import threading
import queue
import time
from flask import Flask
from flask_socketio import SocketIO
from playwright.sync_api import sync_playwright

app = Flask(__name__)
# Threading mode is crucial for Playwright + Flask
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Command Queue to manage browser interactions safely
cmd_queue = queue.Queue()

def scrape_gemini_response(page):
    """
    Advanced Scraper: Waits for text stability to ensure full response capture.
    Fixed: Now supports short responses like "[]"
    """
    print("👀 Waiting for Gemini to finish typing...")
    socketio.emit('status', {'msg': 'Gemini is thinking...'})
    
    try:
        # 1. Initial wait for generation to start
        page.wait_for_timeout(3000)
        
        # Locate the response container
        selectors = [
            ".model-response-text", 
            "message-content", 
            "[data-test-id='model-response']"
        ]
        
        active_selector = None
        for sel in selectors:
            if page.locator(sel).count() > 0:
                active_selector = sel
                break
        
        if not active_selector:
            print("⚠️ Selector not found, waiting blindly...")
            time.sleep(5)
            return "Error: Could not find response container."

        # 2. Stability Loop (Max wait: 100s)
        last_text = ""
        stable_ticks = 0
        
        for i in range(50): # 50 checks * 2s interval
            elements = page.locator(active_selector)
            count = elements.count()
            
            if count == 0:
                time.sleep(2)
                continue
            
            # Target the last message bubble
            current_text = elements.nth(count - 1).inner_text()
            
            # 3. Check Stability: If text length unchanged for 4 seconds (2 ticks)
            # FIXED: Changed limit from 10 to 1 to allow short responses like "[]"
            if len(current_text) > 1 and current_text == last_text:
                stable_ticks += 1
                if stable_ticks >= 2: # Confirmed stable
                    print(f"✅ Generation Complete ({len(current_text)} chars).")
                    return current_text
            else:
                stable_ticks = 0 # Still typing...
            
            last_text = current_text
            page.wait_for_timeout(2000) # Wait 2s before next check
            
    except Exception as e:
        print(f"❌ Scraping Error: {e}")
    
    return "Error: Timeout or Selector mismatch."

def run_browser_logic():
    """
    Background thread to handle Playwright browser instance.
    """
    with sync_playwright() as p:
        try:
            # Launch Browser (Visible)
            browser = p.chromium.launch_persistent_context(
                user_data_dir="./browser_session",
                headless=False,
                args=["--start-maximized"],
                no_viewport=True
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
                        text = task['msg']
                        print(f"🤖 Sending Command: {text[:30]}...")
                        
                        # Find Input Box
                        input_found = False
                        input_selectors = [
                            "div[contenteditable='true']", 
                            "rich-textarea > div", 
                            "textarea"
                        ]
                        
                        for sel in input_selectors:
                            if page.locator(sel).count() > 0:
                                box = page.locator(sel).first
                                box.click()
                                box.fill(text)
                                page.keyboard.press("Enter")
                                input_found = True
                                break
                        
                        if input_found:
                            # Scrape Response
                            reply = scrape_gemini_response(page)
                            socketio.emit('ai_response', {'text': reply})
                            socketio.emit('status', {'msg': 'Reply Received ✅'})
                        else:
                            print("❌ Input box not found")
                            socketio.emit('status', {'msg': 'Error: Input box not found'})

                    cmd_queue.task_done()
                    
                except queue.Empty:
                    pass # Keep loop alive
                except Exception as e:
                    print(f"❌ Loop Error: {e}")
                    
        except Exception as e:
            print(f"❌ Critical Browser Error: {e}")

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
    cmd_queue.put({'type': 'write', 'msg': data.get('message')})

@socketio.on('set_environment')
def handle_environment(data):
    socketio.emit('status', {'msg': 'Queueing Setup...'})

if __name__ == '__main__':
    print("🚀 Server Started on Port 5000")
    socketio.run(app, port=5000)