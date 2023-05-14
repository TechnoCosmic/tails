import * as vscode from 'vscode';
import * as common from './common';


function getReplacementText(entry: any, indent: string, eol: string): string {
    let str: string = entry.replacement.join(eol + indent);
    let xs: string = (entry.replacement.length > 1) ? eol : "";
    return str + xs;
}


function getLabel(entry: HistoryEntry): string {
    const suffix: string = entry.replacement.length > 1 ? '...' : '';
    return entry.replacement[0].trim() + suffix;
}


class HistoryEntry {
    timestamp: number;

    label: string;
    detail: string;
    languageId: string;
    replacement: string[];
    keywords: string[];

    fileName: string = "";
    lineNumber: number = 0;

    buttons?: vscode.QuickInputButton[];

    constructor(timestamp: number, langId: string, fileName: string, lineNumber: number, replacement: string[], keywords: string[]) {
        const xs: string = replacement.length > 1 ? "s" : "";
        const lineCountStr: string = replacement.length + " line" + xs + ",";

        this.timestamp = timestamp;
        this.detail = "... " + lineCountStr + " from '" + fileName + "'";
        this.languageId = langId;
        this.replacement = replacement;
        this.keywords = keywords;
        this.fileName = fileName;

        this.label = getLabel(this);
    }
}


function addButtons(entry: HistoryEntry): void {
    entry.buttons = [{ iconPath: new vscode.ThemeIcon("trash") }];
}


async function pasteText(str: string) {
    const pasteCmd: string = common.getSetting<string>('tails.pasteCommand', 'editor.action.clipboardPasteAction');
    await vscode.env.clipboard.writeText(str);
    return vscode.commands.executeCommand(pasteCmd);
}


// *********************************************************************************************************************
// CSV Paste
// *********************************************************************************************************************

async function pasteAsCsv() {
    let outStr: string = "";
    let doneOne: boolean = false;

    if (historyEntries.length === 0) {
        vscode.window.showErrorMessage('No clips to paste');
        return;
    }

    const wrapStr: string = await vscode.window.showInputBox({
        prompt: "Optional wrapping character",
        placeHolder: 'e.g. \"',
        value: ''
    }) || "";

    for (const entry of historyEntries) {
        for (const str of entry.replacement) {
            let escaped: string = str;

            if (wrapStr.length > 0) {
                escaped = str.replace(new RegExp(wrapStr[0], 'g'), '\\' + wrapStr[0] + '');
            }

            if (doneOne) outStr += ", ";
            doneOne = true;

            outStr += wrapStr + escaped + wrapStr;
        }
    }

    if (doneOne) {
        pasteText(outStr);
    }
}


// *********************************************************************************************************************
// Smart Paste Clip
// *********************************************************************************************************************

function smartPasteClip(): void {
    const selection = vscode.window.activeTextEditor?.selection;
    if (!selection) return;

    if (selection.isEmpty) {
        showPasteList();
    } else {
        pasteNextFromRing();
    }
}


// *********************************************************************************************************************
// Clip Ring Pasting
// *********************************************************************************************************************

let curRingIndex: number = -1;


function isValidRingClip(entry: HistoryEntry, docLangId: string): boolean {
    const lineCountLimit: number = common.getSetting<number>('clipRing.lineCountLimit', 1);
    return entry.languageId == docLangId && (lineCountLimit == 0 || entry.replacement.length <= lineCountLimit);
}


function getNextRingClipIndex(afterIndex: number, docLangId: string): number {
    const startIndex: number = afterIndex;
    let curIndex: number = startIndex;

    while (true) {
        curIndex = (curIndex + 1) % historyEntries.length;
        if (curIndex === startIndex) return startIndex;

        const entry: HistoryEntry = historyEntries[curIndex];
        if (isValidRingClip(entry, docLangId)) return curIndex;
    }
}


