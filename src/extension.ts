import * as vscode from 'vscode';


const MAX_ITEMS: number = 20;
const MAX_ITEM_LEN: number = 2048;

let previousClipboardContent = '';
let history: string[] = [];
let historyCount: number = 0;


function makeQuickSuggestion(word: string, replacement: string) {
    let item = new vscode.CompletionItem(word);
    item.kind = vscode.CompletionItemKind.User;
    item.detail = "From clipboard";
    item.insertText = replacement;
    return item;
}


export class MyCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.CompletionItem[]> {

        let items: vscode.CompletionItem[] = [];
        let offers: string[] = [];

        for (let i: number = 0; i < historyCount; ++i) {
            const words = history[i].trim().match(/[^\s()[\]{}<>,.:;=+*&^%$#@!`~?|\\/]+/g);

            if (words !== null) {
                words.forEach(word => {
                    const key = word + ':' + history[i];

                    if (!offers.includes(key)) {
                        offers.push(key);
                        items.push(makeQuickSuggestion(word, history[i]));
                    }
                });
            }
        }

        return items;
    }
}


function onClipboardChanged(text: string) {
    if (text.trim().length === 0) { return; }
    if (history.includes(text)) { return; }
    if (text.length > MAX_ITEM_LEN) { return; }

    history.push(text);
    ++historyCount;

    while (historyCount > MAX_ITEMS) {
        history.shift();
        --historyCount;
    }
}


function checkClipboard() {
    vscode.env.clipboard.readText().then((clipboardContent) => {
        if (clipboardContent !== previousClipboardContent) {
            previousClipboardContent = clipboardContent;
            onClipboardChanged(previousClipboardContent);
        }
    });
}


export function activate(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.clearHistory', () => {
        history = [];
        historyCount = 0;
    });

    context.subscriptions.push(cmd);

    let myCompleter = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: '*' }, new MyCompletionProvider()
    );

    context.subscriptions.push(myCompleter);

    setInterval(checkClipboard, 1000); // Poll every 1 second
}


export function deactivate() { }
