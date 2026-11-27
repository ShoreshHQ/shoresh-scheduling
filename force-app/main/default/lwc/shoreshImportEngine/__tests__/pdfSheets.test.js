/**
 * A PDF page's drawing, as pdf.js lists it, read as a sheet (INGEST-1.11). These pages are written
 * here as the drawing operations themselves, so each way a PDF can draw a table is tried on its own:
 * borders as thin filled boxes, paths that start without a move, curves, text laid out with the
 * text state's own operations, invisible text, pictures, forms. The whole path from a real PDF
 * (pdf.js itself) is in connect/__tests__/pdf.test.js.
 */
import { sheetsFromPdf, textOf } from "c/shoreshImportEngine";

// pdf.js numbers its operations; the reader takes the numbering it is given.
const NAMES = [
  "save",
  "restore",
  "transform",
  "setFillRGBColor",
  "setStrokeRGBColor",
  "constructPath",
  "moveTo",
  "lineTo",
  "curveTo",
  "curveTo2",
  "curveTo3",
  "closePath",
  "rectangle",
  "fill",
  "eoFill",
  "stroke",
  "closeStroke",
  "fillStroke",
  "eoFillStroke",
  "closeFillStroke",
  "closeEOFillStroke",
  "endPath",
  "paintImageXObject",
  "paintInlineImageXObject",
  "paintImageMaskXObject",
  "paintJpegXObject",
  "paintFormXObjectBegin",
  "paintFormXObjectEnd",
  "beginText",
  "endText",
  "setFont",
  "setTextMatrix",
  "moveText",
  "setLeadingMoveText",
  "nextLine",
  "setLeading",
  "setCharSpacing",
  "setWordSpacing",
  "setHScale",
  "setTextRise",
  "setTextRenderingMode",
  "showText",
  "showSpacedText"
];
const OPS = Object.fromEntries(NAMES.map((n, i) => [n, i + 1]));

/** A page drawn top-down (y grows downward), from [name, args] pairs. */
function page(ops) {
  return {
    view: [0, 0, 600, 800],
    transform: [1, 0, 0, 1, 0, 0],
    fnArray: ops.map(([name]) => OPS[name]),
    argsArray: ops.map(([, args]) => args ?? null)
  };
}

/** The lines of a grid, stroked, as one path of moves and lines. */
function grid(xs, ys) {
  const codes = [];
  const coords = [];
  for (const x of xs) {
    codes.push(OPS.moveTo, OPS.lineTo);
    coords.push(x, ys[0], x, ys[ys.length - 1]);
  }
  for (const y of ys) {
    codes.push(OPS.moveTo, OPS.lineTo);
    coords.push(xs[0], y, xs[xs.length - 1], y);
  }
  return [
    ["constructPath", [codes, coords]],
    ["stroke", []]
  ];
}

const glyphs = (text) =>
  [...text].map((ch) => ({ unicode: ch, width: 500, isSpace: ch === " " }));

/** Words at (x, y), 10 points high, each character 5 points wide. */
function words(x, y, text, before = []) {
  return [
    ["beginText", []],
    ["setFont", ["f", 10]],
    ["setTextMatrix", [1, 0, 0, 1, x, y]],
    ...before,
    ["showText", [glyphs(text)]],
    ["endText", []]
  ];
}

const read = (ops) => sheetsFromPdf([page(ops)], OPS, "camp.pdf");

