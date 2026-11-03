#!/usr/bin/env node
/**
 * Shoresh from the command line: the same actions as the MCP server, by the same names
 * (API-1.10), signed in as the person through the sf CLI.
 *
 *   node connect/cli.js read_group_schedule --season "Summer 2026" --week "Week 2" [--csv]
 *   node connect/cli.js bring_in_campers --file campers.json
 *   node connect/cli.js change_schedule_cell --season "Summer 2026" --week "Week 2" --group "Bunk 3"
 *     --day Monday --time "Period 2" --was "Gym games" --activity Soccer
 *   node connect/cli.js undo_last_agent_change --season "Summer 2026" --week "Week 2"
 *   node connect/cli.js build_week --season "Summer 2026" --week "Week 2"   (then publish_week)
 *   node connect/cli.js finalize_electives --season "Summer 2026" --week "Week 2" --elective_set Chugim
 *   node connect/cli.js delete_version --season "Summer 2026" --week "Week 2" --name "Try 2"
 *     (Shoresh asks first: exit 3, nothing done; only after the person says yes, the same
 *     command again with --confirm "<what Shoresh gave>")
 *   (--org <alias> picks a sf CLI sign-in; otherwise SHORESH_ORG, then the sf CLI's default.)
 * The rules: docs/protocol/api.md, Command line (API-1.109 to API-1.113).
 */
const fs = require("fs");
const { CAPABILITIES, byName } = require("./capabilities");
const { call, withSeasonNamed } = require("./client");
const { toolResult } = require("./mcp");

function usage() {
  return [
    "Usage: node connect/cli.js <action> [--<input> <value> ...] [--csv] [--file <records.json>] [--confirm <what Shoresh gave>] [--org <alias>]",
    "",
    ...CAPABILITIES.map(
      (c) =>
        `  ${c.name.padEnd(34)} ${c.description.split(". ")[0].replace(/\.$/, "")}.`
    )
  ].join("\n");
}

// How a value that isn't text is typed (API-1.109): as JSON.
const LIKE = {
  array: '["Bunk 1", "Bunk 2"]',
  boolean: "true",
  object: '{"name": "Pool"}'
};

/** A value typed for a field that isn't text, read as the JSON it must be. */
function typed(field, type, value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = undefined;
  }
  const fits =
    type === "array"
      ? Array.isArray(parsed)
      : type === "object"
        ? parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        : typeof parsed === type;
  if (!fits)
    throw new Error(
      `--${field} needs JSON, like: --${field} '${LIKE[type] ?? value}'`
    );
  return parsed;
}

/** The action's name and input from the words typed (API-1.109). */
function parse(argv, readFile = (f) => fs.readFileSync(f, "utf8")) {
  const [name, ...rest] = argv;
  const capability = byName(name);
  if (!capability) throw new Error(usage());
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i];
    if (word === "--csv") flags.as_csv = true;
    else if (word.startsWith("--")) {
      if (rest[i + 1] === undefined) throw new Error(`${word} needs a value.`);
      flags[word.slice(2)] = rest[++i];
    } else
      throw new Error(
        `"${word}" isn't an input. Name each one, like --season "Summer 2026".`
      );
  }
  const { org, file, ...given } = flags;
  const fields = capability.inputSchema.properties;
  const input = {};
  if (fields.records && !capability.sendsFields) {
    if (!file) throw new Error(`${name} needs --file <records.json>.`);
    const parsed = JSON.parse(readFile(file));
    input.records = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(input.records)) {
      throw new Error(
        'The file needs JSON like {"records": [ { ... }, { ... } ]}.'
      );
    }
  } else if (file !== undefined) given.file = file;
  for (const [field, value] of Object.entries(given)) {
    if (!fields[field] || field === "records") {
      const inputs = Object.keys(fields).filter((f) => f !== "records");
      throw new Error(
        `${name} has no --${field}.${inputs.length ? ` Its inputs: ${inputs.map((f) => `--${f}`).join(", ")}.` : ""}`
      );
    }
    const type = fields[field].type;
    input[field] =
      type === "string" || typeof value !== "string"
        ? value
        : typed(field, type, value);
  }
  return { name, input, org };
}

/**
 * What a command ends with (API-1.111): 0 done, 3 Shoresh asks first and nothing was done yet,
 * 2 Shoresh refused (nothing changed), 1 it couldn't be asked.
 */
const EXIT = { done: 0, couldNotAsk: 1, refused: 2, asksFirst: 3 };

/** One command: prints exactly what the MCP tool answers, a part a line (API-1.110). */
async function main(
  argv,
  env,
  out = process.stdout,
  err = process.stderr,
  callFn = call
) {
  try {
    const { name, input, org } = parse(argv);
    const said = withSeasonNamed(
      await callFn(name, input, { org: org ?? env.SHORESH_ORG }),
      input
    );
    const lines = toolResult(said).content.map((part) => part.text);
    if (said.ok && input.as_csv) {
      // The file stays a file: only the CSV on standard output, the rest beside it.
      out.write(`${lines[0]}\n`);
      if (lines.length > 1) err.write(`${lines.slice(1).join("\n")}\n`);
    } else (said.ok ? out : err).write(`${lines.join("\n")}\n`);
    if (!said.ok) return EXIT.refused;
    return said.asksFirst ? EXIT.asksFirst : EXIT.done;
  } catch (e) {
    err.write(`${e.message}\n`);
    return EXIT.couldNotAsk;
  }
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { parse, main, usage, EXIT };
