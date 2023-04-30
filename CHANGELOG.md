# Change Log

## [1.3.0]

- Basic clipboard ring pasting, plus smart paste. Hard-coded to only consider single line clips as substitutes for now. Next revision will get regexes and stuff for filtering, like the other features have.

## [1.2.0]

- Can now delete individual clips from history via the paste list.

## [1.1.3]

- Added `tails.clipIgnoredRegexes`, and `tails.cutCommand`, `tails.copyCommand`, and `tails.pasteCommand`.

## [1.1.2]

- Fug bix for pasting from persisted history.

## [1.1.1]

- Clipboard history persists per-workspace

## [1.0.12]

- Commands implemented properly in package.json

## [1.0.10]

- More random tidy ups and quality of life improvements

## [1.0.9]

- Optimisations and tidy ups

## [1.0.8]

- Status bar item
- pasteClip command to show quick pick list of history

## [1.0.7]

- Fine tuning on the indexing of clip contents
- No longer stores duplicates in history

## [1.0.6]

- Smarter indentation when presenting inline suggestions
- Put normal Intellisense code completion back in
- Much tidier code, but plenty to go

## [1.0.4]

- Fixed a bug with copying/cutting longer than `lineCountLimit`

## [1.0.3]

- Added `ignoredWords/Regexes` settings to avoid code (tab) completion clutter

## [1.0.2]

- Experimental inline suggestions

## [1.0.1]

- Initial release
