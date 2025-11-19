import threading
import queue
import time
import json
import re
import subprocess
import os
from flask import Flask
from flask_socketio import SocketIO
from playwright.sync_api import sync_playwright

# --- নতুন সংযোজন: কঠোর সিস্টেম নির্দেশাবলী (STRICT_SYSTEM_INSTRUCTION) ---
STRICT_SYSTEM_INSTRUCTION = """
--- AGENT MODE: ON ---
You are an autonomous AI Coding Agent. Your output must STRICTLY adhere to the following rules:

1.  **FILE/EXECUTION COMMANDS (DEFAULT):** If the task requires file system interaction (read, write) or terminal execution, you MUST respond with a single, valid, compact JSON array.
    -   DO NOT include ANY text, explanations, code blocks, or markdown outside of the JSON block.
    -   The JSON block MUST be enclosed exclusively in ```json.
    -   Example Format:
        ```json
        [{"cmd": "write", "path": "test.js", "content": "console.log('Hello')"}]
        ```
    -   For code modifications, you can also use diff format:
        ```json
        [{"cmd": "write", "path": "test.js", "diff": "@@ -1 +1 @@\n- console.log('Hello')\n+ console.log('Hello World')"}]
        ```
2.  **INLINE COMPLETION MODE:** If the user's request is ONLY for code completion (contains phrases like 'Complete the following code'), you MUST respond ONLY with the RAW CODE TEXT.
    -   DO NOT use markdown fences (```) for raw code.
    -   DO NOT include any explanation or conversational filler.
    
3.  **FAILURE:** Any deviation from these format rules will cause the agent to fail. Respond ONLY with the requested format (JSON block or raw code).

--- USER REQUEST BELOW ---
"""

app = Flask(__name__)
# Threading mode is crucial for Playwright + Flask
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Command Queue to manage browser interactions safely
cmd_queue = queue.Queue()

def scrape_gemini_response(page):
    """
    Advanced Scraper: Waits for text stability to ensure full response capture.
    Fixed: Now supports short responses like "[]"
    Enhanced: Better JSON detection and extraction
    Optimized: Reduced timeout for faster completion
    Improved: Better error handling with structured error messages
    Enhanced: Event-based waiting instead of fixed timeouts
    """
    print("👀 Waiting for Gemini to finish typing...")
    socketio.emit('status', {'msg': 'Gemini is thinking...'})
    
    try:
        # 1. Wait for response container to appear
        selectors = [
            ".model-response-text", 
            "message-content", 
            "[data-test-id='model-response']"
        ]
        
        active_selector = None
        for sel in selectors:
            try:
                # Wait for selector to appear with timeout
                page.wait_for_selector(sel, timeout=5000)
                active_selector = sel
                break
            except:
                continue
        
        if not active_selector:
            print("⚠️ Selector not found, waiting blindly...")
            # Return structured error instead of plain string
            return {"type": "error", "msg": "Selector not found after waiting"}

        # 2. Wait for text to appear and stabilize
        last_text = ""
        stable_ticks = 0
        max_wait_time = 30  # Maximum wait time in seconds
        check_interval = 0.5  # Check every 0.5 seconds
        max_checks = int(max_wait_time / check_interval)
        
        for i in range(max_checks):
            elements = page.locator(active_selector)
            count = elements.count()
            
            if count == 0:
                time.sleep(check_interval)
                continue
            
            # Target the last message bubble
            current_text = elements.nth(count - 1).inner_text()
            
            # Check if text has appeared
            if len(current_text.strip()) > 0:
                # Check Stability: If text length unchanged for 1 second (2 ticks)
                if current_text == last_text:
                    stable_ticks += 1
                    if stable_ticks >= 2:  # Confirmed stable
                        print(f"✅ Generation Complete ({len(current_text)} chars).")
                        return current_text
                else:
                    stable_ticks = 0  # Still typing...
            else:
                stable_ticks = 0  # No text yet
            
            last_text = current_text
            time.sleep(check_interval)
            
    except Exception as e:
        print(f"❌ Scraping Error: {e}")
        # Return structured error instead of plain string
        return {"type": "error", "msg": f"Scraping failed: {str(e)}"}
    
    # Return structured error instead of plain string
    return {"type": "error", "msg": "Timeout or Selector mismatch after maximum wait"}

def extract_json_from_response(response_text):
    """
    Extract JSON from Gemini response text with improved parsing
    """
    try:
        # If response is already a dict (structured error), return it
        if isinstance(response_text, dict):
            return response_text
            
        # Sanitize the response text
        # Remove any leading/trailing whitespace
        response_text = response_text.strip()
        
        # Look for JSON array or object in the response
        # Find the first opening brace or bracket
        first_brace = response_text.find('{')
        first_bracket = response_text.find('[')
        
        start_pos = -1
        if first_brace != -1 and (first_bracket == -1 or first_brace < first_bracket):
            start_pos = first_brace
        elif first_bracket != -1:
            start_pos = first_bracket
            
        if start_pos == -1:
            return None
            
        # Find the matching closing brace or bracket
        bracket_count = 0
        in_string = False
        escape_next = False
        
        for i in range(start_pos, len(response_text)):
            char = response_text[i]
            
            if escape_next:
                escape_next = False
                continue
                
            if char == '\\':
                escape_next = True
                continue
                
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
                
            if in_string:
                continue
                
            if char in '{[':
                bracket_count += 1
            elif char in '}]':
                bracket_count -= 1
                
            if bracket_count == 0:
                # Found the end of JSON
                json_str = response_text[start_pos:i+1]
                try:
                    # Try to parse it
                    parsed = json.loads(json_str)
                    return parsed
                except json.JSONDecodeError:
                    # If parsing fails, continue searching
                    break
                    
        return None
    except Exception as e:
        print(f"Error extracting JSON: {e}")
        return None

