/**
 * A schedule PDF as the sheets Import last year reads (INGEST-1.11, ADR 0032): each page's drawn
 * table a sheet in the page's own layout, its merged boxes merged cells, so the import reads it as
 * the same table saved from Excel. Nothing is guessed: what a page doesn't make plain (a box filled
 * in with no words that can be seen, words hidden in a box's colour or under a box drawn over them,
 * a box that doesn't line up with the times beside it, a scanned page) is left empty, or placed by
 * what it mostly covers, and said in `unclear` for the person to see.
 *
 * Plain JavaScript with nothing to import, run by the screen and by the connector alike: whoever
 * has the file runs pdf.js on it and hands over each page's drawing operations.
 */

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** m1, then m2. */
function times(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5]
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function rgb(args) {
  const a = Array.from({ length: 3 }, (_, i) => Number(args[i]));
  return a.every((v) => Number.isFinite(v)) ? a : [0, 0, 0];
}

/**
 * What one page draws, from pdf.js's list of its drawing operations ({ view, fnArray, argsArray },
 * as page.getOperatorList() gives them, with page.view; OPS is pdf.js's own numbering of them):
 * its borders, the boxes filled with a colour, each character it shows with where, in which
 * direction and whether it can be seen (not the colour of what it sits on, nor covered by a box
 * drawn over it), and how many pictures it holds.
 */
