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
 *   (--org <alias> picks a sf CLI sign-in; otherwise SHORESH_ORG, then the sf CLI's default.)
 */
const fs = require("fs");
const { CAPABILITIES, byName } = require("./capabilities");
const { call } = require("./client");

function usage() {
  return [
    "Usage: node connect/cli.js <action> [--season <name> --week <name> [--csv]] [--file <records.json>] [--<field> <value> ...] [--org <alias>]",
    "",
    ...CAPABILITIES.map(
      (c) =>
        `  ${c.name.padEnd(34)} ${c.description.split(". ")[0].replace(/\.$/, "")}.`
    )
  ].join("\n");
}

/** The action's name and input from the words typed. */
function parse(argv, readFile = (f) => fs.readFileSync(f, "utf8")) {
  const [name, ...rest] = argv;
  const capability = byName(name);
  if (!capability) throw new Error(usage());
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i];
    if (word === "--csv") flags.csv = true;
    else if (word.startsWith("--")) flags[word.slice(2)] = rest[++i];
  }
  const input = {};
  if (capability.sendsFields || capability.queryFields) {
    for (const field of Object.keys(capability.inputSchema.properties)) {
      if (flags[field] !== undefined) input[field] = flags[field];
    }
  } else if (capability.method === "GET") {
    input.season = flags.season;
    input.week = flags.week;
    if (flags.csv) input.as_csv = true;
  } else {
    if (!flags.file) throw new Error(`${name} needs --file <records.json>.`);
    const parsed = JSON.parse(readFile(flags.file));
    input.records = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(input.records)) {
      throw new Error(
        'The file needs JSON like {"records": [ { ... }, { ... } ]}.'
      );
    }
  }
  return { name, input, org: flags.org };
}

async function main(argv, env, out = process.stdout, err = process.stderr) {
  try {
    const { name, input, org } = parse(argv);
    const answer = await call(name, input, { org: org ?? env.SHORESH_ORG });
    (answer.ok ? out : err).write(`${answer.text}\n`);
    return answer.ok ? 0 : 1;
  } catch (e) {
    err.write(`${e.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { parse, main, usage };
