/**
 * Shoresh for AI tools (MCP) and the command line: connect/*.js (docs/protocol/api.md,
 * API-1.6 to API-1.10). No Salesforce here: the sign-in and the web are stand-ins.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES } = require("../capabilities");
const { signIn, requestFor, call } = require("../client");
const { tools, handle, orgFrom } = require("../mcp");
const { parse } = require("../cli");

const CLASSES = path.resolve(__dirname, "../../force-app/main/default/classes");
const TOKEN = "made-up-sign-in-123";
const fakeSign = async () => ({
  instanceUrl: "https://camp.example.test",
  accessToken: TOKEN
});
const answering =
  (status, body, seen = []) =>
  async (url, init) => {
    seen.push({ url, init });
    return { ok: status < 300, status, text: async () => body };
  };

describe("Shoresh for AI tools and the command line", () => {
  // API-1.6
  it("matchesTheApi: one action per API web address, no more, no fewer", () => {
    const addresses = fs
      .readdirSync(CLASSES)
      .filter((f) => f.endsWith(".cls"))
      .flatMap((f) => [
        ...fs
          .readFileSync(path.join(CLASSES, f), "utf8")
          .matchAll(/@RestResource\(\s*urlMapping\s*=\s*'\/v1\/([^']*)'/g)
      ])
      .map((m) => m[1])
      .sort();
    expect(CAPABILITIES.map((c) => c.api).sort()).toEqual(addresses);
    expect(CAPABILITIES).toHaveLength(10);
    for (const c of CAPABILITIES) {
      expect(
        requestFor(c, { season: "S", week: "W", records: [] }).path
      ).toMatch(new RegExp(`^/services/apexrest/v1/${c.api}(\\?|$)`));
      expect(c.method).toBe(c.name.startsWith("read_") ? "GET" : "POST");
    }
  });

  // API-1.6, API-1.5
  it("plainNames: every action is read_<thing> or bring_in_<things>, said without jargon", () => {
    for (const c of CAPABILITIES) {
      expect(c.name).toMatch(/^(read|bring_in)_[a-z]+(_[a-z]+)*$/);
      expect(JSON.stringify(c)).not.toMatch(
        /resource|payload|entity|idempoten|endpoint|sobject/i
      );
    }
  });

  // API-1.7
  it("actsAsThePerson: signs in through the person's own sf CLI sign-in and calls with it", async () => {
    let asked;
    const run = (cmd, args, opts, done) => {
      asked = [cmd, ...args];
      done(
        null,
        JSON.stringify({
          result: {
            instanceUrl: "https://camp.example.test",
            accessToken: TOKEN
          }
        })
      );
    };
    await expect(signIn("my-camp", run)).resolves.toEqual({
      instanceUrl: "https://camp.example.test",
      accessToken: TOKEN
    });
    expect(asked).toEqual([
      "sf",
      "org",
      "display",
      "--json",
      "--target-org",
      "my-camp"
    ]);
    const seen = [];
    await call(
      "read_group_schedule",
      { season: "Summer 2026", week: "Week 2" },
      { sign: fakeSign, fetchFn: answering(200, "{}", seen) }
    );
    expect(seen[0].url).toBe(
      "https://camp.example.test/services/apexrest/v1/group_schedule?season=Summer+2026&week=Week+2"
    );
    expect(seen[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const posted = [];
    await call(
      "bring_in_campers",
      { records: [{ camper_name: "Pat Example" }] },
      { sign: fakeSign, fetchFn: answering(200, "[]", posted) }
    );
    expect(posted[0].init.method).toBe("POST");
    expect(JSON.parse(posted[0].init.body)).toEqual({
      records: [{ camper_name: "Pat Example" }]
    });
  });

  // API-1.8
  it("neverShowsTheSignIn: no sign-in in an answer, an error, or the tool list; none in a file", async () => {
    const run = (cmd, args, opts, done) =>
      done(
        new Error(`failed with ${TOKEN}`),
        `{"status":1,"message":"${TOKEN}"}`
      );
    await expect(signIn("nobody", run)).rejects.toThrow(
      'Not signed in to Salesforce as "nobody". Run: sf org login web --alias nobody'
    );
    await signIn("nobody", run).catch((e) =>
      expect(e.message).not.toContain(TOKEN)
    );
    const answer = await handle(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_elective_seats", arguments: {} }
      },
      {
        callFn: (name, input, opts) =>
          call(name, input, {
            ...opts,
            sign: fakeSign,
            fetchFn: answering(500, "{}")
          })
      }
    );
    expect(JSON.stringify(answer)).not.toContain(TOKEN);
    expect(JSON.stringify(tools())).not.toContain(TOKEN);
    for (const f of fs.readdirSync(path.resolve(__dirname, ".."))) {
      if (f.endsWith(".js")) {
        expect(
          fs.readFileSync(path.resolve(__dirname, "..", f), "utf8")
        ).not.toMatch(/00D[A-Za-z0-9]{12}!|writeFile|appendFile|console\.log/);
      }
    }
  });

  // API-1.9
  it("passesOnThePlainSentence: a refusal comes through as Shoresh's own sentence", async () => {
    const sentence =
      'This user can\'t read the group schedule. A Salesforce admin can give it the "Read group schedules" permission set.';
    const answer = await handle(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "read_group_schedule",
          arguments: { season: "Summer 2026", week: "Week 2" }
        }
      },
      {
        callFn: (name, input, opts) =>
          call(name, input, {
            ...opts,
            sign: fakeSign,
            fetchFn: answering(403, JSON.stringify({ message: sentence }))
          })
      }
    );
    expect(answer.result).toEqual({
      content: [{ type: "text", text: sentence }],
      isError: true
    });
    const conflict = JSON.stringify([
      {
        row: 0,
        outcome: "problem",
        message: "Kept beside the hand edit: a conflict."
      }
    ]);
    const batch = await call(
      "bring_in_camper_elective_choices",
      { records: [{}] },
      { sign: fakeSign, fetchFn: answering(200, conflict) }
    );
    expect(batch).toEqual({ ok: true, status: 200, text: conflict });
  });

  // API-1.10
  it("sameNamesBothWays: the MCP tools and the command line take the same ten names", async () => {
    const init = await handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" }
    });
    expect(init.result.capabilities).toEqual({ tools: {} });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(
      await handle({ jsonrpc: "2.0", method: "notifications/initialized" })
    ).toBeNull();
    const listed = await handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    });
    const names = listed.result.tools.map((t) => t.name);
    expect(names).toEqual(CAPABILITIES.map((c) => c.name));
    for (const name of names) {
      const words = name.startsWith("read_")
        ? [name, "--season", "S", "--week", "W"]
        : [name, "--file", "x.json"];
      expect(parse(words, () => '{"records":[]}').name).toBe(name);
    }
    expect(
      parse([
        "read_activity_schedule",
        "--season",
        "Summer 2026",
        "--week",
        "Week 1",
        "--csv",
        "--org",
        "my-camp"
      ])
    ).toEqual({
      name: "read_activity_schedule",
      input: { season: "Summer 2026", week: "Week 1", as_csv: true },
      org: "my-camp"
    });
    expect(() => parse(["delete_everything"])).toThrow(/Usage/);
    expect(orgFrom(["node", "mcp.js", "--org", "a"], {})).toBe("a");
    expect(orgFrom(["node", "mcp.js"], { SHORESH_ORG: "b" })).toBe("b");
  });
});
