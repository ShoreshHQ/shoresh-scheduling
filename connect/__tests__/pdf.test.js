/**
 * A schedule PDF read as the sheets Import last year reads (INGEST-1.11, ADR 0032). Every PDF here
 * is made up and drawn by the test (pdf-lib): the corpus's invented camps in each layout, and pages
 * built to hold each thing a real camp's PDF did that a plain reading gets wrong. No real camp's
 * file, and nothing made from one, is in this repo.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
const { pdfFile } = require("../pdf");
const { call: callAs, importModules } = require("../client");

const LWC = path.resolve(__dirname, "../../force-app/main/default/lwc");
const engine = require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`);
const {
  ordinaryCamp,
  pagesOf
} = require("../../scripts/import-corpus/camps.js");

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-pdf-"));
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

const ROW = 26;
const PAD = 6;
const SIZE = 8;

/**
 * Draws tables as a spreadsheet prints them: each sheet a page, an optional title above, every cell
 * (or merged cell) outlined, and its text in it, a line per line of the cell.
 */
async function printed(name, sheets, { titles = [], extra } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [i, sheet] of sheets.entries()) {
    const cols = Math.max(...sheet.rows.map((r) => r.length));
    const widths = Array.from(
      { length: cols },
      (_, c) =>
        Math.max(
          40,
          ...sheet.rows.map((r) =>
            Math.max(
              0,
              ...String(r[c] ?? "")
                .split("\n")
                .map((t) => font.widthOfTextAtSize(t, SIZE))
            )
          )
        ) +
        2 * PAD
    );
    const width = widths.reduce((a, b) => a + b, 0) + 72;
    const height = sheet.rows.length * ROW + 140;
    const page = doc.addPage([width, height]);
    const x = (c) => 36 + widths.slice(0, c).reduce((a, b) => a + b, 0);
    const y = (r) => height - 90 - r * ROW;
    (titles[i] || []).forEach((t, k) =>
      page.drawText(t, { x: 36, y: height - 40 - k * 16, size: 12, font })
    );
    const regionOf = {};
    for (const m of sheet.merges || []) {
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) regionOf[`${r},${c}`] = m;
      }
    }
    for (let r = 0; r < sheet.rows.length; r++) {
      for (let c = 0; c < cols; c++) {
        const m = regionOf[`${r},${c}`] || { s: { r, c }, e: { r, c } };
        if (m.s.r !== r || m.s.c !== c) continue;
        page.drawRectangle({
          x: x(m.s.c),
          y: y(m.e.r + 1),
          width: x(m.e.c + 1) - x(m.s.c),
          height: y(m.s.r) - y(m.e.r + 1),
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.75
        });
        String(sheet.rows[r][c] ?? "")
          .split("\n")
          .filter((t) => t)
          .forEach((t, k) =>
            page.drawText(t, {
              x: x(c) + PAD,
              y: y(r) - 11 - k * 10,
              size: SIZE,
              font
            })
          );
      }
    }
    if (extra) extra(page, { x, y, font, doc });
  }
  const file = path.join(DIR, name);
  fs.writeFileSync(file, await doc.save());
  return file;
}

/** A sheet's rows as they read back: text as shown, no trailing blank cells. */
const shown = (rows) =>
  rows.map((r) => {
    const out = r.map((v) => String(v ?? ""));
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  });

const read = (file) =>
  pdfFile({ file_name: path.basename(file), pdf_path: file }, engine);

