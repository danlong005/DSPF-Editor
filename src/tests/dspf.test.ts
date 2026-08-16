import { expect, describe, it } from "vitest";
import { DdsLineRange, DisplayFile, FieldInfo, GLOBAL_RECORD_NAME } from "../ui/dspf";
import exp from "constants";

describe('DisplayFile tests', () => {

  const dspf1: string[] = [
    `     A                                      DSPSIZ(24 80 *DS3)                  `,
    `     A          R HEAD                                                          `,
    `     A                                  1 32'vscode-displayfile'                `,
    `     A          R FMT1                                                          `,     
    `     A                                      SLNO(03)                            `,
    `     A                                  1  3'Opt'                               `,
    `     A                                      COLOR(BLU)                          `,
    `     A                                  1  8'Name'                              `,
    `     A                                      COLOR(BLU)                          `,
    `     A          R GLOBAL                                                        `,     
    `     A                                      SLNO(04)                            `,
    `     A                                  1  3'---'                               `,
    `     A          R FORM1                                                         `,     
    `     A                                      SLNO(06)                            `,
    `     A            FLD0101       10A  B  3  5                                    `,
    `     A  20                                  DSPATR(PR)                          `,
    `     A                                      COLOR(YLW)                          `,
    `     A            FLD0102       10   B  3  5                                    `,
  ];

  it('getRangeForFormat', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    expect(dds.getHeaderRangeForFormat(`DONOTEXIST`)).toBeUndefined();
    
    let range: DdsLineRange | undefined;

    range = dds.getHeaderRangeForFormat(`FMT1`);
    expect(range?.start).toBe(3);
    expect(range?.end).toBe(9);

    range = dds.getHeaderRangeForFormat(`HEAD`);
    expect(range?.start).toBe(1);
    expect(range?.end).toBe(3);
  });

  it('getRangeForField', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    let range: DdsLineRange | undefined;

    expect(dds.getRangeForField(`FORM1`, `UNKNOWN`)).toBeUndefined();

    range = dds.getRangeForField(`FORM1`, `FLD0101`);
    expect(range?.start).toBe(14);
    expect(range?.end).toBe(16);

    range = dds.getRangeForField(`FORM1`, `FLD0102`);
    expect(range?.start).toBe(17);
    expect(range?.end).toBe(17);
  });

  it('generates the same as what is provided', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    const form1 = dds.formats.find(f => f.name === `FORM1`);
    expect(form1).toBeDefined();

    const FLD0101 = form1?.fields.find(f => f.name === `FLD0101`);
    expect(FLD0101).toBeDefined();
    expect(FLD0101?.keywords.length).toBe(2);

    const DSPATR = FLD0101?.keywords.find(k => k.name === `DSPATR`);
    expect(DSPATR).toBeDefined();
    expect(DSPATR?.value).toBe(`PR`);
    expect(DSPATR?.conditions.length).toBe(1);

    const cond = DSPATR?.conditions[0];
    expect(cond).toBeDefined();
    expect(cond?.indicator).toBe(20);
    expect(cond?.negate).toBeFalsy();

    const generatedKeywordLines = DisplayFile.getLinesForKeyword(DSPATR!);
    expect(generatedKeywordLines.length).toBe(1);
    expect(generatedKeywordLines[0]).toBe(dspf1[15].trimEnd());

    const generateFieldLines = DisplayFile.getLinesForField(FLD0101!);
    expect(generateFieldLines.length).toBe(3);

    expect(generateFieldLines[0]).toBe(dspf1[14].trimEnd());
    expect(generateFieldLines[1]).toBe(dspf1[15].trimEnd());
    expect(generateFieldLines[2]).toBe(dspf1[16].trimEnd());

    const generatedRecordFormatLines = DisplayFile.getHeaderLinesForFormat(form1!.name, form1!.keywords);
    expect(generatedRecordFormatLines.length).toBe(2);
    expect(generatedRecordFormatLines[0]).toBe(dspf1[12].trimEnd());
    expect(generatedRecordFormatLines[1]).toBe(dspf1[13].trimEnd());

  });

  it('getLinesForField', () => {
    let field = new FieldInfo(0);
    field.displayType = `const`;
    field.value = `Some text`;
    field.position.x = 10;
    field.position.y = 4;

    let lines = DisplayFile.getLinesForField(field);

    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(`     A                                  4 10'Some text'`);

    field.keywords.push(
      {
      name: "COLOR",
      value: "BLU",
      conditions: []
      },
      {
        name: "DSPATR",
        value: "PR",
        conditions: []
      }
    );

    lines = DisplayFile.getLinesForField(field);
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe(`     A                                  4 10'Some text'`);
    expect(lines[1]).toBe(`     A                                      COLOR(BLU)`);
    expect(lines[2]).toBe(`     A                                      DSPATR(PR)`);
  });

  it('No duplicate RecordInfo', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);
    let names = dds.formats.map(rcd => rcd.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('updateFormatHeader on the file-level (global) record', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    // The global record sits at index 0, which getRangeForField/
    // getHeaderRangeForFormat used to explicitly exclude (`> 0` guard).
    const range = dds.getHeaderRangeForFormat(GLOBAL_RECORD_NAME);
    expect(range?.start).toBe(0);
    expect(range?.end).toBe(1);
    expect(range?.endHeader).toBe(0);

    const update = dds.updateFormatHeader(GLOBAL_RECORD_NAME, [
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
      { name: `INDARA`, value: undefined, conditions: [] },
    ]);
    // No 'R _GLOBAL' line should ever be generated - it isn't a real record.
    expect(update?.newLines.some(l => l.includes(`R ${GLOBAL_RECORD_NAME}`))).toBe(false);
    expect(update?.range).toEqual({ start: 0, end: 0 });

    const newDoc = [...dspf1];
    newDoc.splice(update!.range!.start, (update!.range!.end - update!.range!.start) + 1, ...update!.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);
    const global = reparsed.formats.find(f => f.name === GLOBAL_RECORD_NAME);
    expect(global?.keywords).toEqual([
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
      { name: `INDARA`, conditions: [] },
    ]);
    // Every other format should be completely undisturbed.
    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `FMT1`, `GLOBAL`, `FORM1`]);
    expect(reparsed.formats.find(f => f.name === `HEAD`)?.fields[0].value).toBe(`vscode-displayfile`);
  });

  it('updateFormatHeader inserts when there are no existing file-level keywords', () => {
    const lines = [
      `     A          R HEAD                                                          `,
      `     A                                  1  1'Hi'                                `,
    ];

    let dds = new DisplayFile();
    dds.parse(lines);

    const range = dds.getHeaderRangeForFormat(GLOBAL_RECORD_NAME);
    expect(range?.start).toBe(0);
    expect(range?.endHeader).toBe(-1);

    const update = dds.updateFormatHeader(GLOBAL_RECORD_NAME, [
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
    ]);
    // end < start signals "insert before start", not "replace start..end" -
    // there's no existing file-level content to anchor a replace on.
    expect(update?.range).toEqual({ start: 0, end: -1 });

    const newDoc = [...lines];
    newDoc.splice(update!.range!.start, 0, ...update!.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);
    expect(reparsed.formats.find(f => f.name === GLOBAL_RECORD_NAME)?.keywords).toEqual([
      { name: `DSPSIZ`, value: `24 80 *DS3`, conditions: [] },
    ]);
    expect(reparsed.formats.find(f => f.name === `HEAD`)?.fields[0].value).toBe(`Hi`);
  });

  it('updateFormatHeader on a record with no fields and no keywords', () => {
    const lines = [
      `     A          R EMPTYFMT                                                      `,
      `     A          R NEXTFMT                                                       `,
      `     A                                  1  1'x'                                 `,
    ];

    let dds = new DisplayFile();
    dds.parse(lines);

    const update = dds.updateFormatHeader(`EMPTYFMT`, [
      { name: `TEXT`, value: `'hi'`, conditions: [] },
    ]);
    expect(update?.range).toEqual({ start: 0, end: 0 });

    const newDoc = [...lines];
    newDoc.splice(update!.range!.start, (update!.range!.end - update!.range!.start) + 1, ...update!.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);
    expect(reparsed.formats.find(f => f.name === `EMPTYFMT`)?.keywords).toEqual([
      { name: `TEXT`, value: `'hi'`, conditions: [] },
    ]);
    // NEXTFMT and its field must survive untouched.
    expect(reparsed.formats.find(f => f.name === `NEXTFMT`)?.fields[0].value).toBe(`x`);
  });

  it('addFormat appends a new empty record format at the end of the file', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    const update = dds.addFormat(`NEWFMT`);
    expect(update.newLines).toEqual([`     A          R NEWFMT`]);
    // dspf1 has no trailing newline, so the insertion point is one past its last line.
    expect(update.range).toEqual({ start: dspf1.length, end: dspf1.length });

    const newDoc = [...dspf1];
    newDoc.splice(update.range!.start, 0, ...update.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);

    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `FMT1`, `GLOBAL`, `FORM1`, `NEWFMT`]);
    expect(reparsed.formats.find(f => f.name === `NEWFMT`)?.fields).toEqual([]);
    // Every earlier format should be completely undisturbed.
    expect(reparsed.formats.find(f => f.name === `FORM1`)?.fields[0].name).toBe(`FLD0101`);
  });

  it('addFormat appends after an existing empty file (only the global record)', () => {
    let dds = new DisplayFile();
    dds.parse([]);

    const update = dds.addFormat(`FIRSTFMT`);
    expect(update.range).toEqual({ start: 0, end: 0 });

    const reparsed = new DisplayFile();
    reparsed.parse(update.newLines);
    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `FIRSTFMT`]);
  });

  it('getRangeForFormat spans a whole record, from its R line through its last content line', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    expect(dds.getRangeForFormat(`DONOTEXIST`)).toBeUndefined();
    // The file-level/global record has no R line of its own - it can't be deleted this way.
    expect(dds.getRangeForFormat(GLOBAL_RECORD_NAME)).toBeUndefined();

    expect(dds.getRangeForFormat(`FMT1`)).toEqual({ start: 3, end: 8 });
    // Last format in the file - its range runs to the file's last line.
    expect(dds.getRangeForFormat(`FORM1`)).toEqual({ start: 12, end: 17 });
  });

  it('deleting a format via getRangeForFormat removes exactly that record and leaves the rest intact', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    const range = dds.getRangeForFormat(`FMT1`)!;
    const newDoc = [...dspf1];
    newDoc.splice(range.start, (range.end - range.start) + 1);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);

    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `GLOBAL`, `FORM1`]);
    expect(reparsed.formats.find(f => f.name === `HEAD`)?.fields[0].value).toBe(`vscode-displayfile`);
    expect(reparsed.formats.find(f => f.name === `FORM1`)?.fields[0].name).toBe(`FLD0101`);
  });

  it('renameFormat regenerates only the R line, leaving fields/keywords below it untouched', () => {
    let dds = new DisplayFile();
    dds.parse(dspf1);

    expect(dds.renameFormat(`DONOTEXIST`, `WHATEVER`)).toBeUndefined();
    // The file-level/global record has no R line of its own - it can't be renamed this way.
    expect(dds.renameFormat(GLOBAL_RECORD_NAME, `WHATEVER`)).toBeUndefined();

    const update = dds.renameFormat(`FMT1`, `RENAMED`)!;
    expect(update.newLines).toEqual([`     A          R RENAMED`]);
    expect(update.range).toEqual({ start: 3, end: 3 });

    const newDoc = [...dspf1];
    newDoc.splice(update.range!.start, 1, ...update.newLines);

    const reparsed = new DisplayFile();
    reparsed.parse(newDoc);

    expect(reparsed.formats.map(f => f.name)).toEqual([GLOBAL_RECORD_NAME, `HEAD`, `RENAMED`, `GLOBAL`, `FORM1`]);
    // Its own keywords/fields (and everything after it) must survive untouched.
    const renamed = reparsed.formats.find(f => f.name === `RENAMED`)!;
    expect(renamed.keywords).toEqual([{ name: `SLNO`, value: `03`, conditions: [] }]);
    expect(renamed.fields.map(f => f.value)).toEqual([`Opt`, `Name`]);
    expect(reparsed.formats.find(f => f.name === `FORM1`)?.fields[0].name).toBe(`FLD0101`);
  });

});