def apply_diff_to_content(original_content, diff_commands):
    """
    Apply diff commands to content
    """
    try:
        # For now, we'll just return the new content from the diff
        # A more sophisticated implementation would apply actual diffs
        if isinstance(diff_commands, list) and len(diff_commands) > 0:
            # If it's a list of commands, look for write commands
            for cmd in diff_commands:
                if cmd.get('cmd') == 'write' and ('content' in cmd or 'diff' in cmd):
                    return cmd.get('content', cmd.get('diff', ''))
        elif isinstance(diff_commands, dict) and diff_commands.get('cmd') == 'write':
            return diff_commands.get('content', diff_commands.get('diff', ''))
            
        return original_content
    except Exception as e:
        print(f"Error applying diff: {e}")
        return original_content

def run_browser_logic():
    """
    Background thread to handle Playwright browser instance.
    Enhanced with auto-retry and error handling
    """
    browser = None
    page = None
    
    with sync_playwright() as p:
        try:
            # Launch Browser (Visible) with persistent context for session reuse
            browser = p.firefox.launch_persistent_context(
                user_data_dir="./browser_session",
                headless=False
            )
            
            page = browser.pages[0] if browser.pages else browser.new_page()
            
            # Auto-navigate to Gemini
            if "google.com" not in page.url:
                page.goto("https://gemini.google.com")
            
            print("✅ Browser Ready & Listening...")

            while True:
                try:
                    # Wait for command from Queue
                    task = cmd_queue.get(timeout=1)
                    
                    if task['type'] == 'write':
                        user_message = task['msg']
                        
                        # --- নতুন সংযোজন: কঠোর প্রম্পট তৈরি ---
                        # ব্যবহারকারীর বার্তার আগে কঠোর সিস্টেম নির্দেশাবলী যুক্ত করা হচ্ছে।
                        # এটি নিশ্চিত করবে যে জেমিনি তার আউটপুট ফরমেট নিয়ে সবসময় সচেতন।
                        full_prompt = STRICT_SYSTEM_INSTRUCTION + user_message
                        # -------------------------------------
                        
                        print(f"🤖 Sending Command: {user_message[:30]}...")
                        
                        # Find Input Box
                        input_found = False
                        input_selectors = [
                            "div[contenteditable='true']", 
                            "rich-textarea > div", 
                            "textarea"
                        ]
                        
                        for sel in input_selectors:
                            try:
                                # Wait for input selector to appear
                                page.wait_for_selector(sel, timeout=3000)
                                if page.locator(sel).count() > 0:
                                    box = page.locator(sel).first
                                    box.click()
                                    # fill(full_prompt) ব্যবহার করে নতুন প্রম্পট ইনপুট করা
                                    box.fill(full_prompt)
                                    page.keyboard.press("Enter")
                                    input_found = True
                                    break
                            except:
                                continue
                        
                        if input_found:
                            # Scrape Response
                            reply = scrape_gemini_response(page)
                            
                            # Check if this is a completion request
                            if 'completion' in user_message.lower():
                                # Send special completion result format
                                socketio.emit('ai_response', {
                                    'type': 'completion_result',
                                    'text': reply
                                })
                            else:
                                # Handle structured errors
                                if isinstance(reply, dict) and reply.get('type') == 'error':
                                    # Send structured error to extension
                                    socketio.emit('ai_response', reply)
                                else:
                                    # Try to extract JSON commands from the response
                                    json_commands = extract_json_from_response(reply)
                                    
                                    # Emit the response with extracted commands if found
                                    if json_commands:
                                        socketio.emit('ai_response', {
                                            'text': reply,
                                            'commands': json_commands
                                        })
                                    else:
                                        # Send full response if no commands found (graceful fallback)
                                        socketio.emit('ai_response', {'text': reply})
                                
                            socketio.emit('status', {'msg': 'Reply Received ✅'})
                        else:
                            print("❌ Input box not found")
                            # Send error to both status and ai_response to ensure extension handles it
                            socketio.emit('status', {'msg': 'Error: Input box not found'})
                            socketio.emit('ai_response', {
                                'type': 'error', 
                                'msg': 'Input box not found, check browser.'
                            })

                    cmd_queue.task_done()
                    
                except queue.Empty:
                    pass # Keep loop alive
                except Exception as e:
                    print(f"❌ Loop Error: {e}")
                    # Send structured error to extension
                    socketio.emit('ai_response', {
                        'type': 'error', 
                        'msg': f'Loop error: {str(e)}'
                    })
                    
        except Exception as e:
            print(f"❌ Critical Browser Error: {e}")
            # Send structured error to extension
            socketio.emit('ai_response', {
                'type': 'error', 
                'msg': f'Critical browser error: {str(e)}'
            })
        finally:
            # Cleanup browser resources
            if browser:
                try:
                    browser.close()
                except:
                    pass

# Start Browser Thread
browser_thread = threading.Thread(target=run_browser_logic)
browser_thread.daemon = True
browser_thread.start()

# --- Flask Routes ---

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('send_prompt')
def handle_prompt(data):
    # এই ফাংশনটি শুধু ডাটা কিউতে পাঠাবে, প্রম্পট ফর্মেটিং এখন run_browser_logic হ্যান্ডেল করছে।
    cmd_queue.put({'type': 'write', 'msg': data.get('message')})

@socketio.on('set_environment')
def handle_environment(data):
    socketio.emit('status', {'msg': 'Queueing Setup...'})

if __name__ == '__main__':
    print("🚀 Server Started on Port 5000")
    socketio.run(app, port=5000)