function pasteNextFromRing(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const { document } = editor;
    if (!document) return;

    const nextRingIndex: number = getNextRingClipIndex(curRingIndex, document.languageId);
    if (nextRingIndex === curRingIndex) return;
    if (nextRingIndex < 0) return;
    if (nextRingIndex >= historyEntries.length) return;

    const anch: vscode.Position = editor.selection.anchor;
    const startPosn: vscode.Position = editor.selection.start;
    const beginning: vscode.Position = anch < startPosn ? anch : startPosn;

    const entry: HistoryEntry = historyEntries[nextRingIndex];
    const clipboardContent: string = getReplacementText(entry, '', common.getEndOfLineString(document.eol));

    pasteText(clipboardContent).then(() => {
        curRingIndex = nextRingIndex;

        const currentPosition: vscode.Position = editor.selection.active;
        const selectionRange: vscode.Range = new vscode.Range(beginning, currentPosition);

        editor.selection = new vscode.Selection(selectionRange.start, selectionRange.end);
    });
}


// *********************************************************************************************************************
// Clip Filtering
// *********************************************************************************************************************

function shouldIgnoreClip(str: string): boolean {
    const clipIgnoredRegexes = common.getSetting<string[]>('clipFiltering.ignoredRegexes', []) || [];

    for (let reg of clipIgnoredRegexes) {
        const r: RegExp = new RegExp(reg, 'gm');
        if (r.exec(str)) return true;
    }

    return false;
}


// *********************************************************************************************************************
// IntelliSense Indexing
// *********************************************************************************************************************

