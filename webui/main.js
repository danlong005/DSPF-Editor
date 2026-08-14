/** 
 * @typedef {import('./dspf.d.ts').DisplayFile} DisplayFile
 * @typedef {import('./dspf.d.ts').RecordInfo} RecordInfo
 * @typedef {import('./dspf.d.ts').FieldInfo} FieldInfo
 * @typedef {import('./dspf.d.ts').Keyword} Keyword
 * @typedef {import("konva").default.Rect} Rect
 * @typedef {import("konva").default.Stage} Stage
 * @typedef {import("konva").default.Group} Group
 * @typedef {import("konva").default.Layer} Layer
 * @typedef {{label: string, id?: string, value: string, options?: {label: string, value: string}[]}} Property
 * @typedef {{[key: string]: string}} NewProperties
 * @typedef {{title: string, html: string|Element, open?: boolean}} Section
 */

// Surfaces uncaught errors directly in the webview, since the extension host's
// devtools picker doesn't reliably target this webview over others (e.g. chat).
function showRendererError(error) {
  let banner = document.getElementById(`rendererErrorBanner`);
  if (!banner) {
    banner = document.createElement(`div`);
    banner.id = `rendererErrorBanner`;
    banner.style.background = `#5a1d1d`;
    banner.style.color = `white`;
    banner.style.padding = `0.5em 1em`;
    banner.style.fontFamily = `monospace`;
    banner.style.whiteSpace = `pre-wrap`;
    document.body.prepend(banner);
  }

  banner.textContent = (error && error.stack) ? error.stack : String(error);
}

window.addEventListener(`error`, (event) => showRendererError(event.error || event.message));
window.addEventListener(`unhandledrejection`, (event) => showRendererError(event.reason));

const colours = {
  RED: `red`,
  BLU: `#4287f5`,
  WHT: `#FFFFFF`,
  GRN: `green`,
  TRQ: `turquoise`,
  YLW: `yellow`,
  PNK: `pink`,
  BLK: `black`,
};

const SELECTED_COLOUR = `#383838`;

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

const GLOBAL_RECORD_FORMAT = `_GLOBAL`;

const vscode = acquireVsCodeApi();

const FONT_SIZE = 14;
const FONT_FAMILY = `Consolas, "Liberation Mono", Menlo, Courier, monospace`;

// Measures the font's real glyph advance width so the pixel grid used for
// field positions/widths stays in lockstep with what the canvas actually draws.
/**
 * @param {string} fontFamily
 * @param {number} fontSize
 */
function measureCharWidth(fontFamily, fontSize) {
  const canvas = document.createElement(`canvas`);
  const ctx = canvas.getContext(`2d`);
  ctx.font = `${fontSize}px ${fontFamily}`;

  const sample = `0`.repeat(50);
  return ctx.measureText(sample).width / sample.length;
}

const pxwPerChar = measureCharWidth(FONT_FAMILY, FONT_SIZE);
const pxhPerLine = 20;
const pxhPerChar = 12.5;

function snapToFixedGrid(x, y) {
  const newX = Math.round(x / pxwPerChar) * pxwPerChar;
  const newY = Math.round(y / pxhPerLine) * pxhPerLine;
  return {x: newX, y: newY};
}

function gridCordsToFieldCords(x, y) {
  return {
    x: Math.round(x / pxwPerChar) + 1,
    y: Math.round(y / pxhPerLine) + 1
  };
}

function widthInP(x) {
  return x * pxwPerChar;
}

function heightInP(x) {
  return x * pxhPerLine;
}

/** @type {DisplayFile|undefined} */
let activeDocument = undefined;

/** @type {"dds.dspf"|undefined} */
let activeDocumentType = undefined;

/** @type {string|undefined} */
let lastSelectedFormat = undefined;

// Other formats to render layered on top of lastSelectedFormat, previewing how
// the screen looks when an RPG program WRITEs several formats without clearing
// between them. Only used in preview mode.
/** @type {Set<string>} */
let composedFormats = new Set();

// Edit mode (default) shows only the focused format, fully interactive - like
// RDi's "Design Records". Preview mode shows the focused format plus any
// composed formats, entirely read-only - like RDi's "Preview" page.
let previewMode = false;

// Which DSPSIZ size is currently selected for rendering, when a file defines
// more than one (e.g. *DS3 and *DS4 together). Only meaningful/shown when
// there's actually a choice to make.
/** @type {string|undefined} */
let dspSizeQualifier = undefined;

/** @type {Stage|undefined} */
let existingStage = undefined;

// Which indicators are currently "on", for previewing conditional display in
// the renderer. This is session-only UI state - indicator values aren't part
// of the DDS source, they're supplied at runtime, so this never gets saved.
/** @type {Set<number>} */
let activeIndicators = new Set();

/**
 * @param {import('./dspf.d.ts').Conditional[]} conditions
 */
function indicatorsSatisfied(conditions) {
  // Only AND is supported: the DDS AND/OR relator column between condition
  // groups isn't parsed yet (see DisplayFile.parseConditionals), so every
  // condition on a field/keyword is treated as required together.
  return conditions.every(cond => activeIndicators.has(cond.indicator) !== cond.negate);
}

/**
 * @returns {number[]} every indicator referenced anywhere in the document, sorted.
 */
function getReferencedIndicators() {
  /** @type {Set<number>} */
  const indicators = new Set();

  const collect = (conditions) => conditions.forEach(c => indicators.add(c.indicator));

  (activeDocument?.formats || []).forEach(format => {
    format.keywords.forEach(keyword => collect(keyword.conditions));
    format.fields.forEach(field => {
      collect(field.conditions);
      field.keywords.forEach(keyword => collect(keyword.conditions));
    });
  });

  return Array.from(indicators).sort((a, b) => a - b);
}

/**
 * @param {DisplayFile} newDoc 
 * @param {"dds.dspf"} type //TODO: support dds.prtf
 */
function loadDDS(newDoc, type, withRerender = true) {
  activeDocument = newDoc;
  activeDocumentType = type;

  if (withRerender) {
    const validFormats = activeDocument.formats.filter(format => format.name !== GLOBAL_RECORD_FORMAT);
    const validNames = validFormats.map(format => format.name);

    // Never leave the selector on a blank/stale format - fall back to the
    // first one whenever there isn't already a valid selection (first load,
    // or the previously-selected format got renamed/deleted).
    const chosenFormat = (lastSelectedFormat && validNames.includes(lastSelectedFormat))
      ? lastSelectedFormat
      : validNames[0];

    setTabs(validNames, chosenFormat);

    if (chosenFormat) {
      setWindowForFormat(chosenFormat);
    }
  }
}

/**
 * @param {string} chosenFormat 
 */