export function drawingOf(page, OPS) {
  const [vx0, vy0, vx1, vy1] = page.view;
  const height = vy1 - vy0;
  // Page coordinates from the top left, as a person reads the page: by pdf.js's own viewport,
  // turned as the page says it is turned (a landscape page is often a turned portrait one).
  const view = page.transform || [1, 0, 0, -1, -vx0, vy1];
  const onPage = ([x, y]) => apply(view, x, y);
  const ops = page;
  const lines = [];
  const fills = [];
  const glyphs = [];
  let pictures = 0;
  let g = {
    ctm: IDENTITY,
    fill: [0, 0, 0],
    stroke: [0, 0, 0],
    font: 0,
    charSpacing: 0,
    wordSpacing: 0,
    hScale: 1,
    leading: 0,
    rise: 0,
    render: 0
  };
  const stack = [];
  let tm = IDENTITY;
  let tlm = IDENTITY;
  let path = [];

  /** What the page shows under a point, as the last box filled there before now. */
  const under = (x, y) => {
    for (let i = fills.length - 1; i >= 0; i--) {
      const f = fills[i];
      if (x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1) return f.color;
    }
    return [255, 255, 255];
  };
  const box = (points) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return {
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys)
    };
  };
  const filled = () => {
    for (const sub of path) {
      if (sub.length < 3) continue;
      const b = box(sub);
      // A filled box a few points thin is a border drawn as a fill.
      if (b.x1 - b.x0 <= 2.5 && b.y1 - b.y0 > 2.5) {
        lines.push({
          x0: (b.x0 + b.x1) / 2,
          y0: b.y0,
          x1: (b.x0 + b.x1) / 2,
          y1: b.y1
        });
      } else if (b.y1 - b.y0 <= 2.5 && b.x1 - b.x0 > 2.5) {
        lines.push({
          x0: b.x0,
          y0: (b.y0 + b.y1) / 2,
          x1: b.x1,
          y1: (b.y0 + b.y1) / 2
        });
      } else {
        fills.push({
          ...b,
          color: g.fill,
          order: fills.length + glyphs.length
        });
      }
    }
  };
  const stroked = () => {
    for (const sub of path) {
      for (let i = 1; i < sub.length; i++) {
        const [a, b] = [sub[i - 1], sub[i]];
        if (Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5) {
          lines.push({
            x0: Math.min(a[0], b[0]),
            y0: Math.min(a[1], b[1]),
            x1: Math.max(a[0], b[0]),
            y1: Math.max(a[1], b[1])
          });
        }
      }
    }
  };
  const moveText = (tx, ty) => {
    tlm = times([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i] || [];
    switch (fn) {
      case OPS.save:
        stack.push({ ...g });
        break;
      case OPS.restore:
        if (stack.length) g = stack.pop();
        break;
      // A drawing kept apart and placed on the page (a form): its own matrix, then back.
      case OPS.paintFormXObjectBegin:
        stack.push({ ...g });
        if (Array.isArray(args[0]) && args[0].length === 6) {
          g.ctm = times(args[0], g.ctm);
        }
        break;
      case OPS.paintFormXObjectEnd:
        if (stack.length) g = stack.pop();
        break;
      case OPS.transform:
        g.ctm = times(args, g.ctm);
        break;
      case OPS.setFillRGBColor:
        g.fill = rgb(args);
        break;
      case OPS.setStrokeRGBColor:
        g.stroke = rgb(args);
        break;
      case OPS.constructPath: {
        const [codes, coords] = args;
        let k = 0;
        let sub = null;
        for (const code of codes) {
          if (code === OPS.moveTo) {
            sub = [onPage(apply(g.ctm, coords[k], coords[k + 1]))];
            path.push(sub);
            k += 2;
          } else if (code === OPS.lineTo) {
            if (!sub) path.push((sub = []));
            sub.push(onPage(apply(g.ctm, coords[k], coords[k + 1])));
            k += 2;
          } else if (code === OPS.rectangle) {
            const ctm = g.ctm;
            const [x, y, w, h] = coords.slice(k, k + 4);
            sub = [
              [x, y],
              [x + w, y],
              [x + w, y + h],
              [x, y + h],
              [x, y]
            ].map(([px, py]) => onPage(apply(ctm, px, py)));
            path.push(sub);
            k += 4;
          } else if (code === OPS.curveTo) {
            k += 6;
          } else if (code === OPS.curveTo2 || code === OPS.curveTo3) {
            k += 4;
          } else if (code === OPS.closePath && sub && sub.length) {
            sub.push(sub[0]);
          }
        }
        break;
      }
      case OPS.fill:
      case OPS.eoFill:
        filled();
        path = [];
        break;
      case OPS.stroke:
      case OPS.closeStroke:
        stroked();
        path = [];
        break;
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        filled();
        stroked();
        path = [];
        break;
      case OPS.endPath:
        path = [];
        break;
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintJpegXObject:
        pictures += 1;
        break;
      case OPS.beginText:
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case OPS.setFont:
        g.font = Number(args[1]) || 0;
        break;
      case OPS.setTextMatrix:
        tm = args.slice(0, 6);
        tlm = tm;
        break;
      case OPS.moveText:
        moveText(args[0], args[1]);
        break;
      case OPS.setLeadingMoveText:
        g.leading = -args[1];
        moveText(args[0], args[1]);
        break;
      case OPS.nextLine:
        moveText(0, -g.leading);
        break;
      case OPS.setLeading:
        g.leading = args[0];
        break;
      case OPS.setCharSpacing:
        g.charSpacing = args[0];
        break;
      case OPS.setWordSpacing:
        g.wordSpacing = args[0];
        break;
      case OPS.setHScale:
        g.hScale = args[0] / 100;
        break;
      case OPS.setTextRise:
        g.rise = args[0];
        break;
      case OPS.setTextRenderingMode:
        g.render = args[0];
        break;
      case OPS.showText:
      case OPS.showSpacedText: {
        const size = g.font;
        for (const glyph of args[0] || []) {
          if (typeof glyph === "number") {
            tm = times([1, 0, 0, 1, (-glyph / 1000) * size * g.hScale, 0], tm);
            continue;
          }
          if (!glyph) continue;
          const width = ((glyph.width || 0) / 1000) * size;
          const trm = times(times([g.hScale, 0, 0, 1, 0, g.rise], tm), g.ctm);
          const start = onPage(apply(trm, 0, 0));
          const end = onPage(apply(trm, width / g.hScale, 0));
          const centre = onPage(apply(trm, width / g.hScale / 2, size * 0.3));
          const text = glyph.unicode || "";
          if (text.trim()) {
            const shown = g.render === 3 ? null : g.fill;
            const ground = under(centre[0], centre[1]);
            const seen =
              shown !== null &&
              Math.max(...shown.map((v, j) => Math.abs(v - ground[j]))) >= 40;
            const length =
              Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
            glyphs.push({
              order: fills.length + glyphs.length,
              text,
              x: centre[0],
              y: centre[1],
              start,
              end,
              dir: [(end[0] - start[0]) / length, (end[1] - start[1]) / length],
              size: Math.abs(size) * Math.hypot(trm[2], trm[3]),
              seen
            });
          }
          const advance =
            (width + g.charSpacing + (glyph.isSpace ? g.wordSpacing : 0)) *
            g.hScale;
          tm = times([1, 0, 0, 1, advance, 0], tm);
        }
        break;
      }
      default:
        break;
    }
  }
  // A box filled over words after they were drawn hides them too.
  for (const c of glyphs) {
    if (
      c.seen &&
      fills.some(
        (f) =>
          f.order > c.order &&
          c.x >= f.x0 &&
          c.x <= f.x1 &&
          c.y >= f.y0 &&
          c.y <= f.y1
      )
    ) {
      c.seen = false;
    }
  }
  const round = (v) => Math.round(v * 100) / 100;
  return {
    width: round(vx1 - vx0),
    height: round(height),
    lines: lines.map((l) => ({
      x0: round(l.x0),
      y0: round(l.y0),
      x1: round(l.x1),
      y1: round(l.y1)
    })),
    fills: fills.map((f) => ({
      x0: round(f.x0),
      y0: round(f.y0),
      x1: round(f.x1),
      y1: round(f.y1),
      color: f.color
    })),
    glyphs: glyphs.map((c) => ({
      text: c.text,
      x: round(c.x),
      y: round(c.y),
      start: c.start.map(round),
      end: c.end.map(round),
      dir: c.dir.map((v) => Math.round(v * 1000) / 1000),
      size: round(c.size),
      seen: c.seen
    })),
    pictures
  };
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

const RIGHT_TO_LEFT = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

/**
 * Characters laid out left to right on the page, in the order they are read: a run of Hebrew (or
 * other right-to-left) letters, and the spaces between them, is read from its right end.
 */
function inReadingOrder(chars) {
  const out = [];
  let run = [];
  const flush = () => {
    let trailing = 0;
    while (trailing < run.length && run[run.length - 1 - trailing] === " ") {
      trailing += 1;
    }
    out.push(...run.slice(0, run.length - trailing).reverse());
    out.push(...run.slice(run.length - trailing));
    run = [];
  };
  for (const ch of chars) {
    if (RIGHT_TO_LEFT.test(ch) || (ch === " " && run.length)) run.push(ch);
    else {
      flush();
      out.push(ch);
    }
  }
  flush();
  return out;
}

/** Characters as words and lines, in the direction they run. */
export function textOf(glyphs) {
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
      const chars = [];
      row.forEach((c, i) => {
        if (i && along(c.start) - along(row[i - 1].end) > c.size * 0.2)
          chars.push(" ");
        chars.push(...c.text);
      });
      return inReadingOrder(chars).join("").replace(/\s+/g, " ").trim();
    })
    .filter((t) => t)
    .join("\n");
}

