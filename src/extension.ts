/* eslint-disable curly */
import { join } from 'path';
import * as vscode from 'vscode';


class HistoryEntry {
    languageId: string;
    replacement: string[];
    file: string;
    lineNumber: number;

    constructor(langId: string, replacement: string[], file: string, lineNumber: number) {
        this.languageId = langId;
        this.replacement = replacement;
        this.file = file;
        this.lineNumber = lineNumber;
    }
}


let previousClipboardContent = '';
let history: HistoryEntry[] = [];
let historyCount: number = 0;


function getSetting<T>(str: string, def: T): T {
    const config = vscode.workspace.getConfiguration('tails');
    return config.get<T>('str', def);
}


function getEndOfLineString(eol: vscode.EndOfLine): string {
    switch (eol) {
        case vscode.EndOfLine.CRLF: return '\r\n';
        case vscode.EndOfLine.LF: return '\n';
        default: return '';
    }
}


function getCurrentLineIndentation(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return "";

    const position = editor.selection.active;
    const line = editor.document.lineAt(position.line);
    const leadingWhitespace = line.text.match(/^\s*/);

    return leadingWhitespace ? leadingWhitespace[0] : "";
}


export class HistoryInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        let suggestions: vscode.InlineCompletionItem[] = [];

        // get the current line text
        const lineTextOrig = document.lineAt(position.line).text;

        // check if the cursor is at the end of the line
        const isAtEol = position.character === lineTextOrig.length;
        const lineText = lineTextOrig.substring(0, position.character).trimStart();
        const langId = document.languageId;

        if (isAtEol && lineText.length >= 3) {
            for (const entry of history) {
                if (entry.languageId !== langId) { continue; }

                const indent = getCurrentLineIndentation();
                const joinStr = getEndOfLineString(document.eol) + indent;
                const str: string = entry.replacement.join(joinStr);

                if (entry.replacement[0].trim().startsWith(lineText)) {
                    const suggestion = new vscode.InlineCompletionItem(str.trim().substring(lineText.length));
                    suggestion.range = new vscode.Range(position.line, position.character, position.line, position.character);
                    suggestions.push(suggestion);
                }
            }
        }

        return suggestions;
    }
}


function extractFilename(path: string) {
    let filenameRegex = /\/([^\/]+)$/;

    if (process.platform === 'win32') {
        filenameRegex = /.*[\\/](.*)$/;
    }

    const match = path.match(filenameRegex);
    if (!match) return path;

    return match[1];
}


function addCmdClearHistory(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.clearHistory', () => {
        history = [];
        historyCount = 0;
    });

    context.subscriptions.push(cmd);
}


function trimBlankLines(str: string, lineTerminator: string): string[] {
    const lines = str.split(lineTerminator);
    let startIdx = 0;
    let endIdx = lines.length - 1;

    while (startIdx < lines.length && lines[startIdx].trim() === "") {
        ++startIdx;
    }

    while (endIdx >= 0 && lines[endIdx].trim() === "") {
        --endIdx;
    }

    return lines.slice(startIdx, endIdx + 1);
}


function removeCommonLeadingWhitespace(lines: string[]): string[] {
    if (lines.length === 0) return lines;

    let minLeadingWhitespace = Infinity;

    for (let line of lines) {
        if (!line.trim()) continue;

        const caps = line.match(/^\s*/);

        if (caps) {
            const leadingWhitespace = caps[0].length;
            minLeadingWhitespace = Math.min(minLeadingWhitespace, leadingWhitespace);
        }
    }

    if (minLeadingWhitespace === 0) return lines;

    for (let i = 0; i < lines.length; ++i) {
        lines[i] = lines[i].slice(minLeadingWhitespace);
    }

    return lines;
}


function processClipboard(str: string) {
    if (str.trim().length === 0) return;

    const document = vscode.window.activeTextEditor?.document;
    if (!document) return;

    const filename: string = extractFilename(document.fileName);
    const lines: string[] = removeCommonLeadingWhitespace(trimBlankLines(str, getEndOfLineString(document.eol)));

    const lineCountLimit: number = getSetting<number>('lineCountLimit', 0);
    if (lineCountLimit > 0 && lines.length > lineCountLimit) return;

    const entry: HistoryEntry = new HistoryEntry(document.languageId, lines, filename, 0);

    history.push(entry);
    ++historyCount;

    const maxEntries: number = getSetting<number>('maxHistoryEntries', 20);

    while (historyCount > maxEntries) {
        history.shift();
        --historyCount;
    }
}


function handleClipboard() {
    vscode.env.clipboard.readText().then((clipboardContent) => {
        if (clipboardContent !== previousClipboardContent) {
            previousClipboardContent = clipboardContent;
            processClipboard(previousClipboardContent);
        }
    });
}


function addCmdCutToClipboard(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.cutToClipboard', () => {
        vscode.commands.executeCommand('editor.action.clipboardCutAction').then(() => {
            handleClipboard();
        });
    });

    context.subscriptions.push(cmd);
}


function addCmdCopyToClipboard(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.copyToClipboard', () => {
        vscode.commands.executeCommand('editor.action.clipboardCopyAction').then(() => {
            handleClipboard();
        });
    });

    context.subscriptions.push(cmd);
}


export function activate(context: vscode.ExtensionContext) {
    addCmdClearHistory(context);
    addCmdCopyToClipboard(context);
    addCmdCutToClipboard(context);

    let inlineHandler = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryInlineCompletionProvider()
    );

    context.subscriptions.push(inlineHandler);
}


export function deactivate() { }