function setWindowForFormat(chosenFormat) {
  let renderWidth = 80;
  let renderHeight = 24;

  const globalFormat = activeDocument.formats.find(currentFormat => currentFormat.name === GLOBAL_RECORD_FORMAT);
  const selectedFormat = activeDocument.formats.find(currentFormat => currentFormat.name === chosenFormat);

  if (!selectedFormat) {
    // Not a real error the user needs to see (e.g. still typing into the
    // format combobox) - just show nothing rather than leaving stale
    // content on screen or logging a visible error.
    if (existingStage) {
      existingStage.destroy();
      existingStage = undefined;
    }
    document.getElementById(`recordFormatSidebar`).innerHTML = ``;
    document.getElementById(`fieldInfoSidebar`).innerHTML = ``;
    return;
  }

  switch (activeDocumentType) {
    case `dds.dspf`:
      if (globalFormat) {
        const displaySize = globalFormat.keywords.find(keyword => keyword.name === `DSPSIZ`);
        const sizes = displaySize ? parseDspSizes(displaySize.value) : [];

        updateDspSizeToggle(sizes);

        const chosenSize = sizes.length > 1
          ? (sizes.find(s => s.qualifier === dspSizeQualifier) || sizes[0])
          : sizes[0];

        if (chosenSize) {
          renderWidth = chosenSize.width;
          renderHeight = chosenSize.height;
        }
      }
      break;
  }

  let width = renderWidth * pxwPerChar;
  let height = renderHeight * pxhPerLine;

  if (existingStage) {
    existingStage.destroy();
  }

  existingStage = new Konva.Stage({
    container: 'container',
    width: width,
    height: height
  });

  const bg = new Konva.Rect({
    x: 0,
    y: 0,
    width: width,
    height: height,
    fill: colours.BLK
  });

  bg.on('pointerclick', () => {
    setActiveField();
  });

  let layer = new Konva.Layer({
    id: selectedFormat.name
  });

  layer.add(bg);

  // Editing always targets whichever format is focused here, regardless of
  // what else gets layered on top below. In preview mode nothing is
  // editable at all, including the focused format itself.
  lastSelectedFormat = chosenFormat;

  const formatsToRender = [{ format: selectedFormat, displayOnly: previewMode }];

  // Layer any other checked formats on top, read-only, but only in preview
  // mode - edit mode always shows just the focused format.
  if (previewMode) {
    composedFormats.forEach(name => {
      if (name === chosenFormat) { return; }

      const composedFormat = activeDocument.formats.find(currentFormat => currentFormat.name === name);
      if (composedFormat) {
        formatsToRender.push({ format: composedFormat, displayOnly: true });
      }
    });
  }

  // Windows always draw on top of everything else, whether they're the
  // focused format or a composed one - Array#sort is stable, so this only
  // reorders windows-vs-non-windows and otherwise preserves the order above.
  formatsToRender.sort((a, b) => Number(a.format.isWindow) - Number(b.format.isWindow));

  // Routing through renderSelectedFormat (not addFieldsToLayer directly) means
  // a composed format that's itself a window still gets its border/background drawn.
  formatsToRender.forEach(({ format, displayOnly }) => {
    renderSelectedFormat(layer, format, displayOnly);
  });

  existingStage.add(layer);

  updateRecordFormatSidebar(selectedFormat);
  setActiveField();
}

/**
 *
 * @param {Layer} layer
 * @param {RecordInfo} [format]
 * @param {boolean} [displayOnly] render read-only, for a format composed alongside the focused one
 */
function renderSelectedFormat(layer, format, displayOnly = false) {
  /** @type {RecordInfo|undefined} */
  let windowFormat;

  /** @type {{baseX: number, baseY: number, baseWidth: number, baseHeight: number, x: number, y: number, width: number, height: number, color?: string}|undefined} */
  let windowConfig;

  /** @type {FieldInfo|undefined} */
  let windowTitle;

  const recordFormat = format;

  if (recordFormat) {
    if (recordFormat.isWindow) {
      if (recordFormat.windowReference) {
        windowFormat = activeDocument.formats.find(currentFormat => currentFormat.name === recordFormat.windowReference);
      } else {
        windowFormat = recordFormat;
      }

      const { x, y, width, height } = windowFormat.windowSize;
      windowConfig = {
        baseX: x,
        baseY: y,
        baseWidth: width,
        baseHeight: height, 
        x: widthInP(x),
        y: heightInP(y),
        width: widthInP(width),
        height: heightInP(height-1)
      };

      const borderInfo = windowFormat.keywords.find(keyword => keyword.name === `WDWBORDER`);
      if (borderInfo) {
        parts = parseParms(borderInfo.value);

        parts.forEach((part, index) => {
          switch (part.toUpperCase()) {
          case `*COLOR`:
            windowConfig.color = parts[index + 1];
            break;
          }
        });
      }

      const windowInfo = windowFormat.keywords.find(keyword => keyword.name === `WDWTITLE`);
      if (windowInfo) {
        windowTitle = {
          name: `WINDOWTITLE`,
          displayType: `const`,
          type: `A`,
          primitiveType: `char`,
          keywords: []
        };

        let xPositionValue = `center`;
        let yPositionValue = `top`;

        parts = parseParms(windowInfo.value);

        parts.forEach((part, index) => {
          switch (part.toUpperCase()) {
          case `*TEXT`:
            windowTitle.value = parts[index + 1];
            break;
          case `*COLOR`:
            windowTitle.keywords.push({
              name: `COLOR`,
              value: parts[index + 1],
              conditions: []
            });
          case `*DSPATR`:
            windowTitle.keywords.push({
              name: `DSPATR`,
              value: parts[index + 1],
              conditions: []
            });
            break;

          case `*CENTER`:
          case `*LEFT`:
          case `*RIGHT`:
            xPositionValue = part.substring(1).toLowerCase();
            break;

          case `*TOP`:
          case `*BOTTOM`:
            yPositionValue = part.substring(1).toLowerCase();
            break;
          }
        });

        // If no color is found, the default is blue.
        if (!windowTitle.keywords.find(keyword => keyword.name === `COLOR`)) {
          windowTitle.keywords.push({
            name: `COLOR`,
            value: `BLU`,
            conditions: []
          });
        }

        const txtLength = windowTitle.value.length;

        const yPosition = (windowConfig.baseY) + (yPositionValue === `top` ? 0 : windowConfig.baseHeight);
        let xPosition = (windowConfig.baseX + 1);

        switch (xPositionValue) {
        case `center`:
          xPosition = (windowConfig.baseX + 1) + Math.floor((windowConfig.baseWidth / 2) - (txtLength / 2));
          break;
        case `right`:
          xPosition = (windowConfig.baseX + 1) + windowConfig.baseWidth - txtLength;
          break;
        case `left`:
          xPosition = (windowConfig.baseX + 1);
          break;
        }

        windowTitle.position = {
          x: xPosition,
          y: yPosition
        };
      }
    }
  }

  if (windowFormat) {
    // If this is a window, add the window CSS
      if (windowConfig) {
        const windowColor = colours[windowConfig.color] || colours.BLU;

        // Windows have an opaque interior in a real 5250 session - they cover
        // whatever's underneath, not just outline it. Matters most when this
        // format is composed on top of another one that already drew content
        // in the same area.
        /** @type {Rect} */
        const windowRect = new Konva.Rect({
          id: windowFormat.name,
          x: windowConfig.x,
          y: windowConfig.y,
          width: windowConfig.width,
          height: windowConfig.height,
          fill: colours.BLK,
          stroke: windowColor,
        });

        layer.add(windowRect);
      }

      if (windowTitle) {
        console.log(`TODO: add window title: ${windowFormat}`);
        // const windowContent = this.getContent(windowTitle);

        // css += windowContent.css;
        // body += windowContent.body;
      }

      if (windowFormat.name !== format.name) {
        renderSelectedFormat(layer, windowFormat, displayOnly);
      }
    }

  // TODO: handle window
  // TODO: make format optional
  if (format) {
    addFieldsToLayer(layer, format, displayOnly);
  }
}

/**
 * 
 * @param {*} layer 
 * @param {RecordInfo} format 
 */
/**
 * How many screen columns a field actually occupies - matches the same
 * length rule getElement uses to render it (const's literal text, or the
 * field's own length floored at 1 for zero-length referenced fields).
 * @param {FieldInfo} field
 */
