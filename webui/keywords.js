/**
 * Everything the editor knows about DDS keywords: the name list, value sets,
 * per-keyword help for display and printer files, and the parameter forms
 * for keywords with positional parameters - all of it read through
 * keywordInfo at the bottom.
 *
 * A plain script, loaded before main.js (see index.html), so everything here
 * is a global main.js can use. Nothing here touches the DOM or the open
 * document; anything that needs the file being edited (SFLCTL's list of
 * subfile records, which file type is open) is worked out in main.js and
 * passed in.
 *
 * Help, never a gate - see the ground rule in todo.md. A keyword or value
 * that isn't tabled here still has to be enterable and saveable.
 */

// CAxx/CFxx command-key keywords go up to 24 (CA01-CA24, CF01-CF24).
const COMMAND_KEY_PATTERN = /^(CA|CF)(0[1-9]|1[0-9]|2[0-4])$/;

/** @param {string} name */
function isCommandKeyKeyword(name) {
  return COMMAND_KEY_PATTERN.test(name);
}

const dateFormats = {
  '*MDY': `mm/dd/yyyy`,
  '*DMY': `dd/mm/yyyy`,
  '*YMD': `yyyy/mm/dd`,
  '*JUL': 'yy/ddd',
  '*ISO': 'yyyy-mm-dd',
  '*USA': 'mm/dd/yyyy',
  '*EUR': 'dd.mm.yyyy',
  '*JIS': 'yyyy-mm-dd',
};

const timeFormats = {
  '*HMS': 'hh:mm:ss',
  '*ISO': 'hh.mm.ss',
  '*USA': 'hh:mm am',
  '*EUR': 'hh.mm.ss',
  '*JIS': 'hh:mm:ss',
};

// Every CA01-CA24 / CF01-CF24 command key, the same 01-24 range
// COMMAND_KEY_PATTERN recognises when reading them back out of a file.
// Listing them all is what keeps CF05 (say) pickable instead of something
// you have to know to type.
const COMMAND_KEY_KEYWORDS = Array.from({ length: 24 }, (_, index) => {
  const number = String(index + 1).padStart(2, `0`);
  return [`CA${number}`, `CF${number}`];
}).flat();

// Common DDS keywords for display files (DSPF) and printer files (PRTF), at
// file/record/field level. Not necessarily exhaustive - there are
// obscure/version-specific keywords not listed here. The keyword select below
// is a filterable combobox that also accepts free text, so a keyword missing
// from this list can still just be typed directly.
const DDS_KEYWORDS = [
  ...COMMAND_KEY_KEYWORDS,
  `AFPRSC`, `ALARM`, `ALIGN`, `ASSUME`, `AUTO`,
  `BARCODE`, `BLANKS`, `BLINK`,
  `CDEFNT`,
  `CHANGE`, `CHECK`, `CHGINPDFT`, `CHRSIZ`, `CLRL`, `COLOR`, `CONCAT`, `CPI`, `CSRLOC`,
  `DATA`, `DATE`, `DATFMT`, `DATSEP`, `DFRWRT`, `DFT`, `DSPATR`, `DSPSIZ`, `DUPLEX`,
  `EDTCDE`, `EDTWRD`, `END`, `ENDPAGE`, `ERRMSG`, `ERRMSGID`, `ERRSFL`,
  `FONT`, `FORCE`, `FORMFEED`,
  `HELP`, `HLPARA`, `HLPID`, `HLPPGM`, `HLPRTN`,
  `IGCALTTYP`, `INDARA`, `INDTXT`,
  `KEEP`, `LPI`,
  `MNUBAR`, `MSGID`, `MSGLOC`,
  `OUTBIN`, `OUTPUT`, `OVERFLOW`, `OVERLAY`,
  `PAGEDOWN`, `PAGEUP`, `PAGNBR`, `PAGRTT`, `PAGSIZ`, `PRINT`, `PRTQLTY`, `PULLDOWN`, `PUTOVR`, `PUTRETAIN`,
  `RANGE`, `REF`, `REFFLD`, `RMVWDW`, `ROLLDOWN`, `ROLLUP`, `RTNCSRLOC`,
  `SFL`, `SFLCLR`, `SFLCSRRRN`, `SFLCTL`, `SFLDROP`, `SFLDSP`, `SFLDSPCTL`, `SFLEND`,
  `SFLENTER`, `SFLFOLD`, `SFLINZ`, `SFLLIN`, `SFLMODE`, `SFLMSG`, `SFLMSGID`, `SFLMSGRCD`,
  `SFLNXTCHG`, `SFLPAG`, `SFLPGMQ`, `SFLRCDNBR`, `SFLRNA`, `SFLROLVAL`, `SFLSCROLL`, `SFLSIZ`,
  `SKIPA`, `SKIPB`, `SPACEA`, `SPACEB`, `SYSNAME`,
  `TEXT`, `TIME`, `TIMFMT`, `TIMSEP`, `TRNSPARENCY`,
  `UDATE`, `UDAY`, `UMONTH`, `UNDERLINE`, `USER`, `USRDFN`, `USRRSTDSP`, `UYEAR`,
  `VALUES`, `VLDCMDKEY`,
  `WDWBORDER`, `WDWTITLE`, `WINDOW`, `WRDWRAP`,
].sort();

/**
 * Value sets for keywords whose value is a code from a fixed list, keyed by
 * keyword name: value code to what it means. Feeds the Value control - a
 * dropdown, or a checkbox per code for the keywords in MULTI_VALUE_KEYWORDS -
 * and the unknown-value warning. A keyword that isn't here keeps the plain
 * free-text box, and even one that is stays typeable, so a value we don't
 * have tabled (or a newer one IBM has added since) can still be entered.
 *
 * These are display-file values: a printer file's COLOR is BLUE, not BLU.
 */
