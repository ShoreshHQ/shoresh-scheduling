/**
 * A schedule PDF's pages as pdf.js draws them, read in a process of its own (connect/pdf.js starts
 * it, so a broken or huge PDF never takes the connector down, and the same code runs under Jest).
 * It writes JSON to stdout: pdf.js's numbering of its drawing operations (OPS), the page count, and
 * each page's size and drawing operations as plain data. What they mean is worked out by the import
 * engine's own module, the one the screen uses (shoreshImportEngine/pdfSheets.js). INGEST-1.11.
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

/** An operation's arguments as JSON keeps them: lists for typed arrays, a character's own fields. */
function plain(value) {
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    if ("unicode" in value || "fontChar" in value) {
      return {
        unicode: value.unicode,
        width: value.width,
        isSpace: Boolean(value.isSpace)
      };
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)])
    );
  }
  return value;
}

async function main() {
  const [file, most] = process.argv.slice(2);
  // stdout carries only the JSON: pdf.js says what it lacks (an optional canvas package the
  // connector doesn't ship, an older Node) on the console's log, before any of its own settings apply.
  for (const say of ["log", "info", "warn", "debug"]) {
    console[say] = (...args) => process.stderr.write(`${args.join(" ")}\n`);
  }
  const pdfjs = await import(
    pathToFileURL(pdfjsFile("engine.pdfjs.mjs", "pdf.min.mjs")).href
  );
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    pdfjsFile("engine.pdfjs.worker.mjs", "pdf.worker.min.mjs")
  ).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0
  }).promise;
  const out = { OPS: pdfjs.OPS, pageCount: doc.numPages, pages: [] };
  if (doc.numPages <= Number(most)) {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const ops = await page.getOperatorList();
      out.pages.push({
        view: Array.from(page.view),
        transform: Array.from(page.getViewport({ scale: 1 }).transform),
        fnArray: Array.from(ops.fnArray),
        argsArray: ops.argsArray.map(plain)
      });
    }
  }
  process.stdout.write(JSON.stringify(out));
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(String((e && e.message) || e));
    process.exitCode = 1;
  });
}

module.exports = { pdfjsFile };
