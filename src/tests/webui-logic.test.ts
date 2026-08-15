import { describe, expect, it } from "vitest";
import { FakeElement } from "./webui-harness";
import { loadWebui } from "./webui-harness";

/** Finds and checks/unchecks one of createIndicatorsPanel's checkboxes by label, firing its change handler. */
function toggleIndicatorCheckbox(panel: FakeElement, indicator: number, checked: boolean) {
  const checkbox = panel.children.find(c => c.attributes.label === `Indicator ${indicator}`);
  if (!checkbox) { throw new Error(`No checkbox for indicator ${indicator}`); }
  checkbox.attributes.checked = checked ? `true` : `false`;
  checkbox.trigger(`change`);
}

function cond(indicator: number, negate = false) {
  return { indicator, negate };
}

/** Depth-first search for a FakeElement with a given dataset key, anywhere under root. */
function findByDataFieldId(root: FakeElement, fieldId: string): FakeElement | undefined {
  if (root.dataset.fieldId === fieldId) { return root; }
  for (const child of root.children) {
    const found = findByDataFieldId(child, fieldId);
    if (found) { return found; }
  }
  return undefined;
}

describe(`indicatorsSatisfied`, () => {
  it(`is satisfied with no conditions at all`, () => {
    const sandbox = loadWebui();
    expect(sandbox.indicatorsSatisfied([])).toBe(true);
  });

  it(`requires every listed indicator to be on (AND, not OR)`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([30, 40]);
    toggleIndicatorCheckbox(panel, 30, true);
    // 40 stays off

    expect(sandbox.indicatorsSatisfied([cond(30)])).toBe(true);
    expect(sandbox.indicatorsSatisfied([cond(40)])).toBe(false);
    expect(sandbox.indicatorsSatisfied([cond(30), cond(40)])).toBe(false);

    toggleIndicatorCheckbox(panel, 40, true);
    expect(sandbox.indicatorsSatisfied([cond(30), cond(40)])).toBe(true);
  });

  it(`respects negation`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([50]);

    // Indicator off: a negated condition on it is satisfied.
    expect(sandbox.indicatorsSatisfied([cond(50, true)])).toBe(true);
    expect(sandbox.indicatorsSatisfied([cond(50, false)])).toBe(false);

    toggleIndicatorCheckbox(panel, 50, true);
    expect(sandbox.indicatorsSatisfied([cond(50, true)])).toBe(false);
    expect(sandbox.indicatorsSatisfied([cond(50, false)])).toBe(true);
  });

  it(`unchecking an indicator turns its conditions back off`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([60]);
    toggleIndicatorCheckbox(panel, 60, true);
    expect(sandbox.indicatorsSatisfied([cond(60)])).toBe(true);

    toggleIndicatorCheckbox(panel, 60, false);
    expect(sandbox.indicatorsSatisfied([cond(60)])).toBe(false);
  });
});

describe(`getReferencedIndicators`, () => {
  it(`collects indicators from field conditions, field keyword conditions, and format keyword conditions - deduped and sorted`, () => {
    const sandbox = loadWebui();

    const model = {
      formats: [
        {
          name: `FMT1`,
          keywords: [{ name: `SFLCLR`, value: undefined, conditions: [cond(90)] }],
          fields: [
            {
              name: `FLD1`,
              conditions: [cond(30)],
              keywords: [{ name: `COLOR`, value: `RED`, conditions: [cond(30)] }],
            },
            {
              name: `FLD2`,
              conditions: [cond(10)],
              keywords: [],
            },
          ],
        },
        {
          name: `FMT2`,
          keywords: [],
          fields: [{ name: `FLD3`, conditions: [cond(90)], keywords: [] }],
        },
      ],
    };

    sandbox.loadDDS(model, `dds.dspf`, false);

    expect(sandbox.getReferencedIndicators()).toEqual([10, 30, 90]);
  });

  it(`returns an empty list when nothing references any indicator`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS({ formats: [{ name: `FMT1`, keywords: [], fields: [{ name: `FLD1`, conditions: [], keywords: [] }] }] }, `dds.dspf`, false);
    expect(sandbox.getReferencedIndicators()).toEqual([]);
  });
});

