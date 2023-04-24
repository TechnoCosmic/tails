## Features

Clipboard history, done simple. 

## Settings

### Feature Control

Tails offers three ways to paste clips...

1) From a quick pick list accessed via the `tails.pasteClip` command (default keybinding is `ctrl+shift+v`).
2) From an Intellisense context menu. This is where *indexing* (see below) is used.
3) Inline suggestions. If you start typing a clip (from it's start), Tails will offer the clip as a sexy little inline suggestion.

You can disable the use of #2 via `tails.enableCompletions`, and #3 can be disabled via `tails.enableInlineSuggestions`.

### History Control

`tails.persistHistory` controls whether Tails will preserve your clips between sessions (on a per-workspace basis).

`tails.maxHistoryEntries` controls the maximum number of history entries before tossing out older clips.

`tails.lineCountLimit` lets you tell Tails not to remember giant copy/paste efforts by setting a limit to the number of lines a clip can contain. If you cut/copy anything longer than this, Tails will pretend it didn't notice.

### Indexing

Tails extracts words of interest from your history entries so that it can present different clips to you when you start typing something contained within the clip, as part of it's little Intellisense provider thingy.

You can tell Tails to ignore given words or regular expressions for indexing purposes. I use this to tell Tails to ignore all the language keywords, so I will only get Intellisense thingies for words such as function names and identifiers contained within the clip.

Use `tails.ignoredWords` and `tails.ignoredRegexes` to make your own ignore list.