// INGEST-1.11
describe("a schedule PDF read as the import's sheets", () => {
  it("INGEST-1.11: every corpus layout, printed, reads back as the same table, merged cells and all", async () => {
    // One invented camp of each layout the import reads (docs/import/corpus.md): a page per
    // group, a page per day with groups across (divisions merged above them), and by activity.
    const wanted = { byGroup: null, allCamp: null, byActivity: null };
    for (let seed = 1; Object.values(wanted).some((v) => !v); seed++) {
      const camp = ordinaryCamp(seed);
      if (!wanted[camp.layout] && camp.divisions.length > 1)
        wanted[camp.layout] = camp;
    }
    for (const camp of Object.values(wanted)) {
      const sheets = pagesOf(camp).flatMap((f) => f.sheets);
      const file = await printed(`${camp.layout}.pdf`, sheets);
      const { file: got, unclear, problem } = await read(file);
      expect(problem).toBeUndefined();
      expect(unclear).toEqual([]);
      expect(got.sheets).toHaveLength(sheets.length);
      got.sheets.forEach((s, i) => {
        expect([camp.layout, shown(s.rows)]).toEqual([
          camp.layout,
          shown(sheets[i].rows)
        ]);
        expect(s.merges).toEqual(
          expect.arrayContaining(
            (sheets[i].merges || []).map((m) => expect.objectContaining(m))
          )
        );
      });
    }
  });

  it("INGEST-1.11: the connector as shipped reads a PDF on a computer with nothing else installed", async () => {
    // pdf.js asks for packages the connector doesn't ship and says so; only the pages reach stdout.
    const { execFileSync } = require("child_process");
    const shipped = fs.mkdtempSync(
      path.join(os.tmpdir(), "shoresh-connector-")
    );
    const RESOURCE = path.resolve(
      __dirname,
      "../../force-app/main/default/staticresources/ShoreshConnect"
    );
    for (const f of [
      "pdfPages.js",
      "engine.pdfjs.mjs",
      "engine.pdfjs.worker.mjs"
    ]) {
      fs.copyFileSync(path.join(RESOURCE, f), path.join(shipped, f));
    }
    const file = await printed("shipped.pdf", [
      {
        rows: [
          ["Time", "Monday"],
          ["9:00-9:45", "Art"]
        ],
        merges: []
      }
    ]);
    const out = execFileSync(
      process.execPath,
      [path.join(shipped, "pdfPages.js"), file, "256"],
      { cwd: shipped, stdio: ["ignore", "pipe", "ignore"] }
    );
    fs.rmSync(shipped, { recursive: true, force: true });
    const drawn = JSON.parse(out.toString());
    expect(drawn.pageCount).toBe(1);
    expect(
      engine.sheetsFromPdf(drawn.pages, drawn.OPS, "shipped.pdf").sheets[0].rows
    ).toEqual([
      ["Time", "Monday"],
      ["9:00-9:45", "Art"]
    ]);
  });

  it("INGEST-1.11: the same PDF always gives the same sheets", async () => {
    const camp = ordinaryCamp(3);
    const file = await printed(
      "again.pdf",
      pagesOf(camp).flatMap((f) => f.sheets)
    );
    expect(await read(file)).toEqual(await read(file));
  });

  it("INGEST-1.11: lines above the table, a title and the group, come first, each a row of its own", async () => {
    const file = await printed(
      "titled.pdf",
      [
        {
          rows: [
            ["", "Monday"],
            ["9:00-9:45", "Art\n217"]
          ],
          merges: []
        }
      ],
      { titles: [["Made-up Camp 2026", "Otters"]] }
    );
    const { file: got } = await read(file);
    expect(shown(got.sheets[0].rows)).toEqual([
      ["Made-up Camp 2026"],
      ["Otters"],
      ["", "Monday"],
      ["9:00-9:45", "Art\n217"]
    ]);
    expect(got.sheets[0].name).toBe("Page 1");
  });

  it("INGEST-1.11: a merged box whose inside is coloured cell by cell is one cell with all its text", async () => {
    const rows = [
      ["Time", "Monday", "Tuesday"],
      ["9:00-9:45", "", "Art"],
      ["10:00-10:45", "", "Drama"]
    ];
    const file = await printed(
      "filled.pdf",
      [{ rows, merges: [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }] }],
      {
        // A spreadsheet colours each cell of a merged box on its own: white boxes edge to edge.
        extra: (page, { x, y }) => {
          for (const r of [1, 2]) {
            page.drawRectangle({
              x: x(1) + 0.5,
              y: y(r + 1) + 0.5,
              width: x(2) - x(1) - 1,
              height: ROW - 1,
              color: rgb(1, 1, 1)
            });
          }
          // Drawn again over the white, so the words show.
          page.drawText("Field Trip", {
            x: x(1) + PAD,
            y: y(1) - 11,
            size: SIZE
          });
        }
      }
    );
    const { file: got, unclear } = await read(file);
    expect(shown(got.sheets[0].rows)).toEqual([
      ["Time", "Monday", "Tuesday"],
      ["9:00-9:45", "Field Trip", "Art"],
      ["10:00-10:45", "", "Drama"]
    ]);
    expect(got.sheets[0].merges).toEqual([
      { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }
    ]);
    expect(unclear).toEqual([]);
  });

  it("INGEST-1.11: words turned on their side (a Block column) read in their own direction", async () => {
    const rows = [
      ["Time", "", "Monday"],
      ["9:00-9:45", "", "Art"]
    ];
    const file = await printed("sideways.pdf", [{ rows, merges: [] }], {
      extra: (page, { x, y }) =>
        page.drawText("Block 1", {
          x: x(1) + 14,
          y: y(2) + 2,
          size: 6,
          rotate: degrees(90)
        })
    });
    const { file: got } = await read(file);
    expect(got.sheets[0].rows[1][1]).toBe("Block 1");
  });

  it("INGEST-1.11: a box filled in with no words, and words hidden in a box's own colour, are left out and said, never guessed", async () => {
    // Lunch is drawn by the page itself below, white on black.
    const rows = [
      ["Time", "Monday", "Tuesday"],
      ["9:00-9:45", "Art", ""],
      ["1:00-1:45", "", ""]
    ];
    const file = await printed("dark.pdf", [{ rows, merges: [] }], {
      extra: (page, { x, y, font }) => {
        const fill = (c, r) =>
          page.drawRectangle({
            x: x(c) + 0.5,
            y: y(r + 1) + 0.5,
            width: x(c + 1) - x(c) - 1,
            height: ROW - 1,
            color: rgb(0, 0, 0)
          });
        // Lunch in white on black: seen, and read.
        fill(2, 1);
        page.drawText("Lunch", {
          x: x(2) + PAD,
          y: y(1) - 11,
          size: SIZE,
          font,
          color: rgb(1, 1, 1)
        });
        // A half-day group's afternoon: black, nothing on it; and black, with black words under.
        fill(1, 2);
        fill(2, 2);
        page.drawText("Pick Up", {
          x: x(2) + PAD,
          y: y(2) - 11,
          size: SIZE,
          font,
          color: rgb(0, 0, 0)
        });
      }
    });
    const { file: got, unclear } = await read(file);
    expect(shown(got.sheets[0].rows)).toEqual([
      ["Time", "Monday", "Tuesday"],
      ["9:00-9:45", "Art", "Lunch"],
      ["1:00-1:45"]
    ]);
    expect(unclear).toEqual([
      "Page 1, 1:00-1:45, Monday: filled in with no words; left empty",
      "Page 1, 1:00-1:45, Tuesday: words hidden in the box's own colour were left out"
    ]);
  });

  it("INGEST-1.11: a box that doesn't line up with the times beside it goes in the times it mostly covers, and is said", async () => {
    const file = await printed(
      "shifted.pdf",
      [
        {
          rows: [
            ["Time", "Monday"],
            ["11:00-11:30", ""],
            ["11:30-12:00", ""],
            ["12:00-12:30", ""]
          ],
          merges: [{ s: { r: 1, c: 1 }, e: { r: 3, c: 1 } }]
        }
      ],
      {
        // Monday's own line: Swim from 11:00 to about 12:10, Lunch after it.
        extra: (page, { x, y }) => {
          const cut = y(3) - 8;
          page.drawLine({
            start: { x: x(1), y: cut },
            end: { x: x(2), y: cut },
            thickness: 0.75,
            color: rgb(0, 0, 0)
          });
          page.drawText("Swim", { x: x(1) + PAD, y: y(1) - 11, size: SIZE });
          page.drawText("Lunch", { x: x(1) + PAD, y: cut - 11, size: SIZE });
        }
      }
    );
    const { file: got, unclear } = await read(file);
    const sheet = got.sheets[0];
    expect(sheet.rows[1][1]).toBe("Swim");
    expect(sheet.rows[3][1]).toBe("Lunch");
    expect(sheet.merges).toContainEqual({
      s: { r: 1, c: 1 },
      e: { r: 2, c: 1 }
    });
    expect(unclear).toEqual([
      "Page 1, 11:00-11:30, Monday: this box starts or ends partway through a time in the PDF; it is placed in the times it mostly covers",
      "Page 1, 12:00-12:30, Monday: this box starts or ends partway through a time in the PDF; it is placed in the time it mostly covers"
    ]);
  });

  it("INGEST-1.11: a landscape page made by turning a portrait one reads the right way up", async () => {
    const {
      concatTransformationMatrix,
      pushGraphicsState,
      popGraphicsState
    } = require("pdf-lib");
    // A landscape table, drawn turned a quarter on a portrait page that is told to turn it back.
    const flat = await PDFDocument.create();
    const font = await flat.embedFont(StandardFonts.Helvetica);
    const table = flat.addPage([300, 200]);
    table.drawRectangle({
      x: 20,
      y: 20,
      width: 200,
      height: 100,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1
    });
    table.drawLine({
      start: { x: 120, y: 20 },
      end: { x: 120, y: 120 },
      thickness: 1
    });
    table.drawText("Monday", { x: 30, y: 60, size: 10, font });
    table.drawText("Swim", { x: 130, y: 60, size: 10, font });
    const turned = await PDFDocument.create();
    const placed = await turned.embedPage(table);
    const portrait = turned.addPage([200, 300]);
    portrait.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(0, 1, -1, 0, 200, 0)
    );
    portrait.drawPage(placed, { x: 0, y: 0 });
    portrait.pushOperators(popGraphicsState());
    portrait.setRotation(degrees(90));
    const file = path.join(DIR, "turned.pdf");
    fs.writeFileSync(file, await turned.save());
    const { file: got } = await read(file);
    expect(shown(got.sheets[0].rows)).toEqual([["Monday", "Swim"]]);
  });

  it("INGEST-1.11: notes under the table come after it; words beside it and a frame round the page are not the table, and words beside it are said", async () => {
    const file = await printed(
      "framed.pdf",
      [
        {
          rows: [
            ["Time", "Monday"],
            ["9:00-9:45", "Swim"]
          ],
          merges: []
        }
      ],
      {
        extra: (page, { x, y }) => {
          const { width, height } = page.getSize();
          page.drawRectangle({
            x: 8,
            y: 8,
            width: width - 16,
            height: height - 16,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
          });
          page.drawText("* Swim moves to Tuesday if it rains", {
            x: x(0),
            y: y(2) - 20,
            size: SIZE
          });
          page.drawText("Bring a towel", {
            x: x(2) + 4,
            y: y(1) - 11,
            size: SIZE
          });
        }
      }
    );
    const { file: got, unclear } = await read(file);
    expect(shown(got.sheets[0].rows)).toEqual([
      ["Time", "Monday"],
      ["9:00-9:45", "Swim"],
      ["* Swim moves to Tuesday if it rains"]
    ]);
    expect(unclear).toEqual([
      "Page 1: words beside the table were left out: “Bring a towel”"
    ]);
  });

  it("INGEST-1.11: Hebrew is read in its own direction, right to left", () => {
    // Letters as a page lays them out, left to right: ם ו ל ש reads שלום; a number stays as written.
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
    const laidOut = [..."םולש"].map((ch, i) => glyph(ch, i * 6));
    expect(engine.textOf(laidOut)).toBe("שלום");
    const withNumber = [
      glyph("2", 0),
      ...[..."קנוב"].map((ch, i) => glyph(ch, 12 + i * 6))
    ];
    expect(engine.textOf(withNumber)).toBe("2 בונק");
  });

  it("INGEST-1.11: a scanned page or a page with no table is left out and said; a PDF of nothing else is refused", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const picture = async (doc) => {
      const page = doc.addPage([300, 300]);
      page.drawImage(await doc.embedPng(png), {
        x: 10,
        y: 10,
        width: 280,
        height: 280
      });
    };
    const scanned = await PDFDocument.create();
    await picture(scanned);
    const scannedFile = path.join(DIR, "scanned.pdf");
    fs.writeFileSync(scannedFile, await scanned.save());
    expect(await read(scannedFile)).toEqual({
      problem:
        "scanned.pdf is a picture of a schedule (scanned), not text; Shoresh can't read it. Nothing was imported."
    });

    const words = await PDFDocument.create();
    words
      .addPage([300, 300])
      .drawText("Our week at camp", { x: 20, y: 200, size: 12 });
    const wordsFile = path.join(DIR, "words.pdf");
    fs.writeFileSync(wordsFile, await words.save());
    expect(await read(wordsFile)).toEqual({
      problem:
        "words.pdf has no schedule table Shoresh can read. Nothing was imported."
    });

    const mixed = await PDFDocument.load(
      fs
        .readFileSync(
          await printed("table.pdf", [
            {
              rows: [
                ["Time", "Monday"],
                ["9:00-9:45", "Art"]
              ],
              merges: []
            }
          ])
        )
        .toString("base64")
    );
    await picture(mixed);
    const mixedFile = path.join(DIR, "mixed.pdf");
    fs.writeFileSync(mixedFile, await mixed.save());
    const { file: got, unclear } = await read(mixedFile);
    expect(got.sheets.map((s) => s.name)).toEqual(["Page 1"]);
    expect(unclear).toEqual([
      "Page 2: a picture of a schedule (scanned), not text; Shoresh can't read it, so it was left out."
    ]);
  });

  it("INGEST-1.11: a missing file, a file that isn't a PDF, and a PDF over 10 MB are refused before any of it is read", async () => {
    expect(await read(path.join(DIR, "gone.pdf"))).toEqual({
      problem:
        "There's no file named gone.pdf where it was said to be. Nothing was imported."
    });
    const text = path.join(DIR, "notes.pdf");
    fs.writeFileSync(text, "Monday: Art");
    expect(await read(text)).toEqual({
      problem: "Shoresh couldn't read notes.pdf as a PDF. Nothing was imported."
    });
    const big = path.join(DIR, "big.pdf");
    fs.writeFileSync(big, "%PDF-1.7\n");
    fs.truncateSync(big, 10 * 1024 * 1024 + 1);
    expect(await read(big)).toEqual({
      problem:
        "That file is too large to import (over 10 MB). Nothing was imported."
    });
  });
});