describe(`elementId`, () => {
  it(`namespaces by record format so same-named fields in different formats don't collide`, () => {
    const sandbox = loadWebui();
    expect(sandbox.elementId(`FMTA`, `FLD1`)).toBe(`FMTA::FLD1`);
    expect(sandbox.elementId(`FMTB`, `FLD1`)).toBe(`FMTB::FLD1`);
    expect(sandbox.elementId(`FMTA`, `FLD1`)).not.toBe(sandbox.elementId(`FMTB`, `FLD1`));
  });
});

describe(`getElement (canvas field rendering)`, () => {
  function textOf(group: any): string {
    const text = group.children.find((c: any) => c.type === `Text`);
    return text.config.text;
  }

  it(`derives the alpha/numeric placeholder character straight from the DDS type, not the possibly-stale primitiveType`, () => {
    const sandbox = loadWebui();

    // primitiveType deliberately set wrong (char) while type says numeric (D) -
    // this is exactly the state a client-side Type edit used to leave behind
    // before the fix, since primitiveType is only ever computed server-side.
    const numericField = {
      name: `NUM1`, type: `D`, primitiveType: `char`, length: 5, decimals: 0,
      displayType: `input`, value: undefined, position: { x: 1, y: 1 }, keywords: [],
    };
    const numericGroup = sandbox.getElement(numericField, false, `FMT`);
    expect(textOf(numericGroup)).toBe(`33333`);

    const alphaField = {
      name: `ALP1`, type: `A`, primitiveType: `decimal`, length: 4, decimals: 0,
      displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [],
    };
    const alphaGroup = sandbox.getElement(alphaField, false, `FMT`);
    expect(textOf(alphaGroup)).toBe(`OOOO`);
  });

  it(`uses the both/input/output-specific padding character for both primitive types`, () => {
    const sandbox = loadWebui();
    const base = { type: `A`, length: 3, decimals: 0, value: undefined, position: { x: 1, y: 1 }, keywords: [] };

    expect(textOf(sandbox.getElement({ ...base, name: `F1`, displayType: `input` }, false, `FMT`))).toBe(`III`);
    expect(textOf(sandbox.getElement({ ...base, name: `F2`, displayType: `output` }, false, `FMT`))).toBe(`OOO`);
    expect(textOf(sandbox.getElement({ ...base, name: `F3`, displayType: `both` }, false, `FMT`))).toBe(`BBB`);

    const decBase = { type: `D`, length: 3, decimals: 0, value: undefined, position: { x: 1, y: 1 }, keywords: [] };
    expect(textOf(sandbox.getElement({ ...decBase, name: `F4`, displayType: `input` }, false, `FMT`))).toBe(`333`);
    expect(textOf(sandbox.getElement({ ...decBase, name: `F5`, displayType: `output` }, false, `FMT`))).toBe(`666`);
    expect(textOf(sandbox.getElement({ ...decBase, name: `F6`, displayType: `both` }, false, `FMT`))).toBe(`999`);
  });

  it(`floors the rendered width at 1 character for a zero-length referenced field`, () => {
    const sandbox = loadWebui();
    const referencedField = {
      name: `REFFLD1`, type: ``, primitiveType: undefined, length: 0, decimals: 0,
      displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [],
    };
    const group = sandbox.getElement(referencedField, false, `FMT`);
    expect(textOf(group).length).toBe(1);
    expect(group.config.width).toBeGreaterThan(0);
  });

  it(`namespaces the canvas element id by the owning record format`, () => {
    const sandbox = loadWebui();
    const field = { name: `SAMENAME`, type: `A`, length: 1, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [] };

    const groupA = sandbox.getElement(field, false, `FMTA`);
    const groupB = sandbox.getElement(field, false, `FMTB`);

    expect(groupA.config.id).toBe(`FMTA::SAMENAME`);
    expect(groupB.config.id).toBe(`FMTB::SAMENAME`);
  });

  it(`only applies a keyword whose conditioning indicator is currently on`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([30]);
    toggleIndicatorCheckbox(panel, 30, false);

    // getElement applies keywords in array order (last match wins), so like
    // real DDS authoring, the conditioned override is written after the
    // unconditioned default - it only takes effect once its indicator is on.
    const field = {
      name: `F1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `COLOR`, value: `GRN`, conditions: [] },
        { name: `COLOR`, value: `RED`, conditions: [cond(30)] },
      ],
    };

    const offGroup = sandbox.getElement(field, false, `FMT`);
    const offText = offGroup.children.find((c: any) => c.type === `Text`);
    expect(offText.config.fill).toBe(`green`); // colours.GRN

    toggleIndicatorCheckbox(panel, 30, true);
    const onGroup = sandbox.getElement(field, false, `FMT`);
    const onText = onGroup.children.find((c: any) => c.type === `Text`);
    expect(onText.config.fill).toBe(`red`); // colours.RED - the conditioned COLOR now wins
  });
});

describe(`addFieldsToLayer field visibility`, () => {
  it(`only adds fields whose conditions are currently satisfied`, () => {
    const sandbox = loadWebui();
    const panel = sandbox.createIndicatorsPanel([80]);
    // leave indicator 80 off

    const format = {
      name: `FMT`,
      keywords: [],
      fields: [
        { name: `ALWAYS`, type: `A`, length: 1, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] },
        { name: `ONLYIF80`, type: `A`, length: 1, decimals: 0, displayType: `output`, value: undefined, position: { x: 2, y: 1 }, keywords: [], conditions: [cond(80)] },
      ],
    };

    const layer = new sandbox.Konva.Layer({});
    sandbox.addFieldsToLayer(layer, format, false);
    expect(layer.children.map((c: any) => c.config.id)).toEqual([`FMT::ALWAYS`]);

    toggleIndicatorCheckbox(panel, 80, true);
    const layer2 = new sandbox.Konva.Layer({});
    sandbox.addFieldsToLayer(layer2, format, false);
    expect(layer2.children.map((c: any) => c.config.id).sort()).toEqual([`FMT::ALWAYS`, `FMT::ONLYIF80`]);
  });

  it(`hidden fields never render regardless of indicators`, () => {
    const sandbox = loadWebui();
    const format = {
      name: `FMT`,
      keywords: [],
      fields: [
        { name: `HID`, type: `A`, length: 1, decimals: 0, displayType: `hidden`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] },
      ],
    };
    const layer = new sandbox.Konva.Layer({});
    sandbox.addFieldsToLayer(layer, format, false);
    expect(layer.children.length).toBe(0);
  });
});

describe(`createValuesPanel select-value corruption guard`, () => {
  it(`omits a select's value from the update entirely when it doesn't match any option, instead of sending undefined`, () => {
    const sandbox = loadWebui();

    let lastUpdate: any;
    const properties = [
      { label: `Name`, value: `MYFLD`, id: `name` },
      {
        label: `Type`, value: `L`, id: `type`, // Date - not one of the dropdown's own options
        options: [{ label: `Alpha`, value: `A` }, { label: `Numeric`, value: `D` }],
      },
    ];

    const section = sandbox.createValuesPanel(`test-panel`, properties, (values: any) => { lastUpdate = values; });

    const typeSelect = findByDataFieldId(section, `type`);
    expect(typeSelect).toBeDefined();
    expect(typeSelect!.value).toBeUndefined(); // confirms the FakeElement itself models the real "no match" behavior

    typeSelect!.trigger(`change`);

    expect(lastUpdate).toBeDefined();
    expect(`type` in lastUpdate).toBe(false);
    // The other, valid control's value should still come through normally.
    expect(lastUpdate.name).toBe(`MYFLD`);
  });

  it(`includes a select's value normally when it does match an option`, () => {
    const sandbox = loadWebui();

    let lastUpdate: any;
    const properties = [
      {
        label: `Type`, value: `A`, id: `type`,
        options: [{ label: `Alpha`, value: `A` }, { label: `Numeric`, value: `D` }],
      },
    ];

    const section = sandbox.createValuesPanel(`test-panel`, properties, (values: any) => { lastUpdate = values; });
    const typeSelect = findByDataFieldId(section, `type`);
    typeSelect!.trigger(`change`);

    expect(lastUpdate.type).toBe(`A`);
  });

  it(`applies a contenteditable text field's value on blur`, () => {
    const sandbox = loadWebui();

    let lastUpdate: any;
    const properties = [{ label: `Length`, value: 10, id: `length` }];
    const section = sandbox.createValuesPanel(`test-panel`, properties, (values: any) => { lastUpdate = values; });

    const lengthInput = findByDataFieldId(section, `length`);
    lengthInput!.innerText = `20`;
    lengthInput!.trigger(`blur`);

    expect(lastUpdate.length).toBe(`20`);
  });
});

