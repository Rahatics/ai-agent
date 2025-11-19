"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompletionProvider = void 0;
// @ts-ignore: VS Code types may not be available in development environment
const vscode = require("vscode");
class CompletionProvider {
    constructor(socket) {
        this.socket = null;
        this.socket = socket;
    }
    async provideInlineCompletionItems(document, position, _context, _token) {
        // Get the text before the cursor
        const textBeforeCursor = document.getText(new vscode.Range(Math.max(0, position.line - 10), // Get up to 10 lines before
        0, position.line, position.character));
        // Skip if text is too short or cursor is at beginning of line with no text
        if (textBeforeCursor.trim().length < 3) {
            return [];
        }
        // Create a promise that will resolve with the completion
        return new Promise((resolve) => {
            // Send request to Gemini through our backend
            if (this.socket && this.socket.connected) {
                const completionRequest = {
                    type: 'completion',
                    content: textBeforeCursor,
                    fileName: document.fileName,
                    language: document.languageId,
                    line: position.line,
                    character: position.character
                };
                // Set up temporary listener for the response
                const responseHandler = (data) => {
                    if (data.type === 'completion_result') {
                        // Clean up listener
                        this.socket?.off('ai_response', responseHandler);
                        // Create completion item
                        const completionItem = new vscode.InlineCompletionItem(data.text);
                        resolve([completionItem]);
                    }
                };
                // Listen for response
                this.socket.on('ai_response', responseHandler);
                // Send the request
                this.socket.emit('send_prompt', {
                    message: `Complete the following code in ${document.languageId}:

${textBeforeCursor}

Provide only the completion without any explanations.`
                });
                // Timeout after 5 seconds
                setTimeout(() => {
                    this.socket?.off('ai_response', responseHandler);
                    resolve([]);
                }, 5000);
            }
            else {
                resolve([]);
            }
        });
    }
}
exports.CompletionProvider = CompletionProvider;
//# sourceMappingURL=completionProvider.js.map