const KEYWORD_VALUES = {
  CHECK: {
    AB: `Allow blank`,
    ER: `Automatic record advance when the last position is typed`,
    FE: `Field exit key required to leave the field`,
    LC: `Lowercase allowed`,
    M10: `Modulus 10 self-check`,
    M10F: `Modulus 10 self-check (IBM variant)`,
    M11: `Modulus 11 self-check`,
    M11F: `Modulus 11 self-check (IBM variant)`,
    ME: `Mandatory enter`,
    MF: `Mandatory fill`,
    RB: `Right-adjust, blank fill`,
    RL: `Cursor moves right to left within the field`,
    RLTB: `Cursor moves right to left, top to bottom between fields`,
    RZ: `Right-adjust, zero fill`,
    VN: `Validate name`,
    VNE: `Validate name, extended`,
  },
  COLOR: {
    GRN: `Green (the default)`,
    WHT: `White`,
    RED: `Red`,
    TRQ: `Turquoise`,
    YLW: `Yellow`,
    PNK: `Pink`,
    BLU: `Blue`,
  },
  // The same map the canvas renders these fields from, so the dropdown and
  // what you see on screen can't drift apart - plus *JOB, which the canvas
  // has no fixed picture for since it's whatever the job says at run time.
  DATFMT: { '*JOB': `The job's date format`, ...dateFormats },
  // The standard edit codes. A second parameter - EDTCDE(Z *) for asterisk
  // fill, EDTCDE(1 $) for a floating currency symbol - is allowed after any
  // of them, so only the first code is ever checked against this.
  EDTCDE: {
    1: `Commas, zero shown as .00 or 0, no sign`,
    2: `Commas, zero blank, no sign`,
    3: `No commas, zero shown as .00 or 0, no sign`,
    4: `No commas, zero blank, no sign`,
    5: `User-defined (QEDIT5)`,
    6: `User-defined (QEDIT6)`,
    7: `User-defined (QEDIT7)`,
    8: `User-defined (QEDIT8)`,
    9: `User-defined (QEDIT9)`,
    A: `Commas, zero shown as .00 or 0, CR for negative`,
    B: `Commas, zero blank, CR for negative`,
    C: `No commas, zero shown as .00 or 0, CR for negative`,
    D: `No commas, zero blank, CR for negative`,
    J: `Commas, zero shown as .00 or 0, trailing minus`,
    K: `Commas, zero blank, trailing minus`,
    L: `No commas, zero shown as .00 or 0, trailing minus`,
    M: `No commas, zero blank, trailing minus`,
    N: `Commas, zero shown as .00 or 0, leading minus`,
    O: `Commas, zero blank, leading minus`,
    P: `No commas, zero shown as .00 or 0, leading minus`,
    Q: `No commas, zero blank, leading minus`,
    W: `Date with slashes, four-digit year (nnnn/nn/nn)`,
    Y: `Date with slashes (nn/nn/nn)`,
    Z: `Suppress leading zeros, no sign`,
  },
  DSPATR: {
    HI: `High intensity`,
    BL: `Blink`,
    UL: `Underline`,
    RI: `Reverse image`,
    ND: `Non-display`,
    PR: `Protected (no input)`,
    PC: `Position cursor here`,
    CS: `Column separator`,
    MDT: `Set modified data tag`,
    OID: `Operator identification (magnetic stripe reader)`,
    SP: `Select by light pen`,
  },
  SFLEND: {
    '*MORE': `"More..." at the bottom of a full page`,
    '*PLUS': `"+" at the bottom of a full page`,
    '*SCRBAR': `Scroll bar`,
  },
  TIMFMT: timeFormats,
};

/**
 * Keywords whose value is a space-separated LIST of the codes in
 * KEYWORD_VALUES rather than a single one - DSPATR(HI UL) is two display
 * attributes, not a value called "HI UL", and CHECK(ME FE) is two checks.
 * A single-select can't express that, so these get the checkbox treatment
 * instead (see createValueRow).
 */
const MULTI_VALUE_KEYWORDS = new Set([`CHECK`, `DSPATR`]);

/**
 * Splits a space-separated keyword value into its individual codes.
 * @param {string} value
 */
function valueTokens(value) {
  return (value || ``).trim().split(/\s+/).filter(token => token.length > 0);
}

/**
 * Per-keyword help for display files: which level(s) the keyword is legal at
 * and one line on what it does, transcribed from IBM's DDS reference (DDS for
 * display files). Feeds the hint line under the keyword name in the editor.
 *
 * This is help text, never a gate - see the ground rule in todo.md. A keyword
 * that isn't here (or isn't legal for the file type currently open) just shows
 * no hint, and nothing here is checked against what you type.
 *
 * `CA`/`CF` aren't keywords themselves - they stand in for all 48 CAxx/CFxx
 * command keys, which say the same thing bar the key number (see keywordHelp).
 */