function fieldDisplayLength(field) {
  if (field.displayType === `const`) {
    return (field.value || ``).length;
  }
  return Math.max(1, field.length || 0);
}

/**
 * Finds fields/constants on the same row whose columns overlap, or sit
 * immediately next to each other with no blank column between them - on a
 * real 5250 display that doesn't render/behave correctly, even though it's
 * visually indistinguishable from a normal 1-column gap in this renderer.
 * @param {FieldInfo[]} fields
 * @returns {Set<FieldInfo>} every field involved in at least one conflict
 */
function findTouchingFields(fields) {
  const conflicting = new Set();
  const positioned = fields.filter(field => field.displayType !== `hidden` && field.position.x > 0 && field.position.y > 0);

  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i];
      const b = positioned[j];
      if (a.position.y !== b.position.y) { continue; }

      const aEnd = a.position.x + fieldDisplayLength(a) - 1;
      const bEnd = b.position.x + fieldDisplayLength(b) - 1;

      const overlaps = a.position.x <= bEnd && b.position.x <= aEnd;
      const noGap = (b.position.x === aEnd + 1) || (a.position.x === bEnd + 1);

      if (overlaps || noGap) {
        conflicting.add(a);
        conflicting.add(b);
      }
    }
  }

  return conflicting;
}

function addFieldsToLayer(layer, format, displayOnly = false) {
  const subfileFormat = format.keywords.find(keyword => keyword.name === `SFLCTL`);
  // TODO: handle when subFileFormat is found

  if (subfileFormat) {
    const subfilePage = format.keywords.find(keyword => keyword.name === `SFLPAG`)
    const rows = Number(subfilePage ? subfilePage.value : 1);

    const subfileRecord = activeDocument.formats.find(format => format.name === subfileFormat.value);

    if (subfileRecord) {
      const subfileFields = subfileRecord.fields.filter(field => field.displayType !== `hidden` && field.position.x > 0 && field.position.y > 0);
      // Checked once against the template row - every repeated row has the same conflicts.
      const subfileConflicting = findTouchingFields(subfileFields);

      const low = Math.min(...subfileFields.map(field => field.position.y));
      const high = Math.max(...subfileFields.map(field => field.position.y));
      const linesPerItem = (high - low) + 1;

      for (let row = 0; row < rows; row++) {
        subfileFields.forEach(field => {
          // TODO: these fields cant be edited in this format
          let subField = JSON.parse(JSON.stringify(field));
          subField.position.y += (row * linesPerItem);

          if (indicatorsSatisfied(field.conditions)) {
            subField.name = `${field.name}_${row}`;
            const content = getElement(subField, true, subfileRecord.name, subfileConflicting.has(field));
            layer.add(content);
          }
        });
      }


    } else {
      throw new Error(`Unable to find SFLCTL format ${subfileFormat.value} from ${format.name}`);
    }
  }

  const fields = format.fields.filter(field => field.displayType !== `hidden`);
  const conflicting = findTouchingFields(fields);
  fields.forEach(field => {
    if (indicatorsSatisfied(field.conditions)) {
      const content = getElement(field, displayOnly, format.name, conflicting.has(field));
      layer.add(content);
    }
  });
}

/**
 * 
 * @param {FieldInfo} fieldInfo 
 * @returns {Konva.Group|undefined}
 */
function renderSpecificField(fieldInfo) {
  // Editing always targets the focused tab, even when other formats are
  // composed alongside it - see getElement()'s formatName param.
  const existingField = existingStage.findOne(`#${elementId(lastSelectedFormat, fieldInfo.name)}`);

  if (existingField) {
    existingField.destroy();
  }

  const formatLayer = existingStage.findOne(`#${lastSelectedFormat}`);

  if (formatLayer) {
    const content = getElement(fieldInfo, false, lastSelectedFormat);
    formatLayer.add(content);

    return content;
  }
}

function elementId(formatName, fieldName) {
  return `${formatName}::${fieldName}`;
}

/**
 * @param {FieldInfo} fieldInfo
 * @param {boolean} [displayOnly]
 * @param {string} [formatName] the record format this field belongs to, so its
 *   canvas id doesn't collide with a same-named field in another composed format
 * @param {boolean} [hasWarning] outlines the field in red - it touches or
 *   overlaps another field/constant on the same row, which doesn't render
 *   correctly on a real 5250 display
 */
