"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// @ts-ignore: VS Code types may not be available in development environment
const vscode = require("vscode");
// @ts-ignore: fs types may not be available in development environment
const fs = require("fs");
// @ts-ignore: path types may not be available in development environment
const path = require("path");
// @ts-ignore: socket.io-client types may not be available in development environment
const socket_io_client_1 = require("socket.io-client");
const completionProvider_1 = require("./completionProvider");
const chatProvider_1 = require("./chatProvider");
function activate(context) {
    // Socket connection to the backend server
    // @ts-ignore: io types may not be available in development environment
    const socket = (0, socket_io_client_1.io)('http://localhost:5000', { transports: ['websocket', 'polling'] });
    // Singleton Terminal Instance for recycling
    let aiTerminal;
    // Register the completion provider for inline completions
    const completionProvider = new completionProvider_1.CompletionProvider(socket);
    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, completionProvider);
    // Register the chat participant
    const chatProvider = new chatProvider_1.ChatProvider(socket);
    // Register chat participant with VS Code
    const chatDisposable = vscode.chat.createChatParticipant('gemini-agent', async (request, _context, response, _token) => {
        return await chatProvider.handleChatRequest(request, response);
    });
    // Set chat participant metadata
    // @ts-ignore: These properties may not be available in the current VS Code version
    chatDisposable.iconPath = vscode.Uri.parse('https://upload.wikimedia.org/wikipedia/commons/8/8a/Gemini_logo.svg');
    // @ts-ignore: These properties may not be available in the current VS Code version
    chatDisposable.description = 'Gemini AI Coding Assistant';
    // @ts-ignore: These properties may not be available in the current VS Code version
    chatDisposable.fullName = 'Gemini AI Coding Assistant';
    // Register traditional command for opening webview (optional, for backward compatibility)
    let disposable = vscode.commands.registerCommand('ai-agent.open', () => {
        vscode.window.showInformationMessage('AI Assistant is now available in the chat view and provides inline completions!');
    });
    // Add disposables to context
    context.subscriptions.push(completionDisposable);
    context.subscriptions.push(chatDisposable);
    context.subscriptions.push(disposable);
    // Handle socket events
    socket.on('connect', () => {
        // Log to output channel instead of console
        const outputChannel = vscode.window.createOutputChannel("AI Agent");
        outputChannel.appendLine('Connected to AI agent server');
    });
    socket.on('disconnect', () => {
        // Log to output channel instead of console
        const outputChannel = vscode.window.createOutputChannel("AI Agent");
        outputChannel.appendLine('Disconnected from AI agent server');
    });
    // Handle AI responses
    socket.on('ai_response', (data) => {
        // This will be handled by the completion provider and chat provider
        // Log to output channel instead of console
        const outputChannel = vscode.window.createOutputChannel("AI Agent");
        outputChannel.appendLine(`AI Response: ${JSON.stringify(data)}`);
    });
    // --- Message Handler for Smart Context Management ---
    // @ts-ignore: This function may not be used directly but is kept for reference
    async function handleMessages(message) {
        if (!vscode.workspace.workspaceFolders) {
            // @ts-ignore: This function may not be used directly but is kept for reference
            return { command: 'error', msg: "Please open a folder first." };
        }
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        switch (message.command) {
            case 'scan_files':
                // Smart context management: Focus on relevant files only
                try {
                    // Get recently accessed files
                    const recentlyAccessedFiles = await getRecentlyAccessedFiles();
                    // Get git modified files
                    const gitModifiedFiles = await getGitModifiedFiles();
                    // Get main entry point files (package.json, requirements.txt, etc.)
                    const entryPointFiles = await getEntryPointFiles(rootPath);
                    // Combine all relevant files
                    const relevantFiles = [...new Set([
                            ...recentlyAccessedFiles,
                            ...gitModifiedFiles,
                            ...entryPointFiles
                        ])];
                    // Convert to file list string
                    const fileList = relevantFiles.join('\n');
                    return { command: 'file_list', files: fileList };
                }
                catch (err) {
                    return { command: 'error', msg: err.message };
                }
            case 'read_file':
                try {
                    const readUri = vscode.Uri.file(path.join(rootPath, message.path));
                    const readData = await vscode.workspace.fs.readFile(readUri);
                    return { command: 'file_content', path: message.path, content: Buffer.from(readData).toString('utf8') };
                }
                catch (err) {
                    return { command: 'error', msg: err.message };
                }
            case 'write_file':
                try {
                    const filePath = path.join(rootPath, message.path);
                    const dirPath = path.dirname(filePath);
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                    // Fix TypeScript error by using Uint8Array
                    const contentBytes = new Uint8Array(Buffer.from(message.content, 'utf8'));
                    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), contentBytes);
                    return { command: 'action_done', msg: `Wrote: ${message.path}` };
                }
                catch (err) {
                    return { command: 'error', msg: err.message };
                }
            case 'run_terminal':
                try {
                    // FIX: Reuse existing terminal instead of creating new ones
                    if (!aiTerminal || aiTerminal.exitStatus !== undefined) {
                        aiTerminal = vscode.window.terminals.find(t => t.name === 'AI Agent') || vscode.window.createTerminal('AI Agent');
                    }
                    aiTerminal.show();
                    aiTerminal.sendText(message.cmd);
                    return { command: 'action_done', msg: `Executed: ${message.cmd}` };
                }
                catch (err) {
                    return { command: 'error', msg: err.message };
                }
        }
    }
    // Helper function to get recently accessed files
    async function getRecentlyAccessedFiles() {
        // For now, we'll return an empty array as this requires more complex implementation
        // In a full implementation, we would track file access times
        return [];
    }
    // Helper function to get git modified files
    async function getGitModifiedFiles() {
        try {
            // This would require executing git commands
            // For now, we'll return an empty array as a placeholder
            return [];
        }
        catch (error) {
            return [];
        }
    }
    // Helper function to get entry point files
    async function getEntryPointFiles(rootPath) {
        const entryPoints = [];
        // Check for common entry point files
        const commonEntryPoints = [
            'package.json',
            'requirements.txt',
            'pom.xml',
            'build.gradle',
            'index.js',
            'main.py',
            'app.py',
            'server.js',
            'index.html'
        ];
        for (const file of commonEntryPoints) {
            const fullPath = path.join(rootPath, file);
            if (fs.existsSync(fullPath)) {
                entryPoints.push(file);
            }
        }
        return entryPoints;
    }
}
function deactivate() {
    // Clean up resources when the extension is deactivated
}
//# sourceMappingURL=extension.js.map