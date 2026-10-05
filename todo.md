# Feature backlog

Ideas for making keyword entry smarter (researched 2026-08-21), ranked by
value vs. effort. Not commitments - just what we want to keep in view.

## Ground rule for all of this

**Every control keeps a free-text escape hatch.** DDS is big, version-specific,
and full of keywords we won't have tabled. The editor must never block a
keyword or value we don't happen to know about - a smarter control is a
suggestion, never a gate.

We already do exactly this for the keyword *name*: `createKeywordNameSelect`
(`webui/main.js`) is a `vscode-single-select` with `combobox = true` and
`creatable = true`, so you can pick from the list or just type something that
isn't on it - and every Value control (`createValueRow`) mirrors that: a
creatable dropdown, or a text box that stays the source of truth under
checkboxes or parameter fields. Every control below should keep doing the
same. Note the workaround for `.value` only selecting an entry already in
`.options` - `CONTRIBUTING.md` documents that gotcha.

## Where we are today

Tiers 1 and 2 are done, and so is Tier 3's metadata module: all keyword
knowledge lives in `webui/keywords.js` - the per-file-type name lists, value sets, help for
both file types, number ranges, and the parameter forms with their
`parse`/`compose` pairs - and the editor reads it through one lookup,
`keywordInfo(name, documentType)`. The tables stay separate in the source
because they're transcribed from different IBM references; `keywordInfo` is
what joins them.

Keywords are checked as well, as warnings only: a value off its list, a
keyword at the wrong level, a misspelt name, a value where none belongs, or
positional parameters that don't add up (see the validation item below).

Still outside `keywords.js`, deliberately: the ~10 `keyword.name === 'X'`
special cases in rendering (`WINDOW` in `src/ui/dspf.ts`, `WDWTITLE`/
`WDWBORDER`, `DSPSIZ`, `PAGSIZ`, `SFLCTL`/`SFLPAG`, the printer spacing
keywords) and the canvas `colours` map. They're behaviour - how a keyword
draws - not what the editor knows about one, and `src/ui/dspf.ts` can't share
a webview script without a build step anyway.

The model is `interface Keyword { name, value?, conditions }`
(`src/ui/dspf.ts`) - **the value is one opaque string end to end**, pasted
verbatim inside `(...)` by `getLinesForKeyword`. The parameter forms parse it
on open and recompose it on every edit rather than changing that type.

Good news on seed data: `.claude/skills/dds/SKILL.md` already holds the
richest keyword tables in the repo (DSPATR values, COLOR, EDTCDE, CHECK,
subfile keywords, WINDOW/WDWBORDER/WDWTITLE param forms, command keys) - it's
where `KEYWORD_VALUES` was transcribed from, and still the place to start for
anything it doesn't cover yet.

## Tier 1 - done

All three shipped: the value dropdown for single-token enum keywords
(`COLOR`, `CHECK`, `EDTCDE`, `DATFMT`, `TIMFMT`, `SFLEND`), rebuilding the
value control when the keyword name changes, and all 24 `CAxx`/`CFxx` in the
name list. `DSPATR` was deliberately left out - it's space-separated
multi-value, which is Tier 2's first item.

## Tier 2 - medium

- ~~**Multi-value keywords.**~~ Done: `DSPATR` gets a checkbox per attribute
  over a text box that stays the value's source of truth (a
  `vscode-multi-select` isn't creatable, so it couldn't keep the escape
  hatch). `MULTI_VALUE_KEYWORDS` marks which keywords take a list; nothing
  else needs one yet.
- ~~**Per-keyword description and level hint in the editor.**~~ Done:
  `KEYWORD_HELP` / `PRINTER_KEYWORD_HELP` (`webui/main.js`) table a level list
  and a one-line description per keyword, transcribed from IBM's *DDS for
  display files* / *DDS for printer files*; `keywordHelpText` renders the line
  under the Keyword field and the name select refreshes it. Two tables rather
  than one because the file types barely overlap - a printer file gets the
  printer meaning of `COLOR`, and nothing at all for `DSPATR`. Purely
  additive: an untabled keyword hides the line. (Still *not* the
  hover/IntelliSense-in-the-raw-source idea we ruled out - that was tooling
  over the DDS text; this is help text in the sidebar form we already render.)