function getElement(fieldInfo, displayOnly = false, formatName = lastSelectedFormat, hasWarning = false) {
  const boxInfo = {
    id: elementId(formatName, fieldInfo.name),
    x: widthInP(fieldInfo.position.x - 1),
    y: heightInP(fieldInfo.position.y - 1),
    width: 0,
    height: heightInP(1),
    draggable: !displayOnly,
  };

  const labelInfo = {
    value: fieldInfo.value || ``,
    colour: colours.GRN,
    fontStyle: `normal`,
    textDecoration: ``
  };

  // Only keywords whose conditioning indicators are currently satisfied apply -
  // e.g. a field with two COLOR keywords gated by different indicators only
  // shows whichever one is actually "on" in the current indicator preview.
  const keywords = fieldInfo.keywords.filter(keyword => indicatorsSatisfied(keyword.conditions));

  keywords.forEach(keyword => {
    const key = keyword.name;
    switch (key) {
      case `PAGNBR`:
        labelInfo.value = `####`;
        break;
      case `COLOR`:
        labelInfo.colour = colours[keyword.value] || colours.GRN;
        break;
      case `SYSNAME`:
        labelInfo.value = `SYSNAME_`;
        break;
      case `USER`:
        labelInfo.value = `USERNAME__`;
        break;
      case `DATE`:
        const dateSep = keywords.find(keyword => keyword.name === `DATSEP`);

        // DDS's own default when DATFMT is omitted is *JOB (whatever format
        // the running job uses) - unknowable from a static file. *MDY is the
        // closest thing to a traditional IBM i default, so fall back to it.
        const dateFormat = keywords.find(keyword => keyword.name === `DATFMT`);
        const effectiveDateFormat = dateFormat ? dateFormat.value : `*MDY`;
        labelInfo.value = dateFormats[effectiveDateFormat] || `?FORMAT?`;

        if (dateSep && dateSep.value.toUpperCase() !== `*JOB`) {
          labelInfo.value = labelInfo.value.replace(new RegExp(`[./-:]`, `g`), dateSep.value);
        }
        break;
      case `TIME`:
        const sep = keywords.find(keyword => keyword.name === `TIMSEP`);

        const format = keywords.find(keyword => keyword.name === `TIMFMT`);
        const effectiveTimeFormat = format ? format.value : `*HMS`;
        labelInfo.value = timeFormats[effectiveTimeFormat] || `?FORMAT?`;

        if (sep && sep.value.toUpperCase() !== `*JOB`) {
          labelInfo.value = labelInfo.value.replace(new RegExp(`[./-:]`, `g`), sep.value);
        }
        break;
      case `UNDERLINE`:
        labelInfo.textDecoration = `underline`;
        break;
      case `HIGHLIGHT`:
        // css += `font-weight: 900;`;
        labelInfo.fontStyle = `900`;
        break;
      case `DSPATR`:
        keyword.value.split(` `).forEach(value => {
          switch (value) {
            case `UL`:
              // css += `text-decoration: underline;`;
              labelInfo.textDecoration = `underline`;
              break;
            case `HI`:
              // css += `font-weight: 900;`;
              // if (!keywords.find(keyword => keyword.name === `COLOR`)) {
              //   css += `color: ${colors.WHT};`;
              // }
              labelInfo.fontStyle = `900`;
              labelInfo.colour = colours.WHT;
              break;
            case `BL`:
              // Can Konva do a blinking effect?
              // css += `animation: blinker 1s step-start infinite;`;
              break;
          }
        });
        break;
    }
  });

  let padString = `_`;

  // fieldInfo.primitiveType is only ever set by the server-side parser (see
  // DisplayFile.parse in dspf.ts) - it never gets recomputed here after a
  // client-side edit to Type, so an optimistic re-render right after changing
  // Type would still be keying off the old value. Deriving straight from the
  // DDS type character (the same D/Z/Y rule the parser uses) keeps this
  // correct immediately, without needing primitiveType kept in sync at all.
  const isDecimalType = fieldInfo.type === `D` || fieldInfo.type === `Z` || fieldInfo.type === `Y`;

  if (isDecimalType) {
    switch (fieldInfo.displayType) {
      case `input`: padString = `3`; break;
      case `output`: padString = `6`; break;
      case `both`: padString = `9`; break;
    }
  } else {
    switch (fieldInfo.displayType) {
      case `input`: padString = `I`; break;
      case `output`: padString = `O`; break;
      case `both`: padString = `B`; break;
    }
  }

  // A field referencing another field for its definition (REF/REFFLD) has no
  // length of its own in this source - length 0 and no value would otherwise
  // render as an invisible, zero-width box. Show at least a 1-char placeholder
  // so there's a visible marker that a field exists here.
  const displayLength = Math.max(1, fieldInfo.length > 0 && labelInfo.value.length < fieldInfo.length ? fieldInfo.length : labelInfo.value.length);
  const displayValue = labelInfo.value
    .replace(new RegExp(`''`, `g`), `'`)
    .padEnd(displayLength, padString);

  boxInfo.width = widthInP(displayLength);

  let group = new Konva.Group(boxInfo);

  group.on('dragmove', (e) => {
    /** @type {Group} */
    const cGroup = e.target;

    /** @type {Stage} */
    const stage = e.target.getStage();
    const mousePos = stage.getPointerPosition();
    
    let {x, y} = mousePos;

    const boxPos = cGroup.absolutePosition();
    
    // Mouse pos inside the group
    x -= (x - boxPos.x);
    y -= (y - boxPos.y);

    const newCords = snapToFixedGrid(x, y);

    cGroup.absolutePosition({
      x: newCords.x,
      y: newCords.y
    });
  });

  group.on(`dragend`, e => {
    // const {x, y} = e.target.attrs;
    // get mouse x,y
    /** @type {Group} */
    const cGroup = e.target;
    const stage = cGroup.getStage();
    const mousePos = stage.getPointerPosition();
    
    let {x, y} = mousePos;
    const boxPos = cGroup.absolutePosition();
    
    // Mouse pos inside the group
    x -= (x - boxPos.x);
    y -= (y - boxPos.y);

    const newCords = snapToFixedGrid(x, y);
    
    cGroup.absolutePosition({
      x: newCords.x,
      y: newCords.y
    });

    const fieldCords = gridCordsToFieldCords(newCords.x, newCords.y);
    fieldInfo.position.x = fieldCords.x;
    fieldInfo.position.y = fieldCords.y;

    sendFieldUpdate(lastSelectedFormat, fieldInfo.name, fieldInfo);
  });

  group.add(new Konva.Rect({
    id: `bg`,
    fill: colours.BLK,
    x: 0,
    y: 0,
    width: boxInfo.width,
    height: pxhPerChar,
    stroke: hasWarning ? colours.RED : undefined,
    strokeWidth: hasWarning ? 1 : 0,
  }));

  // add text to the label
  group.add(new Konva.Text({
    text: displayValue,
    width: boxInfo.width,
    wrap: `none`,
    fontSize: FONT_SIZE,
    fontFamily: FONT_FAMILY,
    fill: labelInfo.colour,
    fontStyle: labelInfo.fontStyle,
    textDecoration: labelInfo.textDecoration,
  }));

  if (!displayOnly) {
    group.on('pointerclick', () => {
      setActiveField(group, fieldInfo);
    });
  }

  return group;
}

function parseParms(string) {
  let items = [];
  let inString = false;
  let current = ``;

  for (let i = 0; i < string.length; i++) {
    switch (string[i]) {
      case `'`:
        inString = !inString;
        break;
      case ` `:
        if (inString) { current += string[i]; }
        else {
          items.push(current);
          current = ``;
        }
        break;
      default:
        current += string[i];
        break;
    }
  }

  if (current.trim().length > 0) {
    items.push(current.trim());
  }

  return items;
}

/**
 * DSPSIZ can define one size (`24 80 *DS3`) or two, so the same screen can
 * adapt to either terminal size at runtime (`24 80 *DS3 27 132 *DS4`). Parses
 * it into a list of {height, width, qualifier} groups - one entry normally,
 * two if both are defined. The trailing *DSx qualifier is optional on a
 * given group (older DDS sometimes omits it).
 * @param {string} value
 * @returns {{height: number, width: number, qualifier: string|undefined}[]}
 */
function parseDspSizes(value) {
  const parts = parseParms(value);
  const sizes = [];

  let i = 0;
  while (i < parts.length) {
    const height = Number(parts[i]);
    const width = Number(parts[i + 1]);

    if (Number.isNaN(height) || Number.isNaN(width)) { break; }

    let qualifier;
    if (parts[i + 2] && parts[i + 2].toUpperCase().startsWith(`*DS`)) {
      qualifier = parts[i + 2].toUpperCase();
      i += 3;
    } else {
      i += 2;
    }

    sizes.push({ height, width, qualifier });
  }

  return sizes;
}

/**
 * Shows/hides and (re)builds the *DS3/*DS4 toggle in the top bar, based on
 * how many sizes the current file's DSPSIZ actually defines.
 * @param {{height: number, width: number, qualifier: string|undefined}[]} sizes
 */
function updateDspSizeToggle(sizes) {
  const container = document.getElementById(`dspSizeToggle`);
  container.innerHTML = ``;

  if (sizes.length < 2) {
    container.style.display = `none`;
    return;
  }

  container.style.display = ``;

  if (!sizes.some(s => s.qualifier === dspSizeQualifier)) {
    dspSizeQualifier = sizes[0].qualifier;
  }

  const group = document.createElement(`vscode-radio-group`);

  sizes.forEach((size, index) => {
    const radio = document.createElement(`vscode-radio`);
    radio.setAttribute(`name`, `dspSize`);
    radio.setAttribute(`value`, size.qualifier || String(index));
    radio.setAttribute(`label`, `${size.qualifier || `Size ${index + 1}`} (${size.height}x${size.width})`);
    if (size.qualifier === dspSizeQualifier) {
      radio.setAttribute(`checked`, `true`);
    }

    radio.addEventListener(`change`, () => {
      dspSizeQualifier = size.qualifier;
      if (lastSelectedFormat) {
        setWindowForFormat(lastSelectedFormat);
      }
    });

    group.appendChild(radio);
  });

  container.appendChild(group);
}

/**
 * @param {string[]} recordFormats
 */
function setTabs(recordFormats, setActiveTab) {
  const container = document.getElementById(`recordFormatSelector`);

  // Formats that no longer exist (e.g. renamed/deleted) shouldn't stay composed.
  composedFormats.forEach(name => {
    if (!recordFormats.includes(name)) { composedFormats.delete(name); }
  });

  container.innerHTML = ``;

  const select = document.createElement(`vscode-single-select`);
  select.id = `recordFormatSelect`;
  select.combobox = true;
  select.filter = `contains`;
  select.style.width = `100%`;

  select.options = recordFormats.map(name => ({ label: name, value: name }));
  if (setActiveTab) {
    select.value = setActiveTab;
  }

  select.addEventListener(`change`, () => {
    if (select.value) {
      setWindowForFormat(select.value);
    }
  });

  container.appendChild(select);
}


