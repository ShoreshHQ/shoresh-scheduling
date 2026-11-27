/**
 * What a schedule PDF draws, page by page, read with pdf.js in a process of its own (connect/pdf.js
 * starts it, so a broken or huge PDF never takes the connector down, and the same code runs under
 * Jest). It writes JSON to stdout: for each page its size, the lines drawn (borders), the boxes
 * filled with a colour, each character it shows with where and in which direction, whether it can
 * be seen (not the colour of what it sits on), and how many pictures it holds. INGEST-1.11.
 *
 * node pdfPages.js <file.pdf> <most pages>
 */
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

/** pdf.js as the connector ships it (scripts/build-connect.js), or the repo's own copy. */
function pdfjsFile(flat, packaged) {
  const shipped = path.join(__dirname, flat);
  return fs.existsSync(shipped)
    ? shipped
    : require.resolve(`pdfjs-dist/legacy/build/${packaged}`);
}

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

/** One page: borders, filled boxes, characters, pictures. */
async function pageOf(pdfjs, page) {
  const OPS = pdfjs.OPS;
  const [vx0, vy0, vx1, vy1] = page.view;
  const height = vy1 - vy0;
  // Page coordinates from the top left, as a person reads the page.
  const onPage = ([x, y]) => [x - vx0, height - (y - vy0)];
  const ops = await page.getOperatorList();
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
            const [x, y, w, h] = coords.slice(k, k + 4);
            sub = [
              [x, y],
              [x + w, y],
              [x + w, y + h],
              [x, y + h],
              [x, y]
            ].map(([px, py]) => onPage(apply(g.ctm, px, py)));
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

async function main() {
  const [file, most] = process.argv.slice(2);
  const pdfjs = await import(
    pathToFileURL(pdfjsFile("engine.pdfjs.mjs", "pdf.min.mjs")).href
  );
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    pdfjsFile("engine.pdfjs.worker.mjs", "pdf.worker.min.mjs")
  ).href;
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0
  }).promise;
  if (doc.numPages > Number(most)) {
    process.stdout.write(
      JSON.stringify({ pageCount: doc.numPages, pages: [] })
    );
    return;
  }
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    pages.push(await pageOf(pdfjs, await doc.getPage(n)));
  }
  process.stdout.write(JSON.stringify({ pageCount: doc.numPages, pages }));
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(String((e && e.message) || e));
    process.exitCode = 1;
  });
}

module.exports = { pdfjsFile };
