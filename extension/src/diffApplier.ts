// @ts-ignore: VS Code types may not be available in development environment
import * as vscode from 'vscode';
// @ts-ignore: diff library types may not be available in development environment
import * as diff from 'diff';

export class DiffApplier {
    /**
     * Apply a diff/patch to the current document
     * @param editor The text editor to apply the diff to
     * @param diffContent The diff content to apply
     * @returns Promise that resolves when the diff is applied
     */
    public static async applyDiff(editor: vscode.TextEditor, diffContent: string): Promise<boolean> {
        try {
            // For now, we'll implement a simple approach that replaces the entire document
            // In a more advanced implementation, we would parse the actual diff format
            
            const document = editor.document;
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            // Apply the edit
            const success = await editor.edit((editBuilder: vscode.TextEditorEdit) => {
                editBuilder.replace(fullRange, diffContent);
            });
            
            if (success) {
                // Save the document after applying the diff
                await document.save();
                return true;
            }
            
            return false;
        } catch (error) {
            // Log error to output channel instead of console
            const outputChannel = vscode.window.createOutputChannel("AI Agent");
            outputChannel.appendLine(`Error applying diff: ${error}`);
            return false;
        }
    }

    /**
     * Apply a structured diff object to the current document
     * @param editor The text editor to apply the diff to
     * @param diffObject The structured diff object with line changes
     * @returns Promise that resolves when the diff is applied
     */
    public static async applyStructuredDiff(
        editor: vscode.TextEditor, 
        diffObject: any
    ): Promise<boolean> {
        try {
            const document = editor.document;
            
            // Start an edit operation
            const success = await editor.edit((editBuilder: vscode.TextEditorEdit) => {
                if (diffObject.type === 'replace') {
                    // Replace a range of text
                    const startLine = diffObject.startLine || 0;
                    const endLine = diffObject.endLine || document.lineCount;
                    
                    const range = new vscode.Range(
                        new vscode.Position(startLine, 0),
                        new vscode.Position(endLine, 0)
                    );
                    
                    editBuilder.replace(range, diffObject.content);
                } else if (diffObject.type === 'insert') {
                    // Insert text at a specific line
                    const line = diffObject.line || 0;
                    const position = new vscode.Position(line, 0);
                    editBuilder.insert(position, diffObject.content);
                } else if (diffObject.type === 'delete') {
                    // Delete a range of lines
                    const startLine = diffObject.startLine || 0;
                    const endLine = diffObject.endLine || document.lineCount;
                    
                    const range = new vscode.Range(
                        new vscode.Position(startLine, 0),
                        new vscode.Position(endLine, 0)
                    );
                    
                    editBuilder.delete(range);
                }
            });
            
            if (success) {
                // Save the document after applying the diff
                await document.save();
                return true;
            }
            
            return false;
        } catch (error) {
            // Log error to output channel instead of console
            const outputChannel = vscode.window.createOutputChannel("AI Agent");
            outputChannel.appendLine(`Error applying structured diff: ${error}`);
            return false;
        }
    }

    /**
     * Parse a unified diff format and apply it to the current document
     * @param editor The text editor to apply the diff to
     * @param unifiedDiff The unified diff string to parse and apply
     * @returns Promise that resolves when the diff is applied
     */
    public static async applyUnifiedDiff(
        editor: vscode.TextEditor, 
        unifiedDiff: string
    ): Promise<boolean> {
        try {
            // Use the diff library to parse and apply the unified diff
            const document = editor.document;
            const originalContent = document.getText();
            
            // Parse the unified diff
            const patch = diff.parsePatch(unifiedDiff);
            
            // Apply the patch to the original content
            const patchedContent = diff.applyPatch(originalContent, patch[0]);
            
            if (patchedContent === false) {
                // Patch application failed
                return false;
            }
            
            // Replace the entire document with the patched content
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            
            const success = await editor.edit((editBuilder: vscode.TextEditorEdit) => {
                editBuilder.replace(fullRange, patchedContent as string);
            });
            
            if (success) {
                // Save the document after applying the diff
                await document.save();
                return true;
            }
            
            return false;
        } catch (error) {
            // Log error to output channel instead of console
            const outputChannel = vscode.window.createOutputChannel("AI Agent");
            outputChannel.appendLine(`Error applying unified diff: ${error}`);
            return false;
        }
    }
}