/**
 * The table's own lines: the largest set of lines that touch one another. A frame round the page,
 * a rule under the title or a second, smaller table is not part of it.
 */
function tableLines(lines) {
  const across = lines.filter((l) => l.y1 - l.y0 < 0.5 && l.x1 - l.x0 > 2);
  const down = lines.filter((l) => l.x1 - l.x0 < 0.5 && l.y1 - l.y0 > 2);
  const all = [...across, ...down];
  const parent = all.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  across.forEach((h, i) => {
    down.forEach((v, j) => {
      if (
        v.x0 >= h.x0 - 2 &&
        v.x0 <= h.x1 + 2 &&
        h.y0 >= v.y0 - 2 &&
        h.y0 <= v.y1 + 2
      ) {
        parent[find(i)] = find(across.length + j);
      }
    });
  });
  const size = new Map();
  all.forEach((_, i) => size.set(find(i), (size.get(find(i)) || 0) + 1));
  let biggest = -1;
  size.forEach((n, k) => {
    if (biggest < 0 || n > size.get(biggest)) biggest = k;
  });
  const kept = (i) => find(i) === biggest;
  return {
    across: across.filter((_, i) => kept(i)),
    down: down.filter((_, j) => kept(across.length + j))
  };
}

const dark = (color) =>
  0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2] < 80;

