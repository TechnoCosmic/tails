/* eslint-disable curly */
import * as vscode from 'vscode';


const MAX_ITEM_LEN: number = 2048;

class HistoryEntry {
    languageId: string;
    replacement: string;
    file: string;
    lineNumber: number;

    constructor(langId: string, replacement: string, file: string, lineNumber: number) {
        this.languageId = langId;
        this.replacement = replacement;
        this.file = file;
        this.lineNumber = lineNumber;
    }
}


let previousClipboardContent = '';
let history: HistoryEntry[] = [];
let historyCount: number = 0;


function makeSuggestion(word: string, index: number, entry: HistoryEntry) {
    let item = new vscode.CompletionItem(word);
    item.kind = vscode.CompletionItemKind.User;
    item.detail = "#" + index + ", copied from " + entry.file;
    item.insertText = entry.replacement;
    return item;
}


function makeShortSuggestion(word: string, repl: string) {
    let item = new vscode.CompletionItem(word);
    item.kind = vscode.CompletionItemKind.User;
    item.insertText = repl;
    return item;
}


export class HistoryCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.CompletionItem[]> {

        let items: vscode.CompletionItem[] = [];
        let offers: string[] = [];
        const langId: string = document.languageId;

        for (let i: number = 0; i < historyCount; ++i) {
            const entry = history[i];

            if (entry.languageId === langId) {
                items.push(makeSuggestion("clip" + (i + 1), i + 1, entry));

                const words = entry.replacement.trim().match(/[^\s()[\]{}<>,.:;=+*&^%$#@!`~?|\\/]+/g);

                if (words !== null) {
                    words.forEach(word => {
                        const key = word + ':' + history[i].replacement;

                        if (!offers.includes(key)) {
                            offers.push(key);
                            items.push(makeSuggestion(word, i + 1, entry));
                        }
                    });
                }
            }
        }

        return items;
    }
}


export class HistoryInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        let suggestions: vscode.InlineCompletionItem[] = [];
        const lineText = document.lineAt(position.line).text.substring(0, position.character).trimStart();
        const langId = document.languageId;

        if (lineText.length >= 3) {
            for (const entry of history) {
                if (entry.languageId === langId) {
                    const str: string = entry.replacement;

                    if (str.trim().startsWith(lineText)) {
                        const suggestion = new vscode.InlineCompletionItem(str.trim().substring(lineText.length));
                        suggestion.range = new vscode.Range(position.line, position.character, position.line, position.character);
                        suggestions.push(suggestion);
                    }
                }
            }
        }

        return suggestions;
    }
}


function alreadyInHistory(text: string) {
    history.forEach(entry => {
        if (entry.replacement === text) {
            return true;
        }
    });

    return false;
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


function onClipboardChanged(text: string, lineNum: number) {
    if (text.trim().length === 0) return;
    if (alreadyInHistory(text)) return;
    if (text.length > MAX_ITEM_LEN) return;

    const document = vscode.window.activeTextEditor?.document;
    if (!document) return;

    const filename = extractFilename(document.fileName);
    const entry = new HistoryEntry(document.languageId, text, filename, lineNum);
    history.push(entry);
    ++historyCount;

    const config = vscode.workspace.getConfiguration('tails');
    const maxEntries = config.get('maxHistoryEntries', 20);

    while (historyCount > maxEntries) {
        history.shift();
        --historyCount;
    }
}


function checkClipboard(lineNum: number) {
    vscode.env.clipboard.readText().then((clipboardContent) => {
        if (clipboardContent !== previousClipboardContent) {
            previousClipboardContent = clipboardContent;
            onClipboardChanged(previousClipboardContent, lineNum);
        }
    });
}


function addCmdClearHistory(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.clearHistory', () => {
        history = [];
        historyCount = 0;
    });

    context.subscriptions.push(cmd);
}


function getSelectionLineCount() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return 0; }

    const startLine = editor.selection.start.line;
    const endLine = editor.selection.end.line;
    const adjustment = editor.selection.end.character === 0 ? 0 : 1;

    return endLine - startLine + adjustment;
}


function addCmdCutToClipboard(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.cutToClipboard', () => {
        const config = vscode.workspace.getConfiguration('tails');
        const lineLimit = config.get('lineCountLimit', 5);
        const lineCount: number = getSelectionLineCount();

        if (lineLimit > 0 && lineCount <= lineLimit) {
            vscode.commands.executeCommand('editor.action.clipboardCutAction').then(() => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;

                const lineNum = editor.selection.active.line;
                checkClipboard(lineNum);
            });
        }
    });

    context.subscriptions.push(cmd);
}


function addCmdCopyToClipboard(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.copyToClipboard', () => {
        const config = vscode.workspace.getConfiguration('tails');
        const lineLimit = config.get('lineCountLimit', 5);
        const lineCount: number = getSelectionLineCount();

        if (lineLimit > 0 && lineCount <= lineLimit) {
            vscode.commands.executeCommand('editor.action.clipboardCopyAction').then(() => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;

                const lineNum = editor.selection.active.line;
                checkClipboard(lineNum);
            });
        }
    });

    context.subscriptions.push(cmd);
}


export function activate(context: vscode.ExtensionContext) {
    addCmdClearHistory(context);
    addCmdCopyToClipboard(context);
    addCmdCutToClipboard(context);

    let codeCompletionHandler = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryCompletionProvider()
    );

    context.subscriptions.push(codeCompletionHandler);

    let inlineHandler = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryInlineCompletionProvider()
    );

    context.subscriptions.push(inlineHandler);
}


export function deactivate() { }
