#!/usr/bin/env node
/**
 * The one command `npx -y github:ShoreshHQ/shoresh-scheduling` runs (API-1.15):
 *   (nothing but --org)  the MCP server an AI tool starts (mcp.js)
 *   check --org <alias>  the setup's test read: one plain sentence
 *   <action> ...         the command line (cli.js)
 */
const { serve, orgFrom } = require("./mcp");
const { main } = require("./cli");
const { check } = require("./client");

const argv = process.argv.slice(2);
const org = orgFrom(argv, process.env);
const say = (ok, text) => {
  (ok ? process.stdout : process.stderr).write(`${text}\n`);
  process.exitCode = ok ? 0 : 1;
};
if (argv.includes("--org") && !org) {
  say(false, "Say which Salesforce sign-in after --org, like: --org shoresh");
} else if (argv[0] === "check") {
  check({ org }).then(
    (answer) => say(answer.ok, answer.text),
    (e) => say(false, e.message)
  );
} else if (argv.length === 0 || argv[0] === "--org") {
  serve(org);
} else {
  main(argv, process.env).then((code) => {
    process.exitCode = code;
  });
}
