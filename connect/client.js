/**
 * The one small client the MCP server and the command line share. It signs in as the person,
 * through the Salesforce command line's own sign-in store (`sf org login web` once), and calls the
 * API's web addresses with that person's access (API-1.7). It keeps no key or password in a
 * file, and never puts the sign-in in an answer, an error or a log (API-1.8).
 */
const { execFile } = require("child_process");
const { byName } = require("./capabilities");

/** The person's sign-in from the sf CLI: { instanceUrl, accessToken }, kept in memory only. */
function signIn(org, run = execFile) {
  const args = ["org", "display", "--json"];
  if (org) args.push("--target-org", org);
  return new Promise((resolve, reject) => {
    run("sf", args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      let result;
      try {
        result = JSON.parse(stdout).result;
      } catch {
        result = null;
      }
      if (!result || !result.accessToken || !result.instanceUrl) {
        reject(
          new Error(
            `Not signed in to Salesforce${org ? ` as "${org}"` : ""}. Run: sf org login web${org ? ` --alias ${org}` : ""}`
          )
        );
        return;
      }
      resolve({
        instanceUrl: result.instanceUrl,
        accessToken: result.accessToken
      });
    });
  });
}

/** The web address and request for one action; no sign-in in it. */
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
  return {
    path,
    method: "POST",
    body: JSON.stringify({ records: input.records ?? [] })
  };
}

/**
 * Do one action as the person. Answers { ok, status, text }: text is Shoresh's own answer, so a
 * conflict or a refusal reaches the agent as the same plain sentence a person sees (API-1.9).
 */
async function call(name, input, { org, fetchFn = fetch, sign = signIn } = {}) {
  const capability = byName(name);
  if (!capability) throw new Error(`Shoresh has no action called "${name}".`);
  const { instanceUrl, accessToken } = await sign(org);
  const request = requestFor(capability, input);
  const response = await fetchFn(`${instanceUrl}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: request.body
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text: answerText(text) };
}

/** Shoresh's answer as text; a refusal's sentence on its own when it has one. */
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
  return text;
}

module.exports = { signIn, requestFor, call };
