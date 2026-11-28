/**
 * The Shoresh skill (API-1.163) served over MCP's Skills extension, io.modelcontextprotocol/skills
 * (API-1.164): skills/list, skills/get, and its files through resources/read at
 * skill://shoresh-camp-scheduling/<path>. Read from the files shipped: connect/skill/<name>/ in the
 * repo, or their flat copies, skill.<path with "/" as ".">, in the ShoreshConnect static resource
 * (scripts/build-connect.js).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCHEME = "skill://";

/**
 * Every skill file shipped beside the connector, as [skill name, path in the skill, file on disk],
 * sorted, so the same files always give the same answer.
 */
function shippedFiles(dir = __dirname) {
  const folder = path.join(dir, "skill");
  const found = [];
  if (fs.existsSync(folder)) {
    const walk = (at) => {
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        const full = path.join(at, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".md")) {
          // Only the skill's markdown: no .DS_Store or other stray file is served.
          const [name, ...rest] = path.relative(folder, full).split(path.sep);
          found.push([name, rest.join("/"), full]);
        }
      }
    };
    walk(folder);
  } else {
    // Flat: every dot but the extension's was a "/" (each name and folder in a skill has no dot).
    for (const f of fs.readdirSync(dir)) {
      const m = /^skill\.([^.]+)\.(.+)\.([^.]+)$/.exec(f);
      if (m) {
        found.push([
          m[1],
          `${m[2].split(".").join("/")}.${m[3]}`,
          path.join(dir, f)
        ]);
      }
    }
  }
  return found.sort(([a, x], [b, y]) =>
    a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1
  );
}

/**
 * SKILL.md's YAML header as an object, unchanged. Only what the skill's header uses: `key: value`
 * and folded `key: >-` blocks. Anything else throws (skillsOverMcp.test.js checks the shipped header
 * against a full YAML reader).
 */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error("SKILL.md has no header");
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const field = /^([a-z][a-z0-9-]*):(?: (.*))?$/.exec(lines[i]);
    if (!field) throw new Error(`SKILL.md header line not read: ${lines[i]}`);
    const [, key, value = ""] = field;
    if (value === ">-") {
      const folded = [];
      while (i + 1 < lines.length && /^ {2}\S/.test(lines[i + 1])) {
        folded.push(lines[++i].trim());
      }
      out[key] = folded.join(" ");
    } else if (value && !/^["'|>&*!%@`{[#-]/.test(value) && !/ #/.test(value)) {
      out[key] = value.trim();
    } else {
      throw new Error(`SKILL.md header value not read: ${key}`);
    }
  }
  return out;
}

const uriOf = (name, file) => `${SCHEME}${name}/${file}`;

/** Each skill's entry as skills/list gives it: SKILL.md's URI, its header, every file's digest. */
function skills(dir = __dirname) {
  const files = shippedFiles(dir);
  const names = [...new Set(files.map(([name]) => name))];
  return names
    .filter((name) => files.some(([n, f]) => n === name && f === "SKILL.md"))
    .map((name) => {
      const own = files.filter(([n]) => n === name);
      const bytes = (full) => fs.readFileSync(full);
      return {
        uri: uriOf(name, "SKILL.md"),
        frontmatter: frontmatter(
          bytes(own.find(([, f]) => f === "SKILL.md")[2]).toString("utf8")
        ),
        resources: own.map(([, f, full]) => {
          const raw = bytes(full);
          return {
            uri: uriOf(name, f),
            digest: `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`,
            size: raw.length
          };
        })
      };
    });
}

/** The entry for one SKILL.md URI, or null when no skill is served there. */
function skill(uri, dir = __dirname) {
  return skills(dir).find((s) => s.uri === uri) ?? null;
}

/** One skill file as resources/read gives it, or null when it isn't one the connector serves. */
function readSkillFile(uri, dir = __dirname) {
  const file = shippedFiles(dir).find(([n, f]) => uriOf(n, f) === uri);
  if (!file) return null;
  return {
    uri,
    mimeType: file[1].endsWith(".md") ? "text/markdown" : "text/plain",
    text: fs.readFileSync(file[2], "utf8")
  };
}

/**
 * The skill's golden rules (API-1.165): SKILL.md's text between its golden-rules markers, which
 * the connector sends every AI as its startup `instructions`. Null when the skill or a marker is
 * missing, so the connector still starts.
 */
const GOLDEN_RULES =
  /<!-- golden-rules:start[^>]*-->\r?\n([\s\S]*?)\r?\n<!-- golden-rules:end -->/;

function goldenRules(dir = __dirname) {
  const file = readSkillFile(uriOf("shoresh-camp-scheduling", "SKILL.md"), dir);
  const m = file && GOLDEN_RULES.exec(file.text);
  return m ? m[1].trim() : null;
}

module.exports = {
  SCHEME,
  goldenRules,
  shippedFiles,
  frontmatter,
  skills,
  skill,
  readSkillFile
};
