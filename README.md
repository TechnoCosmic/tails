## Features

Comprehensive clipboard history.

## Settings

### Feature Control

Tails offers four ways to paste clips...

1) From a quick pick list accessed via the `tails.pasteClip` command (default keybinding is `ctrl+shift+v`).
2) From an IntelliSense context menu. This is where *indexing* (see below) is used.
3) Inline suggestions. If you start typing a clip (from it's start), Tails will offer the clip as a sexy little inline suggestion.
4) Clipboard Ring: Clips can be pasted in sequence into the current selection using `tails.ringPasteClip` (`tails.smartPasteClip` will use ring pasting when there's a selected range of text when activated, and will use `tails.pasteClip` when there's no range selected). You can control which clips are cycled through with the `tails.clipRing.lineCountLimit` setting.

You can disable the use of the second point via `tails.intelliSense.enable`, and point threee can be disabled via `tails.inlineSuggestions.enable`.

### History Control

`tails.persistHistory` controls whether Tails will preserve your clips between sessions (on a per-workspace basis).

`tails.maxHistoryEntries` controls the maximum number of history entries before tossing out older clips.

`tails.clipFiltering.lineCountLimit` lets you tell Tails not to remember giant copy/paste efforts by setting a limit to the number of lines a clip can contain. If you cut/copy anything longer than this, Tails will pretend it didn't notice.

`tails.clipIgnoredRegexes` controls whether a clip will be entered into history. Clips matching any of these regular expressions will be ignored by Tails.

### Indexing

Tails extracts words of interest from your history entries so that it can present different clips to you when you start typing something contained within the clip, as part of it's little Intellisense provider thingy.

You can tell Tails to ignore given words or regular expressions for indexing purposes. I use this to tell Tails to ignore all the language keywords, so I will only get Intellisense thingies for words such as function names and identifiers contained within the clip.

Use `tails.indexIgnoredWords` and `tails.indexIgnoredRegexes` to make your own ignore list.

### Working with other clipboard extensions

If you want to use Tails in conjuction with another clipboard extension, shame on you. But in your shame, you can change which command IDs Tails will use to cut, copy, and paste from the clipboard. By default, Tails uses the VSCode native commands, but you may want to alter them to use the ones provided by the other clipboard extension you're flirting with.

`tail.cutCommand`, `tails.copyCommand`, `tails.pasteCommand` are the settings you want for this.

If it's only Tails playing clipboard shenanigans, then you won't need to play with these.