const KEYWORD_HELP = {
  ALARM: { levels: [`Record`], description: `Sounds the workstation's audible alarm when this record is displayed` },
  ALIAS: { levels: [`Field`], description: `Gives the field an alternative name for the compiler to bring into the program` },
  ALTHELP: { levels: [`File`], description: `Assigns a CAnn key as an alternative Help key` },
  ALTNAME: { levels: [`Record`], description: `Gives the record an alternative name for I/O from a program-described file` },
  ALTPAGEDWN: { levels: [`File`], description: `Assigns a CFnn key as an alternative Page Down key (CF08 by default)` },
  ALTPAGEUP: { levels: [`File`], description: `Assigns a CFnn key as an alternative Page Up key (CF07 by default)` },
  ALWGPH: { levels: [`File`, `Record`], description: `Allows graphics and alphanumeric contents to be displayed together (5292 Model 2 only)` },
  ALWROL: { levels: [`Record`], description: `Lets your program roll the data inside a window on the display` },
  ASSUME: { levels: [`Record`], description: `Assumes this record is already on the display when the file is opened` },
  AUTO: { levels: [`Field`], description: `Older equivalent of CHECK(ER), CHECK(RB) and CHECK(RZ) - CHECK is preferred` },
  BLANKS: { levels: [`Field`], description: `Sets on a response indicator when a numeric input field is left blank, telling blank apart from zero` },
  BLINK: { levels: [`Record`], description: `Flashes the cursor for as long as this record is displayed` },
  BLKFOLD: { levels: [`Field`], description: `Folds a long output field onto the next display line at a blank rather than mid-word` },
  CA: { levels: [`File`, `Record`], description: `Command attention key - returns control to your program with no input data, setting the response indicator` },
  CCSID: { levels: [`File`, `Record`, `Field`], description: `Makes a G-type field carry Unicode data instead of DBCS-graphic data` },
  CF: { levels: [`File`, `Record`], description: `Command function key - returns control to your program with the changed input data, setting the response indicator` },
  CHANGE: { levels: [`Record`, `Field`], description: `Sets on a response indicator when the user changes any field in the record (or this field)` },
  CHCACCEL: { levels: [`Field`], description: `Text shown as the accelerator key for a pull-down menu choice` },
  CHCAVAIL: { levels: [`Field`], description: `Colour or display attributes for the available choices in a menu bar, push button or selection field` },
  CHCCTL: { levels: [`Field`], description: `Controls, through a program field, which choices in a selection field are available` },
  CHCSLT: { levels: [`Field`], description: `Colour or display attributes for a selected choice in a menu bar or selection field` },
  CHCUNAVAIL: { levels: [`Field`], description: `Colour or display attributes for the unavailable choices in a selection field or push button` },
  CHECK: { levels: [`File`, `Record`, `Field`], description: `Validity checking (AB, ME, MF, VN...) and keyboard control (ER, LC, RB, RZ, RL) for input fields - not every value is legal at every level` },
  CHGINPDFT: { levels: [`File`, `Record`, `Field`], description: `Changes one or more input defaults for input-capable fields` },
  CHKMSGID: { levels: [`Field`], description: `The error message issued when this field fails its validity check` },
  CHOICE: { levels: [`Field`], description: `Defines one choice in a selection field` },
  CHRID: { levels: [`Field`], description: `Translates the field when the file's CHRID differs from the workstation's` },
  CLEAR: { levels: [`File`, `Record`], description: `Returns control to your program when the Clear key is pressed` },
  CLRL: { levels: [`Record`], description: `Clears a given number of display lines before this record is written` },
  CMP: { levels: [`Field`], description: `Validity-checks input against one value with a comparison (older spelling of COMP)` },
  CNTFLD: { levels: [`Field`], description: `Defines the field as a continued-entry field, typed across several display lines` },
  COLOR: { levels: [`Field`], description: `The colour of the field on a colour display` },
  COMP: { levels: [`Field`], description: `Validity-checks input against one value with a comparison (EQ, NE, LT, NL, GT, NG, LE, GE)` },
  CSRINPONLY: { levels: [`File`, `Record`], description: `Restricts cursor movement to input-capable positions only` },
  CSRLOC: { levels: [`Record`], description: `Places the cursor at the row/column held in two named fields when the record is written` },
  DATE: { levels: [`Field`], description: `Displays the current date as a constant, output-only field` },
  DATFMT: { levels: [`Field`], description: `The format of a date (L) field` },
  DATSEP: { levels: [`Field`], description: `The separator character used in a date (L) field` },
  DFT: { levels: [`Field`], description: `The constant value of an unnamed field, or a default value for a named one` },
  DFTVAL: { levels: [`Field`], description: `A default value for an output-capable field, which the program can override` },
  DLTCHK: { levels: [`Field`], description: `Drops the validity checking a referenced field brought with it (needs R in position 29)` },
  DLTEDT: { levels: [`Field`], description: `Drops the EDTCDE or EDTWRD a referenced field brought with it (needs R in position 29)` },
  DSPATR: { levels: [`Field`], description: `Display attributes for the field - HI, UL, RI, ND, PR, BL, CS, PC, MDT` },
  DSPMOD: { levels: [`Record`], description: `Which display mode (size) this record uses on a display station that supports two` },
  DSPRL: { levels: [`File`], description: `Writes the file's records right to left on the display` },
  DSPSIZ: { levels: [`File`], description: `The display size(s) the file can be opened for - 24x80 (*DS3) and/or 27x132 (*DS4)` },
  DUP: { levels: [`Field`], description: `Activates the Dup key for this field, setting on a response indicator when it's pressed` },
  EDTCDE: { levels: [`Field`], description: `Edits an output-capable numeric field with one of DDS's standard edit codes` },
  EDTWRD: { levels: [`Field`], description: `Edits a numeric field with an edit word, for formatting EDTCDE can't produce` },
  ENTFLDATR: { levels: [`File`, `Record`, `Field`], description: `Changes the field's leading attribute while the cursor is in it` },
  ERASE: { levels: [`Record`], description: `Erases the named records from the display as this one is written (used with OVERLAY)` },
  ERASEINP: { levels: [`Record`], description: `Erases input-capable fields already on the display (used with OVERLAY)` },
  ERRMSG: { levels: [`Field`], description: `The error message text shown on the message line for this field` },
  ERRMSGID: { levels: [`Field`], description: `The message ID whose text is shown on the message line for this field` },
  ERRSFL: { levels: [`File`], description: `Displays messages through the system-supplied error subfile, so several can queue up` },
  FLDCSRPRG: { levels: [`Field`], description: `The field the cursor moves to when it leaves this one` },
  FLTFIXDEC: { levels: [`Field`], description: `Displays an output-capable floating-point field in fixed-decimal notation` },
  FLTPCN: { levels: [`Field`], description: `The precision - single or double - of a floating-point field` },
  FRCDTA: { levels: [`Record`], description: `Displays the record immediately instead of waiting for the next input operation` },
  GETRETAIN: { levels: [`Record`], description: `Keeps input-capable fields on the display through an input operation (used with UNLOCK)` },
  GRDATR: { levels: [`File`, `Record`], description: `Default colour and line type for the record's grid structures` },
  GRDBOX: { levels: [`Record`], description: `Shape, position and attributes of a grid box` },
  GRDCLR: { levels: [`Record`], description: `The rectangle within which all grid structures are cleared` },
  GRDLIN: { levels: [`Record`], description: `Shape, position and attributes of a grid line` },
  GRDRCD: { levels: [`Record`], description: `Defines the record as a grid line structure` },
  HELP: { levels: [`File`, `Record`], description: `Enables the Help key` },
  HLPARA: { levels: [`Help specification`], description: `The rectangular area of the display this help specification covers` },
  HLPBDY: { levels: [`Help specification`], description: `Limits which help information is available from this help specification` },
  HLPCLR: { levels: [`Record`], description: `Clears the list of active help specifications` },
  HLPCMDKEY: { levels: [`Record`], description: `Returns control to your program when a CA/CF key is pressed on an application help record` },
  HLPDOC: { levels: [`File`, `Help specification`], description: `The document holding the help text for a location on the display` },
  HLPEXCLD: { levels: [`Help specification`], description: `Keeps this help specification's text out of extended help, leaving it item-specific` },
  HLPFULL: { levels: [`File`], description: `Shows the application's help panel group full screen rather than in a window` },
  HLPID: { levels: [`Field`], description: `An identifier for a constant field, for field-level help` },
  HLPPNLGRP: { levels: [`File`, `Help specification`], description: `The UIM panel group holding the help shown when the Help key is pressed` },
  HLPRCD: { levels: [`File`, `Help specification`], description: `The record format holding the help shown when the Help key is pressed` },
  HLPRTN: { levels: [`File`, `Record`], description: `Returns control to your program when the Help key is pressed` },
  HLPSCHIDX: { levels: [`File`], description: `Enables index search on the Help display and names the search index object` },
  HLPSEQ: { levels: [`Record`], description: `Sequences help text records for Page key processing` },
  HLPTITLE: { levels: [`File`, `Record`], description: `The default title of the online help panel group` },
  HOME: { levels: [`File`, `Record`], description: `Handles the Home key in your program instead of letting the system home the cursor` },
  HTML: { levels: [`Field`], description: `Sends HTML tags along with the 5250 data stream for an unnamed constant field` },
  IGCALTTYP: { levels: [`Field`], description: `Turns input-capable alphanumeric fields into DBCS (type O) fields` },
  IGCCNV: { levels: [`File`], description: `Enables DBCS conversion, so DBCS characters can be picked rather than typed` },
  INDARA: { levels: [`File`], description: `Moves option and response indicators out of the record buffer into a separate 99-byte area` },
  INDTXT: { levels: [`File`, `Record`, `Field`], description: `Documents what an indicator is for - comment only, no run-time effect` },
  INVITE: { levels: [`File`, `Record`], description: `Invites the device for a later read operation` },
  INZINP: { levels: [`Record`], description: `Initialises input fields without sending the data (used with PUTOVR and ERASEINP(*ALL))` },
  INZRCD: { levels: [`Record`], description: `Writes the record to the display before an input operation if it isn't already there` },
  KEEP: { levels: [`Record`], description: `Keeps the record on the display when the file is closed` },
  LOCK: { levels: [`Record`], description: `Leaves the keyboard locked after an output operation` },
  LOGINP: { levels: [`Record`], description: `Writes the record's input buffer to the job log on every input operation` },
  LOGOUT: { levels: [`Record`], description: `Writes the record's output buffer to the job log on every output operation` },
  LOWER: { levels: [`Field`], description: `Older equivalent of CHECK(LC) - CHECK is preferred` },
  MAPVAL: { levels: [`Field`], description: `Maps a date, time or timestamp field between program and system values` },
  MDTOFF: { levels: [`Record`], description: `Sets off modified data tags on fields already displayed (used with OVERLAY)` },
  MLTCHCFLD: { levels: [`Field`], description: `Defines the field as a multiple-choice selection field` },
  MNUBAR: { levels: [`Record`], description: `Defines the record as a menu bar` },
  MNUBARCHC: { levels: [`Field`], description: `Defines one choice on a menu-bar field and the pull-down record behind it` },
  MNUBARDSP: { levels: [`Record`], description: `Displays a menu bar from this record` },
  MNUBARSEP: { levels: [`Field`], description: `Colour, attributes and character of the menu-bar separator line` },
  MNUBARSW: { levels: [`File`, `Record`], description: `Assigns a CAnn key as the Switch-to-menu-bar key` },
  MNUCNL: { levels: [`File`, `Record`], description: `Assigns a CAnn key as the cancel key for menu bars and pull-down menus` },
  MOUBTN: { levels: [`File`, `Record`], description: `Ties a pointer-device event to a command key or event ID` },
  MSGALARM: { levels: [`File`, `Record`], description: `Sounds the alarm when an error message or failed validity check is displayed` },
  MSGCON: { levels: [`Field`], description: `Takes a constant field's text from a message description instead of the source` },
  MSGID: { levels: [`Field`], description: `Takes a named field's text from a message description chosen at run time` },
  MSGLOC: { levels: [`File`], description: `The line the program's messages are displayed on` },
  NOCCSID: { levels: [`Field`], description: `Skips CCSID conversion for the field` },
  OPENPRT: { levels: [`File`], description: `Keeps the print file opened by the Print key open until the display file closes` },
  OVERLAY: { levels: [`Record`], description: `Writes the record over what's on the display instead of clearing the screen first` },
  OVRATR: { levels: [`Record`, `Field`], description: `Overrides the display attributes of what's already displayed (used with PUTOVR)` },
  OVRDTA: { levels: [`Record`, `Field`], description: `Overrides the data of what's already displayed (used with PUTOVR)` },
  PAGEDOWN: { levels: [`File`, `Record`], description: `Handles Page Down in your program when the system can't page the display itself` },
  PAGEUP: { levels: [`File`, `Record`], description: `Handles Page Up in your program when the system can't page the display itself` },
  PASSRCD: { levels: [`File`], description: `The record format used when another program passes unformatted data to yours` },
  PRINT: { levels: [`File`, `Record`], description: `Lets the user print the current display with the Print key` },
  PROTECT: { levels: [`Record`], description: `Protects input-capable fields already on the display (used with OVERLAY)` },
  PSHBTNCHC: { levels: [`Field`], description: `Defines one choice in a push button field` },
  PSHBTNFLD: { levels: [`Field`], description: `Defines the field as a push button field` },
  PULLDOWN: { levels: [`Record`], description: `Defines the record as a pull-down menu for a menu bar` },
  PUTOVR: { levels: [`Record`], description: `Lets OVRATR/OVRDTA override attributes or data of fields already displayed` },
  PUTRETAIN: { levels: [`Record`, `Field`], description: `Keeps data already on the display when the record is written again (used with OVERLAY)` },
  RANGE: { levels: [`Field`], description: `Validity-checks input against a low and high value` },
  REF: { levels: [`File`], description: `The file field descriptions are retrieved from` },
  REFFLD: { levels: [`Field`], description: `The field this one is defined from, when its name, format, file or library differs` },
  RETLCKSTS: { levels: [`Record`], description: `Leaves the keyboard locked on the next input operation` },
  RMVWDW: { levels: [`Record`], description: `Removes every window on the display before this record is written` },
  ROLLDOWN: { levels: [`File`, `Record`], description: `Handles the Roll Down / Page Up key in your program` },
  ROLLUP: { levels: [`File`, `Record`], description: `Handles the Roll Up / Page Down key in your program` },
  RTNCSRLOC: { levels: [`Record`], description: `Returns the cursor's location to your program on input` },
  RTNDTA: { levels: [`Record`], description: `Returns the same data as the previous input operation, without re-reading the display` },
  SETOF: { levels: [`Record`], description: `Sets off a response indicator when an input operation to this record completes` },
  SETOFF: { levels: [`Record`], description: `Sets off a response indicator when an input operation to this record completes` },
  SFL: { levels: [`Record`], description: `Defines the record as a subfile record format` },
  SFLCHCCTL: { levels: [`Field`], description: `Controls, through a program field, which choices in a selection list are available` },
  SFLCLR: { levels: [`Record`], description: `On the subfile-control format: clears every record out of the subfile` },
  SFLCSRPRG: { levels: [`Field`], description: `Moves the cursor to the same field in the next subfile record rather than the next field` },
  SFLCSRRRN: { levels: [`Record`], description: `Returns the relative record number the cursor is on within the subfile` },
  SFLCTL: { levels: [`Record`], description: `Defines the record as the subfile-control format for the named subfile` },
  SFLDLT: { levels: [`Record`], description: `Lets your program delete the subfile` },
  SFLDROP: { levels: [`Record`], description: `Assigns a CA/CF key that folds or truncates subfile records too long for one line` },
  SFLDSP: { levels: [`Record`], description: `On the subfile-control format: displays the subfile records` },
  SFLDSPCTL: { levels: [`Record`], description: `On the subfile-control format: displays the control record itself` },
  SFLEND: { levels: [`Record`], description: `Marks the end of the subfile with "+", "More..."/"Bottom" or a scroll bar` },
  SFLENTER: { levels: [`Record`], description: `Makes the Enter key act as the Page Up key for this subfile` },
  SFLFOLD: { levels: [`Record`], description: `Assigns a CA/CF key that truncates or folds subfile records too long for one line` },
  SFLINZ: { levels: [`Record`], description: `Initialises every record in the subfile on output to the control format` },
  SFLLIN: { levels: [`Record`], description: `Displays the subfile horizontally, with the given gap between columns` },
  SFLMLTCHC: { levels: [`Record`], description: `Defines the subfile as a multiple-choice selection list` },
  SFLMODE: { levels: [`Record`], description: `Returns whether the subfile was folded or truncated on input` },
  SFLMSG: { levels: [`Record`], description: `On the subfile-control format: message text to display on the message line` },
  SFLMSGID: { levels: [`Record`], description: `On the subfile-control format: the message ID to display on the message line` },
  SFLMSGKEY: { levels: [`Field`], description: `On the first field of a message subfile record: the message reference key` },
  SFLMSGRCD: { levels: [`Record`], description: `Makes the subfile a message subfile, displayed from a program message queue` },
  SFLNXTCHG: { levels: [`Record`], description: `Makes an already-read subfile record be returned again until the user corrects it` },
  SFLPAG: { levels: [`Record`], description: `How many subfile records are displayed at once (one page)` },
  SFLPGMQ: { levels: [`Field`], description: `On the last field of a message subfile record: the program message queue to read` },
  SFLRCDNBR: { levels: [`Field`], description: `Displays the subfile page containing the relative record number in this field` },
  SFLRNA: { levels: [`Record`], description: `Initialises the subfile with no active records (used with SFLINZ)` },
  SFLROLVAL: { levels: [`Field`], description: `Lets the user type how many lines to roll in this subfile-control field` },
  SFLRTNSEL: { levels: [`Record`], description: `Controls how selection-list choices come back on a GET-NEXT-CHANGED` },
  SFLSCROLL: { levels: [`Field`], description: `Returns the relative record number at the top of the subfile` },
  SFLSIZ: { levels: [`Record`], description: `How many records the subfile holds in total` },
  SFLSNGCHC: { levels: [`Record`], description: `Defines the subfile as a single-choice selection list` },
  SLNO: { levels: [`Record`], description: `The starting line number the record is written at, fixed or set by the program` },
  SNGCHCFLD: { levels: [`Field`], description: `Defines the field as a single-choice selection field` },
  SYSNAME: { levels: [`Field`], description: `Displays the system name as an 8-character constant, output-only field` },
  TEXT: { levels: [`Record`, `Field`], description: `A comment describing the record or field - documentation only` },
  TIME: { levels: [`Field`], description: `Displays the current time as a constant, output-only field` },
  TIMFMT: { levels: [`Field`], description: `The format of a time (T) field` },
  TIMSEP: { levels: [`Field`], description: `The separator character used in a time (T) field` },
  UNLOCK: { levels: [`Record`], description: `Unlocks the keyboard immediately after an input operation is issued` },
  USER: { levels: [`Field`], description: `Displays the job's user profile as a 10-character constant, output-only field` },
  USRDFN: { levels: [`Record`], description: `The record's data is a user-defined data stream, passed to the device as-is` },
  USRDSPMGT: { levels: [`File`], description: `Holds written data on the display until it's overwritten or CLRL clears it (System/36 style)` },
  USRRSTDSP: { levels: [`Record`], description: `Leaves the application to manage the display for this window record` },
  VALNUM: { levels: [`File`, `Record`, `Field`], description: `Tightens error checking on numeric-only fields` },
  VALUES: { levels: [`Field`], description: `Validity-checks input against a list of allowed values` },
  VLDCMDKEY: { levels: [`File`, `Record`], description: `Sets on a response indicator when any valid command key other than Enter is pressed` },
  WDWBORDER: { levels: [`File`, `Record`], description: `Colour, display attributes and characters forming a window's border` },
  WDWTITLE: { levels: [`Record`], description: `Text, colour and attributes of a title embedded in a window's top or bottom border` },
  WINDOW: { levels: [`Record`], description: `Displays the record as a window: its size and position, or the window record it shares` },
  WRDWRAP: { levels: [`File`, `Record`, `Field`], description: `Wraps a field's text onto the following display lines instead of truncating it` },
};

