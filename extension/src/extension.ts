import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    
    // Singleton Terminal Instance
    let aiTerminal: vscode.Terminal | undefined;

    let disposable = vscode.commands.registerCommand('ai-agent.open', () => {
        const panel = vscode.window.createWebviewPanel(
            'aiAgent', 'AI Assistant', vscode.ViewColumn.Two,
            { enableScripts: true, localResourceRoots: [vscode.Uri.file(context.extensionPath)] }
        );

        // Robust HTML Loading
        const htmlPath = path.join(context.extensionPath, fs.existsSync(path.join(context.extensionPath, 'webview.html')) ? 'webview.html' : 'src/webview.html');
        if (fs.existsSync(htmlPath)) {
            panel.webview.html = fs.readFileSync(htmlPath, 'utf8');
        } else {
            vscode.window.showErrorMessage("Critical Error: webview.html not found!");
            return;
        }

        // --- Message Handler ---
        panel.webview.onDidReceiveMessage(
            async message => {
                if (!vscode.workspace.workspaceFolders) {
                    vscode.window.showErrorMessage("⚠️ Error: No folder open.");
                    panel.webview.postMessage({ command: 'error', msg: "Please open a folder first." });
                    return;
                }
                
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
                            panel.webview.postMessage({ command: 'file_content', path: message.path, content: Buffer.from(readData).toString('utf8') });
                        } catch (err: any) {
                            panel.webview.postMessage({ command: 'error', msg: err.message });
                        }
                        break;

                    case 'write_file':
                        try {
                            const filePath = path.join(rootPath, message.path);
                            const dirPath = path.dirname(filePath);
                            
                            if (!fs.existsSync(dirPath)){
                                fs.mkdirSync(dirPath, { recursive: true });
                            }

                            await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(message.content, 'utf8'));
                            panel.webview.postMessage({ command: 'action_done', msg: `Wrote: ${message.path}` });
                        } catch (err: any) {
                            panel.webview.postMessage({ command: 'error', msg: err.message });
                        }
                        break;

                    case 'run_terminal':
                        // FIX: Reuse existing terminal instead of creating new ones
                        if (!aiTerminal || aiTerminal.exitStatus !== undefined) {
                            aiTerminal = vscode.window.terminals.find(t => t.name === 'AI Agent') || vscode.window.createTerminal('AI Agent');
                        }
                        aiTerminal.show();
                        aiTerminal.sendText(message.cmd);
                        panel.webview.postMessage({ command: 'action_done', msg: `Executed: ${message.cmd}` });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}