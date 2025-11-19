// @ts-ignore: VS Code types may not be available in development environment
import * as vscode from 'vscode';
// @ts-ignore: socket.io-client types may not be available in development environment
import { Socket } from 'socket.io-client';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    private socket: Socket | null = null;

    constructor(socket: Socket) {
        this.socket = socket;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
        
        // Get the text before the cursor
        const textBeforeCursor = document.getText(
            new vscode.Range(
                Math.max(0, position.line - 10), // Get up to 10 lines before
                0,
                position.line,
                position.character
            )
        );

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
                const responseHandler = (data: any) => {
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

                // Send the request with context about the current code block
                this.socket.emit('send_prompt', {
                    message: `Complete the following code in ${document.languageId}:
                    
${textBeforeCursor}

Provide only the completion without any explanations. Focus on the current code block and its immediate context.`
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    this.socket?.off('ai_response', responseHandler);
                    resolve([]);
                }, 5000);
            } else {
                resolve([]);
            }
        });
    }
}