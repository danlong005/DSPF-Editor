# Feature backlog

Ideas gathered from researching other DSPF/DDS-related VS Code extensions
(2026-08-18), ranked by value vs. effort. Not commitments - just what we
want to keep in view.

## 1. Hover/IntelliSense keyword docs in the raw source editor

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
- **Multi-size window resize** (`*DS3`/`*DS4`-conditioned `WINDOW` keywords,
  or paired window records per size) - real DDS support for this is
  either a niche, IBM-discouraged pattern (conditioning one record's
  keywords by display-size name) or relies on an invented naming
  convention to pair two separate records as "the same window." Not
  worth the complexity/ambiguity for how rarely it's actually used.

## Reference

- [DSPF Designer](https://marketplace.visualstudio.com/items?itemName=Balrocj.dspf-designer) - closest direct competitor; we already beat it on subfile support, PRTF, record creation, undo/redo, and field snapping.
- [Display file DDS edit](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit) ([source](https://github.com/christianlarsen/dspf-edit))
- [Carbon/400](https://carbon400.com/en/)