/**
 * The same, for printer files - a separate table because the two file types
 * barely overlap: a printer file has no DSPATR, COLOR means something else,
 * and half of what it does have (SPACEB, FONT, DRAWER) means nothing to a
 * display. Transcribed from IBM's DDS for printer files.
 */
const PRINTER_KEYWORD_HELP = {
  AFPRSC: { levels: [`Record`], description: `Prints an AFP (or non-AFP) resource held in the integrated file system` },
  ALIAS: { levels: [`Field`], description: `Gives the field an alternative name for the compiler to bring into the program` },
  BARCODE: { levels: [`Field`], description: `Prints the field as a bar code of the given type` },
  BLKFOLD: { levels: [`Field`], description: `Folds a long field onto the next print line at a blank rather than mid-word` },
  BOX: { levels: [`Record`], description: `Prints a rectangle at the given corners` },
  CCSID: { levels: [`File`, `Record`, `Field`], description: `Makes a G-type field carry UTF-16 data instead of DBCS-graphic data` },
  CDEFNT: { levels: [`Record`, `Field`], description: `The coded font used to print the record's or field's text` },
  CHRID: { levels: [`Field`], description: `Prints the field with a character set and code page other than the device default` },
  CHRSIZ: { levels: [`Record`, `Field`], description: `Expands the printed width and height of a record or field` },
  COLOR: { levels: [`Field`], description: `The colour the field is printed in` },
  CPI: { levels: [`Record`, `Field`], description: `Characters per inch - the horizontal print density` },
  CVTDTA: { levels: [`Field`], description: `Passes the field to the printer as hexadecimal data` },
  DATE: { levels: [`Field`], description: `Prints the current (or job) date as a constant field` },
  DATFMT: { levels: [`Field`], description: `The format of a date (L) field` },
  DATSEP: { levels: [`Field`], description: `The separator character used in a date (L) field` },
  DFNCHR: { levels: [`File`, `Record`], description: `Defines characters of your own design (5224 and 5225 printers)` },
  DFNLIN: { levels: [`Record`], description: `Draws a horizontal or vertical line` },
  DFT: { levels: [`Field`], description: `The constant value of an unnamed field` },
  DLTEDT: { levels: [`Field`], description: `Drops the EDTCDE or EDTWRD a referenced field brought with it (needs R in position 29)` },
  DOCIDXTAG: { levels: [`Record`], description: `Creates an indexing tag in the document for AFP and post-processing tools` },
  DRAWER: { levels: [`Record`], description: `The paper drawer the sheet is fed from` },
  DTASTMCMD: { levels: [`Record`, `Field`], description: `Stores a data stream command or other information in the spooled file` },
  DUPLEX: { levels: [`Record`], description: `Prints on one side or both sides of the paper` },
  EDTCDE: { levels: [`Field`], description: `Edits an output-capable numeric field with one of DDS's standard edit codes` },
  EDTWRD: { levels: [`Field`], description: `Edits a numeric field with an edit word, for formatting EDTCDE can't produce` },
  ENDPAGE: { levels: [`Record`], description: `Ejects the page after this record is printed` },
  ENDPAGGRP: { levels: [`Record`], description: `Ends the page group started by STRPAGGRP` },
  FLTFIXDEC: { levels: [`Field`], description: `Prints a floating-point field in fixed-decimal notation` },
  FLTPCN: { levels: [`Field`], description: `The precision - single or double - of a floating-point field` },
  FNTCHRSET: { levels: [`File`, `Record`, `Field`], description: `The font character set and code page used to print the text` },
  FONT: { levels: [`Record`, `Field`], description: `The font ID used to print the record's or field's text` },
  FONTNAME: { levels: [`File`, `Record`, `Field`], description: `The TrueType font used to print the record's or field's text` },
  FORCE: { levels: [`Record`], description: `Feeds a new sheet before this record is printed` },
  GDF: { levels: [`Record`], description: `Prints a graphic data file` },
  HIGHLIGHT: { levels: [`Record`, `Field`], description: `Prints the record or field in bold` },
  IGCALTTYP: { levels: [`Field`], description: `Turns alphanumeric fields into DBCS (type O) fields` },
  IGCANKCNV: { levels: [`Field`], description: `Converts alphanumeric characters to their DBCS equivalents (Japanese only)` },
  IGCCDEFNT: { levels: [`Record`, `Field`], description: `The DBCS coded font used to print the text` },
  IGCCHRRTT: { levels: [`Record`, `Field`], description: `Rotates each DBCS character 90 degrees anticlockwise before printing` },
  INDARA: { levels: [`File`], description: `Moves option indicators out of the record buffer into a separate 99-byte area` },
  INDTXT: { levels: [`File`, `Record`, `Field`], description: `Documents what an indicator is for - comment only, no run-time effect` },
  INVDTAMAP: { levels: [`Record`], description: `The data map defining the layout of a formatted page` },
  INVMMAP: { levels: [`Record`], description: `Calls a new medium map` },
  LINE: { levels: [`Record`], description: `Prints a horizontal or vertical line` },
  LPI: { levels: [`Record`], description: `Lines per inch - the vertical print density` },
  MSGCON: { levels: [`Field`], description: `Takes a constant field's text from a message description instead of the source` },
  OUTBIN: { levels: [`Record`], description: `The output bin the sheet is delivered to` },
  OVERLAY: { levels: [`Record`], description: `Prints an overlay with the record` },
  PAGNBR: { levels: [`Field`], description: `Prints the page number as an unnamed 4-digit zoned field` },
  PAGRTT: { levels: [`Record`], description: `Rotates the text relative to how the page is loaded into the printer` },
  POSITION: { levels: [`Field`], description: `Positions a named field on the page in inches, centimetres or rows and columns` },
  PRTQLTY: { levels: [`Record`, `Field`], description: `Varies the print quality within the file` },
  REF: { levels: [`File`], description: `The file field descriptions are retrieved from` },
  REFFLD: { levels: [`Field`], description: `The field this one is defined from, when its name, format, file or library differs` },
  RELPOS: { levels: [`File`], description: `Positions +n fields relative to the end of the previous field rather than the line` },
  SKIPA: { levels: [`File`, `Record`, `Field`], description: `Skips to the given line number after printing` },
  SKIPB: { levels: [`File`, `Record`, `Field`], description: `Skips to the given line number before printing` },
  SPACEA: { levels: [`Record`, `Field`], description: `Spaces the given number of lines after printing` },
  SPACEB: { levels: [`Record`, `Field`], description: `Spaces the given number of lines before printing` },
  STAPLE: { levels: [`Record`], description: `Staples the spooled output` },
  STRPAGGRP: { levels: [`Record`], description: `Starts a logical group of pages, ended by ENDPAGGRP` },
  TEXT: { levels: [`Record`, `Field`], description: `A comment describing the record or field - documentation only` },
  TIME: { levels: [`Field`], description: `Prints the current time as a 6-byte constant field` },
  TIMFMT: { levels: [`Field`], description: `The format of a time (T) field` },
  TIMSEP: { levels: [`Field`], description: `The separator character used in a time (T) field` },
  TRNSPY: { levels: [`Field`], description: `Stops redefined code points being read as SCS printer control commands` },
  TXTRTT: { levels: [`Field`], description: `Rotates the text in the field` },
  UNDERLINE: { levels: [`Field`], description: `Underlines the field when it's printed` },
  UNISCRIPT: { levels: [`Field`], description: `Controls selection of text marked for complex script processing` },
  ZFOLD: { levels: [`Record`], description: `Z-folds the current sheet` },
};