window.addEventListener("message", (event) => {
  const command = event.data.command;
  switch (command) {
    case `load`:
      loadDDS(event.data.dds, `dds.dspf`);
      break;
    case 'update':
      loadDDS(event.data.dds, `dds.dspf`, false);
      break;
  }
});


/** @type {Rect|undefined} */
let lastActiveKonvaElement;

/**
 * 
 * @param {*} [konvaElement] 
 * @param {FieldInfo} [fieldInfo] 
 */
function setActiveField(konvaElement, fieldInfo) {
  clearKeywordEditor();

  if (lastActiveKonvaElement) {
    const bg = lastActiveKonvaElement.findOne(`#bg`);
    // Remove background from last active element

    if (bg) {
      bg.fill(colours.BLK);
    }

    lastActiveKonvaElement = undefined;
  }

  if (konvaElement && fieldInfo) {
    lastActiveKonvaElement = konvaElement;

    const bg = lastActiveKonvaElement.findOne(`#bg`);
    bg.fill(SELECTED_COLOUR);

    updateSelectedFieldSidebar(fieldInfo);
  } else {
    clearFieldInfo();
  }
}

/**
 * @param {RecordInfo} recordInfo
 * @param {RecordInfo} [globalInfo]
 */
function updateRecordFormatSidebar(recordInfo) {
  const sidebar = document.getElementById(`recordFormatSidebar`);

  /** @type {Section[]} */
  let sections = [];

  // Always shown, not just in preview mode - selections here are simply
  // ignored (see setWindowForFormat) until preview mode is on, rather than
  // the control itself disappearing.
  const otherFormats = activeDocument.formats
    .filter(format => format.name !== GLOBAL_RECORD_FORMAT && format.name !== recordInfo.name)
    .map(format => format.name);

  if (otherFormats.length > 0) {
    sections.push({
      title: `Composed Formats`,
      html: createComposedFormatsPanel(otherFormats),
      // Stay open across the re-render a toggle triggers, once anything's composed.
      open: composedFormats.size > 0
    });
  }

  const referencedIndicators = getReferencedIndicators();
  if (referencedIndicators.length > 0) {
    sections.push({
      title: `Indicators`,
      html: createIndicatorsPanel(referencedIndicators),
      // Stay open across the re-render a toggle triggers, once any indicator is on.
      open: activeIndicators.size > 0
    });
  }

  renderSections(sidebar, sections);

  const modeToggle = document.createElement(`vscode-checkbox`);
  modeToggle.setAttribute(`label`, `Preview mode`);
  modeToggle.setAttribute(`title`, `Show a read-only preview of this format together with any composed formats and indicators, instead of editing it directly.`);
  modeToggle.style.display = `block`;
  modeToggle.style.margin = `0.5em 1em`;
  if (previewMode) {
    modeToggle.setAttribute(`checked`, `true`);
  }
  modeToggle.addEventListener(`change`, () => {
    previewMode = modeToggle.checked;
    if (lastSelectedFormat) {
      setWindowForFormat(lastSelectedFormat);
    }
  });
  sidebar.insertBefore(modeToggle, sidebar.firstChild);
}

/**
 * @param {number[]} indicatorNumbers
 */
function createIndicatorsPanel(indicatorNumbers) {
  const section = document.createElement(`div`);

  indicatorNumbers.forEach(indicator => {
    const checkbox = document.createElement(`vscode-checkbox`);
    checkbox.setAttribute(`label`, `Indicator ${indicator}`);
    checkbox.style.display = `block`;
    checkbox.style.margin = `0.25em 1em`;

    if (activeIndicators.has(indicator)) {
      checkbox.setAttribute(`checked`, `true`);
    }

    checkbox.addEventListener(`change`, () => {
      if (checkbox.checked) {
        activeIndicators.add(indicator);
      } else {
        activeIndicators.delete(indicator);
      }

      if (lastSelectedFormat) {
        setWindowForFormat(lastSelectedFormat);
      }
    });

    section.appendChild(checkbox);
  });

  return section;
}

/**
 * @param {string[]} formatNames every format other than the currently focused one
 */
function createComposedFormatsPanel(formatNames) {
  const section = document.createElement(`div`);

  formatNames.forEach(name => {
    const checkbox = document.createElement(`vscode-checkbox`);
    checkbox.setAttribute(`label`, name);
    checkbox.style.display = `block`;
    checkbox.style.margin = `0.25em 1em`;

    if (composedFormats.has(name)) {
      checkbox.setAttribute(`checked`, `true`);
    }

    checkbox.addEventListener(`change`, () => {
      if (checkbox.checked) {
        composedFormats.add(name);
      } else {
        composedFormats.delete(name);
      }

      if (lastSelectedFormat) {
        setWindowForFormat(lastSelectedFormat);
      }
    });

    section.appendChild(checkbox);
  });

  return section;
}

function clearFieldInfo() {
  const sidebar = document.getElementById(`fieldInfoSidebar`);

  /** @type {{title: string, html: string|Element}[]} */
  const tabs = [];

  if (!previewMode) {
    // Nothing is editable in preview mode - there's no field to add these to.
    tabs.push({ title: `Add Field`, html: createAddFieldPanel() });
  }

  tabs.push(createFormatKeywordsTab());
  tabs.push(createFileKeywordsTab());

  renderFieldTabs(sidebar, tabs);
}

