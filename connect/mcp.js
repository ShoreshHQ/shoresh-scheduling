#!/usr/bin/env node
/**
 * Shoresh as an MCP server, for any AI tool that speaks MCP (API-1.10). Runs on the person's
 * computer over stdio and signs in as that person through the sf CLI (client.js).
 * Which Salesforce sign-in: --org <alias>, or SHORESH_ORG, or the sf CLI's default.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES, byName } = require("./capabilities");
const { call, sfInstalled, signIn, toAgent } = require("./client");
const { ownVersion } = require("./camp");
const script = require("./script");
const { askPerson, withPersonsYes } = require("./yes");

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

/**
 * The MCP revisions the connector answers (API-1.161). An AI app that starts with `initialize`
 * gets 2025-06-18 as before. One that names 2026-07-28 on each request, in `_meta`, gets
 * 2026-07-28: no handshake, `server/discover` says what the connector does. Claude desktop asks
 * `server/discover` first and starts with `initialize` only when that fails.
 */
const LEGACY_VERSION = "2025-06-18";
const VERSIONS = ["2026-07-28"];
const VERSION_KEY = "io.modelcontextprotocol/protocolVersion";

/**
 * What the connector does, the same under both revisions. Skills over MCP
 * (io.modelcontextprotocol/skills) is declared here, with skills/list and skills/get in handle(),
 * once Shoresh serves a skill.
 */
const CAPABILITIES_DECLARED = {
  tools: {},
  resources: {},
  extensions: { "io.modelcontextprotocol/ui": {} }
};

// 2026-07-28's cache hint on lists, reads and server/discover: never kept, so an AI app never
// works from a tool list an update has changed; and only this person's.
const NOT_KEPT = { ttlMs: 0, cacheScope: "private" };

/** An ask-first tool as the AI sees it: no confirm to send, the person's screen asks (API-1.153). */
function forTheAi(capability) {
  if (!capability.asksFirst) return capability;
  const { confirm, ...properties } = capability.inputSchema.properties;
  return {
    ...capability,
    description: capability.onScreen,
    inputSchema: { ...capability.inputSchema, properties }
  };
}

/**
 * The tool list an AI tool sees; a schedule read names Shoresh's view of the week. Last, code mode
 * for the AI (API-1.118): one script making many of these calls.
 */
function tools() {
  return [
    ...CAPABILITIES.map(forTheAi).map(
      ({ name, description, inputSchema, showsWeek }) => ({
        name,
        description,
        inputSchema,
        ...(showsWeek ? { _meta: { ui: { resourceUri: WEEK_VIEW.uri } } } : {})
      })
    ),
    script.scriptTool(CAPABILITIES.map(forTheAi))
  ];
}

/**
 * The answer as MCP gives it: what it is first, then Shoresh's answer, then the link that opens
 * the week on the Schedules screen in the camp's own Salesforce (API-1.28), then the view's data.
 */
