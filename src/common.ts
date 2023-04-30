import * as vscode from 'vscode';


export function getSetting<T>(str: string, def: T): T {
    const config = vscode.workspace.getConfiguration('tails');
    return config.get<T>(str, def);
}


export function getEndOfLineString(eol: vscode.EndOfLine): string {
    switch (eol) {
        case vscode.EndOfLine.CRLF: return '\r\n';
        case vscode.EndOfLine.LF: return '\n';
        default: return '';
    }
}


export function getCurrentLineIndentation(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "";

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const leadingWhitespace = line.text.match(/^\s*/);

    return leadingWhitespace ? leadingWhitespace[0] : "";
}


export function getCurrentSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const selection = editor.selection;
    if (selection.isEmpty) return null;

    const selectedText = editor.document.getText(selection);
    return selectedText;
}