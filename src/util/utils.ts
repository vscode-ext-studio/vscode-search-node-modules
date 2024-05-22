import * as vscode from 'vscode';

const formatMsg = (message: string): string => `Search node_modules: ${message}`;
export function showError(message: string): Thenable<string | undefined> {
    return vscode.window.showErrorMessage(formatMsg(message));
}

export function showWarning(message: string): Thenable<string | undefined> {
    return vscode.window.showWarningMessage(formatMsg(message));
}