// @ts-ignore: VS Code types may not be available in development environment
import * as vscode from 'vscode';
// @ts-ignore: socket.io-client types may not be available in development environment
import { Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';
import { DiffApplier } from './diffApplier';

export class ChatProvider {
    private socket: Socket | null = null;

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
                    if (data.text) {
                        // Clean up listener
                        this.socket?.off('ai_response', responseHandler);
                        
                        // Clear the typing indicator
                        if (response.clear) {
                            response.clear();
                        }
                        
                        // Process and send the response
                        this.processAIResponse(data.text, response);
                        
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

    private processAIResponse(text: string, response: any): void {
        // Check if the response contains commands to execute
        if (text.includes('"cmd"')) {
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

                        // Process commands with actual execution
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
        response.markdown(text);
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
                                response.markdown(`\n❌ File not found: ${filePath}\n`);
                            }
                        } else {
                            response.markdown(`\n❌ No workspace folder open\n`);
                        }
                    } catch (error) {
                        response.markdown(`\n❌ Error reading file: ${error}\n`);
                    }
                    break;
                    
                case 'write':
                    try {
                        const filePath = cmd.path || cmd.file;
                        response.markdown(`${index}. Writing file: ${filePath}\n`);
                        
                        // Actually write the file
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
                            response.markdown(`\n❌ No workspace folder open\n`);
                        }
                    } catch (error) {
                        response.markdown(`\n❌ Error writing file: ${error}\n`);
                    }
                    break;
                    
                case 'exec':
                    try {
                        response.markdown(`${index}. Executing: ${cmd.command}\n`);
                        
                        // Execute command in terminal
                        const terminal = vscode.window.createTerminal('AI Agent Command');
                        terminal.show();
                        terminal.sendText(cmd.command);
                        response.markdown(`\n✅ Command sent to terminal\n`);
                    } catch (error) {
                        response.markdown(`\n❌ Error executing command: ${error}\n`);
                    }
                    break;
                    
                default:
                    response.markdown(`${index}. Unknown command: ${cmd.cmd}\n`);
            }
        }
    }
}