describe(`updateSelectedFieldSidebar - constant fields`, () => {
  it(`never shows a Display Type control for a constant (it can't represent "const" and corrupts the field if edited)`, () => {
    const sandbox = loadWebui();

    const constField = {
      name: undefined, displayType: `const`, value: `Hello`, position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(constField);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `displayType`)).toBeUndefined();
    // Value should still be there and editable.
    expect(findByDataFieldId(sidebar, `value`)).toBeDefined();
  });

  it(`shows an editable Display Type control for a non-constant field`, () => {
    const sandbox = loadWebui();

    const field = {
      name: `FLD1`, displayType: `input`, type: `A`, length: 5, decimals: 0,
      position: { x: 1, y: 1 }, keywords: [],
    };
    sandbox.updateSelectedFieldSidebar(field);

    const sidebar = sandbox.document.getElementById(`fieldInfoSidebar`);
    expect(findByDataFieldId(sidebar, `displayType`)).toBeDefined();
  });
});

describe(`parseDspSizes`, () => {
  it(`parses a single size with a qualifier`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`24 80 *DS3`)).toEqual([
      { height: 24, width: 80, qualifier: `*DS3` },
    ]);
  });

  it(`parses a single size with no qualifier`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`24 80`)).toEqual([
      { height: 24, width: 80, qualifier: undefined },
    ]);
  });

  it(`parses two sizes defined together`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`24 80 *DS3 27 132 *DS4`)).toEqual([
      { height: 24, width: 80, qualifier: `*DS3` },
      { height: 27, width: 132, qualifier: `*DS4` },
    ]);
  });

  it(`returns an empty list for garbage input`, () => {
    const sandbox = loadWebui();
    expect(sandbox.parseDspSizes(`*DS3`)).toEqual([]);
    expect(sandbox.parseDspSizes(``)).toEqual([]);
  });
});