function toolResult(said) {
  const answer = toAgent(said);
  const content = [{ type: "text", text: answer.text }];
  if (answer.about) content.unshift({ type: "text", text: answer.about });
  // Which season Shoresh used, named or not (API-1.108): say it to the person.
  if (answer.season) {
    content.push({ type: "text", text: `Season used: ${answer.season}.` });
  }
  // The special days the published week has, named, so a day isn't read as its few rows (API-1.149).
  if (answer.specialDays === null) {
    content.push({
      type: "text",
      text: "Which days of this week a special day replaced couldn't be read this time: read_special_days says which days have one."
    });
  } else if (answer.specialDays?.length) {
    content.push({
      type: "text",
      text: `Special days this week, each replacing its whole day: ${answer.specialDays
        .map(
          (d) =>
            `${d.day} ${d.date}, ${d.special_day}${d.program ? ` (${d.program} only)` : ""}`
        )
        .join(
          "; "
        )}. On those days the rows are only what the special day's own schedule has: say the day is that special day.`
    });
  }
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

/**
 * One tool call answered as MCP answers it, with what was said (`said`) as code mode has it. An
 * ask-first action is done only on the person's own Yes on their screen (API-1.153).
 */
async function answerTool(name, input, { log, ask, inScript, ...options }) {
  try {
    const answer = byName(name)?.asksFirst
      ? await withPersonsYes(name, input, {
          act: (sent) => act(name, sent, options),
          ask,
          inScript,
          log
        })
      : await act(name, input, options);
    const result = toolResult(answer);
    if (result.structuredContent) {
      log(`Shoresh: answered ${name} with the week view attached`);
    }
    return { ...result, said: toAgent(answer) };
  } catch (e) {
    return {
      content: [{ type: "text", text: e.message }],
      isError: true,
      said: { ok: false, text: e.message }
    };
  }
}

/** What a script's call gets back: code mode's answer (API-1.114, 1.115), without the view's data. */
function forScript({ ok, status, text, about, season, asksFirst }) {
  return { ok, status, text, about, season, asksFirst };
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
    ask = askPerson,
    // One line to standard error, which Claude desktop keeps in mcp-server-Shoresh.log (API-1.29).
    log = (line) => process.stderr.write(`${line}\n`)
  } = {}
) {
  const { id, method, params } = message;
  if (id === undefined || id === null) return null;
  const fail = (code, text, data) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message: text, ...(data ? { data } : {}) }
  });
  // 2026-07-28 when the request names it; `initialize` and 2025-06-18 named are 2025-06-18's.
  const version = params?._meta?.[VERSION_KEY];
  const modern =
    method === "server/discover" ||
    (method !== "initialize" &&
      version !== undefined &&
      version !== LEGACY_VERSION);
  if (modern && version !== undefined && !VERSIONS.includes(version)) {
    // 2025-06-18 named too, so an AI app that can't use 2026-07-28 starts with `initialize`.
    return fail(-32022, "Unsupported protocol version", {
      supported: [...VERSIONS, LEGACY_VERSION],
      requested: version
    });
  }
  const reply = (result) => ({
    jsonrpc: "2.0",
    id,
    result: modern ? { resultType: "complete", ...result } : result
  });
  const kept = (result) => reply(modern ? { ...result, ...NOT_KEPT } : result);
  // This copy's own version (its manifest.json); none in the repo.
  const serverInfo = () => ({
    name: "shoresh",
    version: ownVersion() ?? "0.0.0"
  });
  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: LEGACY_VERSION,
        capabilities: CAPABILITIES_DECLARED,
        serverInfo: serverInfo()
      });
    case "server/discover":
      return kept({
        supportedVersions: VERSIONS,
        capabilities: CAPABILITIES_DECLARED,
        _meta: { "io.modelcontextprotocol/serverInfo": serverInfo() }
      });
    case "ping":
      return reply({});
    case "tools/list":
      return kept({ tools: tools() });
    case "resources/list":
      return kept({ resources: [WEEK_VIEW] });
    case "resources/read":
      if (params?.uri !== WEEK_VIEW.uri) {
        // A page that isn't there: 2026-07-28 calls it invalid params.
        return fail(modern ? -32602 : -32002, `No such page: ${params?.uri}`);
      }
      log("Shoresh: Claude asked for the week view");
      return kept({
        contents: [{ ...WEEK_VIEW, text: weekViewPage() }]
      });
    case "tools/call": {
      const options = { org, browserSignIn, host, callFn, sf, log, ask };
      if (params?.name === script.NAME) {
        // Each call the script makes is answered as the same tool call would be (API-1.120).
        const ran = await script.runScript(params?.arguments?.script, {
          callAction: async (name, input) => {
            const result = await answerTool(name, input, {
              ...options,
              inScript: true
            });
            return {
              answer: forScript(result.said),
              lines: result.content.map((c) => c.text)
            };
          }
        });
        return reply({
          content: [{ type: "text", text: ran.text }],
          isError: !ran.ok
        });
      }
      const result = await answerTool(
        params?.name,
        params?.arguments ?? {},
        options
      );
      delete result.said;
      return reply(result);
    }
    // skills/list and skills/get go here with the skills extension above.
    default:
      return fail(-32601, `Unknown request: ${method}`);
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

module.exports = {
  tools,
  forTheAi,
  handle,
  orgFrom,
  serve,
  hostFrom,
  toolResult,
  WEEK_VIEW,
  VERSIONS
};
