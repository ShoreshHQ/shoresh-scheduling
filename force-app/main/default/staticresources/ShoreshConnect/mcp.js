#!/usr/bin/env node
/**
 * Shoresh as an MCP server, for any AI tool that speaks MCP (API-1.10). Runs on the person's
 * computer over stdio and signs in as that person through the sf CLI (client.js).
 * Which Salesforce sign-in: --org <alias>, or SHORESH_ORG, or the sf CLI's default.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES } = require("./capabilities");
const { call, sfInstalled, signIn } = require("./client");

/**
 * Shoresh's own view of a week (API-1.26), as an MCP App (the MCP Apps extension,
 * io.modelcontextprotocol/ui): a page the chat app shows beside a schedule read. scripts/
 * build-connect.js makes it from the Schedules screen's own components.
 */
const WEEK_VIEW = {
  uri: "ui://shoresh/week-view.html",
  name: "Shoresh week",
  mimeType: "text/html;profile=mcp-app"
};

function weekViewPage() {
  return fs.readFileSync(path.join(__dirname, "week-view.html"), "utf8");
}

/** The tool list an AI tool sees; a schedule read names Shoresh's view of the week. */
function tools() {
  return CAPABILITIES.map(({ name, description, inputSchema, showsWeek }) => ({
    name,
    description,
    inputSchema,
    ...(showsWeek ? { _meta: { ui: { resourceUri: WEEK_VIEW.uri } } } : {})
  }));
}

/**
 * The answer as MCP gives it: what it is first, then Shoresh's answer, then the link that opens
 * the week on the Schedules screen in the camp's own Salesforce (API-1.28), then the view's data.
 */
function toolResult(answer) {
  const content = [{ type: "text", text: answer.text }];
  if (answer.about) content.unshift({ type: "text", text: answer.about });
  const opens = answer.weekView?.opens;
  if (typeof opens === "string" && /^https:\/\//.test(opens)) {
    content.push({
      type: "text",
      text: `Open this week on Shoresh's Schedules screen: ${opens}`
    });
  }
  return {
    content,
    ...(answer.weekView
      ? { structuredContent: { week_view: answer.weekView } }
      : {}),
    isError: !answer.ok
  };
}

const NO_SF =
  "The Salesforce command line isn't installed on this computer. Install it from https://developer.salesforce.com/tools/salesforcecli, then ask again.";

const SIGNING_IN =
  "Your browser has opened at Salesforce's sign-in page. Sign in and click Allow, then ask me again.";

/** The one sign-in under way, shared by every action asked meanwhile (one browser page, once). */
let signingIn = null;

/**
 * One action; when the person isn't signed in and `browserSignIn` is on (the Claude desktop
 * extension), their browser opens at Salesforce's sign-in page, once, and the answer says to ask
 * again after signing in: the sign-in can take longer than an AI app waits for one answer.
 */
async function act(name, input, { org, browserSignIn, host, callFn, sf }) {
  try {
    return await callFn(name, input, { org });
  } catch (e) {
    if (!/^Couldn't reach Salesforce/.test(e.message)) throw e;
    if (!(await sf.installed())) throw new Error(NO_SF);
    if (!browserSignIn) throw e;
    if (!signingIn) {
      signingIn = Promise.resolve()
        .then(() => sf.signIn(org, host))
        .catch(() => {})
        .then(() => {
          signingIn = null;
        });
    }
    throw new Error(SIGNING_IN);
  }
}

/** One JSON-RPC message in, its answer out (null for a notification). */
async function handle(
  message,
  {
    org,
    browserSignIn = false,
    host,
    callFn = call,
    sf = { installed: () => sfInstalled(), signIn },
    // One line to standard error, which Claude desktop keeps in mcp-server-Shoresh.log (API-1.29).
    log = (line) => process.stderr.write(`${line}\n`)
  } = {}
) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {},
          resources: {},
          extensions: { "io.modelcontextprotocol/ui": {} }
        },
        serverInfo: { name: "shoresh", version: "1.0.0" }
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: tools() });
    case "resources/list":
      return reply({ resources: [WEEK_VIEW] });
    case "resources/read":
      if (params?.uri !== WEEK_VIEW.uri) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32002, message: `No such page: ${params?.uri}` }
        };
      }
      log("Shoresh: Claude asked for the week view");
      return reply({
        contents: [{ ...WEEK_VIEW, text: weekViewPage() }]
      });
    case "tools/call":
      try {
        const answer = await act(params?.name, params?.arguments ?? {}, {
          org,
          browserSignIn,
          host,
          callFn,
          sf
        });
        const result = toolResult(answer);
        if (result.structuredContent) {
          log(`Shoresh: answered ${params.name} with the week view attached`);
        }
        return reply(result);
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

/** The My Domain host from what the person typed: a web address, or a Lightning page's. */
function hostFrom(typed) {
  const host = String(typed || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase()
    .replace(/\.lightning\.force\.com$/, ".my.salesforce.com");
  return host || undefined;
}

/**
 * Answers MCP messages on standard input, one a line, as the person signed in to `org`.
 * SHORESH_SIGN_IN=browser (the Claude desktop extension) signs in through the browser when
 * needed, at SHORESH_SALESFORCE (a My Domain host) if given.
 */
function serve(org, env = process.env) {
  const options = {
    org,
    browserSignIn: env.SHORESH_SIGN_IN === "browser",
    host: hostFrom(env.SHORESH_SALESFORCE)
  };
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
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Unreadable JSON." } })}\n`
        );
        continue;
      }
      handle(message, options).then((answer) => {
        if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
      });
    }
  });
}

if (require.main === module) serve(orgFrom(process.argv, process.env));

module.exports = { tools, handle, orgFrom, serve, hostFrom, WEEK_VIEW };
