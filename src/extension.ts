import * as vscode from 'vscode';


const MAX_ITEM_LEN: number = 2048;

let previousClipboardContent = '';
let history: HistoryEntry[] = [];
let historyCount: number = 0;


class HistoryEntry {
    replacement: string;
    file: string;
    lineNumber: number;

    constructor(replacement: string, file: string, lineNumber: number) {
        this.replacement = replacement;
        this.file = file;
        this.lineNumber = lineNumber;
    }
}


function makeQuickSuggestion(word: string, index: number, entry: HistoryEntry) {
    let item = new vscode.CompletionItem(word);
    item.kind = vscode.CompletionItemKind.User;
    item.detail = "#" + index + ", copied from " + entry.file;
    item.insertText = entry.replacement;
    return item;
}


export class HistoryCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.CompletionItem[]> {

        let items: vscode.CompletionItem[] = [];
        let offers: string[] = [];

        for (let i: number = 0; i < historyCount; ++i) {
            const entry = history[i];
            const words = entry.replacement.trim().match(/[^\s()[\]{}<>,.:;=+*&^%$#@!`~?|\\/]+/g);

            items.push(makeQuickSuggestion("clip" + (i + 1), i + 1, entry));

            if (words !== null) {
                words.forEach(word => {
                    const key = word + ':' + history[i];

                    if (!offers.includes(key)) {
                        offers.push(key);
                        items.push(makeQuickSuggestion(word, i + 1, entry));
                    }
                });
            }
        }

        return items;
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
    if (!match) { return path; }

    return match[1];
}


function onClipboardChanged(text: string, lineNum: number) {
    if (text.trim().length === 0) { return; }
    if (alreadyInHistory(text)) { return; }
    if (text.length > MAX_ITEM_LEN) { return; }

    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) { return; }

    const filename = extractFilename(document.fileName);
    const entry = new HistoryEntry(text, filename, lineNum);
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



function addCmdCutToClipboard(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.cutToClipboard', () => {
        vscode.commands.executeCommand('editor.action.clipboardCutAction').then(() => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const lineNum = editor.selection.active.line;
            checkClipboard(lineNum);
        });
    });

    context.subscriptions.push(cmd);
}


function addCmdCopyToClipboard(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.copyToClipboard', () => {
        vscode.commands.executeCommand('editor.action.clipboardCopyAction').then(() => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { return; }

            const lineNum = editor.selection.active.line;
            checkClipboard(lineNum);
        });
    });

    context.subscriptions.push(cmd);
}


export function activate(context: vscode.ExtensionContext) {
    addCmdClearHistory(context);
    addCmdCopyToClipboard(context);
    addCmdCutToClipboard(context);

    let myCompleter = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryCompletionProvider()
    );

    context.subscriptions.push(myCompleter);
}


export function deactivate() { }
