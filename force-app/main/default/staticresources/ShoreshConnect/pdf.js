/**
 * A schedule PDF, read as the sheets Import last year reads (INGEST-1.11, ADR 0032): each page's
 * drawn table becomes a sheet in the page's own layout, its merged boxes as merged cells, so the
 * import reads it exactly as it reads the same table saved from Excel. Nothing is guessed: a box
 * the page doesn't make plain (filled in with no words that can be seen, words hidden in its own
 * colour, a box that doesn't line up with the times beside it) is left empty or placed by what it
 * mostly covers, and said in `unclear` for the person to see. connect/pdfPages.js reads what the
 * page draws, in a process of its own.
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const READ_FOR = 120000;

/** What connect/pdfPages.js gives for a file, or why it couldn't. */
function pagesOf(file, most) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.join(__dirname, "pdfPages.js"), file, String(most)],
      { maxBuffer: 256 * 1024 * 1024, timeout: READ_FOR, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/** Positions a point or two apart are one edge. */
function snap(values, tolerance = 2) {
  const out = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (!out.length || v - out[out.length - 1] > tolerance) out.push(v);
  }
  return out;
}

/** How much of a cell's edge, from lo to hi, a border is drawn along. */
function drawnAlong(segments, lo, hi) {
  let covered = 0;
  let at = lo;
  for (const [a, b] of segments.slice().sort((p, q) => p[0] - q[0])) {
    const from = Math.max(a, at);
    const to = Math.min(b, hi);
    if (to > from) {
      covered += to - from;
      at = to;
    }
  }
  return hi > lo ? covered / (hi - lo) : 1;
}

/** Characters as words and lines, in the direction they run. */
function textOf(glyphs) {
  if (!glyphs.length) return "";
  const dir = glyphs[0].dir;
  const along = (p) => p[0] * dir[0] + p[1] * dir[1];
  const across = (c) => c.x * -dir[1] + c.y * dir[0];
  const size = Math.max(...glyphs.map((c) => c.size)) || 10;
  const sorted = glyphs.slice().sort((a, b) => across(a) - across(b));
  const lines = [];
  for (const c of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(across(c) - line.at) < size * 0.5) line.glyphs.push(c);
    else lines.push({ at: across(c), glyphs: [c] });
  }
  return lines
    .map((line) => {
      const row = line.glyphs.sort((a, b) => along(a.start) - along(b.start));
      let text = "";
      row.forEach((c, i) => {
        if (i && along(c.start) - along(row[i - 1].end) > c.size * 0.2)
          text += " ";
        text += c.text;
      });
      return text.replace(/\s+/g, " ").trim();
    })
    .filter((t) => t)
    .join("\n");
}

const dark = (color) =>
  0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2] < 80;

