#!/usr/bin/env node
/**
 * Shoresh as an MCP server, for any AI tool that speaks MCP (API-1.10). Runs on the person's
 * computer over stdio and signs in as that person through the sf CLI (client.js).
 * Which Salesforce sign-in: --org <alias>, or SHORESH_ORG, or the sf CLI's default.
 */
const { CAPABILITIES } = require("./capabilities");
const { call } = require("./client");

/** The tool list an AI tool sees. */
function tools() {
  return CAPABILITIES.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }));
}

/** One JSON-RPC message in, its answer out (null for a notification). */
async function handle(message, { org, callFn = call } = {}) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "shoresh", version: "1.0.0" }
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: tools() });
    case "tools/call":
      try {
        const answer = await callFn(params?.name, params?.arguments ?? {}, {
          org
        });
        return reply({
          content: [{ type: "text", text: answer.text }],
          isError: !answer.ok
        });
      } catch (e) {
        return reply({
          content: [{ type: "text", text: e.message }],
          isError: true
        });
      }
    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown request: ${method}` }
      };
  }
}

function orgFrom(argv, env) {
  const i = argv.indexOf("--org");
  return i >= 0 ? argv[i + 1] : env.SHORESH_ORG;
}

if (require.main === module) {
  const org = orgFrom(process.argv, process.env);
  let buffered = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffered += chunk;
    let end;
    while ((end = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, end).trim();
      buffered = buffered.slice(end + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      handle(message, { org }).then((answer) => {
        if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
      });
    }
  });
}

module.exports = { tools, handle, orgFrom };
