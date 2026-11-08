/**
 * The camp's Salesforce, as the connector reaches it: where Shoresh's actions are, and whether this
 * copy of the connector is the camp's own. Every web address the connector asks is made here.
 *
 * A packaged Shoresh's actions are at /services/apexrest/<namespace>/v1/<api> (ADR 0024). The
 * namespace isn't guessed: Salesforce says it, as the prefix of the package's own ShoreshConnect
 * static resource (none where Shoresh isn't packaged, as in the test org). The same record's
 * description names the connector version the camp ships (scripts/build-connect.js writes it), so
 * an older download says so instead of working the camp's data with older screens' modules.
 */
const fs = require("fs");
const path = require("path");

const QUERY =
  // The package's own first, should the camp also have one of that name outside it.
  "SELECT NamespacePrefix, Description FROM StaticResource WHERE Name = 'ShoreshConnect' ORDER BY NamespacePrefix NULLS LAST LIMIT 1";
const API_VERSION = "v67.0";

/** "This copy of Shoresh's connector <can't do what>. Download it again from Settings in Shoresh." */
function downloadAgain(what) {
  return `This copy of Shoresh's connector ${what}. Download it again from Settings in Shoresh.`;
}

/** The connector version a text names ("1.0.48"), or null. */
function versionIn(text) {
  const found = /\b\d+\.\d+\.\d+\b/.exec(text || "");
  return found ? found[0] : null;
}

/** This copy's own version: its manifest.json, beside it in the download (none in the repo). */
function ownVersion(dir = __dirname) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"))
      .version;
  } catch {
    return null;
  }
}

/**
 * What Salesforce says of the camp's Shoresh: { namespace, version }. ask(request) answers
 * Salesforce's { status, body }. Where it can't be read, no namespace and no version, and read:
 * false so it is asked again next time.
 */
async function campOf(ask) {
  const read = await ask({
    path: `/services/data/${API_VERSION}/query?${new URLSearchParams({ q: QUERY })}`,
    method: "GET"
  });
  let records;
  try {
    records = read.status === 200 && JSON.parse(read.body).records;
  } catch {
    records = null;
  }
  if (!Array.isArray(records))
    return { namespace: "", version: null, read: false };
  const [record] = records;
  if (!record) return { namespace: "", version: null };
  return {
    namespace: record.NamespacePrefix || "",
    version: versionIn(record.Description)
  };
}

/** Why this copy can't be used with the camp (it is older than the camp's), or null. */
function tooOld(camp, own = ownVersion()) {
  const ours = versionIn(own);
  if (!camp.version || !ours) return null;
  const theirs = camp.version.split(".").map(Number);
  const mine = ours.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (mine[i] > theirs[i]) return null;
    if (mine[i] < theirs[i]) {
      return downloadAgain(
        `(${own}) is older than your camp's Shoresh (${camp.version}), so nothing was done`
      );
    }
  }
  return null;
}

/** One action's web address: /services/apexrest/[<namespace>/]v1/<api>[?<fields>]. */
function address(namespace, api, fields = {}) {
  const query = new URLSearchParams(fields).toString();
  const base = `/services/apexrest/${namespace ? `${namespace}/` : ""}v1/${api}`;
  return query ? `${base}?${query}` : base;
}

/** A read of an action's address: GET with the fields as its query. */
function read(namespace, api, fields) {
  return { path: address(namespace, api, fields), method: "GET" };
}

/** A save to an action's address: POST with the body as JSON. */
function send(namespace, api, body) {
  return {
    path: address(namespace, api),
    method: "POST",
    body: JSON.stringify(body)
  };
}

/** What a read sends: every input it declares, but what is used only on this computer. */
function queryFields(capability) {
  const declared = capability.inputSchema?.properties ?? {
    season: {},
    week: {}
  };
  const local = ["as_csv", ...(capability.localFields ?? [])];
  return Object.keys(declared).filter((field) => !local.includes(field));
}

/** The web address and request for one action, from the person's input. */
function requestFor(capability, input = {}, namespace = "") {
  if (capability.method === "GET") {
    const query = {};
    for (const field of queryFields(capability)) {
      if (input[field]) query[field] = input[field];
    }
    if (input.as_csv) query.format = "csv";
    return read(namespace, capability.api, query);
  }
  if (capability.sendsFields) {
    const fields = {};
    for (const field of Object.keys(capability.inputSchema.properties)) {
      if (input[field] !== undefined) fields[field] = input[field];
    }
    return send(namespace, capability.api, fields);
  }
  return send(namespace, capability.api, { records: input.records ?? [] });
}

module.exports = {
  queryFields,
  campOf,
  tooOld,
  ownVersion,
  downloadAgain,
  address,
  read,
  send,
  requestFor
};