/**
 * Keywords whose value is a single record count, with the range DDS allows.
 * Their Value box becomes a number box - but only while what's in it is a
 * number, so a hand-written value that isn't still opens as plain text.
 */
const NUMBER_KEYWORDS = {
  SFLPAG: { min: 1, max: 9999 },
  SFLSIZ: { min: 1, max: 9999 },
};

// A DDS name: a record format, field, file or library.
const DDS_NAME = `[A-Z#@$][A-Z0-9#@$_]*`;

const WINDOW_MESSAGE_LINE_OPTIONS = [`*MSGLIN`, `*NOMSGLIN`];
const WINDOW_OPTIONS = [...WINDOW_MESSAGE_LINE_OPTIONS, `*RSTCSR`, `*NORSTCSR`];

/**
 * Splits a WINDOW value into its positional parameters, or returns undefined
 * for one the form can't represent (a WINDOW(recordname) reference, or
 * anything malformed). Handles WINDOW(line pos lines cols) and
 * WINDOW(*DFT lines cols), where line/pos may be a program field (&FIELD),
 * followed by any of *MSGLIN/*NOMSGLIN/*RSTCSR/*NORSTCSR. Options the form
 * has no control for are kept in `otherOptions` so composing doesn't drop them.
 * @param {string} value
 */
