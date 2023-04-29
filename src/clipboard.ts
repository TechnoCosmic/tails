import * as vscode from 'vscode';
import * as common from './common';


let extCtx: vscode.ExtensionContext;


function getReplacementText(entry: HistoryEntry, indent: string, eol: string): string {
    let str: string = entry.replacement.join(eol + indent);
    let xs: string = (entry.replacement.length > 1) ? eol : "";
    return str + xs;
}


function getLabel(entry: HistoryEntry): string {
    const suffix: string = entry.replacement.length > 1 ? '...' : '';
    return entry.replacement[0].trim() + suffix;
}


class HistoryEntry {
    label: string;
    detail: string;
    languageId: string;
    replacement: string[];
    keywords: string[];

    fileName: string = "";
    lineNumber: number = 0;

    constructor(langId: string, fileName: string, lineNumber: number, replacement: string[], keywords: string[]) {
        const xs: string = replacement.length > 1 ? "s" : "";
        const lineCountStr: string = replacement.length + " line" + xs + ",";

        this.detail = "... " + lineCountStr + " from '" + fileName + "'";
        this.languageId = langId;
        this.replacement = replacement;
        this.keywords = keywords;

        this.fileName = fileName;

        this.label = getLabel(this);
    }
}


let historyEntries: HistoryEntry[] = [];
let historyCount: number = 0;

let statusBarItem: vscode.StatusBarItem;
let previousClipboardContent = '';


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


function shouldIgnoreClip(str: string) {
    const clipIgnoredRegexes = common.getSetting<string[]>('clipIgnoredRegexes', []) || [];

    for (let reg of clipIgnoredRegexes) {
        const r: RegExp = new RegExp(reg, 'gm');
        if (r.exec(str)) return true;
    }

    return false;
}


function shouldIndexIgnoreWord(str: string) {
    const indexIgnoredWords = common.getSetting<string[]>('indexIgnoredWords', []) || [];
    const indexIgnoredRegexes = common.getSetting<string[]>('indexIgnoredRegexes', []) || [];

    for (let word of indexIgnoredWords) {
        if (word === str) return true;
    }

    for (let reg of indexIgnoredRegexes) {
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

    words.forEach(word => {
        if (!shouldIndexIgnoreWord(word) && !offers.includes(word)) {
            offers.push(word);
        }
    });

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
        if (common.getSetting<boolean>('enableCompletions', true) !== true) return [];

        let items: vscode.CompletionItem[] = [];
        const eol: string = common.getEndOfLineString(document.eol);
        const langId = document.languageId;

        for (const entry of historyEntries) {
            if (entry.languageId !== langId) continue;

            for (const word of entry.keywords) {
                const replacement: string = getReplacementText(entry, "", eol);
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

        const eolStr: string = common.getEndOfLineString(document.eol);
        const clipboardContent: string = getReplacementText(selectedEntry, "", eolStr);

        vscode.env.clipboard.writeText(clipboardContent).then(() => {
            const pasteCmd: string = common.getSetting<string>('tails.pasteCommand', 'editor.action.clipboardPasteAction');
            vscode.commands.executeCommand(pasteCmd);
        });
    });
}


export class HistoryInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        if (common.getSetting<boolean>('enableInlineSuggestions', true) !== true) return [];

        let suggestions: vscode.InlineCompletionItem[] = [];

        const lineTextOrig = document.lineAt(position.line).text;
        const isAtEol = position.character === lineTextOrig.length;
        const lineText = lineTextOrig.substring(0, position.character).trimStart();
        const langId = document.languageId;

        if (!isAtEol) return [];
        if (lineText.length < 3) return [];

        const eol: string = common.getEndOfLineString(document.eol);
        const indent: string = common.getCurrentLineIndentation();

        for (const entry of historyEntries) {
            if (entry.languageId !== langId) continue;

            const str: string = getReplacementText(entry, indent, eol);

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


function saveHistory(): void {
    const persist: boolean = common.getSetting<boolean>(`tails.persistHistory`, true);
    if (!persist) return;

    extCtx.workspaceState.update('tails.historyCount', historyCount);
    extCtx.workspaceState.update('tails.history', historyEntries);
}


function clearHistory(): void {
    historyEntries = [];
    historyCount = 0;
    updateStatusBarItem();
    saveHistory();
}


function addCmdClearHistory(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.clearHistory', () => {
        clearHistory();
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
    const entryStr: string = entry.replacement.join('\n');

    for (const cur of historyEntries) {
        if (cur.languageId !== entry.languageId) continue;
        if (cur.replacement.join('\n') === entryStr) return true;
    }

    return false;
}


function addHistoryEntry(entry: HistoryEntry) {
    if (alreadyInHistory(entry)) return;

    historyEntries.unshift(entry);
    ++historyCount;

    const maxEntries: number = common.getSetting<number>('maxHistoryEntries', 20);

    while (historyCount > maxEntries) {
        historyEntries.pop();
        --historyCount;
    }

    updateStatusBarItem();
    saveHistory();
}


function cleanClip(str: string, eol: string) {
    return removeCommonLeadingWhitespace(trimBlankLines(str, eol));
}


function processClipboardString(str: string) {
    if (str.trim().length === 0) return;
    if (shouldIgnoreClip(str)) return;

    const document = vscode.window.activeTextEditor?.document;
    if (!document) return;

    const fileName: string = extractFilename(document.fileName);
    const eol: string = common.getEndOfLineString(document.eol);

    // tidy, index, and store the clip
    const lines: string[] = cleanClip(str, eol);
    const lineCountLimit: number = common.getSetting<number>('lineCountLimit', 0);
    if (lineCountLimit > 0 && lines.length > lineCountLimit) return;

    const keywords: string[] = indexClip(str);
    const entry: HistoryEntry = new HistoryEntry(document.languageId, fileName, 0, lines, keywords);
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
        const cutCmd: string = common.getSetting<string>('tails.cutCommand', 'editor.action.clipboardCutAction');

        vscode.commands.executeCommand(cutCmd).then(() => {
            handleClipboard();
        });
    });

    context.subscriptions.push(cmd);
}


function addCmdCopyToClipboard(context: vscode.ExtensionContext) {
    let cmd = vscode.commands.registerCommand('tails.copyToClipboard', () => {
        const copyCmd: string = common.getSetting<string>('tails.copyCommand', 'editor.action.clipboardCopyAction');

        vscode.commands.executeCommand(copyCmd).then(() => {
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


function addCommands(context: vscode.ExtensionContext) {
    addCmdClearHistory(context);
    addCmdCopyToClipboard(context);
    addCmdCutToClipboard(context);
    addCmdPasteClip(context);
}


function addStatusBarItem() {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    updateStatusBarItem();
    statusBarItem.show();
}


function loadHistory(): void {
    const persist: boolean = common.getSetting<boolean>(`tails.persistHistory`, true);
    if (!persist) return;

    const storedEntries: HistoryEntry[] | undefined = extCtx.workspaceState.get('tails.history');
    const storedCount: number | undefined = extCtx.workspaceState.get('tails.historyCount');

    if (storedEntries && storedCount) {
        historyEntries = storedEntries;
        historyCount = storedCount;
    }
}


export function connect(context: vscode.ExtensionContext) {
    extCtx = context;
    loadHistory();
    addCommands(context);
    addCompletionHandlers(context);
    addStatusBarItem();
}
