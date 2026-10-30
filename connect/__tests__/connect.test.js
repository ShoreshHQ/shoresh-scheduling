/**
 * Shoresh for AI tools (MCP) and the command line: connect/*.js (docs/protocol/api.md,
 * API-1.6 to API-1.10). No Salesforce here: the sf command line is a stand-in.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES } = require("../capabilities");
const { requestFor, sfArgs, readResponse, call } = require("../client");
const { tools, handle, orgFrom } = require("../mcp");
const { parse } = require("../cli");

const CLASSES = path.resolve(__dirname, "../../force-app/main/default/classes");

/** A stand-in for `sf api request rest --include`: answers status and body, and records each call. */
const sfAnswering =
  (status, body, seen = []) =>
  async (args, stdin) => {
    seen.push({ args, stdin });
    return `HTTP/1.1 ${status}\ncontent-type: application/json\n\n${body}`;
  };

const callTool = (name, args, run) =>
  handle(
    {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name, arguments: args }
    },
    { callFn: (n, input, opts) => call(n, input, { ...opts, run }) }
  );

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
    expect(CAPABILITIES).toHaveLength(12);
    for (const c of CAPABILITIES) {
      expect(
        requestFor(c, { season: "S", week: "W", records: [] }).path
      ).toMatch(new RegExp(`^/services/apexrest/v1/${c.api}(\\?|$)`));
      expect(c.method).toBe(c.name.startsWith("read_") ? "GET" : "POST");
    }
  });

  // API-1.6, API-1.5
  it("plainNames: every action is read_<thing>, bring_in_<things>, change_<thing> or undo_last_agent_change, said without jargon", () => {
    for (const c of CAPABILITIES) {
      expect(c.name).toMatch(
        /^((read|bring_in|change)_[a-z]+(_[a-z]+)*|undo_last_agent_change)$/
      );
      expect(JSON.stringify(c)).not.toMatch(
        /resource|payload|entity|idempoten|endpoint|sobject/i
      );
    }
  });

  // API-1.7
  it("actsAsThePerson: each action is the person's own sf CLI call to the API's address", async () => {
    const seen = [];
    await call(
      "read_group_schedule",
      { season: "Summer 2026", week: "Week 2" },
      { org: "my-camp", run: sfAnswering(200, "{}", seen) }
    );
    expect(seen[0].args).toEqual([
      "api",
      "request",
      "rest",
      "/services/apexrest/v1/group_schedule?season=Summer+2026&week=Week+2",
      "--method",
      "GET",
      "--include",
      "--target-org",
      "my-camp"
    ]);
    const posted = [];
    await call(
      "bring_in_campers",
      { records: [{ camper_name: "Pat Example" }] },
      { run: sfAnswering(200, "{}", posted) }
    );
    expect(posted[0].args).toEqual([
      "api",
      "request",
      "rest",
      "/services/apexrest/v1/camper",
      "--method",
      "POST",
      "--include",
      "--body",
      "-"
    ]);
    expect(JSON.parse(posted[0].stdin)).toEqual({
      records: [{ camper_name: "Pat Example" }]
    });
    expect(() => sfArgs({ path: "/x", method: "GET" }, "--json")).toThrow(
      "That isn't a Salesforce sign-in name."
    );
    expect(() => sfArgs({ path: "/x", method: "GET" }, "a b")).toThrow(
      "That isn't a Salesforce sign-in name."
    );
  });

  // API-1.8
  it("neverShowsTheSignIn: no sign-in passes through Shoresh's code, and none is written down", async () => {
    // Only Shoresh's answer is kept from what sf prints; its headers are dropped.
    expect(
      readResponse(
        "HTTP/1.1 200\nauthorization: secret\nset-cookie: sid=secret\n\nok"
      )
    ).toEqual({ status: 200, body: "ok" });
    // As sf prints it: no blank line before the answer.
    expect(
      readResponse(
        'HTTP/1.1 403\nx-empty:\nx-request-id: 1\n{\n  "message": "No."\n}'
      )
    ).toEqual({ status: 403, body: '{\n  "message": "No."\n}' });
    await expect(
      call("read_elective_seats", {}, { org: "nobody", run: async () => "" })
    ).rejects.toThrow(
      'Couldn\'t reach Salesforce as "nobody". Sign in once with: sf org login web --alias nobody'
    );
    for (const f of fs.readdirSync(path.resolve(__dirname, ".."))) {
      if (f.endsWith(".js")) {
        const text = fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
        expect([
          f,
          /accessToken|Bearer|org display|sfdxAuthUrl|writeFile|appendFile|createWriteStream|console\./.test(
            text
          )
        ]).toEqual([f, false]);
      }
    }
  });

  // API-1.9
  it("passesOnThePlainSentence: a refusal or a conflict comes through as Shoresh's own sentence", async () => {
    const sentence =
      'This user can\'t read the group schedule. A Salesforce admin can give it the "Read group schedules" permission set.';
    const refused = await callTool(
      "read_group_schedule",
      { season: "Summer 2026", week: "Week 2" },
      sfAnswering(403, JSON.stringify({ message: sentence }))
    );
    expect(refused.result).toEqual({
      content: [{ type: "text", text: sentence }],
      isError: true
    });
    // The import's own answer (IncomingDoors): every record, each in one sentence.
    const conflict = JSON.stringify({
      saved: 0,
      unchanged: 0,
      problems: 1,
      records: [
        {
          row: 0,
          result: "problem",
          message:
            "Kept beside Pat Example's choice a person made: shown as a conflict."
        }
      ]
    });
    const batch = await callTool(
      "bring_in_camper_elective_choices",
      { records: [{}] },
      sfAnswering(200, conflict)
    );
    expect(batch.result).toEqual({
      content: [{ type: "text", text: conflict }],
      isError: false
    });
  });

  // API-1.10
  // API-1.11
  it("personsOwnChanges: change_schedule_cell and undo_last_agent_change send the person's fields to /v1/schedule_cell and /v1/undo_last_agent_change", async () => {
    const seen = [];
    const fields = {
      season: "Summer 2026",
      week: "Week 1",
      group: "Group A",
      day: "Monday",
      time: "Period 2",
      was: "Gym games",
      activity: "Soccer"
    };
    await call(
      "change_schedule_cell",
      { ...fields, records: [] },
      { run: sfAnswering(200, "{}", seen) }
    );
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/schedule_cell",
      "--method",
      "POST"
    ]);
    expect(JSON.parse(seen[0].stdin)).toEqual(fields);
    const undone = await call(
      "undo_last_agent_change",
      { season: "Summer 2026", week: "Week 1" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({
            message: 'Undid "Placed Soccer · Group A · Monday · Period 2".'
          }),
          seen
        )
      }
    );
    expect(seen[1].args[3]).toBe(
      "/services/apexrest/v1/undo_last_agent_change"
    );
    expect(undone).toEqual({
      ok: true,
      status: 200,
      text: 'Undid "Placed Soccer · Group A · Monday · Period 2".'
    });
    expect(
      parse([
        "change_schedule_cell",
        ...Object.entries(fields).flatMap(([k, v]) => [`--${k}`, v]),
        "--org",
        "my-camp"
      ])
    ).toEqual({ name: "change_schedule_cell", input: fields, org: "my-camp" });
  });

  it("sameNamesBothWays: the MCP tools and the command line take the same names", async () => {
    const init = await handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2099-01-01" }
    });
    expect(init.result.capabilities).toEqual({ tools: {} });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(
      await handle({ jsonrpc: "2.0", method: "notifications/initialized" })
    ).toBeNull();
    const names = tools().map((t) => t.name);
    expect(names).toEqual(CAPABILITIES.map((c) => c.name));
    for (const name of names) {
      const words = name.startsWith("bring_in_")
        ? [name, "--file", "x.json"]
        : [name, "--season", "S", "--week", "W"];
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
    expect(() =>
      parse(["bring_in_campers", "--file", "x.json"], () => '{"campers":[]}')
    ).toThrow('The file needs JSON like {"records": [ { ... }, { ... } ]}.');
    expect(orgFrom(["node", "mcp.js", "--org", "a"], {})).toBe("a");
    expect(orgFrom(["node", "mcp.js"], { SHORESH_ORG: "b" })).toBe("b");
  });
});