/** One page's table as a sheet: { rows, merges, unclear } or { problem }. */
function sheetOf(page, pageNumber) {
  const visible = page.glyphs.filter((c) => c.seen);
  const across = page.lines.filter((l) => l.y1 - l.y0 < 0.5 && l.x1 - l.x0 > 2);
  const down = page.lines.filter((l) => l.x1 - l.x0 < 0.5 && l.y1 - l.y0 > 2);
  if (!visible.length && page.pictures) return { problem: "scanned" };
  if (!across.length || !down.length) return { problem: "no table" };
  const xs = snap(down.map((l) => l.x0));
  const ys = snap(across.map((l) => l.y0));
  if (xs.length < 2 || ys.length < 2) return { problem: "no table" };
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const at = (r, c) => r * cols + c;
  const parent = Array.from({ length: rows * cols }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => {
    parent[find(a)] = find(b);
  };
  const tol = 1.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // No border drawn between two cells: one box (a merged cell).
      if (c + 1 < cols) {
        const segs = down
          .filter((l) => Math.abs(l.x0 - xs[c + 1]) <= tol)
          .map((l) => [l.y0, l.y1]);
        if (drawnAlong(segs, ys[r], ys[r + 1]) < 0.5)
          join(at(r, c), at(r, c + 1));
      }
      if (r + 1 < rows) {
        const segs = across
          .filter((l) => Math.abs(l.y0 - ys[r + 1]) <= tol)
          .map((l) => [l.x0, l.x1]);
        if (drawnAlong(segs, xs[c], xs[c + 1]) < 0.5)
          join(at(r, c), at(r + 1, c));
      }
    }
  }
  const groups = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = find(at(r, c));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push([r, c]);
    }
  }
  // A box that isn't a rectangle is its cells, each on its own.
  const boxes = [];
  for (const cells of groups.values()) {
    const r0 = Math.min(...cells.map((x) => x[0]));
    const r1 = Math.max(...cells.map((x) => x[0])) + 1;
    const c0 = Math.min(...cells.map((x) => x[1]));
    const c1 = Math.max(...cells.map((x) => x[1])) + 1;
    if ((r1 - r0) * (c1 - c0) === cells.length) boxes.push({ r0, r1, c0, c1 });
    else
      cells.forEach(([r, c]) =>
        boxes.push({ r0: r, r1: r + 1, c0: c, c1: c + 1 })
      );
  }
  const inBox = (b, c) =>
    c.x >= xs[b.c0] && c.x <= xs[b.c1] && c.y >= ys[b.r0] && c.y <= ys[b.r1];
  for (const b of boxes) {
    b.text = textOf(visible.filter((c) => inBox(b, c)));
    b.hidden = page.glyphs.some((c) => !c.seen && inBox(b, c));
    const mid = [(xs[b.c0] + xs[b.c1]) / 2, (ys[b.r0] + ys[b.r1]) / 2];
    const ground = page.fills
      .filter(
        (f) =>
          mid[0] >= f.x0 && mid[0] <= f.x1 && mid[1] >= f.y0 && mid[1] <= f.y1
      )
      .pop();
    b.dark = Boolean(ground && dark(ground.color));
  }
  // The table's rows are the boxes down its first column (the times), each one row of the sheet;
  // a box finer than them is placed in the rows it covers by more than half.
  const bands = boxes
    .filter((b) => b.c0 === 0)
    .sort((a, b) => a.r0 - b.r0)
    .map((b) => ({
      y0: ys[b.r0],
      y1: ys[b.r1],
      label: b.text.replace(/\n/g, " ")
    }));
  const header = (c) => {
    const head = boxes
      .filter((b) => b.c0 === c && b.c1 === c + 1 && b.text && b.r0 < rows)
      .sort((a, b) => a.r0 - b.r0)[0];
    return head ? head.text.replace(/\n/g, " ") : `column ${c + 1}`;
  };
  const grid = bands.map(() => Array(cols).fill(""));
  const taken = bands.map(() => Array(cols).fill(false));
  const merges = [];
  const unclear = [];
  const say = (band, c, why) =>
    unclear.push(
      `Page ${pageNumber}, ${bands[band].label || `row ${band + 1}`}, ${header(c)}: ${why}`
    );
  for (const b of boxes.sort((p, q) => p.r0 - q.r0 || p.c0 - q.c0)) {
    const y0 = ys[b.r0];
    const y1 = ys[b.r1];
    const share = bands.map(
      (band) =>
        Math.max(0, Math.min(y1, band.y1) - Math.max(y0, band.y0)) /
        (band.y1 - band.y0)
    );
    let covered = share.map((s, i) => (s > 0.5 ? i : -1)).filter((i) => i >= 0);
    // Its top or bottom edge falls inside a time rather than on one's edge.
    const onEdge = (v) =>
      bands.some(
        (band) => Math.abs(band.y0 - v) < 2 || Math.abs(band.y1 - v) < 2
      );
    const partly = !onEdge(y0) || !onEdge(y1);
    if (!covered.length) covered = [share.indexOf(Math.max(...share))];
    const top = covered[0];
    const bottom = covered[covered.length - 1];
    if (b.c0 > 0 && partly && b.text) {
      say(
        top,
        b.c0,
        `this box starts or ends partway through a time in the PDF; it is placed in the ${covered.length === 1 ? "time" : "times"} it mostly covers`
      );
    }
    if (b.hidden) {
      say(top, b.c0, "words hidden in the box's own colour were left out");
    } else if (b.dark && !b.text && b.c0 > 0) {
      say(top, b.c0, "filled in with no words; left empty");
    }
    if (!b.text) continue;
    const clash = [];
    for (let r = top; r <= bottom; r++) {
      for (let c = b.c0; c < b.c1; c++) if (taken[r][c]) clash.push(r);
    }
    if (clash.length) {
      grid[top][b.c0] = grid[top][b.c0]
        ? `${grid[top][b.c0]}\n${b.text}`
        : b.text;
      say(
        top,
        b.c0,
        "two boxes in the PDF fall in this one place; both are kept here"
      );
      continue;
    }
    grid[top][b.c0] = b.text;
    for (let r = top; r <= bottom; r++) {
      for (let c = b.c0; c < b.c1; c++) taken[r][c] = true;
    }
    if (bottom > top || b.c1 - b.c0 > 1) {
      merges.push({ s: { r: top, c: b.c0 }, e: { r: bottom, c: b.c1 - 1 } });
    }
  }
  // Lines above the table (a title, the group's name) come first, each a row of its own.
  const above = visible.filter((c) => c.y < ys[0]);
  const title = textOf(above)
    .split("\n")
    .filter((t) => t);
  return {
    rows: [...title.map((t) => [t]), ...grid],
    merges: merges.map((m) => ({
      s: { r: m.s.r + title.length, c: m.s.c },
      e: { r: m.e.r + title.length, c: m.e.c }
    })),
    unclear
  };
}

