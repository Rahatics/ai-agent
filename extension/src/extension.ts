// @ts-ignore: VS Code types may not be available in development environment
import * as vscode from 'vscode';
// @ts-ignore: fs types may not be available in development environment
import * as fs from 'fs';
// @ts-ignore: path types may not be available in development environment
import * as path from 'path';
// @ts-ignore: socket.io-client types may not be available in development environment
import { io, Socket } from 'socket.io-client';
import { CompletionProvider } from './completionProvider';
import { ChatProvider } from './chatProvider';
import { DiffApplier } from './diffApplier';

export function activate(context: vscode.ExtensionContext) {
    // Socket connection to the backend server
    // @ts-ignore: io types may not be available in development environment
    const socket: Socket = io('http://localhost:5000', { transports: ['websocket', 'polling'] });
    
    // Register the completion provider for inline completions
    const completionProvider = new CompletionProvider(socket);
    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' }, 
        completionProvider
    );
    
    // Register the chat participant
    const chatProvider = new ChatProvider(socket);
    
    // Register traditional command for opening webview (optional, for backward compatibility)
    let disposable = vscode.commands.registerCommand('ai-agent.open', () => {
        vscode.window.showInformationMessage('AI Assistant is now available in the chat view and provides inline completions!');
    });
    
    // Add disposables to context
    context.subscriptions.push(completionDisposable);
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
    socket.on('ai_response', (data: any) => {
        // This will be handled by the completion provider and chat provider
        // Log to output channel instead of console
        const outputChannel = vscode.window.createOutputChannel("AI Agent");
        outputChannel.appendLine(`AI Response: ${JSON.stringify(data)}`);
    });
}

export function deactivate() {
    // Clean up resources when the extension is deactivated
}