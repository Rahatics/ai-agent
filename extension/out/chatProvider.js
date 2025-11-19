"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatProvider = void 0;
const vscode = require("vscode");
class ChatProvider {
    constructor(socket) {
        this.socket = null;
        this.chatInstance = null;
        this.socket = socket;
        this.registerChatParticipant();
    }
    registerChatParticipant() {
        // @ts-ignore: VS Code types may not be available in development environment
        this.chatInstance = vscode.chat.createChatParticipant('gemini-agent', async (request, _context, response, _token) => {
            // Handle the chat request
            return await this.handleChatRequest(request, response);
        });
        // Set participant metadata
        if (this.chatInstance) {
            this.chatInstance.iconPath = vscode.Uri.parse('https://upload.wikimedia.org/wikipedia/commons/8/8a/Gemini_logo.svg');
            this.chatInstance.description = 'Gemini AI Coding Assistant';
            this.chatInstance.fullName = 'Gemini AI Coding Assistant';
        }
    }
    async handleChatRequest(request, response) {
        // Send typing indicator
        response.markdown('Thinking...');
        return new Promise((resolve) => {
            if (this.socket && this.socket.connected) {
                // Listen for AI response
                const responseHandler = (data) => {
                    if (data.text) {
                        // Clean up listener
                        this.socket?.off('ai_response', responseHandler);
                        // Clear the typing indicator
                        response.clear();
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
                    response.clear();
                    response.markdown('Sorry, I timed out. Please try again.');
                    resolve({
                        metadata: {
                            command: ''
                        }
                    });
                }, 15000);
            }
            else {
                response.clear();
                response.markdown('Not connected to the AI agent. Please make sure the server is running.');
                resolve({
                    metadata: {
                        command: ''
                    }
                });
            }
        });
    }
    processAIResponse(text, response) {
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
                }
                else if (firstCurly !== -1) {
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
            }
            catch (e) {
                // If JSON parsing fails, just display the text
                response.markdown(text);
                return;
            }
        }
        // If no commands, just display the text
        response.markdown(text);
    }
    processCommands(commands, response) {
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
    dispose() {
        if (this.chatInstance) {
            this.chatInstance.dispose();
        }
    }
}
exports.ChatProvider = ChatProvider;
//# sourceMappingURL=chatProvider.js.map