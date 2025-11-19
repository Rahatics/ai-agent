// @ts-ignore: VS Code types may not be available in development environment
import * as vscode from 'vscode';
// @ts-ignore: socket.io-client types may not be available in development environment
import { Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';
import { DiffApplier } from './diffApplier';

export class ChatProvider {
    private socket: Socket | null = null;
    private aiTerminal: vscode.Terminal | undefined;

    constructor(socket: Socket) {
        this.socket = socket;
    }

    public async handleChatRequest(
        request: any,
        response: any
    ): Promise<any> {
        
        // Send typing indicator
        response.markdown('Thinking...');
        
        return new Promise((resolve) => {
            if (this.socket && this.socket.connected) {
                // Listen for AI response
                const responseHandler = (data: any) => {
                    if (data.text || data.type === 'error') {
                        // Clean up listener
                        this.socket?.off('ai_response', responseHandler);
                        
                        // Clear the typing indicator
                        if (response.clear) {
                            response.clear();
                        }
                        
                        // Process and send the response
                        this.processAIResponse(data, response);
                        
                        resolve({
                            metadata: {
                                command: ''
                            }
                        });
                    }
                };

                // Set up listener
                this.socket.on('ai_response', responseHandler);

                // Send the prompt to Gemini
                this.socket.emit('send_prompt', {
                    message: request.prompt
                });

                // Handle timeout
                setTimeout(() => {
                    this.socket?.off('ai_response', responseHandler);
                    if (response.clear) {
                        response.clear();
                    }
                    response.markdown('Sorry, I timed out. Please try again.');
                    resolve({
                        metadata: {
                            command: ''
                        }
                    });
                }, 15000);
            } else {
                if (response.clear) {
                    response.clear();
                }
                response.markdown('Not connected to the AI agent. Please make sure the server is running.');
                resolve({
                    metadata: {
                        command: ''
                    }
                });
            }
        });
    }

    private processAIResponse(data: any, response: any): void {
        // Handle structured errors
        if (data.type === 'error') {
            response.markdown(`❌ **Error**: ${data.msg}`);
            return;
        }
        
        const text = data.text;
        
        // Check if the response contains commands to execute
        if (text && text.includes('"cmd"')) {
            try {
                // Extract JSON commands from the response
                let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
                
                const firstBracket = cleanText.indexOf('[');
                const firstCurly = cleanText.indexOf('{');
                let startIndex = -1;

                if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
                    startIndex = firstBracket;
                } else if (firstCurly !== -1) {
                    startIndex = firstCurly;
                }

                if (startIndex !== -1) {
                    const lastBracket = cleanText.lastIndexOf(']');
                    const lastCurly = cleanText.lastIndexOf('}');
                    const endIndex = Math.max(lastBracket, lastCurly);

                    if (endIndex > startIndex) {
                        const jsonString = cleanText.substring(startIndex, endIndex + 1);
                        const parsedData = JSON.parse(jsonString);
                        const commands = Array.isArray(parsedData) ? parsedData : [parsedData];

                        // Display the explanation part of the response
                        const explanation = cleanText.substring(0, startIndex);
                        if (explanation.trim()) {
                            response.markdown(explanation);
                        }

                        // Process commands with actual execution and action chaining
                        this.processCommands(commands, response);
                        return;
                    }
                }
            } catch (e) {
                // If JSON parsing fails, just display the text
                response.markdown(text);
                return;
            }
        }
        
        // If no commands, just display the text
        response.markdown(text || "No response received.");
    }

    private async processCommands(commands: any[], response: any): Promise<void> {
        response.markdown('\n\nExecuting commands:\n');
        
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            const index = i + 1;
            
            switch (cmd.cmd) {
                case 'read':
                    try {
                        const filePath = cmd.path || cmd.file;
                        response.markdown(`${index}. Reading file: ${filePath}\n`);
                        
                        // Actually read the file
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const rootPath = workspaceFolders[0].uri.fsPath;
                            const fullPath = path.join(rootPath, filePath);
                            
                            if (fs.existsSync(fullPath)) {
                                const content = fs.readFileSync(fullPath, 'utf8');
                                response.markdown(`
Content of ${filePath}:
\`\`\`
${content}
\`\`\`
`);
                            } else {
                                const errorMsg = `File not found: ${filePath}`;
                                response.markdown(`\n❌ ${errorMsg}\n`);
                                
                                // Automatic feedback loop: Send error back to Gemini
                                if (this.socket && this.socket.connected) {
                                    this.socket.emit('send_prompt', {
                                        message: `[SYSTEM ERROR] Execution failed for 'read' command. Error: ${errorMsg}. Please check the file path and try again.`
                                    });
                                }
                            }
                        } else {
                            const errorMsg = "No workspace folder open";
                            response.markdown(`\n❌ ${errorMsg}\n`);
                            
                            // Automatic feedback loop: Send error back to Gemini
                            if (this.socket && this.socket.connected) {
                                this.socket.emit('send_prompt', {
                                    message: `[SYSTEM ERROR] Execution failed for 'read' command. Error: ${errorMsg}. Please ensure a workspace folder is open.`
                                });
                            }
                        }
                    } catch (error) {
                        const errorMsg = `Error reading file: ${error}`;
                        response.markdown(`\n❌ ${errorMsg}\n`);
                        
                        // Automatic feedback loop: Send error back to Gemini
                        if (this.socket && this.socket.connected) {
                            this.socket.emit('send_prompt', {
                                message: `[SYSTEM ERROR] Execution failed for 'read' command. Error: ${errorMsg}. Please try a different approach.`
                            });
                        }
                    }
                    break;
                    
                case 'write':
                    try {
                        const filePath = cmd.path || cmd.file;
                        response.markdown(`${index}. Writing file: ${filePath}\n`);
                        
                        // Check if this is a diff/patch instead of full content
                        if (cmd.diff || cmd.patch) {
                            // Apply diff using DiffApplier
                            const editor = vscode.window.activeTextEditor;
                            if (editor) {
                                const success = await DiffApplier.applyUnifiedDiff(editor, cmd.diff || cmd.patch);
                                if (success) {
                                    response.markdown(`\n✅ Successfully applied diff to ${filePath}\n`);
                                } else {
                                    const errorMsg = `Failed to apply diff to ${filePath}`;
                                    response.markdown(`\n❌ ${errorMsg}\n`);
                                    
                                    // Automatic feedback loop: Send error back to Gemini
                                    if (this.socket && this.socket.connected) {
                                        this.socket.emit('send_prompt', {
                                            message: `[SYSTEM ERROR] Execution failed for 'write' command with diff. Error: ${errorMsg}. Please check the diff format and try again.`
                                        });
                                    }
                                }
                            } else {
                                const errorMsg = "No active editor to apply diff";
                                response.markdown(`\n❌ ${errorMsg}\n`);
                                
                                // Automatic feedback loop: Send error back to Gemini
                                if (this.socket && this.socket.connected) {
                                    this.socket.emit('send_prompt', {
                                        message: `[SYSTEM ERROR] Execution failed for 'write' command with diff. Error: ${errorMsg}. Please open a file in the editor first.`
                                    });
                                }
                            }
                        } else {
                            // Write full file content
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            if (workspaceFolders && workspaceFolders.length > 0) {
                                const rootPath = workspaceFolders[0].uri.fsPath;
                                const fullPath = path.join(rootPath, filePath);
                                const dirPath = path.dirname(fullPath);
                                
                                // Create directory if it doesn't exist
                                if (!fs.existsSync(dirPath)) {
                                    fs.mkdirSync(dirPath, { recursive: true });
                                }
                                
                                // Write file content
                                fs.writeFileSync(fullPath, cmd.content, 'utf8');
                                response.markdown(`\n✅ Successfully wrote to ${filePath}\n`);
                            } else {
                                const errorMsg = "No workspace folder open";
                                response.markdown(`\n❌ ${errorMsg}\n`);
                                
                                // Automatic feedback loop: Send error back to Gemini
                                if (this.socket && this.socket.connected) {
                                    this.socket.emit('send_prompt', {
                                        message: `[SYSTEM ERROR] Execution failed for 'write' command. Error: ${errorMsg}. Please ensure a workspace folder is open.`
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        const errorMsg = `Error writing file: ${error}`;
                        response.markdown(`\n❌ ${errorMsg}\n`);
                        
                        // Automatic feedback loop: Send error back to Gemini
                        if (this.socket && this.socket.connected) {
                            this.socket.emit('send_prompt', {
                                message: `[SYSTEM ERROR] Execution failed for 'write' command. Error: ${errorMsg}. Please try a different approach.`
                            });
                        }
                    }
                    break;
                    
                case 'exec':
                    try {
                        response.markdown(`${index}. Executing: ${cmd.command}\n`);
                        
                        // Reuse existing terminal instead of creating new ones
                        if (!this.aiTerminal || this.aiTerminal.exitStatus !== undefined) {
                            this.aiTerminal = vscode.window.terminals.find(t => t.name === 'AI Agent') || vscode.window.createTerminal('AI Agent');
                        }
                        this.aiTerminal.show();
                        this.aiTerminal.sendText(cmd.command);
                        
                        // Capture terminal output for error checking
                        // Note: VS Code API limitations prevent direct terminal output capture
                        // In a more advanced implementation, we would use a custom terminal or
                        // execute commands through child processes to capture output
                        response.markdown(`\n✅ Command sent to terminal. Monitoring for output...\n`);
                        
                        // Action chaining: Send terminal output back to Gemini after execution
                        // This would require a more complex implementation with terminal output listeners
                    } catch (error) {
                        const errorMsg = `Error executing command: ${error}`;
                        response.markdown(`\n❌ ${errorMsg}\n`);
                        
                        // Automatic feedback loop: Send error back to Gemini
                        if (this.socket && this.socket.connected) {
                            this.socket.emit('send_prompt', {
                                message: `[SYSTEM ERROR] Execution failed for 'exec' command. Error: ${errorMsg}. Please try a different approach.`
                            });
                        }
                    }
                    break;
                    
                default:
                    const errorMsg = `Unknown command: ${cmd.cmd}`;
                    response.markdown(`${index}. ❌ ${errorMsg}\n`);
                    
                    // Automatic feedback loop: Send error back to Gemini
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('send_prompt', {
                            message: `[SYSTEM ERROR] Execution failed. Error: ${errorMsg}. Please use only supported commands (read, write, exec).`
                        });
                    }
            }
        }
    }
}