/** One page's table as a sheet: { rows, merges, unclear } or { problem }. */
export function sheetOf(page, pageNumber) {
  const visible = page.glyphs.filter((c) => c.seen);
  const { across, down } = tableLines(page.lines);
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
  // A border a little off its edge (drawn 1 or 2 points apart) is still that edge's.
  const tol = 2.5;
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
  // A box that isn't a rectangle is its cells, each on its own, and said.
  const boxes = [];
  let notRectangles = 0;
  for (const cells of groups.values()) {
    const r0 = Math.min(...cells.map((x) => x[0]));
    const r1 = Math.max(...cells.map((x) => x[0])) + 1;
    const c0 = Math.min(...cells.map((x) => x[1]));
    const c1 = Math.max(...cells.map((x) => x[1])) + 1;
    if ((r1 - r0) * (c1 - c0) === cells.length) boxes.push({ r0, r1, c0, c1 });
    else {
      notRectangles += 1;
      cells.forEach(([r, c]) =>
        boxes.push({ r0: r, r1: r + 1, c0: c, c1: c + 1 })
      );
    }
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
  // Which box's place (its top left) each spot of the sheet is part of.
  const taken = bands.map(() => Array(cols).fill(null));
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
      for (let c = b.c0; c < b.c1; c++)
        if (taken[r][c]) clash.push(taken[r][c]);
    }
    if (clash.length) {
      const [r, c] = clash[0];
      grid[r][c] = grid[r][c] ? `${grid[r][c]}\n${b.text}` : b.text;
      say(
        top,
        b.c0,
        "two boxes in the PDF fall in this one place; both are kept here"
      );
      continue;
    }
    grid[top][b.c0] = b.text;
    for (let r = top; r <= bottom; r++) {
      for (let c = b.c0; c < b.c1; c++) taken[r][c] = [top, b.c0];
    }
    if (bottom > top || b.c1 - b.c0 > 1) {
      merges.push({ s: { r: top, c: b.c0 }, e: { r: bottom, c: b.c1 - 1 } });
    }
  }
  if (notRectangles) {
    unclear.push(
      `Page ${pageNumber}: ${notRectangles === 1 ? "a box" : `${notRectangles} boxes`} in the PDF ${notRectangles === 1 ? "isn't a rectangle; its words are" : "aren't rectangles; their words are"} kept in the cells they sit in`
    );
  }
  // Lines above the table (a title, the group's name) come first, each a row of its own; lines
  // under it (notes) come after it, as a spreadsheet's notes do. Words beside it are said.
  const lineRows = (glyphs) =>
    textOf(glyphs)
      .split("\n")
      .filter((t) => t)
      .map((t) => [t]);
  const title = lineRows(visible.filter((c) => c.y < ys[0]));
  const notes = lineRows(visible.filter((c) => c.y > ys[ys.length - 1]));
  const beside = textOf(
    visible.filter(
      (c) =>
        c.y >= ys[0] &&
        c.y <= ys[ys.length - 1] &&
        (c.x < xs[0] || c.x > xs[xs.length - 1])
    )
  ).replace(/\n/g, " ");
  if (beside) {
    unclear.push(
      `Page ${pageNumber}: words beside the table were left out: “${beside}”`
    );
  }
  return {
    rows: [...title, ...grid, ...notes],
    merges: merges.map((m) => ({
      s: { r: m.s.r + title.length, c: m.s.c },
      e: { r: m.e.r + title.length, c: m.e.c }
    })),
    unclear
  };
}

/**
 * Every page of a PDF, as drawn ({ view, transform, fnArray, argsArray } each: page.view,
 * page.getViewport({ scale: 1 }).transform and page.getOperatorList(), with pdf.js's OPS), as the
 * file Import last year reads: { sheets, unclear } or { problem }, in the screens' words.
 */
export function sheetsFromPdf(drawnPages, OPS, name) {
  const sheets = [];
  const unclear = [];
  const scanned = [];
  const noTable = [];
  drawnPages.forEach((drawn, i) => {
    const n = i + 1;
    const sheet = sheetOf(drawingOf(drawn, OPS), n);
    if (sheet.problem === "scanned") scanned.push(n);
    else if (sheet.problem) noTable.push(n);
    else {
      sheets.push({
        name: `Page ${n}`,
        rows: sheet.rows,
        merges: sheet.merges
      });
      unclear.push(...sheet.unclear);
    }
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
  return { sheets, unclear };
}
