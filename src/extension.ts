import * as vscode from 'vscode';


class HistoryEntry {
    label: string;
    detail: string = "... from 'blah.cpp'";
    languageId: string;
    replacement: string[];
    keywords: string[];

    constructor(langId: string, filename: string, replacement: string[], keywords: string[]) {
        const suffix: string = replacement.length > 1 ? '...' : '';
        this.label = replacement[0] + suffix;

        this.detail = "... from '" + filename + "'";
        this.languageId = langId;
        this.replacement = replacement;
        this.keywords = keywords;
    }
}


let statusBarItem: vscode.StatusBarItem;
let previousClipboardContent = '';
let historyEntries: HistoryEntry[] = [];
let historyCount: number = 0;


function getSetting<T>(str: string, def: T): T {
    const config = vscode.workspace.getConfiguration('tails');
    return config.get<T>(str, def);
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


function updateStatusBarItem() {
    if (historyCount === 0) {
        statusBarItem.hide();
        return;
    }

    if (historyCount === 1) {
        statusBarItem.text = '1 clip';
    }
    else {
        statusBarItem.text = historyCount + ' clips';
    }

    statusBarItem.show();
}


function shouldIndexWord(str: string) {
    const ignoredWords = getSetting<string[]>('ignoredWords', []) || [];
    const ignoredRegexes = getSetting<string[]>('ignoredRegexes', []) || [];

    for (let word of ignoredWords) {
        if (word === str) return true;
    }

    for (let reg of ignoredRegexes) {
        const match = str.match(reg);
        if (match) return true;
    }

    if (str.length < 4) return true;

    return false;
}


function indexClip(str: string): string[] {
    const words = str.trim().match(/[^\s()[\]{}<>,.:;=+*&^%$#@!`~?|\\/]+/g);
    if (!words) return [];

    let offers: string[] = [];

    if (words !== null) {
        words.forEach(word => {
            if (!shouldIndexWord(word)) {
                if (!offers.includes(word)) {
                    offers.push(word);
                }
            }
        });
    }

    return offers;
}


function makeSuggestion(word: string, repl: string) {
    let item = new vscode.CompletionItem(word);
    item.kind = vscode.CompletionItemKind.User;
    item.detail = 'Clipboard history';
    item.insertText = repl;
    return item;
}


export class HistoryCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.CompletionItem[]> {
        if (getSetting<boolean>('enableCompletions', true) !== true) return [];

        let items: vscode.CompletionItem[] = [];
        const eol: string = getEndOfLineString(document.eol);

        for (const entry of historyEntries) {
            for (const word of entry.keywords) {
                const replacement: string = entry.replacement.join(eol);
                const item = makeSuggestion(word, replacement);
                items.push(item);
            }
        }

        return items;
    }
}


function showPasteList() {
    vscode.window.showQuickPick(historyEntries).then((selectedEntry) => {
        if (!selectedEntry) return;

        const editor = vscode.window.activeTextEditor;
        const document = editor?.document;
        if (!document) return;

        const clipboardContent = selectedEntry.replacement.join(getEndOfLineString(document.eol));
        vscode.env.clipboard.writeText(clipboardContent);

        vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    });
}


export class HistoryInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        if (getSetting<boolean>('enableInlineSuggestions', true) !== true) return [];

        let suggestions: vscode.InlineCompletionItem[] = [];

        const lineTextOrig = document.lineAt(position.line).text;
        const isAtEol = position.character === lineTextOrig.length;
        const lineText = lineTextOrig.substring(0, position.character).trimStart();
        const langId = document.languageId;

        if (!isAtEol) return [];
        if (lineText.length < 3) return [];

        for (const entry of historyEntries) {
            if (entry.languageId !== langId) continue;

            const indent = getCurrentLineIndentation();
            const joinStr = getEndOfLineString(document.eol) + indent;
            const str: string = entry.replacement.join(joinStr);

            if (entry.replacement[0].trim().startsWith(lineText)) {
                const suggestion = new vscode.InlineCompletionItem(str.trim().substring(lineText.length));
                suggestion.range = new vscode.Range(position.line, position.character, position.line, position.character);
                suggestions.push(suggestion);
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
        historyEntries = [];
        historyCount = 0;
        updateStatusBarItem();
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
        if (line.trim().length === 0) continue;

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


function alreadyInHistory(entry: HistoryEntry): boolean {
    for (const cur of historyEntries) {
        if (cur.languageId !== entry.languageId) continue;

        const curStr: string = cur.replacement.join('\n');
        const entryStr: string = entry.replacement.join('\n');

        if (curStr === entryStr) return true;
    }

    return false;
}


function addHistoryEntry(entry: HistoryEntry) {
    if (alreadyInHistory(entry)) return;

    historyEntries.unshift(entry);
    ++historyCount;

    const maxEntries: number = getSetting<number>('maxHistoryEntries', 20);

    while (historyCount > maxEntries) {
        historyEntries.pop();
        --historyCount;
    }

    updateStatusBarItem();
}


function cleanClip(str: string, eol: string) {
    return removeCommonLeadingWhitespace(trimBlankLines(str, eol));
}


function processClipboardString(str: string) {
    if (str.trim().length === 0) return;

    const document = vscode.window.activeTextEditor?.document;
    if (!document) return;

    const filename: string = extractFilename(document.fileName);
    const eol: string = getEndOfLineString(document.eol);
    const lines: string[] = cleanClip(str, eol);

    const lineCountLimit: number = getSetting<number>('lineCountLimit', 0);
    if (lineCountLimit > 0 && lines.length > lineCountLimit) return;

    const keywords: string[] = indexClip(str);
    const entry: HistoryEntry = new HistoryEntry(document.languageId, filename, lines, keywords);
    addHistoryEntry(entry);
}


function handleClipboard() {
    vscode.env.clipboard.readText().then((clipboardContent) => {
        if (clipboardContent !== previousClipboardContent) {
            previousClipboardContent = clipboardContent;
            processClipboardString(previousClipboardContent);
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


function addCmdPasteClip(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.pasteClip', () => {
        showPasteList();
    });

    context.subscriptions.push(cmd);
}


function addCommands(context: vscode.ExtensionContext) {
    addCmdClearHistory(context);
    addCmdCopyToClipboard(context);
    addCmdCutToClipboard(context);
    addCmdPasteClip(context);
}


function addCompletionHandlers(context: vscode.ExtensionContext) {
    let inlineHandler = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryInlineCompletionProvider()
    );

    context.subscriptions.push(inlineHandler);

    let codeCompletionHandler = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryCompletionProvider()
    );

    context.subscriptions.push(codeCompletionHandler);
}


export function activate(context: vscode.ExtensionContext) {
    addCommands(context);
    addCompletionHandlers(context);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    updateStatusBarItem();
    statusBarItem.show();
}


export function deactivate() { }
