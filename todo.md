# Feature backlog

Ideas gathered from researching other DSPF/DDS-related VS Code extensions
(2026-08-18), ranked by value vs. effort. Not commitments - just what we
want to keep in view.

## 1. Outline view (cheapest win)

VS Code's native Outline panel, listing record formats and fields for the
open `.dspf`/`.prtf` file. Clicking an entry reveals it on the canvas, even
if it's currently hidden by an indicator condition.

- Reuses the parsed model we already have (`DisplayFile.formats[].fields[]`
  in `src/ui/dspf.ts`) - no new parsing needed.
- Implementation: a `vscode.DocumentSymbolProvider` adapter, plus a
  "reveal + un-hide via indicator" hook into the existing canvas selection
  logic.
- Source: seen in Carbon/400.

## 2. Command-key (CAxx/CFxx) management

- A legend/panel showing every command key (`CA01`-`CA24`, `CF01`-`CF24`)
  declared anywhere in the file, so you can see what's already in use.
- Duplicate/conflict detection - flag the same command key assigned twice
  within a record (or file-wide, TBD) the same way we already flag
  overlapping fields.
- A "Buttons" toolbox shortcut in the Add Field panel: a constant
  pre-wired to a command key, same pattern as our existing System/Date/
  Time constant buttons.
- Source: seen in "Display file DDS edit" (ChristianLarsen.dspf-edit).
- Effort: small (buttons) to medium (legend + conflict detection).

## 3. Field/keyword collision validation

Surface DDS-level errors before compile - overlapping fields/keywords, bad
keyword combinations - inline in the editor.

- We already have half of this: `findTouchingFields` in `webui/main.js`
  gives an overlapping field a red border warning. Extending that same
  pattern to keyword-level and command-key conflicts is the natural next
  step, not a new subsystem.
- Consider surfacing findings via VS Code's diagnostics API (Problems
  panel) in addition to the in-canvas red border, so issues are visible
  even without the Design view open.
- Source: seen in Carbon/400.
- Effort: medium-large.

## 4. Multi-size window resize

Resizing a `WINDOW` on the canvas updates its size consistently across
every declared `DSPSIZ` alternate size (`*DS3`/`*DS4`) at once, instead of
just the currently-viewed one.

- Touches window-size keyword generation in `src/ui/dspf.ts`.
- Source: seen in "Display file DDS edit" (ChristianLarsen.dspf-edit).
- Effort: medium.

## 5. Hover/IntelliSense keyword docs in the raw source editor

Contextual keyword completion and documentation-on-hover when editing the
raw DDS text directly (independent of the canvas).

- Our existing `DDS_KEYWORDS` list in `webui/main.js` (already used for the
  canvas's keyword combobox) could seed the keyword list, but writing
  per-keyword documentation text is the real work, not the plumbing.
- Needs a real `CompletionItemProvider`/`HoverProvider` subsystem - the
  biggest lift of this list.
- Only worth prioritizing if people edit raw source as much as they use
  the canvas.
- Source: seen in Carbon/400.
- Effort: large.

## Explicitly not pursuing

- **REFFLD resolution against a live IBM i connection** (seen in
  "Display file DDS edit") - we're intentionally a local-only DDS source
  editor with no connection to a real IBM i system. Not worth chasing
  unless that scope changes.
- **Becoming a general RPG/ILE IDE** - out of scope; this stays a focused
  visual DDS designer.

## Reference

- [DSPF Designer](https://marketplace.visualstudio.com/items?itemName=Balrocj.dspf-designer) - closest direct competitor; we already beat it on subfile support, PRTF, record creation, undo/redo, and field snapping.
- [Display file DDS edit](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit) ([source](https://github.com/christianlarsen/dspf-edit))
- [Carbon/400](https://carbon400.com/en/)
