/**
 * A PDF the person's AI names by its place on their computer, read as the file Import last year
 * reads (INGEST-1.11, ADR 0032). This file only finds and checks the file and runs pdf.js on it
 * (connect/pdfPages.js, in a process of its own); the import engine's own module, the one the
 * screen uses, turns each page into a sheet and says what the page doesn't make plain.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const READ_FOR = 120000;

// The reading process may use this much memory, at most (the computer may be busy with more).
const MEMORY_MB = 768;

/**
 * What connect/pdfPages.js gives for a file: { drawn }, or { why } it couldn't ("slow": it took
 * too long; "password": the PDF is locked; "unread": anything else).
 */
function drawnPages(file, most) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        `--max-old-space-size=${MEMORY_MB}`,
        path.join(__dirname, "pdfPages.js"),
        file,
        String(most)
      ],
      { maxBuffer: 256 * 1024 * 1024, timeout: READ_FOR, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) return resolve({ why: "slow" });
          if (/password/i.test(String(stderr)))
            return resolve({ why: "password" });
          return resolve({ why: "unread" });
        }
        try {
          return resolve({ drawn: JSON.parse(stdout) });
        } catch {
          return resolve({ why: "unread" });
        }
      }
    );
  });
}

/**
 * { file: { file_name, sheets }, unclear } or { problem } in the screens' words. m is the import
 * engine: its size limit (INGEST-1.1) before any of the file is read, its sheet limit (INGEST-1.2)
 * on the page count, and its reading of the pages.
 */
async function pdfFile(given, m) {
  // "~/Downloads/camp.pdf" as a person writes it, the home folder spelled out.
  const file = String(given.pdf_path || "")
    .trim()
    .replace(/^~(?=$|[\\/])/, os.homedir());
  const name = String(given.file_name || "").trim() || path.basename(file);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return {
      problem: `There's no file named ${name} where it was said to be. Nothing was imported.`
    };
  }
  if (!stat.isFile()) {
    return { problem: `${name} is a folder, not a PDF. Nothing was imported.` };
  }
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
  const { drawn, why } = await drawnPages(file, m.IMPORT_LIMITS.maxSheets);
  if (why === "slow") {
    return {
      problem: `Reading ${name} took too long (over 2 minutes), so Shoresh stopped. Nothing was imported.`
    };
  }
  if (why === "password") {
    return {
      problem: `${name} is locked with a password, so Shoresh can't read it. Nothing was imported.`
    };
  }
  if (!drawn) return { problem: notRead };
  try {
    m.checkSheets(Array(drawn.pageCount).fill(0));
  } catch (e) {
    return { problem: m.refusedFile(e) || e.message };
  }
  const read = m.sheetsFromPdf(drawn.pages, drawn.OPS, name);
  if (read.problem) return { problem: read.problem };
  return {
    file: { file_name: name, sheets: read.sheets },
    unclear: read.unclear
  };
}

module.exports = { pdfFile };
