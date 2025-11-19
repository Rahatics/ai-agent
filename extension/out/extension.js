"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
function activate(context) {
    let disposable = vscode.commands.registerCommand('ai-agent.open', () => {
        const panel = vscode.window.createWebviewPanel('aiAgent', 'AI Assistant', vscode.ViewColumn.Two, { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath))] });
        // HTML পাথ ফিক্স (যেখানেই থাকুক খুঁজে নেবে)
        let htmlPath = path.join(context.extensionPath, 'webview.html');
        if (!fs.existsSync(htmlPath)) {
            htmlPath = path.join(context.extensionPath, 'src', 'webview.html');
        }
        panel.webview.html = fs.readFileSync(htmlPath, 'utf8');
        // --- এজেন্ট কমান্ড হ্যান্ডলার ---
        panel.webview.onDidReceiveMessage(async (message) => {
            // ১. ফোল্ডার ওপেন আছে কি না চেক করা (CRITICAL FIX)
            if (!vscode.workspace.workspaceFolders) {
                vscode.window.showErrorMessage("⚠️ Error: No folder open. Please open a project folder first.");
                panel.webview.postMessage({ command: 'error', msg: "Please open a folder in VS Code first." });
                return;
            }
            // রুট ফোল্ডার পাথ নেওয়া
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            switch (message.command) {
                case 'scan_files':
                    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
                    const fileList = files.map(f => vscode.workspace.asRelativePath(f)).join('\n');
                    panel.webview.postMessage({ command: 'file_list', files: fileList });
                    break;
                case 'read_file':
                    try {
                        const readUri = vscode.Uri.file(path.join(rootPath, message.path));
                        const readData = await vscode.workspace.fs.readFile(readUri);
                        const content = Buffer.from(readData).toString('utf8');
                        panel.webview.postMessage({ command: 'file_content', path: message.path, content: content });
                    }
                    catch (err) {
                        panel.webview.postMessage({ command: 'error', msg: `Error reading file: ${err.message}` });
                    }
                    break;
                case 'write_file':
                    try {
                        const filePath = path.join(rootPath, message.path);
                        const writeUri = vscode.Uri.file(filePath);
                        const writeData = Buffer.from(message.content, 'utf8');
                        // ২. ফোল্ডার না থাকলে তৈরি করা (Recursive Directory Creation)
                        const dirPath = path.dirname(filePath);
                        if (!fs.existsSync(dirPath)) {
                            fs.mkdirSync(dirPath, { recursive: true });
                        }
                        await vscode.workspace.fs.writeFile(writeUri, writeData);
                        vscode.window.showInformationMessage(`AI wrote: ${message.path}`);
                        panel.webview.postMessage({ command: 'action_done', msg: `Wrote to ${message.path}` });
                    }
                    catch (err) {
                        panel.webview.postMessage({ command: 'error', msg: `Error writing file: ${err.message}` });
                    }
                    break;
                case 'run_terminal':
                    const terminal = vscode.window.createTerminal(`AI Agent`);
                    terminal.show();
                    terminal.sendText(message.cmd);
                    panel.webview.postMessage({ command: 'action_done', msg: `Executed: ${message.cmd}` });
                    break;
            }
        }, undefined, context.subscriptions);
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map