function parseWindowValue(value) {
  const tokens = valueTokens(value);
  const options = [];

  while (tokens.length > 0 && WINDOW_OPTIONS.includes(tokens[tokens.length - 1].toUpperCase())) {
    options.unshift(tokens.pop().toUpperCase());
  }

  const isNumber = (token) => /^\d+$/.test(token);
  const isStart = (token) => isNumber(token) || new RegExp(`^&${DDS_NAME}$`, `i`).test(token);

  let start = [``, ``];
  let size = [``, ``];

  if (tokens.length === 0 && options.length === 0) {
    // A brand-new WINDOW with nothing in it yet - every field starts blank.
  } else if (tokens.length === 3 && tokens[0].toUpperCase() === `*DFT` && isNumber(tokens[1]) && isNumber(tokens[2])) {
    size = tokens.slice(1);
  } else if (tokens.length === 4 && isStart(tokens[0]) && isStart(tokens[1]) && isNumber(tokens[2]) && isNumber(tokens[3])) {
    start = tokens.slice(0, 2);
    size = tokens.slice(2);
  } else {
    return undefined;
  }

  return {
    startLine: start[0],
    startPosition: start[1],
    lines: size[0],
    columns: size[1],
    noMessageLine: options.includes(`*NOMSGLIN`),
    explicitMessageLine: options.includes(`*MSGLIN`),
    otherOptions: options.filter(option => !WINDOW_MESSAGE_LINE_OPTIONS.includes(option)),
  };
}