describe(`findTouchingFields`, () => {
  function field(name: string, x: number, y: number, length: number): any {
    return { name, position: { x, y }, length, displayType: `output`, keywords: [], conditions: [] };
  }

  function constField(name: string, x: number, y: number, value: string): any {
    return { name, position: { x, y }, value, displayType: `const`, keywords: [], conditions: [] };
  }

  it(`flags nothing when there's a real gap between fields`, () => {
    const sandbox = loadWebui();
    // A occupies cols 1-5, B starts at col 7 - one blank column (6) between them.
    const a = field(`A`, 1, 1, 5);
    const b = field(`B`, 7, 1, 5);
    expect(sandbox.findTouchingFields([a, b]).size).toBe(0);
  });

  it(`flags fields with zero gap (immediately touching)`, () => {
    const sandbox = loadWebui();
    // A occupies cols 1-5, B starts at col 6 - no blank column between them.
    const a = field(`A`, 1, 1, 5);
    const b = field(`B`, 6, 1, 5);
    const conflicting = sandbox.findTouchingFields([a, b]);
    expect(conflicting.has(a)).toBe(true);
    expect(conflicting.has(b)).toBe(true);
  });

  it(`flags fields that actually overlap`, () => {
    const sandbox = loadWebui();
    const a = field(`A`, 1, 1, 5); // cols 1-5
    const b = field(`B`, 3, 1, 5); // cols 3-7, overlaps A
    const conflicting = sandbox.findTouchingFields([a, b]);
    expect(conflicting.has(a)).toBe(true);
    expect(conflicting.has(b)).toBe(true);
  });

  it(`ignores fields on different rows`, () => {
    const sandbox = loadWebui();
    const a = field(`A`, 1, 1, 5);
    const b = field(`B`, 6, 2, 5); // same columns, different row
    expect(sandbox.findTouchingFields([a, b]).size).toBe(0);
  });

  it(`ignores hidden fields`, () => {
    const sandbox = loadWebui();
    const a = { ...field(`A`, 1, 1, 5), displayType: `hidden` };
    const b = field(`B`, 6, 1, 5);
    expect(sandbox.findTouchingFields([a, b]).size).toBe(0);
  });

  it(`uses a constant's literal text length, not a field length`, () => {
    const sandbox = loadWebui();
    const label = constField(`LBL`, 1, 1, `Name:`); // 5 chars, cols 1-5
    const touching = field(`F`, 6, 1, 10); // starts right where the label ends
    const notTouching = field(`F2`, 7, 1, 10); // one blank column after the label

    expect(sandbox.findTouchingFields([label, touching]).size).toBe(2);
    expect(sandbox.findTouchingFields([label, notTouching]).size).toBe(0);
  });

  it(`floors a zero-length field at 1, matching how it actually renders`, () => {
    const sandbox = loadWebui();
    const referenced = field(`REF`, 1, 1, 0); // renders as 1 char wide (see getElement's floor)
    const touching = field(`F`, 2, 1, 5); // right after that 1 rendered character
    const notTouching = field(`F2`, 3, 1, 5);

    expect(sandbox.findTouchingFields([referenced, touching]).size).toBe(2);
    expect(sandbox.findTouchingFields([referenced, notTouching]).size).toBe(0);
  });

  it(`flags two constants (labels) touching each other, not just fields`, () => {
    const sandbox = loadWebui();
    const a = constField(`LBL1`, 1, 1, `Name:`); // cols 1-5
    const touching = constField(`LBL2`, 6, 1, `Date:`); // starts right where LBL1 ends
    const notTouching = constField(`LBL3`, 7, 1, `Date:`); // one blank column after LBL1

    expect(sandbox.findTouchingFields([a, touching]).size).toBe(2);
    expect(sandbox.findTouchingFields([a, notTouching]).size).toBe(0);
  });
});