describe("a page's drawing read as a sheet (INGEST-1.11)", () => {
  it("INGEST-1.11: borders drawn as thin filled boxes, and paths drawn as rectangles, are a table", () => {
    // Two columns, two rows, every border a filled box a point wide.
    const thin = [];
    for (const x of [0, 100, 200]) thin.push([OPS.rectangle], [x, 0, 1, 60]);
    for (const y of [0, 30, 60]) thin.push([OPS.rectangle], [0, y, 201, 1]);
    const ops = [];
    for (let i = 0; i < thin.length; i += 2) {
      ops.push(["constructPath", [thin[i], thin[i + 1]]], ["eoFill", []]);
    }
    const got = read([
      ...ops,
      ...words(10, 12, "Time"),
      ...words(110, 12, "Monday"),
      ...words(10, 42, "9:00"),
      ...words(110, 42, "Swim")
    ]);
    expect(got.sheets[0].rows).toEqual([
      ["Time", "Monday"],
      ["9:00", "Swim"]
    ]);
    expect(got.unclear).toEqual([]);
  });

  it("INGEST-1.11: a path's curves are passed over, a line without a move starts its own path, and a closed path ends where it began", () => {
    const got = read([
      // A rounded corner (curves) on its own is no border.
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.curveTo, OPS.curveTo2, OPS.curveTo3],
          [300, 300, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]
        ]
      ],
      ["stroke", []],
      // The table's outline: lines with no move first, closed back to the start.
      [
        "constructPath",
        [
          [OPS.lineTo, OPS.lineTo, OPS.lineTo, OPS.lineTo, OPS.closePath],
          [0, 0, 200, 0, 200, 60, 0, 60]
        ]
      ],
      ["closeStroke", []],
      ...grid([100], [0, 60]),
      ...grid([0, 200], [30]),
      // Drawn and dropped: a path ended without painting is no border.
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [150, 0, 150, 60]
        ]
      ],
      ["endPath", []],
      ...words(10, 12, "Time"),
      ...words(110, 12, "Monday"),
      ...words(10, 42, "9:00"),
      ...words(110, 42, "Swim")
    ]);
    expect(got.sheets[0].rows).toEqual([
      ["Time", "Monday"],
      ["9:00", "Swim"]
    ]);
  });

  it("INGEST-1.11: a filled box with a border (fill and stroke at once) is both a colour and lines", () => {
    for (const paint of [
      "fillStroke",
      "eoFillStroke",
      "closeFillStroke",
      "closeEOFillStroke"
    ]) {
      const got = read([
        ...grid([0, 100, 200], [0, 30]),
        ["setFillRGBColor", [0, 0, 0]],
        ["constructPath", [[OPS.rectangle], [100, 30, 100, 30]]],
        [paint, []],
        ["constructPath", [[OPS.rectangle], [0, 30, 100, 30]]],
        [paint, []],
        ["setFillRGBColor", [0, 0, 0]],
        ...words(10, 12, "Time"),
        ...words(110, 12, "Monday")
      ]);
      expect([paint, got.sheets[0].rows[1], got.unclear]).toEqual([
        paint,
        ["", ""],
        [`Page 1, row 2, Monday: filled in with no words; left empty`]
      ]);
    }
  });

  it("INGEST-1.11: text set with the text state's own operations (leading, spacing, scale, rise) lands in its box, line by line", () => {
    const got = read([
      ...grid([0, 100, 200], [0, 30, 60]),
      ...words(10, 12, "Time"),
      ...words(110, 12, "Monday"),
      ...words(10, 42, "9:00"),
      // Two lines in one box: a leading set by moving, then the next line.
      ["beginText", []],
      ["setFont", ["f", 10]],
      ["setCharSpacing", [0.5]],
      ["setWordSpacing", [1]],
      ["setHScale", [100]],
      ["setTextRise", [0]],
      ["setLeading", [11]],
      ["setTextMatrix", [1, 0, 0, 1, 105, 33]],
      ["setLeadingMoveText", [0, -11]],
      ["moveText", [0, 11]],
      ["showText", [glyphs("Free Swim")]],
      ["nextLine", []],
      ["moveText", [0, 22]],
      // Kerning numbers between characters, and an empty slot, as pdf.js gives them.
      ["showSpacedText", [[...glyphs("Po"), -50, null, ...glyphs("ol")]]],
      ["endText", []]
    ]);
    expect(got.sheets[0].rows[1]).toEqual(["9:00", "Free Swim\nPool"]);
  });

  it("INGEST-1.11: invisible text, and text under a box drawn later, are hidden and said", () => {
    const got = read([
      ...grid([0, 100, 200], [0, 30, 60]),
      ...words(10, 12, "Time"),
      ...words(110, 12, "Monday"),
      ...words(10, 42, "9:00"),
      ...words(110, 42, "Swim", [["setTextRenderingMode", [3]]])
    ]);
    expect(got.sheets[0].rows[1]).toEqual(["9:00", ""]);
    expect(got.unclear).toEqual([
      "Page 1, 9:00, Monday: words hidden in the box's own colour were left out"
    ]);
  });

  it("INGEST-1.11: a drawing placed as a form follows its own matrix, and the state after it is as before", () => {
    const got = read([
      ["save", []],
      ["transform", [1, 0, 0, 1, 0, 0]],
      [
        "paintFormXObjectBegin",
        [
          [1, 0, 0, 1, 50, 0],
          [0, 0, 300, 100]
        ]
      ],
      ...grid([0, 100, 200], [0, 30, 60]),
      ["paintFormXObjectEnd", []],
      ["restore", []],
      // Unpaired restores change nothing.
      ["restore", []],
      ["paintFormXObjectEnd", []],
      ...words(60, 12, "Time"),
      ...words(160, 12, "Monday"),
      ...words(60, 42, "9:00"),
      ...words(160, 42, "Swim")
    ]);
    expect(got.sheets[0].rows).toEqual([
      ["Time", "Monday"],
      ["9:00", "Swim"]
    ]);
  });

  it("INGEST-1.11: a box that isn't a rectangle keeps its words in its cells, and is said", () => {
    // An L: the top two cells and the one under the left one, with no borders between them.
    const got = read([
      ...grid([0, 200], [0, 60]),
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [100, 30, 100, 60]
        ]
      ],
      ["stroke", []],
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [100, 30, 200, 30]
        ]
      ],
      ["stroke", []],
      ...words(10, 12, "Lunch"),
      ...words(110, 42, "Art")
    ]);
    expect(got.sheets[0].rows).toEqual([
      ["Lunch", ""],
      ["", "Art"]
    ]);
    expect(got.unclear).toEqual([
      "Page 1: a box in the PDF isn't a rectangle; its words are kept in the cells they sit in"
    ]);
  });

  it("INGEST-1.11: two boxes that fall in one time join the box already there, and it is said", () => {
    // Monday's column split into a box ending a little after 9:00's top and one after it.
    const got = read([
      ...grid([0, 100, 200], [0, 30, 60, 90]),
      ["setFillRGBColor", [255, 255, 255]],
      ["constructPath", [[OPS.rectangle], [101, 31, 98, 58]]],
      ["fill", []],
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [100, 38, 200, 38]
        ]
      ],
      ["stroke", []],
      ["setFillRGBColor", [0, 0, 0]],
      ...words(10, 12, "Time"),
      ...words(110, 12, "Monday"),
      ...words(10, 42, "9:00"),
      ...words(10, 72, "10:00"),
      ...words(110, 32, "Hike"),
      ...words(110, 50, "Swim")
    ]);
    const rows = got.sheets[0].rows;
    expect(rows[1][1]).toBe("Hike\nSwim");
    expect(got.unclear).toContain(
      "Page 1, 9:00, Monday: two boxes in the PDF fall in this one place; both are kept here"
    );
  });

  it("INGEST-1.11: pictures alone are a scanned page; lines one way only are no table; several of each are said once", () => {
    const picture = page([
      ["paintImageXObject", ["img"]],
      ["paintInlineImageXObject", ["img"]],
      ["paintImageMaskXObject", ["img"]],
      ["paintJpegXObject", ["img"]]
    ]);
    const ruled = page([
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [0, 10, 300, 10]
        ]
      ],
      ["stroke", []],
      ...words(10, 30, "Our week")
    ]);
    const blank = page([]);
    const table = page([
      ...grid([0, 100, 200], [0, 30]),
      ...words(10, 12, "Time"),
      ...words(110, 12, "Monday")
    ]);
    expect(
      sheetsFromPdf([picture, picture, table, ruled, blank], OPS, "camp.pdf")
        .unclear
    ).toEqual([
      "Pages 1, 2: a picture of a schedule (scanned), not text; Shoresh can't read them, so they were left out.",
      "Pages 4, 5: no table drawn with lines; Shoresh can't read them, so they were left out."
    ]);
    expect(sheetsFromPdf([ruled], OPS, "camp.pdf")).toEqual({
      problem:
        "camp.pdf has no schedule table Shoresh can read. Nothing was imported."
    });
    expect(sheetsFromPdf([picture, picture], OPS, "camp.pdf")).toEqual({
      problem:
        "camp.pdf is a picture of a schedule (scanned), not text; Shoresh can't read it. Nothing was imported."
    });
  });

  it("INGEST-1.11: a page with no transform of its own is read the right way up from its size", () => {
    const flipped = page([
      // Drawn bottom-up, as a PDF's own space is, on a page 100 high.
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [0, 100, 200, 100]
        ]
      ],
      ["stroke", []],
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [0, 40, 200, 40]
        ]
      ],
      ["stroke", []],
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [0, 40, 0, 100]
        ]
      ],
      ["stroke", []],
      [
        "constructPath",
        [
          [OPS.moveTo, OPS.lineTo],
          [200, 40, 200, 100]
        ]
      ],
      ["stroke", []],
      ...words(10, 60, "Swim", [["setTextMatrix", [1, 0, 0, 1, 10, 60]]])
    ]);
    delete flipped.transform;
    flipped.view = [0, 0, 300, 100];
    expect(sheetsFromPdf([flipped], OPS, "camp.pdf").sheets[0].rows).toEqual([
      ["Swim"]
    ]);
  });

  it("INGEST-1.11: right-to-left words keep the spaces after them where they were", () => {
    const glyph = (text, x) => ({
      text,
      x: x + 3,
      y: 10,
      start: [x, 12],
      end: [x + 6, 12],
      dir: [1, 0],
      size: 10,
      seen: true
    });
    // "םש" then a gap then "Art": the Hebrew read right to left, the space kept before Art.
    expect(
      textOf([
        glyph("ם", 0),
        glyph("ש", 6),
        glyph("A", 24),
        glyph("r", 30),
        glyph("t", 36)
      ])
    ).toBe("שם Art");
    expect(textOf([])).toBe("");
  });
});