- ~~**Structured parameter forms for positional keywords.**~~ Done:
  `KEYWORD_PARAMETERS` gives `WINDOW`, `CAxx`/`CFxx` and `REFFLD` a control
  per parameter under the Value box, each with a `parse`/`compose` pair. As
  with `DSPATR`, the box stays the source of truth: the fields rewrite it,
  typing in it refills them, and a value that won't parse (a
  `WINDOW(recordname)` reference, anything hand-written) hides them and
  stays plain text. `SFLCTL` reuses the value dropdown, filled from the
  file's `SFL` records; `SFLSIZ`/`SFLPAG` get a number box while the value
  is a number.

## Tier 3 - larger, and the unifying refactor

- ~~**A real keyword metadata module.**~~ Done: `webui/keywords.js`, a
  plain script loaded before `main.js` (`{keywords}` in `index.html`), holds
  every keyword table and the parameter parse/compose functions, with
  `keywordInfo` as the one way in. It doesn't touch the DOM or the open
  document - `SFLCTL`'s subfile list and the file type are worked out in
  `main.js` and passed in. The rendering special cases stay where they are
  (see above).
- ~~**Soft, non-blocking validation warnings.**~~ Done: `keywordWarnings`
  (`webui/keywords.js`) checks a keyword's name, its level, and its value
  against what's tabled, and the editor shows the result under the Value
  field as you type and as a warning icon in the keyword list. Never blocks
  Confirm. Value checks are display-file only (`KEYWORD_VALUES` is display
  values), and `NO_VALUE_KEYWORDS` only lists keywords IBM is explicit about.
  Not covered yet: cross-keyword checks like `SFLSIZ` >= `SFLPAG`, or a
  `SFLCTL` naming a record that isn't a subfile.

## Small, found on the way

- ~~**Names in `DDS_KEYWORDS` that IBM's references don't carry.**~~ Done:
  the name list is now built per file type from the help tables
  (`keywordNames`), so every name offered is one IBM documents for that file
  type. That dropped the 14 that were never DSPF/PRTF keywords (CRTPRTF
  parameters, RPG special words, `CONCAT`) and fixed `TRNSPARENCY` to
  `TRNSPY`. `PAGSIZ` stays readable for sizing the printer canvas but sits
  in `EDITOR_ONLY_KEYWORDS`: not offered, and warned about wherever it's
  coded, since the compiler rejects it.

## Explicitly not pursuing

- **REFFLD resolution against a live IBM i connection** - we're intentionally
  a local-only DDS source editor with no connection to a real IBM i system.
  Not worth chasing unless that scope changes.
- **Becoming a general RPG/ILE IDE** - out of scope; this stays a focused
  visual DDS designer.
- **Multi-size window resize** (`*DS3`/`*DS4`-conditioned `WINDOW` keywords,
  or paired window records per size) - real DDS support for this is either a
  niche, IBM-discouraged pattern or relies on an invented naming convention to
  pair two records as "the same window." Not worth the complexity for how
  rarely it's used.
- **Hover/IntelliSense keyword docs in the raw source editor** (seen in
  Carbon/400) - contextual completion/documentation when editing the raw DDS
  text directly, independent of the canvas. Ruled out for now. (The Tier 2
  description/level hint above is a different thing - it lives in the sidebar
  form, not over the text.)

## Reference

- [DSPF Designer](https://marketplace.visualstudio.com/items?itemName=Balrocj.dspf-designer) - closest direct competitor; we already beat it on subfile support, PRTF, record creation, undo/redo, and field snapping.
- [Display file DDS edit](https://marketplace.visualstudio.com/items?itemName=ChristianLarsen.dspf-edit) ([source](https://github.com/christianlarsen/dspf-edit))
- [Carbon/400](https://carbon400.com/en/)
- `.claude/skills/dds/SKILL.md` - in-repo DDS reference tables; best seed
  material for a keyword metadata table.
