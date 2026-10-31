/**
 * Shoresh for AI tools (MCP) and the command line: connect/*.js (docs/protocol/api.md,
 * API-1.6 to API-1.10). No Salesforce here: the sf command line is a stand-in.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES } = require("../capabilities");
const {
  requestFor,
  sfArgs,
  readResponse,
  call,
  check,
  sfPath,
  signIn
} = require("../client");
const { tools, handle, orgFrom, hostFrom } = require("../mcp");
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
  // API-1.15
  it("shipsInsideThePackage: the connector is the ShoreshConnect static resource, the same files as connect/, needing only Node", () => {
    const { connectorFiles, FROM, TO } = require("../../scripts/build-connect");
    expect(
      fs
        .readdirSync(TO)
        .filter((f) => f !== "manifest.json")
        .sort()
    ).toEqual(connectorFiles());
    for (const f of connectorFiles()) {
      expect([f, fs.readFileSync(path.join(TO, f), "utf8")]).toEqual([
        f,
        fs.readFileSync(path.join(FROM, f), "utf8")
      ]);
      const source = fs.readFileSync(path.join(FROM, f), "utf8");
      for (const [, needed] of source.matchAll(/require\("([^"]+)"\)/g)) {
        expect([f, needed]).toEqual([
          f,
          ["fs", "path", "child_process"].includes(needed) ||
          needed.startsWith("./")
            ? needed
            : "(only Node's own)"
        ]);
      }
    }
    expect(fs.readFileSync(path.join(FROM, "shoresh.js"), "utf8")).toMatch(
      /^#!\/usr\/bin\/env node\n/
    );
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8")
    );
    expect(pkg.bin).toBeUndefined(); // nothing fetched from GitHub or a registry
  });

  // API-1.15
  it("testReadInOneSentence: the setup's test read says connected, a missing permission set, no Shoresh, or not signed in", async () => {
    const seen = [];
    const said = async (status, body) =>
      await check({ org: "shoresh", run: sfAnswering(status, body, seen) });
    expect(await said(400, '{"message":"Say which season (season)."}')).toEqual(
      {
        ok: true,
        text: "Connected: your AI can now see and change your camp's schedules, with the same access you have in Salesforce."
      }
    );
    expect(seen[0].args).toEqual([
      "api",
      "request",
      "rest",
      "/services/apexrest/v1/group_schedule?season=&week=",
      "--method",
      "GET",
      "--include",
      "--target-org",
      "shoresh"
    ]);
    const refused =
      'This user can\'t read the group schedule. A Salesforce admin can give it the "Read group schedules" permission set.';
    expect(await said(403, JSON.stringify({ message: refused }))).toEqual({
      ok: false,
      text: `Not ready yet: ${refused}`
    });
    expect(
      (
        await said(
          404,
          '[{"errorCode":"NOT_FOUND","message":"Could not find a match for URL"}]'
        )
      ).text
    ).toBe(
      "Shoresh isn't in this Salesforce, or your account can't see it. Ask your Salesforce admin."
    );
    expect((await check({ org: "shoresh", run: async () => "" })).text).toBe(
      "Not signed in to Salesforce yet, or the Salesforce command line isn't installed."
    );
  });
  // API-1.17
  it("signsInThroughTheBrowserOnce: the desktop extension opens Salesforce's sign-in page when needed, then tries again", async () => {
    const message = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "read_group_schedule", arguments: {} }
    };
    const signedInto = [];
    let signedIn = false;
    const callFn = async () => {
      if (!signedIn)
        throw new Error('Couldn\'t reach Salesforce as "shoresh".');
      return { ok: true, text: "the schedule" };
    };
    const sf = {
      installed: async () => true,
      signIn: async (org, host) => {
        signedInto.push([org, host]);
        signedIn = true;
      }
    };
    const answer = await handle(message, {
      org: "shoresh",
      browserSignIn: true,
      host: "maple-grove.my.salesforce.com",
      callFn,
      sf
    });
    expect(answer.result).toEqual({
      content: [{ type: "text", text: "the schedule" }],
      isError: false
    });
    expect(signedInto).toEqual([["shoresh", "maple-grove.my.salesforce.com"]]);
    // Without the extension's setting, no browser opens: the sentence says how to sign in.
    signedIn = false;
    const plain = await handle(message, { org: "shoresh", callFn, sf });
    expect(plain.result.isError).toBe(true);
    expect(signedInto).toHaveLength(1);
    // No Salesforce command line: one plain sentence, no browser.
    const none = await handle(message, {
      org: "shoresh",
      browserSignIn: true,
      callFn,
      sf: { ...sf, installed: async () => false }
    });
    expect(none.result.content[0].text).toBe(
      "The Salesforce command line isn't installed on this computer. Install it from https://developer.salesforce.com/tools/salesforcecli, then ask again."
    );
    expect(signedInto).toHaveLength(1);
  });

  // API-1.17, API-1.8
  it("signInIsSalesforcesOwn: sf opens the browser at the camp's address or Salesforce's usual page, and nothing it prints is kept", async () => {
    const seen = [];
    const run = async (args, stdin, timeout) => {
      seen.push({ args, timeout });
      return "Successfully authorized someone@example.com";
    };
    await expect(
      signIn("shoresh", "maple-grove.my.salesforce.com", run)
    ).resolves.toBeUndefined();
    await signIn("shoresh", undefined, run);
    expect(seen).toEqual([
      {
        args: [
          "org",
          "login",
          "web",
          "--alias",
          "shoresh",
          "--instance-url",
          "https://maple-grove.my.salesforce.com"
        ],
        timeout: 300000
      },
      { args: ["org", "login", "web", "--alias", "shoresh"], timeout: 300000 }
    ]);
    await expect(
      signIn("shoresh", "evil.example.com --x", run)
    ).rejects.toThrow(
      "That isn't a Salesforce address, like camp.my.salesforce.com."
    );
    expect(
      hostFrom(" https://Maple-Grove.lightning.force.com/lightning/n/x ")
    ).toBe("maple-grove.my.salesforce.com");
    expect(hostFrom("")).toBeUndefined();
    // A desktop app's short PATH still finds sf where its installers put it.
    expect(
      sfPath(
        { PATH: "/usr/bin", HOME: "/Users/dana" },
        "/apps/node/bin/node"
      ).split(path.delimiter)
    ).toEqual([
      "/usr/bin",
      "/apps/node/bin",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/Users/dana/.npm-global/bin",
      "/usr/bin",
      "/bin"
    ]);
  });

  // API-1.17
  it("theExtensionIsTheSameConnector: the static resource's manifest.json makes it a Claude desktop extension running shoresh.js", () => {
    const { RESOURCE } = require("../../scripts/build-connect");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(RESOURCE, "manifest.json"), "utf8")
    );
    expect(manifest.server).toEqual({
      type: "node",
      entry_point: "shoresh.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/shoresh.js", "--org", "shoresh"],
        env: {
          SHORESH_SIGN_IN: "browser",
          SHORESH_SALESFORCE: "${user_config.salesforce_address}"
        }
      }
    });
    expect(manifest.user_config.salesforce_address.required).toBe(false);
    expect(JSON.stringify(manifest)).not.toMatch(
      /token|password|secret|github/i
    );
    // No folders: Claude's extension installer stops at a folder entry in the zip.
    expect(
      fs
        .readdirSync(RESOURCE)
        .filter((f) => fs.statSync(path.join(RESOURCE, f)).isDirectory())
    ).toEqual([]);
  });
});