function intellisenseShouldIgnoreWord(str: string): boolean {
    const indexIgnoredWords = common.getSetting<string[]>('intellisense.ignoredWords', []) || [];
    const indexIgnoredRegexes = common.getSetting<string[]>('intellisense.ignoredRegexes', []) || [];

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


function intellisenseIndexClip(str: string): string[] {
    const words = str.trim().match(/[^\s()[\]\'{}<>,.:;=+*&^%$#@!`~?|\\/]+/g);
    if (!words) return [];

    let offers: string[] = [];

    words.forEach(word => {
        if (!intellisenseShouldIgnoreWord(word) && !offers.includes(word)) {
            offers.push(word);
        }
    });

    return offers;
}


// *********************************************************************************************************************
// IntelliSense List
// *********************************************************************************************************************

function makeSuggestion(word: string, repl: string): vscode.CompletionItem {
    let item = new vscode.CompletionItem(word);
    item.kind = vscode.CompletionItemKind.User;
    item.detail = 'Clipboard history';
    item.insertText = repl;
    return item;
}


export class HistoryCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.CompletionItem[]> {
        if (common.getSetting<boolean>('intellisense.enable', true) !== true) return [];

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


// *********************************************************************************************************************
// Paste List
// *********************************************************************************************************************

let list = vscode.window.createQuickPick();


function showPasteList(): void {
    list.items = historyEntries;
    list.matchOnDetail = true;
    list.canSelectMany = false;
    list.value = '';

    list.onDidTriggerItemButton((event) => {
        if (!event) return;

        const item: HistoryEntry = event.item as HistoryEntry;
        if (!item.buttons) return;
        if (event.button !== item.buttons[0]) return;

        const index: number = historyEntries.indexOf(item);

        deleteHistoryEntryByIndex(index);
        list.items = historyEntries;

        if (historyEntries.length === 0) {
            list.hide();
            return;
        }
    });

    list.onDidAccept(async () => {
        list.hide();

        const selectedEntry = list.selectedItems[0];
        if (!selectedEntry) return;

        list.selectedItems = [];

        const document = vscode.window.activeTextEditor?.document;
        if (!document) return;

        const eolStr: string = common.getEndOfLineString(document.eol);
        const clipboardContent: string = getReplacementText(selectedEntry, "", eolStr);

        await pasteText(clipboardContent);
    });

    list.show();
}


// *********************************************************************************************************************
// Inline Suggestions
// *********************************************************************************************************************

export class HistoryInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        if (common.getSetting<boolean>('inlineSuggestions.enable', true) !== true) return [];

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

            const maxLines: number = common.getSetting<number>('intellisense.maxLineCount', 0);
            if (maxLines > 0 && entry.replacement.length > maxLines) continue;

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


// *********************************************************************************************************************
// List Manipulation
// *********************************************************************************************************************

let historyEntries: HistoryEntry[] = [];


function addHistoryEntry(entry: HistoryEntry): boolean {
    if (alreadyInHistory(entry)) return false;
    historyEntries.unshift(entry);

    const maxEntries: number = common.getSetting<number>('maxHistoryEntries', 20);

    while (historyEntries.length > maxEntries) {
        historyEntries.pop();
    }

    addButtons(entry);
    saveHistory();

    return true;
}


function deleteHistoryEntryByIndex(index: number): void {
    if (index < 0) return;
    if (index >= historyEntries.length) return;

    historyEntries.splice(index, 1);
    saveHistory();
}


function deleteHistoryEntryByTimestamp(timestamp: number): void {
    if (timestamp === 0) return;

    for (let i: number = 0; i < historyEntries.length; ++i) {
        if (historyEntries[i].timestamp === timestamp) {
            historyEntries.splice(i, 1);
            break;
        }
    }

    saveHistory();
}


function clearHistory(): void {
    historyEntries = [];
    saveHistory();
}


// *********************************************************************************************************************
// List Loading/Saving
// *********************************************************************************************************************

function loadHistory(): void {
    const persist: boolean = common.getSetting<boolean>(`tails.persistHistory`, true);
    if (!persist) return;

    const storedEntries: HistoryEntry[] | undefined = extCtx.workspaceState.get('tails.history') || [];

    if (storedEntries) {
        historyEntries = storedEntries;

        for (let entry of historyEntries) {
            addButtons(entry);
        }
    }

    updateStatusBar();
}


function saveHistory(): void {
    const persist: boolean = common.getSetting<boolean>(`tails.persistHistory`, true);
    if (!persist) return;

    extCtx.workspaceState.update('tails.history', historyEntries);
    updateStatusBar();
}


// *********************************************************************************************************************
// Commands
// *********************************************************************************************************************

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


function cleanClip(str: string, eol: string): string[] {
    return removeCommonLeadingWhitespace(trimBlankLines(str, eol));
}


function extractFilename(path: string): string {
    let filenameRegex = /\/([^\/]+)$/;

    if (process.platform === 'win32') {
        filenameRegex = /.*[\\/](.*)$/;
    }

    const match = path.match(filenameRegex);
    if (!match) return path;

    return match[1];
}


function processClipboardString(str: string): number {
    if (str.trim().length === 0) return 0;
    if (shouldIgnoreClip(str)) return 0;

    const document = vscode.window.activeTextEditor?.document;
    if (!document) return 0;

    const fileName: string = extractFilename(document.fileName);
    const eol: string = common.getEndOfLineString(document.eol);

    // tidy, index, and store the clip
    const lines: string[] = cleanClip(str, eol);
    const lineCountLimit: number = common.getSetting<number>('clipFiltering.lineCountLimit', 0);
    if (lineCountLimit > 0 && lines.length > lineCountLimit) return 0;

    const charCountMin: number = common.getSetting<number>('clipFiltering.singleLineCharCountMinimum', 4);
    if (charCountMin > 0 && lines.length === 1 && lines[0].length < charCountMin) return 0;

    const keywords: string[] = intellisenseIndexClip(str);
    const entry: HistoryEntry = new HistoryEntry(Date.now(), document.languageId, fileName, 0, lines, keywords);

    if (addHistoryEntry(entry)) {
        return entry.timestamp;
    }

    return 0;
}


let lastAddedTimestamp: number = 0;


function handleClipboard(): void {
    vscode.env.clipboard.readText().then((clipboardContent) => {
        const curTimestamp: number = processClipboardString(clipboardContent);
        if (curTimestamp) lastAddedTimestamp = curTimestamp;
    });
}


// *********************************************************************************************************************
// Status Bar Item
// *********************************************************************************************************************

let statusBarItem: vscode.StatusBarItem;


function updateStatusBar(): void {
    if (!statusBarItem) return;

    if (historyEntries.length === 0) {
        statusBarItem.hide();
        return;
    }

    if (historyEntries.length === 1) {
        statusBarItem.text = '1 clip';
    }
    else {
        statusBarItem.text = historyEntries.length + ' clips';
    }

    statusBarItem.show();
}


function addStatusBarItem(): void {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    updateStatusBar();
    statusBarItem.show();
}


// *********************************************************************************************************************
// Context/Connection
// *********************************************************************************************************************

let extCtx: vscode.ExtensionContext;
let lastCutTimestamp: number = 0;


function addCmdClearHistory(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.clearHistory', () => {
        clearHistory();
    });

    context.subscriptions.push(cmd);
}


function addCmdCutToClipboard(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.cutToClipboard', () => {
        const cutCmd: string = common.getSetting<string>('tails.cutCommand', 'editor.action.clipboardCutAction');
        const throttleMs: number = common.getSetting<number>('tails.clipFiltering.cutThrottleMilliseconds', 500);

        const curTimestamp: number = Date.now();
        const diffTimestamp: number = curTimestamp - lastCutTimestamp;

        lastCutTimestamp = curTimestamp;

        vscode.commands.executeCommand(cutCmd).then(() => {
            if (diffTimestamp >= throttleMs) {
                handleClipboard();
            }
            else if (lastAddedTimestamp > 0) {
                const diff: number = Date.now() - lastAddedTimestamp;

                if (diff < throttleMs) {
                    deleteHistoryEntryByTimestamp(lastAddedTimestamp);
                    lastAddedTimestamp = 0;
                }
            }
        });
    });

    context.subscriptions.push(cmd);
}