/** @param {ReturnType<typeof parseWindowValue>} params */
function composeWindowValue(params) {
  const hasStart = params.startLine || params.startPosition;
  const messageLine = params.noMessageLine ? `*NOMSGLIN` : (params.explicitMessageLine ? `*MSGLIN` : ``);
  const options = [messageLine, ...params.otherOptions].filter(option => option);

  if (!hasStart && !params.lines && !params.columns && options.length === 0) {
    return ``;
  }

  // No start position means the system picks one - that's what *DFT says.
  const start = hasStart ? [params.startLine, params.startPosition] : [`*DFT`];

  return [...start, params.lines, params.columns, ...options].filter(token => token).join(` `);
}

/**
 * Splits a CAxx/CFxx value - CA03(03 'Exit') - into its response indicator
 * and optional text, or undefined for anything else. The text comes back
 * with DDS's doubled-quote escape undone.
 * @param {string} value
 */
function parseCommandKeyValue(value) {
  const match = /^(?:(\d{1,2}))?\s*(?:'((?:[^']|'')*)')?$/.exec((value || ``).trim());

  if (!match || match[1] === `0` || match[1] === `00`) {
    return undefined;
  }

  return {
    indicator: match[1] ? match[1].padStart(2, `0`) : ``,
    text: (match[2] ?? ``).replace(/''/g, `'`),
  };
}

/** @param {ReturnType<typeof parseCommandKeyValue>} params */
function composeCommandKeyValue(params) {
  const text = params.text ? `'${params.text.replace(/'/g, `''`)}'` : ``;
  return [params.indicator, text].filter(part => part).join(` `);
}

/**
 * Splits a REFFLD value - REFFLD([record/]field [*SRC | [library/]file]) -
 * into its parts, or undefined for anything else.
 * @param {string} value
 */
function parseReferenceFieldValue(value) {
  const trimmed = (value || ``).trim();

  if (!trimmed) {
    return { record: ``, field: ``, file: `` };
  }

  const pattern = new RegExp(`^(?:(${DDS_NAME})/)?(${DDS_NAME})(?:\\s+(\\*SRC|(?:${DDS_NAME}/)?${DDS_NAME}))?$`, `i`);
  const match = pattern.exec(trimmed);

  return match ? { record: match[1] || ``, field: match[2], file: match[3] || `` } : undefined;
}

/** @param {ReturnType<typeof parseReferenceFieldValue>} params */
function composeReferenceFieldValue(params) {
  const field = params.record ? `${params.record}/${params.field}` : params.field;
  return [field, params.file].filter(part => part).join(` `);
}

/**
 * What's wrong with a WINDOW value, if anything. A lone record name is fine -
 * WINDOW(WINREC) shares that record's window - even though the fields can't
 * show it.
 * @param {string} value
 */
function windowProblem(value) {
  const trimmed = (value || ``).trim();

  if (!trimmed) {
    return `WINDOW needs a size, *DFT and a size, or the name of the window record it shares`;
  }

  if (new RegExp(`^${DDS_NAME}$`, `i`).test(trimmed) || parseWindowValue(trimmed)) {
    return undefined;
  }

  return `WINDOW takes a start line, start position, lines and columns (or *DFT, lines and columns), or a window record's name`;
}

/**
 * @param {string} value
 * @param {string} name the command key, e.g. CF03
 */
function commandKeyProblem(value, name) {
  const params = parseCommandKeyValue(value);

  if (!params) {
    return `${name} takes a response indicator from 01 to 99, optionally followed by quoted text`;
  }

  return params.text && !params.indicator ? `${name}'s text needs a response indicator in front of it` : undefined;
}

/** @param {string} value */
function referenceFieldProblem(value) {
  const params = parseReferenceFieldValue(value);

  if (!params) {
    return `REFFLD takes a field name, optionally record/field, then optionally library/file or *SRC`;
  }

  return params.field ? undefined : `REFFLD needs the name of the field it refers to`;
}

/**
 * Display-file keywords that take no value at all, so one coded with a value
 * is a mistake. Only the ones IBM's reference is explicit about - and only
 * for display files, since a printer file's OVERLAY, say, does take one.
 */
const NO_VALUE_KEYWORDS = new Set([
  `ALARM`, `ASSUME`, `BLINK`, `FRCDTA`, `INVITE`, `INZRCD`, `KEEP`, `LOGINP`, `LOGOUT`,
  `OVERLAY`, `PROTECT`, `PUTOVR`, `RMVWDW`,
  `SFL`, `SFLCLR`, `SFLDLT`, `SFLDSP`, `SFLDSPCTL`, `SFLINZ`, `SFLNXTCHG`, `SFLRNA`,
]);

/**
 * Keywords in KEYWORD_VALUES whose value can be left out - SFLEND on its own
 * means SFLEND(*PLUS). Every other one there needs a value.
 */
const OPTIONAL_VALUE_KEYWORDS = new Set([`SFLEND`]);

/**
 * Keywords whose value is several positional parameters, each given its own
 * control under the Value box. `parse` turns the value string into the
 * parameters (or undefined when it can't, and the form steps aside) and
 * `compose` turns them back. `problem` says what's wrong with a value, for
 * the editor's warnings, or returns undefined. Each field's `id` is the
 * parameter's key; `type` is `text` unless said otherwise.
 *
 * `CA`/`CF` stand in for all 48 command keys, as in KEYWORD_HELP.
 */
