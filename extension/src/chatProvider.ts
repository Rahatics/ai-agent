// @ts-ignore: VS Code types may not be available in development environment
import * as vscode from 'vscode';
// @ts-ignore: socket.io-client types may not be available in development environment
import { Socket } from 'socket.io-client';

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

                        // Process commands
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

    private processCommands(commands: any[], response: any): void {
        response.markdown('\n\nExecuting commands:\n');
        
        commands.forEach((cmd, index) => {
            switch (cmd.cmd) {
                case 'read':
                    response.markdown(`${index + 1}. Reading file: ${cmd.path || cmd.file}\n`);
                    break;
                case 'write':
                    response.markdown(`${index + 1}. Writing file: ${cmd.path || cmd.file}\n`);
                    break;
                case 'exec':
                    response.markdown(`${index + 1}. Executing: ${cmd.command}\n`);
                    break;
                default:
                    response.markdown(`${index + 1}. Unknown command: ${cmd.cmd}\n`);
            }
            
            // Here we would actually execute the commands through VS Code APIs
            // This would be done in the extension.ts file which has access to those APIs
        });
    }
}