/**
 * A PDF the person's AI names by its place on their computer, as the file Import last year reads:
 * { file: { file_name, sheets }, unclear } or { problem } in the screens' words. m is the import
 * engine (its size limit, INGEST-1.1, before any of the file is read; its sheet limit, INGEST-1.2).
 */
async function pdfFile(given, m) {
  const name =
    String(given.file_name || "").trim() ||
    path.basename(String(given.pdf_path));
  const file = String(given.pdf_path || "").trim();
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { problem: `There's no file at ${file}. Nothing was imported.` };
  }
  if (!stat.isFile())
    return { problem: `${file} is a folder, not a PDF. Nothing was imported.` };
  try {
    m.checkFileSize(stat.size);
  } catch (e) {
    return { problem: m.refusedFile(e) || e.message };
  }
  const head = Buffer.alloc(5);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, 5, 0);
  } finally {
    fs.closeSync(fd);
  }
  const notRead = `Shoresh couldn't read ${name} as a PDF. Nothing was imported.`;
  if (head.toString("latin1") !== "%PDF-") return { problem: notRead };
  const read = await pagesOf(file, m.IMPORT_LIMITS.maxSheets);
  if (!read) return { problem: notRead };
  try {
    m.checkSheets(Array(read.pageCount).fill(0));
  } catch (e) {
    return { problem: m.refusedFile(e) || e.message };
  }
  const sheets = [];
  const unclear = [];
  const scanned = [];
  const noTable = [];
  read.pages.forEach((page, i) => {
    const n = i + 1;
    const sheet = sheetOf(page, n);
    if (sheet.problem === "scanned") return scanned.push(n);
    if (sheet.problem) return noTable.push(n);
    sheets.push({ name: `Page ${n}`, rows: sheet.rows, merges: sheet.merges });
    unclear.push(...sheet.unclear);
  });
  const pages = (list) =>
    `${list.length === 1 ? "Page" : "Pages"} ${list.join(", ")}`;
  if (scanned.length) {
    unclear.push(
      `${pages(scanned)}: a picture of a schedule (scanned), not text; Shoresh can't read ${scanned.length === 1 ? "it" : "them"}, so ${scanned.length === 1 ? "it was" : "they were"} left out.`
    );
  }
  if (noTable.length) {
    unclear.push(
      `${pages(noTable)}: no table drawn with lines; Shoresh can't read ${noTable.length === 1 ? "it" : "them"}, so ${noTable.length === 1 ? "it was" : "they were"} left out.`
    );
  }
  if (!sheets.length) {
    return {
      problem: scanned.length
        ? `${name} is a picture of a schedule (scanned), not text; Shoresh can't read it. Nothing was imported.`
        : `${name} has no schedule table Shoresh can read. Nothing was imported.`
    };
  }
  return { file: { file_name: name, sheets }, unclear };
}

module.exports = { pdfFile, sheetOf, textOf };