describe(`DATE/TIME fields with no DATFMT/TIMFMT`, () => {
  function textOf(group: any): string {
    return group.children.find((c: any) => c.type === `Text`).config.text;
  }

  it(`falls back to *MDY when a DATE field has no DATFMT`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 }, keywords: [{ name: `DATE`, value: undefined, conditions: [] }],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`mm/dd/yyyy`);
  });

  it(`falls back to *HMS when a TIME field has no TIMFMT`, () => {
    const sandbox = loadWebui();
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 }, keywords: [{ name: `TIME`, value: undefined, conditions: [] }],
    };
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh:mm:ss`);
  });

  it(`still uses an explicit DATFMT/TIMFMT when given`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `DATE`, value: undefined, conditions: [] },
        { name: `DATFMT`, value: `*ISO`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`yyyy-mm-dd`);
  });

  it(`still applies an explicit DATSEP/TIMSEP on top of the fallback format`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `DATE`, value: undefined, conditions: [] },
        { name: `DATSEP`, value: `-`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`mm-dd-yyyy`);
  });

  it(`still uses an explicit TIMFMT when given (symmetry with DATFMT)`, () => {
    const sandbox = loadWebui();
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `TIME`, value: undefined, conditions: [] },
        { name: `TIMFMT`, value: `*ISO`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh.mm.ss`);
  });

  it(`still applies an explicit TIMSEP on top of the fallback format (symmetry with DATSEP)`, () => {
    const sandbox = loadWebui();
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `TIME`, value: undefined, conditions: [] },
        { name: `TIMSEP`, value: `-`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh-mm-ss`);
  });

  it(`doesn't touch the separator when DATSEP/TIMSEP is explicitly *JOB, even with the fallback format`, () => {
    const sandbox = loadWebui();
    const dateField = {
      name: `DATEFLD`, type: `L`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `DATE`, value: undefined, conditions: [] },
        { name: `DATSEP`, value: `*JOB`, conditions: [] },
      ],
    };
    const timeField = {
      name: `TIMEFLD`, type: `T`, length: 8, decimals: 0, displayType: `output`, value: undefined,
      position: { x: 1, y: 1 },
      keywords: [
        { name: `TIME`, value: undefined, conditions: [] },
        { name: `TIMSEP`, value: `*JOB`, conditions: [] },
      ],
    };
    expect(textOf(sandbox.getElement(dateField, false, `FMT`))).toBe(`mm/dd/yyyy`);
    expect(textOf(sandbox.getElement(timeField, false, `FMT`))).toBe(`hh:mm:ss`);
  });
});