const KEYWORD_PARAMETERS = {
  CA: {
    problem: commandKeyProblem,
    fields: [
      { id: `indicator`, label: `Response indicator`, type: `indicator` },
      { id: `text`, label: `Text - describes the key, documentation only (optional)` },
    ],
    parse: parseCommandKeyValue,
    compose: composeCommandKeyValue,
  },
  REFFLD: {
    problem: referenceFieldProblem,
    fields: [
      { id: `field`, label: `Field` },
      { id: `record`, label: `Record format (optional)` },
      { id: `file`, label: `File - library/file, or *SRC for this file (optional)` },
    ],
    parse: parseReferenceFieldValue,
    compose: composeReferenceFieldValue,
  },
  WINDOW: {
    problem: windowProblem,
    fields: [
      { id: `startLine`, label: `Start line (blank for *DFT)` },
      { id: `startPosition`, label: `Start position (blank for *DFT)` },
      { id: `lines`, label: `Lines` },
      { id: `columns`, label: `Columns` },
      { id: `noMessageLine`, label: `*NOMSGLIN - no message line in the window`, type: `flag` },
    ],
    parse: parseWindowValue,
    compose: composeWindowValue,
  },
};
KEYWORD_PARAMETERS.CF = KEYWORD_PARAMETERS.CA;

/**
 * Everything tabled about one keyword, in one object, so callers ask once
 * rather than consulting each table by name:
 *
 * - `help` - its levels and one-line description for this file type, or
 *   undefined for a keyword we have nothing for (anything typed into the
 *   creatable name combobox, or a display keyword in a printer file);
 * - `values` - dropdown options for a single-code value, labelled with
 *   what each code means, or undefined;
 * - `multiValue` - whether the value is a space-separated list of those codes;
 * - `numberRange` - the min/max for a keyword whose value is one count;
 * - `parameters` - the parameter form for a keyword with positional
 *   parameters, or undefined.
 *
 * CA05 and CF17 differ from CA01 only in which key they are, so all 48
 * command keys share the `CA`/`CF` help and parameter entries.
 * @param {string} name
 * @param {string} [documentType] the open file's type - `dds.prtf` picks the printer-file help
 */
function keywordInfo(name, documentType) {
  const keywordName = (name || ``).toUpperCase();
  const key = isCommandKeyKeyword(keywordName) ? keywordName.slice(0, 2) : keywordName;
  const helpTable = documentType === `dds.prtf` ? PRINTER_KEYWORD_HELP : KEYWORD_HELP;
  const values = KEYWORD_VALUES[keywordName];

  // Own properties only - the tables are plain objects, and nothing typed
  // into the name box should be able to find something on their prototype.
  const lookup = (table, tableKey) => Object.hasOwn(table, tableKey) ? table[tableKey] : undefined;

  return {
    name: keywordName,
    help: lookup(helpTable, key),
    values: values
      ? Object.entries(values).map(([value, meaning]) => ({ label: `${value} - ${meaning}`, value }))
      : undefined,
    multiValue: MULTI_VALUE_KEYWORDS.has(keywordName),
    numberRange: lookup(NUMBER_KEYWORDS, keywordName),
    parameters: lookup(KEYWORD_PARAMETERS, key),
  };
}

/**
 * "File or record level", "File, record or field level" - the levels a
 * keyword is legal at, written out for the hint line.
 * @param {string[]} levels
 */
function keywordLevelText(levels) {
  const named = levels.map((level, index) => index === 0 ? level : level.toLowerCase());
  const last = named[named.length - 1];
  const leading = named.slice(0, -1);

  return `${leading.length > 0 ? `${leading.join(`, `)} or ${last}` : last} level`;
}

/**
 * Anything that looks wrong about a keyword as coded, one sentence each, for
 * the editor to show as a warning. Never a gate - see the ground rule in
 * todo.md - so this only ever reports what the tables here can actually back
 * up, and says nothing about a keyword or value they don't cover.
 *
 * Checks the name (a typo, or a keyword from the other file type), the level
 * it's coded at when `level` is given, and the value: a code off its list, a
 * count that isn't a number, a value where none belongs, or positional
 * parameters that don't add up.
 * @param {string} name
 * @param {string} value as it will be saved - already uppercased outside quotes
 * @param {{documentType?: string, level?: string}} [context] `level` is `File`, `Record` or `Field`
 */
function keywordWarnings(name, value, context = {}) {
  const { documentType, level } = context;
  const info = keywordInfo(name, documentType);
  const keywordName = info.name;
  const trimmed = (value || ``).trim();
  const isPrinterFile = documentType === `dds.prtf`;

  if (!keywordName) {
    return [];
  }

  if (!info.help) {
    const otherFileType = isPrinterFile ? `dds.dspf` : `dds.prtf`;

    if (keywordInfo(keywordName, otherFileType).help) {
      return [isPrinterFile
        ? `${keywordName} is a display-file keyword - printer files don't have it`
        : `${keywordName} is a printer-file keyword - display files don't have it`];
    }

    // Nothing to say about the value of a keyword we don't know at all.
    return DDS_KEYWORDS.includes(keywordName) ? [] : [`${keywordName} isn't a keyword we know - check the spelling`];
  }

  const warnings = [];

  if (level && !info.help.levels.includes(level)) {
    const allowed = keywordLevelText(info.help.levels);
    warnings.push(`${keywordName} belongs at ${allowed.charAt(0).toLowerCase()}${allowed.slice(1)}, not ${level.toLowerCase()} level`);
  }

  // The value checks below are all display-file knowledge - a printer
  // file's COLOR, OVERLAY and the rest take different values entirely.
  if (isPrinterFile) {
    return warnings;
  }

  if (info.parameters) {
    const problem = info.parameters.problem(trimmed, keywordName);
    if (problem) {
      warnings.push(problem);
    }
  } else if (info.numberRange) {
    const { min, max } = info.numberRange;
    const number = Number(trimmed);

    if (!/^\d+$/.test(trimmed) || number < min || number > max) {
      warnings.push(`${keywordName} takes a number from ${min} to ${max}`);
    }
  } else if (NO_VALUE_KEYWORDS.has(keywordName)) {
    if (trimmed) {
      warnings.push(`${keywordName} doesn't take a value`);
    }
  } else if (info.values) {
    // Only the first code of a single-value keyword - EDTCDE(Z *) has a fill
    // character after the code - and never a program field (DSPATR(&ATTR)).
    const tokens = valueTokens(trimmed);
    const codes = (info.multiValue ? tokens : tokens.slice(0, 1)).filter(token => !token.startsWith(`&`));
    const unknown = codes.filter(code => !info.values.some(option => option.value === code.toUpperCase()));

    if (tokens.length === 0 && !OPTIONAL_VALUE_KEYWORDS.has(keywordName)) {
      warnings.push(`${keywordName} needs a value`);
    } else if (unknown.length === 1) {
      warnings.push(`${unknown[0]} isn't a ${keywordName} value we know`);
    } else if (unknown.length > 1) {
      warnings.push(`${unknown.slice(0, -1).join(`, `)} and ${unknown[unknown.length - 1]} aren't ${keywordName} values we know`);
    }
  }

  return warnings;
}
