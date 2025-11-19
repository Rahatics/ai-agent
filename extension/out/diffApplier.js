"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffApplier = void 0;
// @ts-ignore: VS Code types may not be available in development environment
const vscode = require("vscode");
class DiffApplier {
    /**
     * Apply a diff/patch to the current document
     * @param editor The text editor to apply the diff to
     * @param diff The diff content to apply
     * @returns Promise that resolves when the diff is applied
     */
    static async applyDiff(editor, diff) {
        try {
            // For now, we'll implement a simple approach that replaces the entire document
            // In a more advanced implementation, we would parse the actual diff format
            const document = editor.document;
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            // Apply the edit
            const success = await editor.edit((editBuilder) => {
                editBuilder.replace(fullRange, diff);
            });
            if (success) {
                // Save the document after applying the diff
                await document.save();
                return true;
            }
            return false;
        }
        catch (error) {
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
    static async applyStructuredDiff(editor, diffObject) {
        try {
            const document = editor.document;
            // Start an edit operation
            const success = await editor.edit((editBuilder) => {
                if (diffObject.type === 'replace') {
                    // Replace a range of text
                    const startLine = diffObject.startLine || 0;
                    const endLine = diffObject.endLine || document.lineCount;
                    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, 0));
                    editBuilder.replace(range, diffObject.content);
                }
                else if (diffObject.type === 'insert') {
                    // Insert text at a specific line
                    const line = diffObject.line || 0;
                    const position = new vscode.Position(line, 0);
                    editBuilder.insert(position, diffObject.content);
                }
                else if (diffObject.type === 'delete') {
                    // Delete a range of lines
                    const startLine = diffObject.startLine || 0;
                    const endLine = diffObject.endLine || document.lineCount;
                    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine, 0));
                    editBuilder.delete(range);
                }
            });
            if (success) {
                // Save the document after applying the diff
                await document.save();
                return true;
            }
            return false;
        }
        catch (error) {
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
    static async applyUnifiedDiff(editor, unifiedDiff) {
        try {
            // This is a simplified implementation
            // A full implementation would need to parse the unified diff format properly
            const lines = unifiedDiff.split('\n');
            let inHunk = false;
            let contentLines = [];
            for (const line of lines) {
                if (line.startsWith('@@')) {
                    inHunk = true;
                    continue;
                }
                if (inHunk) {
                    if (line.startsWith('+')) {
                        // Added line
                        contentLines.push(line.substring(1));
                    }
                    else if (line.startsWith('-')) {
                        // Removed line - skip
                        continue;
                    }
                    else if (line.startsWith(' ')) {
                        // Unchanged line
                        contentLines.push(line.substring(1));
                    }
                    else if (line.startsWith('\\')) {
                        // No newline at end of file - skip
                        continue;
                    }
                    else {
                        // End of hunk
                        inHunk = false;
                    }
                }
            }
            // For now, replace the entire document with the parsed content
            const document = editor.document;
            const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
            const success = await editor.edit((editBuilder) => {
                editBuilder.replace(fullRange, contentLines.join('\n'));
            });
            if (success) {
                // Save the document after applying the diff
                await document.save();
                return true;
            }
            return false;
        }
        catch (error) {
            // Log error to output channel instead of console
            const outputChannel = vscode.window.createOutputChannel("AI Agent");
            outputChannel.appendLine(`Error applying unified diff: ${error}`);
            return false;
        }
    }
}
exports.DiffApplier = DiffApplier;
//# sourceMappingURL=diffApplier.js.map