function createAddFieldPanel() {
  const panel = document.createElement(`div`);

  const createGroupHeader = (title) => {
    const header = document.createElement(`div`);
    header.innerText = title.toUpperCase();
    header.style.fontSize = `0.8em`;
    header.style.fontWeight = `600`;
    header.style.letterSpacing = `0.05em`;
    header.style.opacity = `0.65`;
    header.style.margin = `1.2em 1em 0.4em`;
    return header;
  };

  /**
   * @param {string} label
   * @param {string} icon
   * @param {FieldInfo} field
   */
  const createButton = (label, icon, field) => {
    const button = document.createElement(`vscode-button`);
    button.setAttribute(`secondary`, `true`);
    button.setAttribute(`icon`, icon);
    button.style.margin = `0.2em 1em`;
    button.style.display = `block`;
    button.style.textAlign = `left`;
    button.innerText = label;

    button.onclick = () => {
      if (lastSelectedFormat) {
        sendNewField(lastSelectedFormat, field);
      }
    };

    return button;
  }

  panel.appendChild(createGroupHeader(`Fields`));
  panel.appendChild(createButton(`Named field`, `add`, {
    name: `NEWFLD1`,
    type: `A`,
    length: 10,
    decimals: 0,
    displayType: `input`,
    position: {x: 1, y: 1},
    keywords: [],
    conditions: [],
  }));
  panel.appendChild(createButton(`Date field`, `calendar`, {
    name: `DATEFLD`,
    type: `L`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    position: {x: 1, y: 1},
    keywords: [{name: `DATFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`Time field`, `calendar`, {
    name: `TIMEFLD`,
    type: `T`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    position: {x: 1, y: 1},
    keywords: [{name: `TIMFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));
  // Timestamp fields aren't wired up yet: the parser only special-cases
  // types L (date) and T (time), not Z (timestamp), so there's no
  // primitiveType/keyword support to generate a working field from here.

  panel.appendChild(createGroupHeader(`Specials`));
  panel.appendChild(createButton(`Constant text`, `symbol-constant`, {
    value: `Constant`,
    position: {x: 1, y: 1},
    displayType: `const`,
    keywords: [],
    conditions: [],
  }));
  panel.appendChild(createButton(`System name constant`, `account`, {
    name: `SYSFLD`,
    type: `A`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    position: {x: 1, y: 1},
    keywords: [{name: `SYSNAME`, value: undefined, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`Date constant`, `calendar`, {
    name: `DATECST`,
    type: `L`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    position: {x: 1, y: 1},
    keywords: [{name: `DATFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));
  panel.appendChild(createButton(`Time constant`, `calendar`, {
    name: `TIMECST`,
    type: `T`,
    length: 8,
    decimals: 0,
    displayType: `output`,
    position: {x: 1, y: 1},
    keywords: [{name: `TIMFMT`, value: `*ISO`, conditions: []}],
    conditions: [],
  }));

  return panel;
}

/**
 * A tab showing the current record format's own keywords - present in the
 * right panel regardless of whether a field is selected, so it sits
 * alongside whatever's currently shown (the add-field toolbox, or a
 * selected field's own properties/keywords) rather than living separately
 * in the left sidebar.
 * @returns {{title: string, html: Element}}
 */
function createFormatKeywordsTab() {
  const currentFormat = activeDocument && lastSelectedFormat
    ? activeDocument.formats.find(format => format.name === lastSelectedFormat)
    : undefined;

  const html = currentFormat
    ? createKeywordPanel(`keywords-${currentFormat.name}`, currentFormat.keywords, previewMode ? undefined : (keywords) => {
      sendFormatHeaderUpdate(currentFormat.name, keywords);
    })
    : document.createElement(`div`);

  return { title: `Format Keywords`, html };
}

/**
 * A tab for the file-level (a.k.a. "screen level") keywords - the ones
 * written above every record format in the source, like DSPSIZ. Same
 * treatment as createFormatKeywordsTab, just scoped to the whole file
 * instead of the current record.
 * @returns {{title: string, html: Element}}
 */
function createFileKeywordsTab() {
  const globalFormat = activeDocument
    ? activeDocument.formats.find(format => format.name === GLOBAL_RECORD_FORMAT)
    : undefined;

  const html = globalFormat
    ? createKeywordPanel(`keywords-${globalFormat.name}`, globalFormat.keywords, previewMode ? undefined : (keywords) => {
      sendFormatHeaderUpdate(globalFormat.name, keywords);
    })
    : document.createElement(`div`);

  return { title: `File Keywords`, html };
}

/**
 *
 * @param {FieldInfo} fieldInfo
 */
function updateSelectedFieldSidebar(fieldInfo) {
  const sidebar = document.getElementById(`fieldInfoSidebar`);

  /** @type {Property[]} */
  const properties = [];

  if (fieldInfo.name) {
    properties.push({ label: `Name`, value: fieldInfo.name, id: `name` });
  }

  if (fieldInfo.displayType === `const`) {
    // A constant's displayType isn't one of input/output/both/hidden, so the
    // dropdown below can't represent it - showing it risked corrupting the
    // field (collectValues() reads back "" for an unmatched selection, which
    // then fails getLinesForField's `displayType === 'const'` check entirely,
    // silently dropping the field's text from the generated DDS). There's
    // also nothing useful to change here for a constant, so just leave it out.
    properties.push({ label: `Value`, value: fieldInfo.value, id: `value` });
  } else {
    properties.push(
      { label: `Display Type`, value: fieldInfo.displayType, id: `displayType`, options: [
        { label: `Input`, value: `input` },
        { label: `Output`, value: `output` },
        { label: `Both`, value: `both` },
        { label: `Hidden`, value: `hidden` },
      ] },
    );
  }

  properties.push({ label: `Position`, value: `${fieldInfo.position.x}, ${fieldInfo.position.y}` });

  if (fieldInfo.type) {
    properties.push(
      { label: `Type`, value: fieldInfo.type, id: `type`, options: [
        { label: `Alpha`, value: `A` },
        { label: `Numeric`, value: `D` },
      ] },
      { label: `Length`, value: fieldInfo.length, id: `length` },
    );

    if (fieldInfo.type !== `A`) {
      properties.push({ label: `Decimals`, value: fieldInfo.decimals, id: `decimals` });
    }
  }

  renderFieldTabs(sidebar, [
    {
      title: `Basic`,
      html: createValuesPanel(`properties-${fieldInfo.name}`, properties, (newProps) => {
        const originalFieldName = fieldInfo.name;

        fieldInfo = {
          ...fieldInfo,
          ...newProps
        };

        sendFieldUpdate(lastSelectedFormat, originalFieldName, fieldInfo);
      })
    },
    {
      title: `Keywords`,
      html: createKeywordPanel(`keywords-${fieldInfo.name}`, fieldInfo.keywords, (keywords) => {
        fieldInfo.keywords = keywords;
        sendFieldUpdate(lastSelectedFormat, fieldInfo.name, fieldInfo);
      }),
    },
  ]);

  const deleteButton = document.createElement(`vscode-button`);
  deleteButton.setAttribute(`secondary`, `true`);
  deleteButton.innerText = `Delete`;
  
  // Center the button
  deleteButton.style.margin = `1em`;
  deleteButton.style.display = `block`;

  deleteButton.addEventListener(`click`, (e) => {
    if (fieldInfo.name) {
      sendDelete(lastSelectedFormat, fieldInfo.name);
    }
  });

  sidebar.appendChild(deleteButton);
}

/**
 * 
 * @param {HTMLElement} sidebar 
 * @param {Section[]} sections 
 */
function renderSections(sidebar, sections) {
  sidebar.innerHTML = ``;

  for (let section of sections) {
    let newSection = document.createElement(`vscode-collapsible`);
    newSection.setAttribute(`title`, section.title);
    if (section.open) {
      newSection.setAttribute(`open`, ``);
    }

    if (typeof section.html === `string`) {
      newSection.innerHTML = section.html;
    } else {
      newSection.appendChild(section.html);
    }

    sidebar.appendChild(newSection);
  }
}

/**
 * A small, fixed set of tabs (Basic/Keywords for a selected field) - unlike
 * the record-format list, this never grows unboundedly, so a tab strip is a
 * fine fit here.
 * @param {HTMLElement} container
 * @param {{title: string, html: string|Element}[]} tabs
 */
function renderFieldTabs(container, tabs) {
  container.innerHTML = ``;

  const tabsElement = document.createElement(`vscode-tabs`);
  tabsElement.setAttribute(`selected-index`, `0`);

  for (const tab of tabs) {
    const header = document.createElement(`vscode-tab-header`);
    header.setAttribute(`slot`, `header`);
    header.innerText = tab.title;
    tabsElement.appendChild(header);

    const panel = document.createElement(`vscode-tab-panel`);
    panel.style.padding = `1em 0`;
    if (typeof tab.html === `string`) {
      panel.innerHTML = tab.html;
    } else {
      panel.appendChild(tab.html);
    }
    tabsElement.appendChild(panel);
  }

  container.appendChild(tabsElement);
}

/**
 * @param {string} recordFormat 
 * @param {FieldInfo} fieldInfo 
 */
function sendNewField(recordFormat, fieldInfo) {
  vscode.postMessage({
    command: `newField`,
    recordFormat,
    fieldInfo
  });
}

function sendDelete(recordFormat, fieldName) {
  vscode.postMessage({
    command: `deleteField`,
    recordFormat,
    fieldName
  });
}

/**
 * @param {string} recordFormat 
 * @param {string} originalFieldName 
 * @param {FieldInfo} newFieldInfo 
 */
function sendFieldUpdate(recordFormat, originalFieldName, newFieldInfo) {
  vscode.postMessage({
    command: `updateField`,
    recordFormat,
    originalFieldName,
    fieldInfo: newFieldInfo
  });

  // const currentFormat = activeDocument.formats.find(format => format.name === recordFormat);
  // if (currentFormat) {
  //   const field = currentFormat.fields.find(field => field.name === originalFieldName);
  //   for (const propKey in newFieldInfo) {
  //     const propValue = newFieldInfo[propKey];

  //     field[propKey] = propValue;
  //   }
  // }

  const newGroup = renderSpecificField(newFieldInfo);

  if (newGroup) {
    setActiveField(newGroup, newFieldInfo);
  }
}

/**
 * @param {string} recordFormat 
 * @param {Keyword[]} newKeywords 
 */
function sendFormatHeaderUpdate(recordFormat, newKeywords) {
  vscode.postMessage({
    command: `updateFormat`,
    recordFormat,
    newKeywords
  });
}

/**
 * Used to create panels for editable key/value lists.
 * @param {string} id
 * @param {Keyword[]} inputKeywords 
 * @param {(keywords: Keyword[]) => void} [onUpdate]
 */
function createKeywordPanel(id, inputKeywords, onUpdate) {
  /** @type {Keyword[]} */
  const keywords = JSON.parse(JSON.stringify(inputKeywords));

  const section = document.createElement(`div`);
  section.id = id;

  const tree = document.createElement(`vscode-tree`);
  tree.id = id;

  const actions = onUpdate ? [
    {
      icon: "edit",
      actionId: "edit",
      tooltip: "Edit",
    },
    {
      icon: "trash",
      actionId: "delete",
      tooltip: "Delete",
    },
  ] : [];

  const icons = {
    branch: 'folder',
    leaf: 'circle-filled',
    open: 'folder-opened',
  };

  const rerenderTree = () => {
    tree.data = keywords.map((keyword, index) => {
      return {
        icons,
        label: keyword.name,
        value: keyword,
        description: keyword.value,
        actions,
        subItems: keyword.conditions.map(c => ({
          label: String(c.indicator),
          description: c.negate ? `Negated` : undefined,
          icons
        })),
      };
    });
  };

  rerenderTree();

  tree.addEventListener('vsc-run-action', (event) => {
    console.log(event.detail);
    /** @type {Keyword} */
    const currentKeyword = event.detail.value;
    const oldKeywordIndex = keywords.findIndex(k => k.name === currentKeyword.name && k.value === currentKeyword.value);

    switch (event.detail.actionId) {
      case `delete`:
        if (oldKeywordIndex >= 0) {
          keywords.splice(oldKeywordIndex, 1);
        }
        rerenderTree();
        onUpdate(keywords);
        break;

      case `edit`:
        editKeyword((newKeyword) => {
          if (oldKeywordIndex >= 0) {
            keywords[oldKeywordIndex] = newKeyword;
          } else {
            keywords.push(newKeyword);
          }

          clearKeywordEditor();
          rerenderTree();
          onUpdate(keywords);
        }, event.detail.value);
        break;
    }
  });

  section.appendChild(tree);

  if (onUpdate) {
    const newKeyword = document.createElement(`vscode-button`);
    newKeyword.setAttribute(`icon`, `add`);

    newKeyword.innerText = `New Keyword`;
    newKeyword.style.margin = `1em`;
    newKeyword.style.display = `block`;

    newKeyword.addEventListener(`click`, (e) => {
      editKeyword((newKeyword) => {
        keywords.push(newKeyword);
        clearKeywordEditor();
        rerenderTree();
        onUpdate(keywords);
      });
    });

    section.appendChild(newKeyword);
  }

  return section;
}

/**
 * Used to create a panel for editable properties.
 * Properties with the `id` property are editable.
 * @param {string} id 
 * @param {Property[]} properties 
 * @param {(newProps: NewProperties) => {}} onUpdate 
 */
function createValuesPanel(id, properties, onUpdate) {
  const section = document.createElement(`div`);
  section.id = id;

  // vscode-table-cell forces `overflow: hidden`, which clips a select's dropdown
  // popup (it's position:absolute relative to itself, not portaled to <body>) so
  // it never becomes visible when opened. A form-group layout has no such clip.
  const group = document.createElement(`vscode-form-group`);
  group.setAttribute(`variant`, `vertical`);
  group.style.padding = `0 1em`;

  const createRow = (label) => {
    const row = document.createElement(`div`);
    row.style.display = `flex`;
    row.style.flexDirection = `column`;
    row.style.gap = `0.3em`;
    row.style.marginBottom = `1em`;

    const labelElement = document.createElement(`vscode-label`);
    labelElement.innerText = label;
    labelElement.style.opacity = `0.8`;
    labelElement.style.fontSize = `0.9em`;
    row.appendChild(labelElement);

    return row;
  };

  // Every edit applies immediately (no Update button) - collectValues() always
  // reads the full set of controls so each change sends a consistent snapshot,
  // not just the one field that changed.
  const collectValues = () => {
    /** @type {{[key: string]: string}} */
    const values = {};

    section.querySelectorAll(`[data-field-id]`).forEach(field => {
      if (field.tagName === `VSCODE-SINGLE-SELECT`) {
        // A select's .value comes back undefined when the field's actual
        // value isn't one of its options (e.g. the Type dropdown only offers
        // Alpha/Numeric, so a Date/Time field's real type doesn't match any
        // option). Sending that through would overwrite the real value with
        // literally the string "undefined" once it hits a template literal
        // in getLinesForField - corrupting the field and, since that throws
        // off fixed-column parsing on reload, potentially every line after
        // it too. Leaving the key out entirely just leaves that property
        // untouched instead.
        if (field.value) {
          values[field.dataset.fieldId] = field.value;
        }
      } else {
        values[field.dataset.fieldId] = field.innerText;
      }
    });

    return values;
  };

  const createInputElement = (fieldId, value) => {
    const input = document.createElement(`code`);
    input.dataset.fieldId = fieldId;
    input.innerText = value;
    input.setAttribute(`contenteditable`, `true`);
    input.style.display = `block`;
    input.style.width = `100%`;
    input.style.boxSizing = `border-box`;
    input.style.padding = `0.4em 0.5em`;
    input.style.border = `1px solid var(--vscode-settings-textInputBorder, transparent)`;
    input.style.borderRadius = `2px`;
    input.style.background = `var(--vscode-settings-textInputBackground)`;
    input.style.color = `var(--vscode-settings-textInputForeground)`;
    input.addEventListener(`blur`, () => onUpdate(collectValues()));

    return input;
  };

  const createSelectElement = (fieldId, value, options) => {
    const select = document.createElement(`vscode-single-select`);
    select.dataset.fieldId = fieldId;
    select.style.width = `100%`;
    // Assigning slotted <vscode-option> children only registers reliably once
    // the element is connected and a slotchange fires - fragile when building
    // the whole tree detached, as we do here. Setting .options directly writes
    // the component's internal state synchronously, so selection works immediately.
    // The initial selection isn't derived from the `selected` flags in that path
    // though - it has to be set explicitly via .value.
    select.options = options.map(option => ({
      label: option.label,
      value: option.value,
    }));
    select.value = value;

    select.addEventListener(`change`, () => onUpdate(collectValues()));

    return select;
  };

  for (let prop of properties) {
    const row = createRow(prop.label);

    if (prop.options) {
      row.appendChild(createSelectElement(prop.id, prop.value, prop.options));
    } else if (prop.id) {
      row.appendChild(createInputElement(prop.id, prop.value));
    } else {
      const plainValue = document.createElement(`div`);
      plainValue.innerText = prop.value;
      row.appendChild(plainValue);
    }

    group.appendChild(row);
  }

  section.appendChild(group);

  return section;
}

function clearKeywordEditor() {
  const keywordEditorArea = document.getElementById(`keywordEditorArea`);
  keywordEditorArea.innerHTML = ``;
}

// Common DDS keywords for display files (DSPF) and printer files (PRTF), at
// file/record/field level. Not necessarily exhaustive - CAxx/CFxx go up to 24,
// and there are obscure/version-specific keywords not listed here. The keyword
// select below is a filterable combobox that also accepts free text, so a
// keyword missing from this list can still just be typed directly.
const DDS_KEYWORDS = [
  `AFPRSC`, `ALARM`, `ALIGN`, `ASSUME`, `AUTO`,
  `BARCODE`, `BLANKS`, `BLINK`,
  `CA01`, `CA03`, `CA12`, `CA24`, `CDEFNT`, `CF01`, `CF03`, `CF12`, `CF24`,
  `CHANGE`, `CHECK`, `CHGINPDFT`, `CHRSIZ`, `CLRL`, `COLOR`, `CONCAT`, `CPI`, `CSRLOC`,
  `DATA`, `DATE`, `DATFMT`, `DATSEP`, `DFRWRT`, `DFT`, `DSPATR`, `DSPSIZ`, `DUPLEX`,
  `EDTCDE`, `EDTWRD`, `END`, `ENDPAGE`, `ERRMSG`, `ERRMSGID`, `ERRSFL`,
  `FONT`, `FORCE`, `FORMFEED`,
  `HELP`, `HLPARA`, `HLPID`, `HLPPGM`, `HLPRTN`,
  `IGCALTTYP`, `INDARA`, `INDTXT`,
  `KEEP`, `LPI`,
  `MNUBAR`, `MSGID`, `MSGLOC`,
  `OUTBIN`, `OUTPUT`, `OVERFLOW`, `OVERLAY`,
  `PAGEDOWN`, `PAGEUP`, `PAGNBR`, `PAGRTT`, `PRINT`, `PRTQLTY`, `PULLDOWN`, `PUTOVR`, `PUTRETAIN`,
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
 * @param {(keyword: Keyword) => void} onUpdate
 * @param {Keyword} [keyword]
 */
function editKeyword(onUpdate, keyword) {
  const group = document.createElement(`vscode-form-group`);
  group.id = `currentKeywordEditor`;
  group.setAttribute(`variant`, `vertical`);
  group.style.paddingLeft = `1em`;
  group.style.paddingRight = `1em`;

  const createLabel = (label, forId) => {
    const labelElement = document.createElement(`vscode-label`);
    labelElement.setAttribute(`for`, forId);
    labelElement.innerText = label;
    labelElement.style.marginTop = `0.5em`;
    return labelElement;
  };

  const createInputField = (id, value) => {
    const input = document.createElement(`vscode-textfield`);
    input.setAttribute(`id`, id);
    input.setAttribute(`value`, value);
    return input;
  };

  const createKeywordNameSelect = (id, value) => {
    const select = document.createElement(`vscode-single-select`);
    select.setAttribute(`id`, id);
    select.combobox = true;
    select.creatable = true;
    select.filter = `startsWith`;

    // Setting .value only selects something already present in .options - it
    // doesn't add it. If we're editing a keyword this list doesn't happen to
    // cover, make sure its name is still there so it shows up instead of
    // silently going blank.
    const names = value && !DDS_KEYWORDS.includes(value) ? [value, ...DDS_KEYWORDS] : DDS_KEYWORDS;
    select.options = names.map(name => ({ label: name, value: name }));
    if (value) {
      select.value = value;
    }

    return select;
  };

  const createIndicatorSelect = (id, defaultValue) => {
    const select = document.createElement(`vscode-single-select`);
    select.setAttribute(`id`, id);

    const options = [`None`];

    for (let i = 1; i <= 99; i++) {
      options.push(String(i));
    }

    select.options = options.map(option => ({
      label: option,
      value: option,
    }));
    // defaultValue is the numeric indicator (or undefined); options are strings.
    select.value = defaultValue !== undefined ? String(defaultValue) : `None`;

    return select;
  };

  const createCheckbox = (id, label, checked) => {
    const checkbox = document.createElement(`vscode-checkbox`);
    checkbox.setAttribute(`id`, id);
    checkbox.setAttribute(`label`, label);
    if (checked) {
      checkbox.setAttribute(`checked`, checked);
    }
    return checkbox;
  };

  group.appendChild(createLabel(`Keyword`, `keyword`));
  group.appendChild(createKeywordNameSelect(`keyword`, keyword ? keyword.name : ``));

  group.appendChild(createLabel(`Value`, `value`));
  group.appendChild(createInputField(`value`, keyword ? (keyword.value || ``) : ``));

  group.appendChild(createLabel(`Indicator 1`, `ind1`));
  group.appendChild(createIndicatorSelect(`ind1`, keyword ? keyword.conditions[0]?.indicator : undefined));

  group.appendChild(createCheckbox(`neg1`, `Negate`, keyword ? keyword.conditions[0]?.negate : undefined));

  group.appendChild(createLabel(`Indicator 2`, `ind2`));
  group.appendChild(createIndicatorSelect(`ind2`, keyword ? keyword.conditions[1]?.indicator : undefined));

  group.appendChild(createCheckbox(`neg2`, `Negate`, keyword ? keyword.conditions[1]?.negate : undefined));

  group.appendChild(createLabel(`Indicator 3`, `ind3`));
  group.appendChild(createIndicatorSelect(`ind3`, keyword ? keyword.conditions[2]?.indicator : undefined));

  group.appendChild(createCheckbox(`neg3`, `Negate`, keyword ? keyword.conditions[2]?.negate : undefined));

  const button = document.createElement(`vscode-button`);
  button.setAttribute(`icon`, `check`);
  button.style.marginTop = `1em`;
  button.style.display = `block`;
  button.innerText = `Confirm`;
  button.onclick = () => {
    const keywordName = group.querySelector(`#keyword`).value;
    const keywordValue = group.querySelector(`#value`).value;

    const ind1 = group.querySelector(`#ind1`).value;
    const neg1 = group.querySelector(`#neg1`).checked;

    const ind2 = group.querySelector(`#ind2`).value;
    const neg2 = group.querySelector(`#neg2`).checked;

    const ind3 = group.querySelector(`#ind3`).value;
    const neg3 = group.querySelector(`#neg3`).checked;

    const newKeyword = {
      name: keywordName,
      value: keywordValue ? keywordValue : undefined,
      conditions: []
    };

    if (ind1 !== `None`) {
      newKeyword.conditions.push({
        indicator: ind1,
        negate: neg1
      });
    }

    if (ind2 !== `None`) {
      newKeyword.conditions.push({
        indicator: ind2,
        negate: neg2
      });
    }

    if (ind3 !== `None`) {
      newKeyword.conditions.push({
        indicator: ind3,
        negate: neg3
      });
    }

    onUpdate(newKeyword);
  };

  group.appendChild(button);

  const keywordEditorArea = document.getElementById(`keywordEditorArea`);
  keywordEditorArea.innerHTML = ``;

  keywordEditorArea.appendChild(document.createElement(`vscode-divider`));
  keywordEditorArea.appendChild(group);
}