describe(`setWindowForFormat error trapping`, () => {
  function basicModel() {
    return {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: [
            { name: `FLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [] },
          ],
        },
        // A second format so the sidebar actually has a "Composed Formats"
        // section to render - proof the successful-render path was exercised
        // before the error path clears it back out.
        { name: `FMT2`, keywords: [], fields: [] },
      ],
    };
  }

  it(`clears the screen instead of throwing when the typed format name doesn't exist yet`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(basicModel(), `dds.dspf`, false);

    // Render something real first, so there's actually content to clear.
    // (Sections are built with appendChild, not an innerHTML string, so
    // presence of content shows up as child elements, not innerHTML text.)
    sandbox.setWindowForFormat(`FMT1`);
    expect(sandbox.document.getElementById(`recordFormatSidebar`).children.length).toBeGreaterThan(0);

    // e.g. the user is still mid-typing a format name into the combobox.
    expect(() => sandbox.setWindowForFormat(`NOT_A_REAL_FORMAT`)).not.toThrow();
    expect(sandbox.document.getElementById(`recordFormatSidebar`).children.length).toBe(0);
    expect(sandbox.document.getElementById(`fieldInfoSidebar`).innerHTML).toBe(``);
  });

  it(`clears the screen instead of throwing when rendering fails unexpectedly for any other reason`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(basicModel(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);
    expect(sandbox.document.getElementById(`recordFormatSidebar`).children.length).toBeGreaterThan(0);

    // Simulate a failure deep in rendering (e.g. a Konva/library error) that
    // has nothing to do with the format name being valid.
    sandbox.Konva.Stage = class {
      constructor() { throw new Error(`boom`); }
    };

    expect(() => sandbox.setWindowForFormat(`FMT1`)).not.toThrow();
    expect(sandbox.document.getElementById(`recordFormatSidebar`).innerHTML).toBe(``);
    expect(sandbox.document.getElementById(`fieldInfoSidebar`).innerHTML).toBe(``);
  });
});

describe(`showRendererError`, () => {
  it(`does not show the banner for vscode-elements' own internal keydown bug`, () => {
    const sandbox = loadWebui();
    // Mirrors the real crash: the combobox's own keydown listener throws
    // "Cannot read properties of undefined (reading 'index')" from inside
    // vscode-elements.js when Enter is pressed while a typed filter matches
    // no options - it's not something our code calls into or can try/catch.
    const libraryError = new Error(`Cannot read properties of undefined (reading 'index')`);
    libraryError.stack = `TypeError: Cannot read properties of undefined (reading 'index')\n    at ds._onEnterKeyDown (.../webui/scripts/vscode-elements.js:1180:10942)`;

    sandbox.showRendererError(libraryError);

    // No banner element should have been created/inserted at all.
    expect(sandbox.document.body.children.length).toBe(0);
  });

  it(`still shows the banner for a real error from our own code`, () => {
    const sandbox = loadWebui();
    const ourError = new Error(`something actually broke`);
    ourError.stack = `Error: something actually broke\n    at renderFormat (.../webui/main.js:252:1)`;

    sandbox.showRendererError(ourError);

    // The fake document's getElementById only resolves the harness's fixed
    // IDs, not elements created and appended at runtime - so look it up the
    // same way showRendererError actually inserted it, via document.body.
    const banner = sandbox.document.body.children.find((el: any) => el.id === `rendererErrorBanner`);
    expect(banner).not.toBeUndefined();
    expect(banner.textContent).toContain(`something actually broke`);
  });
});

describe(`isValidFormatName`, () => {
  it.each([
    `FMT1`, `A`, `$FMT`, `#FMT`, `@FMT`, `AB_CD`, `A123456789`,
  ])(`accepts %s`, (name) => {
    const sandbox = loadWebui();
    expect(sandbox.isValidFormatName(name)).toBe(true);
  });

  it.each([
    [``, `empty`],
    [`1FMT`, `starting with a digit`],
    [`FMT NAME`, `containing a space`],
    [`A12345678901`, `over 10 characters`],
    [`fmt1`, `lowercase (names are uppercased before validating)`],
    [`FMT-1`, `containing a hyphen`],
  ])(`rejects %s (%s)`, (name) => {
    const sandbox = loadWebui();
    expect(sandbox.isValidFormatName(name)).toBe(false);
  });
});

describe(`setTabs (record format selector) - Delete Format button state`, () => {
  it(`disables the Delete Format button when there are no record formats left`, () => {
    const sandbox = loadWebui();
    sandbox.setTabs([], undefined);
    expect(sandbox.document.getElementById(`deleteFormatButton`).getAttribute(`disabled`)).not.toBeUndefined();
  });

  it(`enables the Delete Format button when at least one record format exists`, () => {
    const sandbox = loadWebui();
    // Start disabled (no formats), then confirm a later render re-enables it.
    sandbox.setTabs([], undefined);
    sandbox.setTabs([`FMT1`], `FMT1`);
    expect(sandbox.document.getElementById(`deleteFormatButton`).getAttribute(`disabled`)).toBeUndefined();
  });
});

describe(`updateRecordFormatSidebar - Composed Formats/Indicators tabs`, () => {
  function modelWithComposedFormatsAndIndicators() {
    return {
      formats: [
        {
          name: `FMT1`,
          keywords: [],
          fields: [
            { name: `FLD1`, type: `A`, length: 5, decimals: 0, displayType: `output`, value: undefined, position: { x: 1, y: 1 }, keywords: [], conditions: [{ indicator: 50, negate: false }] },
          ],
        },
        // A second format so the Composed Formats tab has something to list.
        { name: `FMT2`, keywords: [], fields: [] },
      ],
    };
  }

  it(`renders both as tabs, not accordions, defaulting to the first`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithComposedFormatsAndIndicators(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const sidebar = sandbox.document.getElementById(`recordFormatSidebar`);
    const tabsElement = sidebar.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);
    expect(tabsElement).toBeDefined();
    expect(tabsElement.getAttribute(`selected-index`)).toBe(`0`);

    const headers = tabsElement.children
      .filter((el: FakeElement) => el.tagName === `VSCODE-TAB-HEADER`)
      .map((el: FakeElement) => el.innerText);
    expect(headers).toEqual([`Composed Formats`, `Indicators`]);
  });

  it(`keeps the previously selected tab across a re-render instead of resetting to the first tab`, () => {
    const sandbox = loadWebui();
    sandbox.loadDDS(modelWithComposedFormatsAndIndicators(), `dds.dspf`, false);
    sandbox.setWindowForFormat(`FMT1`);

    const sidebar = sandbox.document.getElementById(`recordFormatSidebar`);
    const findTabs = () => sidebar.children.find((el: FakeElement) => el.tagName === `VSCODE-TABS`);

    // Simulate the user clicking the second tab (Indicators).
    findTabs().trigger(`vsc-tabs-select`, { detail: { selectedIndex: 1 } });

    // Anything that re-renders this sidebar (e.g. toggling a checkbox inside
    // it) should land back on the tab the user was actually looking at,
    // rather than snapping back to the first one.
    sandbox.setWindowForFormat(`FMT1`);

    expect(findTabs().getAttribute(`selected-index`)).toBe(`1`);
  });
});