function addCmdCopyToClipboard(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.copyToClipboard', () => {
        const copyCmd: string = common.getSetting<string>('tails.copyCommand', 'editor.action.clipboardCopyAction');

        vscode.commands.executeCommand(copyCmd).then(() => {
            handleClipboard();
        });
    });

    context.subscriptions.push(cmd);
}


function addCmdCsvPaste(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.csvPaste', () => {
        pasteAsCsv();
    });

    context.subscriptions.push(cmd);
}


function addCmdPasteClip(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.pasteClip', () => {
        showPasteList();
    });

    context.subscriptions.push(cmd);
}


function addCmdRingPasteClip(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.ringPasteClip', () => {
        pasteNextFromRing();
    });

    context.subscriptions.push(cmd);
}


function addCmdSmartPasteClip(context: vscode.ExtensionContext): void {
    let cmd = vscode.commands.registerCommand('tails.smartPasteClip', () => {
        smartPasteClip();
    });

    context.subscriptions.push(cmd);
}


function addCompletionHandlers(context: vscode.ExtensionContext): void {
    let inlineHandler = vscode.languages.registerInlineCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryInlineCompletionProvider()
    );

    context.subscriptions.push(inlineHandler);

    let codeCompletionHandler = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: '*' }, new HistoryCompletionProvider()
    );

    context.subscriptions.push(codeCompletionHandler);
}


function addCommands(context: vscode.ExtensionContext): void {
    addCmdClearHistory(context);
    addCmdCopyToClipboard(context);
    addCmdCutToClipboard(context);
    addCmdPasteClip(context);
    addCmdRingPasteClip(context);
    addCmdSmartPasteClip(context);
    addCmdCsvPaste(context);
}


export function connect(context: vscode.ExtensionContext): void {
    extCtx = context;
    addStatusBarItem();
    loadHistory();
    addCommands(context);
    addCompletionHandlers(context);
}