// INGEST-1.11, API-1.160
describe("import_last_year with a PDF", () => {
  const imports = async () =>
    importModules({
      engine,
      lists: require(`${LWC}/shoreshLists/shoreshLists.js`),
      table: require(`${LWC}/shoreshListImport/table.js`),
      terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
      screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
      remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
      patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
      choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
      flow: require(`${LWC}/shoreshImport/flow.js`),
      summary: require(`${LWC}/shoreshImport/summary.js`),
      fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
    });
  const setup = {
    season: { Id: "a00000000000001AAA", Name: "Summer 2026" },
    weeks: [],
    weekExceptions: [],
    locationTypes: [],
    locations: [],
    activities: [],
    programs: [],
    schedules: [],
    labels: []
  };
  const body = JSON.stringify({
    season: "Summer 2026",
    setup,
    answers: [],
    seen: "s1"
  });
  const send = async (input) => {
    const sent = [];
    const done = await callAs("import_last_year", input, {
      camp: async () => ({ namespace: "", version: null }),
      run: async (args, stdin) => {
        sent.push({ args, stdin });
        return `HTTP/1.1 200\n\n${body}`;
      },
      imports
    });
    return { done, sent };
  };

  it("API-1.160: a PDF named by where it is is reviewed as the screen reviews the same table, with what it doesn't make plain said", async () => {
    const camp = (() => {
      for (let seed = 1; ; seed++) {
        const c = ordinaryCamp(seed);
        if (c.layout === "byGroup") return c;
      }
    })();
    const sheets = pagesOf(camp).flatMap((f) => f.sheets);
    const file = await printed("camp.pdf", sheets, {
      // Each group's last time on Monday covered in black, words and all.
      extra: (page, { x, y }) => {
        const last = sheets[0].rows.length - 1;
        page.drawRectangle({
          x: x(1),
          y: y(last + 1),
          width: x(2) - x(1),
          height: ROW,
          color: rgb(0, 0, 0)
        });
      }
    });
    const { done } = await send({
      season: "Summer 2026",
      files: [{ file_name: "camp.pdf", pdf_path: file }]
    });
    expect(done.ok).toBe(true);
    expect(done.text).toMatch(/File camp\.pdf: \d+ pages, read as By group/);
    expect(done.text).toMatch(/Not plain from the PDF: camp\.pdf: Page \d+, /);
    // The same table sent as sheets is reviewed the same, but for what the PDF said.
    const asSheets = await send({
      season: "Summer 2026",
      files: [
        {
          file_name: "camp.pdf",
          sheets: (await read(file)).file.sheets
        }
      ]
    });
    expect(done.text.split("\nNot plain from the PDF")[0]).toBe(
      asSheets.done.text
    );
  });

  it("API-1.160: a PDF that can't be read is refused in the screens' words, and nothing is sent to be saved", async () => {
    const { done, sent } = await send({
      season: "Summer 2026",
      files: [{ file_name: "gone.pdf", pdf_path: path.join(DIR, "gone.pdf") }],
      save: true,
      seen: "s1"
    });
    expect(done).toMatchObject({ ok: false });
    expect(done.text).toMatch(
      /^There's no file named gone\.pdf where it was said to be\. Nothing was imported\./
    );
    expect(sent).toHaveLength(1);
  });
});
