# Change Log

All notable changes to the "DSPF-Editor" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Printer file (`.prtf`/`.PRTF`) support: the Design and Preview views now open for printer-file source too. Vertical field placement is computed accurately from `PAGSIZ` and the `SPACEB`/`SKIPB`/`SPACEA`/`SKIPA` line-advance keywords, not guessed - matching how a real printer file lays out when a line-number column is left blank. File type is detected from the file extension, not VS Code's language ID, since another extension controls what language ID gets assigned to `.prtf` files.
- The keyword combobox now includes `PAGSIZ`.

### Fixed

- The Add Field and Display Type controls no longer offer printer-illegal options (`Input`/`Both`/`Hidden`) when editing a printer file - printer-file fields are output-only.

## [0.1.1] - 2026-08-17

### Fixed

- Edits made through the renderer no longer autosave the source file. They apply to the open document like any other edit, so you can undo them (`Ctrl+Z`/`Cmd+Z`) or close without saving to discard them.

## [0.1.0] - 2026-08-17

### Added

- The renderer now opens automatically as the default editor for `.dspf` files, instead of requiring the source already open and a manual command.
- **Preview mode**: compose multiple record formats together, read-only, to see how a screen actually looks when an RPG program `WRITE`s several formats without clearing between them. Windows always render on top of whatever else is composed.
- **Indicators panel**: toggle indicators on/off to preview conditional field and keyword visibility (AND-only; the DDS AND/OR relator column isn't parsed yet).
- **File Keywords** and **Format Keywords** are now editable, and live together as tabs in the right-hand panel alongside the selected field's own properties/keywords.
- The sidebar's "add field" buttons (Named field, Date field, Time field, Constant text, System name/Date/Time constant) now actually create fields - they were previously wired up incorrectly and silently did nothing.
- Field properties (`Display Type`, `Type`) are now dropdowns instead of free text.
- The DDS keyword name field is a filterable, creatable combobox listing common DSPF/PRTF keywords, so you can pick one or type a name that isn't listed.
- The record-format selector is a searchable dropdown instead of a tab strip, so it scales to files with many record formats.
- Edits made through the renderer now save the source file automatically, and the render stays in sync with edits made directly in the source text too.

### Fixed

- Field spacing on the canvas no longer drifts from the actual DDS columns - the character grid is now measured from the real font instead of a hardcoded guess.
- A field whose name lands on the wrong DDS column (e.g. overlapping the record-type column) used to be silently dropped from the parsed model with no error.
- Several crashes in window rendering: a dead `Render.parseParms` reference, a missing `keywords` array on the window title, and a `colors`/`colours` typo.
- `DSPSIZ`-driven canvas sizing was doubling the pixel conversion, producing a wildly oversized canvas.
- Editing a field's `Type` didn't update its rendered placeholder character (I/O/B vs 3/6/9) - it was keyed off a value only the server-side parser ever computed.
- A property dropdown whose current value doesn't match any of its options (e.g. `Type` on a Date/Time field) could silently corrupt the field on the next edit instead of leaving it alone.
- A field with no length of its own (`REFFLD`/`REF`-referenced) rendered as an invisible, zero-width box.
- File-level (screen) keyword editing was fundamentally broken: the file-level record's line range was never initialized, and range-lookup functions explicitly excluded it.
- `globalFormat` was looked up by the literal name `GLOBAL` instead of `_GLOBAL`, silently broken since day one - `DSPSIZ`-based screen sizing only ever looked correct because the 80x24 default happened to match it.

### Other

- Added a `vm`-sandbox test harness and pure-logic test coverage for `webui/main.js`, which previously had none.
- Added `samples/intricate.dspf`, a multi-format sample file (subfile, window, indicators, referenced field) for exercising the renderer.