/**
 * The one small client the MCP server and the command line share. Each action is made by the
 * Salesforce command line itself (`sf api request rest`), signed in as the person through its own
 * sign-in store (`sf org login web` once), so it has exactly that person's access (API-1.7). This
 * code never sees, keeps or shows the sign-in (API-1.8).
 */
const { execFile } = require("child_process");
const { byName } = require("./capabilities");

/** The web address and request for one action. */
function requestFor(capability, input = {}) {
  const path = `/services/apexrest/v1/${capability.api}`;
  if (capability.method === "GET") {
    const query = new URLSearchParams({
      season: input.season ?? "",
      week: input.week ?? ""
    });
    if (input.as_csv) query.set("format", "csv");
    return { path: `${path}?${query}`, method: "GET" };
  }
  if (capability.sendsFields) {
    const fields = {};
    for (const field of Object.keys(capability.inputSchema.properties)) {
      if (input[field] !== undefined) fields[field] = input[field];
    }
    return { path, method: "POST", body: JSON.stringify(fields) };
  }
  return {
    path,
    method: "POST",
    body: JSON.stringify({ records: input.records ?? [] })
  };
}

/** The sf command line's words for one request; the body goes in on standard input. */
function sfArgs(request, org) {
  if (org && (!/^[\w.@-]+$/.test(org) || org.startsWith("-"))) {
    throw new Error("That isn't a Salesforce sign-in name.");
  }
  const args = [
    "api",
    "request",
    "rest",
    request.path,
    "--method",
    request.method,
    "--include"
  ];
  if (request.body !== undefined) args.push("--body", "-");
  if (org) args.push("--target-org", org);
  return args;
}

/** Runs sf; answers its standard output. */
function runSf(args, stdin) {
  return new Promise((resolve) => {
    const child = execFile(
      "sf",
      args,
      {
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, SF_DISABLE_AUTOUPDATE: "true" }
      },
      (error, stdout) => resolve(stdout ?? "")
    );
    child.stdin.on("error", () => {}); // sf missing: answered by the callback
    child.stdin.end(stdin ?? "");
  });
}

/**
 * sf's `--include` output: "HTTP/1.1 <status>", its headers ("name: value", one a line), maybe a
 * blank line, then Shoresh's answer. Only the status and the answer are kept.
 */
function readResponse(stdout) {
  const status = /^HTTP\/[\d.]+ (\d{3})/.exec(stdout);
  if (!status) return null;
  const lines = stdout.split(/\r?\n/).slice(1);
  let start = 0;
  while (start < lines.length && /^[A-Za-z0-9-]+:( |$)/.test(lines[start]))
    start++;
  if (lines[start] === "") start++;
  return { status: Number(status[1]), body: lines.slice(start).join("\n") };
}

/**
 * Do one action as the person. Answers { ok, status, text }: text is Shoresh's own answer, so a
 * conflict or a refusal reaches the agent as the same plain sentence a person sees (API-1.9).
 */
async function call(name, input, { org, run = runSf } = {}) {
  const capability = byName(name);
  if (!capability) throw new Error(`Shoresh has no action called "${name}".`);
  const request = requestFor(capability, input);
  const response = readResponse(await run(sfArgs(request, org), request.body));
  if (!response) {
    throw new Error(
      `Couldn't reach Salesforce${org ? ` as "${org}"` : ""}. Sign in once with: sf org login web${org ? ` --alias ${org}` : ""}`
    );
  }
  const ok = response.status >= 200 && response.status < 300;
  return { ok, status: response.status, text: answerText(response.body) };
}

/** Shoresh's answer as text; a refusal's sentence on its own. */
function answerText(text) {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).join() === "message"
    ) {
      return parsed.message;
    }
    if (Array.isArray(parsed) && parsed[0] && parsed[0].errorCode) {
      return parsed.map((p) => p.message).join("\n");
    }
  } catch {
    // not JSON (a CSV file): as it came
  }
  return text.trim();
}

module.exports = { requestFor, sfArgs, readResponse, call };
