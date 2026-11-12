/**
 * Shoresh for AI tools (MCP) and the command line: connect/*.js (docs/protocol/api.md,
 * API-1.6 to API-1.10). No Salesforce here: the sf command line is a stand-in.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES, byName } = require("../capabilities");
const {
  requestFor,
  sfArgs,
  readResponse,
  call: callAs,
  check,
  sfPath,
  signIn,
  importModules,
  TOO_BIG,
  PERSON_DECIDES
} = require("../client");
// A camp without a namespace, as the test org is; namespaces are camp.test.js's.
// A packaged camp: the namespace Salesforce says, handed to the screens' modules.
const packaged = async () => ({ namespace: "shoresh", version: null });
// What sf prints when the sign-in named isn't there.
const SIGNED_OUT =
  "Error (NamedOrgNotFoundError): Parsing --target-org\n\tNo authorization information found for nobody.";
const call = (name, input, options) =>
  callAs(name, input, {
    camp: async () => ({ namespace: "", version: null }),
    ...options
  });
const { tools, handle, orgFrom, hostFrom } = require("../mcp");
const { parse } = require("../cli");

const CLASSES = path.resolve(__dirname, "../../force-app/main/default/classes");
// The Versions panel's own words module, as the connector runs it (shipped by build-connect.js).
const versionWords = async () =>
  require("../../force-app/main/default/lwc/shoreshVersions/words.js");

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
  it("matchesTheApi: every API web address has its actions (a delete also its question, API-1.102), no more, no fewer", () => {
    const addresses = fs
      .readdirSync(CLASSES)
      .filter((f) => f.endsWith(".cls"))
      .flatMap((f) => [
        ...fs
          .readFileSync(path.join(CLASSES, f), "utf8")
          .matchAll(/@RestResource\(\s*urlMapping\s*=\s*'\/v1\/([^']*)'/g)
      ])
      .map((m) => m[1])
      // What Shoresh's view of a week draws: part of a schedule read, not an action (API-1.26).
      .filter((a) => a !== "week_view")
      .sort();
    expect([...new Set(CAPABILITIES.map((c) => c.api))].sort()).toEqual(
      addresses
    );
    expect(CAPABILITIES).toHaveLength(104);
    for (const c of CAPABILITIES) {
      expect(
        requestFor(c, { season: "S", week: "W", records: [] }).path
      ).toMatch(new RegExp(`^/services/apexrest/v1/${c.api}(\\?|$)`));
      // A read, or a file made from what a screen reads (API-1.86 to API-1.89), is a GET.
      expect(c.method).toBe(
        /^(read|list|download)_/.test(c.name) ? "GET" : "POST"
      );
    }
  });

  it("API-1.125: apply_to_other_weeks names both weeks, either screen, and asks first", async () => {
    const capability = byName("apply_to_other_weeks");
    expect(capability.inputSchema.required).toEqual(["week", "to_week"]);
    expect(capability.inputSchema.properties.schedule).toBeDefined();
    expect(capability.asksFirst).toBe(true);
    const seen = [];
    const asked = { week: "Week 1", to_week: "Week 2" };
    await call("apply_to_other_weeks", asked, {
      run: sfAnswering(200, JSON.stringify({ message: "Done" }), seen)
    });
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/apply_to_other_weeks",
      "--method",
      "POST"
    ]);
    expect(JSON.parse(seen[0].stdin)).toEqual(asked);
  });

  // API-1.6, API-1.5
  // API-1.19
  it("plainNames: every action is list_seasons, read_<thing>, bring_in_<things>, change_<thing>, build_week, try_another_option, bring_back_option, fill_open_cells, start_over_week, publish_week, unpublish_week, lock_cells, unlock_cells, move_cell, take_out_cell, copy_cells, start_manual_week, finalize_electives, accept_finding, undo_last_agent_change, <verb>_version, rename/delete/add_setup_record, fill_in_weeks, merge_locations, confirm_setup_guess, confirm_proposed_offering, copy_season, update_to_match_setup, switch_to_rain_plans, assign_elective_seats, move_elective_seat, lock_elective_seat, start_new_elective_version, clear_electives, put_special_day_on_day, take_special_day_off_day, place_special_event, set_up_noted_item, import_list, import_worksheet, import_last_year, import_special_schedule, undo_import, apply_to_other_weeks, download_<file>, forget_learned_answer, forget_learned_pattern, undo_learned_answer, make_linked_choice, delete_linked_choice, delete_offering, create_camp, create_season, delete_season, clear_day or clear_week, said without jargon", () => {
    for (const c of CAPABILITIES) {
      expect(c.name).toMatch(
        /^((read|bring_in|change)_[a-z]+(_[a-z]+)*|list_seasons|undo_last_agent_change|build_week|try_another_option|bring_back_option|fill_open_cells|start_over_week|(un)?publish_week|(un)?lock_cells|move_cell|take_out_cell|copy_cells|start_manual_week|finalize_electives|accept_finding|(list|save|restore|rename|delete)_versions?|(rename|delete|add)_setup_record|fill_in_weeks|merge_locations|confirm_setup_guess|confirm_proposed_offering|copy_season|update_to_match_setup|switch_to_rain_plans|assign_elective_seats|move_elective_seat|lock_elective_seat|start_new_elective_version|clear_electives|put_special_day_on_day|take_special_day_off_day|place_special_event|set_up_noted_item|import_list|import_worksheet|import_last_year|import_special_schedule|undo_import|apply_to_other_weeks|download_(schedule|special_schedule|elective_files|setup)|forget_learned_(answer|pattern)|undo_learned_answer|make_linked_choice|delete_linked_choice|delete_offering|create_camp|create_season|delete_season|clear_day|clear_week)$/
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
  // API-1.126
  it("signInOnlyWhenSignedOut: a person is told to sign in only when sf says the sign-in is gone; otherwise that Salesforce didn't answer", async () => {
    const noAnswer =
      "Salesforce didn't answer just now, so Shoresh can't tell whether this was done. Try again in a moment; if it was a change, read first to see whether it went through.";
    for (const out of [
      "",
      "Error (ETIMEDOUT): socket hang up",
      "Error: Command failed: sf api request rest",
      "Error (RefreshTokenAuthError): Error authenticating with the refresh token due to: connect ETIMEDOUT"
    ]) {
      await expect(
        call("read_elective_seats", {}, { org: "camp", run: async () => out })
      ).rejects.toThrow(noAnswer);
    }
    for (const out of [
      SIGNED_OUT,
      "Error (RefreshTokenAuthError): Error authenticating with the refresh token due to: expired access/refresh token",
      "ENOENT"
    ]) {
      await expect(
        call("read_elective_seats", {}, { org: "camp", run: async () => out })
      ).rejects.toThrow(/^Couldn't reach Salesforce as "camp". Sign in once/);
    }
    // A warning sf prints before the answer is passed over, not taken for no answer.
    expect(
      readResponse(
        " ›   Warning: @salesforce/cli update available.\nHTTP/1.1 200\nx-request-id: 1\n\nok"
      )
    ).toEqual({ status: 200, body: "ok" });
  });

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
      call(
        "read_elective_seats",
        {},
        { org: "nobody", run: async () => SIGNED_OUT }
      )
    ).rejects.toThrow(
      'Couldn\'t reach Salesforce as "nobody". Sign in once with: sf org login web --alias nobody'
    );
    for (const f of fs.readdirSync(path.resolve(__dirname, ".."))) {
      if (f.endsWith(".js")) {
        const text = fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
        // exports.js writes only the file a screen would download, into Downloads (API-1.90).
        const written =
          f === "exports.js" ? "" : "|writeFile|appendFile|createWriteStream";
        expect([
          f,
          new RegExp(
            `accessToken|Bearer|org display|sfdxAuthUrl|console\\.${written}`
          ).test(text)
        ]).toEqual([f, false]);
      }
    }
  });

  // API-1.105
  it("saysNoPermissionSetInWords: Salesforce's refusal naming a class never reaches the person", async () => {
    const refused = await callTool(
      "list_seasons",
      {},
      sfAnswering(
        403,
        JSON.stringify([
          {
            errorCode: "FORBIDDEN",
            message:
              "You do not have access to the Apex class named: AgentSeasons"
          }
        ])
      )
    );
    const said = refused.result.content[0].text;
    expect(said).toContain("Shoresh Scheduler");
    expect(said).not.toContain("AgentSeasons");
    expect(said).not.toContain("Apex");
  });

  // API-1.9
  // API-1.105
  it("passesOnThePlainSentence: a refusal or a conflict comes through as Shoresh's own sentence", async () => {
    const sentence =
      'This user can\'t read the group schedule. A Salesforce admin can give it the "Read group schedules" permission set.';
    const refused = await callTool(
      "read_group_schedule",
      { season: "Summer 2026", week: "Week 2" },
      sfAnswering(403, JSON.stringify({ message: sentence }))
    );
    expect(refused.result).toEqual({
      content: [{ type: "text", text: `${sentence} ${PERSON_DECIDES}` }],
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

  // API-1.133: a strict AI app can refuse every tool over one list that doesn't say what it holds.
  it("everyListSaysWhatItHolds", () => {
    const lists = (schema) =>
      Object.values(schema.properties || {}).flatMap((field) => [
        ...(field.type === "array" ? [field] : []),
        ...(field.items && field.items.properties ? lists(field.items) : [])
      ]);
    let checked = 0;
    for (const c of CAPABILITIES) {
      for (const list of lists(c.inputSchema)) {
        expect(list.items).toBeDefined();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  // API-1.128
  it("anOptionBroughtBackTakesItsNumberOnTheCommandLine", () => {
    const { byName } = require("../capabilities");
    const { type } = byName("bring_back_option").inputSchema.properties.option;
    expect(["number", "string"]).toContain(type);
    expect(byName("bring_back_option").inputSchema.required).toEqual([
      "week",
      "option"
    ]);
  });

  // API-1.127, API-1.128, API-1.129, API-1.130
  it("theBuildMenuBuildsHereSavesThere: each action asks the screen's Build menu and saves through build_week", async () => {
    for (const [name, buildAction, input] of [
      ["try_another_option", "TryAnother", {}],
      ["bring_back_option", "BringBack", { option: 1 }],
      ["fill_open_cells", "FillOpen", {}],
      ["start_over_week", "StartOver", {}]
    ]) {
      const seen = [];
      const answers = [
        'HTTP/1.1 200\n\n{"inputs":{},"setup":{},"labels":{}}',
        'HTTP/1.1 200\n\n{"message":"Done with Week 1."}'
      ];
      const run = async (args, stdin) => {
        seen.push({ args, stdin });
        return answers.shift();
      };
      const asked = [];
      const checks = async () => ({
        menuForAgent: (read, how) => {
          asked.push(how);
          return {
            ok: true,
            said: "3 of 4 placed.",
            save: { action: buildAction, revision: "r1", option: 2, days: [] }
          };
        }
      });
      const done = await call(
        name,
        { season: "Summer 2026", week: "Week 1", ...input },
        { run, checks, camp: packaged }
      );
      expect(asked).toEqual([
        { action: buildAction, week: "Week 1", option: input.option }
      ]);
      expect(seen[1].args[3]).toBe("/services/apexrest/shoresh/v1/build_week");
      expect(JSON.parse(seen[1].stdin).action).toBe(buildAction);
      expect(done.ok).toBe(true);
      expect(done.text).toBe("Done with Week 1. 3 of 4 placed.");
    }

    // A refusal is the screen's, and nothing is sent; so is the option the week is already on.
    for (const [said, ok] of [
      [{ ok: false, error: "No open cells." }, false],
      [{ ok: true, unchanged: "Already on it." }, true]
    ]) {
      const seen = [];
      const run = async (args, stdin) => {
        seen.push({ args, stdin });
        return 'HTTP/1.1 200\n\n{"inputs":{},"setup":{},"labels":{}}';
      };
      const done = await call(
        "fill_open_cells",
        { week: "Week 1" },
        {
          run,
          checks: async () => ({ menuForAgent: () => said }),
          camp: packaged
        }
      );
      expect(seen).toHaveLength(1);
      expect(done.ok).toBe(ok);
      expect(done.text).toContain(said.error || said.unchanged);
    }
  });

  // API-1.135, API-1.136
  it("offeringsReadAndSaveThroughTheList: reads with its module and says the row's mark", async () => {
    const read = {
      elective_set: "Chugim",
      set_id: "s1",
      setup: {},
      labels: []
    };
    const offerings = async () => ({
      offeringsForAgent: (got, how) =>
        how.activity === "Nope"
          ? { error: "Chugim doesn't offer." }
          : {
              offerings: [
                { activity: "Swim", look: 'Choose how many seats "Swim" has' }
              ]
            }
    });
    const runOf =
      (seen, status = 200) =>
      async (args, stdin) => {
        seen.push({ args, stdin });
        return stdin
          ? `HTTP/1.1 ${status}\n\n${JSON.stringify({ message: "Changed." })}`
          : `HTTP/1.1 200\n\n${JSON.stringify(read)}`;
      };
    const seenRead = [];
    const said = await call(
      "read_offerings",
      {},
      { run: runOf(seenRead), offerings, camp: packaged }
    );
    expect(seenRead[0].args[3]).toContain("/shoresh/v1/offerings");
    expect(JSON.parse(said.text).offerings[0].activity).toBe("Swim");
    const none = await call(
      "read_offerings",
      { activity: "Nope" },
      { run: runOf([]), offerings, camp: packaged }
    );
    expect(none.ok).toBe(false);

    const change = {
      activity: "Swim",
      fields: { seats: "(blank)" },
      seen: { seats: "2" }
    };
    const seen = [];
    const changed = await call("change_offering", change, {
      run: runOf(seen),
      offerings,
      camp: packaged
    });
    expect(JSON.parse(seen[0].stdin).fields).toEqual({ seats: "(blank)" });
    expect(changed.text).toBe('Changed. Choose how many seats "Swim" has.');
    // A read that fails after the save doesn't undo what was said.
    const answers = ['HTTP/1.1 200\n\n{"message":"Changed."}'];
    const after = await call("change_offering", change, {
      run: async () => answers.shift() ?? "",
      offerings,
      camp: packaged
    });
    expect(after.ok).toBe(true);
    expect(after.text).toBe("Changed.");
  });

  // API-1.131, API-1.132, API-1.133
  it("linkedChoicesReadAndSaveThroughTheEditor: reads with its module, proposes its name and says its marks", async () => {
    const read = {
      elective_set: "Chugim",
      set_id: "s1",
      setup: {},
      labels: [],
      places: { cells: [] }
    };
    const runOf = (seen, message) => async (args, stdin) => {
      seen.push({ args, stdin });
      return args[3].includes("?") || args[3].endsWith("linked_choices")
        ? `HTTP/1.1 200\n\n${JSON.stringify(read)}`
        : `HTTP/1.1 ${message ? 200 : 400}\n\n${JSON.stringify({ message: message ?? "No." })}`;
    };
    const linked = async () => ({
      linkedChoicesForAgent: (got, how) => ({ got, how }),
      proposedForAgent: () => "Pottery · Mon 9:00",
      notesForAgent: () => ['Monday Period 1: Also in "X".']
    });

    const seenRead = [];
    const said = await call(
      "read_linked_choices",
      { season: "Summer 2026", activity: "Pottery" },
      { run: runOf(seenRead), linked, camp: packaged }
    );
    expect(seenRead[0].args[3]).toContain("/shoresh/v1/linked_choices");
    expect(JSON.parse(said.text).how).toEqual({ activity: "Pottery" });

    const seen = [];
    const made = await call(
      "make_linked_choice",
      { activity: "Pottery", periods: [{ day: "Monday", time: "Period 1" }] },
      {
        run: runOf(seen, 'Made the linked choice "x".'),
        linked,
        camp: packaged
      }
    );
    const sent = JSON.parse(seen.find((s) => s.stdin).stdin);
    expect(sent.name).toBe("Pottery · Mon 9:00");
    expect(made.ok).toBe(true);
    expect(made.text).toContain('Also in "X"');

    // A read that fails after the save doesn't undo what was said: it was made.
    const answers = [
      `HTTP/1.1 200\n\n${JSON.stringify(read)}`,
      'HTTP/1.1 200\n\n{"message":"Made it."}'
    ];
    const after = await call(
      "make_linked_choice",
      { activity: "Pottery", periods: [{ day: "Monday", time: "Period 1" }] },
      {
        run: async () => answers.shift() ?? "",
        linked,
        camp: packaged
      }
    );
    expect(after.ok).toBe(true);
    expect(after.text).toBe("Made it.");

    // A name given is sent as it is; a refusal is said with nothing more read.
    const refused = [];
    const no = await call(
      "change_linked_choice",
      { name: "Pottery", new_name: "Pots" },
      { run: runOf(refused), linked, camp: packaged }
    );
    expect(no.ok).toBe(false);
    expect(refused.length).toBe(1);
    expect(JSON.parse(refused[0].stdin).new_name).toBe("Pots");
  });

  // API-1.19
  it("buildsHereSavesThere: build_week reads what Generate reads, builds the week on this computer and saves it through the screen's save", async () => {
    const seen = [];
    const answers = [
      `HTTP/1.1 200\ncontent-type: application/json\n\n${JSON.stringify({
        inputs: { shoresh__Thing__c: 1 },
        setup: {},
        labels: []
      })}`,
      'HTTP/1.1 200\n\n{"message":"Built Week 1."}'
    ];
    const run = async (args, stdin) => {
      seen.push({ args, stdin });
      return answers.shift();
    };
    const asked = [];
    const engine = async (namespace) => ({
      buildForAgent: (read) => {
        asked.push({ namespace, read });
        return { ok: true, save: { revision: "r1", option: 1, days: [] } };
      }
    });
    const built = await call(
      "build_week",
      { season: "Summer 2026", week: "Week 1" },
      { run, engine, camp: packaged }
    );
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/shoresh/v1/build_week?season=Summer+2026&week=Week+1",
      "--method",
      "GET"
    ]);
    expect(asked).toEqual([
      {
        namespace: "shoresh",
        read: { inputs: { shoresh__Thing__c: 1 }, setup: {}, labels: [] }
      }
    ]);
    expect(seen[1].args.slice(3, 6)).toEqual([
      "/services/apexrest/shoresh/v1/build_week",
      "--method",
      "POST"
    ]);
    expect(JSON.parse(seen[1].stdin)).toEqual({
      season: "Summer 2026",
      week: "Week 1",
      revision: "r1",
      option: 1,
      days: []
    });
    expect(built).toEqual({ ok: true, status: 200, text: "Built Week 1." });

    // With the counter's own modules: after the save, the week's checks are read as the counter
    // reads them and said with the build, so an AI can pass on what the screen shows beside the
    // grid (UX pass 2026-11-10: it said only "Built Week 1.").
    const counted = [
      ...[
        `HTTP/1.1 200\ncontent-type: application/json\n\n${JSON.stringify({ inputs: {}, setup: {}, labels: [] })}`,
        'HTTP/1.1 200\n\n{"message":"Built Week 1."}',
        `HTTP/1.1 200\n\n${JSON.stringify({ inputs: {}, setup: {}, labels: [], accepted: "[]" })}`
      ]
    ];
    const countedSeen = [];
    const withCounter = await call(
      "build_week",
      { season: "Summer 2026", week: "Week 1" },
      {
        run: async (args, stdin) => {
          countedSeen.push({ args, stdin });
          return counted.shift();
        },
        engine,
        camp: packaged,
        checks: async () => ({
          buildTerms: () => ({}),
          loadedOf: (inputs) => ({ input: inputs }),
          counterWeek: () => ({
            draft: { schedule: { days: [] } },
            checked: "checked"
          }),
          weekMeasure: () => "measure",
          readKept: (text) => JSON.parse(text),
          counterWords: () => ({
            placed: "174 of 174 placed",
            over: { count: 1, lines: [{ line: "Art: 1 group over" }] },
            to_look_at: [
              { line: "Bunk 6 · Wednesday · Period 5: Over its weekly limit." }
            ],
            notes: [
              {
                line: "Nothing in setup needed a change, so everything was kept as it was."
              }
            ]
          }),
          nameDaysFor: () => {}
        })
      }
    );
    expect(countedSeen[2].args.slice(3, 6)).toEqual([
      "/services/apexrest/shoresh/v1/week_checks?season=Summer+2026&week=Week+1",
      "--method",
      "GET"
    ]);
    expect(withCounter.text).toBe(
      "Built Week 1. 174 of 174 placed. To look at: Art: 1 group over; Bunk 6 · Wednesday · Period 5: Over its weekly limit. Notes: Nothing in setup needed a change, so everything was kept as it was."
    );

    // A counter that can't be worked out adds nothing: the week is saved and said as built.
    const broken = [
      `HTTP/1.1 200\ncontent-type: application/json\n\n${JSON.stringify({ inputs: {}, setup: {}, labels: [] })}`,
      'HTTP/1.1 200\n\n{"message":"Built Week 1."}',
      "HTTP/1.1 200\n\nnot json"
    ];
    const stillBuilt = await call(
      "build_week",
      { season: "Summer 2026", week: "Week 1" },
      {
        run: async () => broken.shift(),
        engine,
        camp: packaged,
        checks: async () => ({ nameDaysFor: () => {} })
      }
    );
    expect(stillBuilt).toMatchObject({ ok: true, text: "Built Week 1." });

    // A refusal while reading, or the engine's own, comes back as one sentence; nothing is saved.
    const refused = await call(
      "build_week",
      { season: "Summer 2026", week: "Week 9" },
      {
        run: sfAnswering(
          400,
          '{"message":"There is no week called \\"Week 9\\" that this user can see."}'
        ),
        engine
      }
    );
    expect(refused.text).toBe(
      'There is no week called "Week 9" that this user can see.'
    );
    const cannot = [];
    expect(
      await call(
        "build_week",
        { season: "Summer 2026", week: "Week 1" },
        {
          run: sfAnswering(200, '{"inputs":{}}', cannot),
          engine: async () => ({
            buildForAgent: () => ({
              ok: false,
              error: "That option can't be built."
            })
          })
        }
      )
    ).toEqual({ ok: false, status: 400, text: "That option can't be built." });
    expect(cannot).toHaveLength(1);
  });

  // API-1.20
  // API-1.30, API-1.31
  it("checksHereAcceptThere: read_week_checks reads what the counter reads and answers the counter's words; accept_finding keeps only a line it lists, through /v1/accept_finding", async () => {
    const read = {
      inputs: { shoresh__Thing__c: 1 },
      setup: {},
      labels: [],
      setup_changes: { dots: [{ key: "d|g|b", words: "Setup changed" }] },
      accepted: "[]"
    };
    const swim = {
      said: "Swim: 2 of 4",
      key: "under|a1|2|4",
      same: "under|a1",
      size: 2
    };
    const overlap = {
      text: "Bunk 1 · Monday · Period 2: clash",
      key: "x",
      acceptable: false
    };
    const handed = [];
    const checks = async (namespace) => ({
      buildTerms: () => "terms",
      loadedOf: (inputs) => ({ input: inputs }),
      counterWeek: () => ({
        draft: { schedule: { days: ["day"] } },
        checked: "checked"
      }),
      weekMeasure: (given) => {
        handed.push({ namespace, given });
        return "measure";
      },
      readKept: (text) => JSON.parse(text),
      checkLines: () => ({
        open: [],
        under: [swim],
        over: [],
        look: [overlap],
        notes: []
      }),
      counterWords: () => ({ placed: "3 of 4 placed" }),
      acceptable: (l) => l.acceptable !== false,
      wordsOf: (l) => l.said || l.text,
      saidOf: () => "Swim, 2 of 4",
      keptLine: (l) => JSON.stringify({ k: l.key, s: l.same, n: l.size }),
      nameDaysFor: () => {}
    });
    const seen = [];
    const answers = (more) => {
      const queue = [`HTTP/1.1 200\n\n${JSON.stringify(read)}`, ...more];
      return async (args, stdin) => {
        seen.push({ args, stdin });
        return queue.shift();
      };
    };
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const got = await call("read_week_checks", asked, {
      run: answers([]),
      checks,
      camp: packaged
    });
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/shoresh/v1/week_checks?season=Summer+2026&week=Week+1&program=Main",
      "--method",
      "GET"
    ]);
    expect(got).toEqual({
      ok: true,
      status: 200,
      about: byName("read_week_checks").about,
      text: JSON.stringify({ placed: "3 of 4 placed" }, null, 2)
    });
    // LOCK-4.7: a Generated Schedule week read gives its revision as seen, for lock_cells.
    read.inputs.revision = "2,1";
    seen.length = 0;
    // Its locked cells too (none in this week; severalCellsAsTheGridDoes names some).
    const noLocks = async () => ({
      buildTerms: () => "terms",
      loadedOf: (inputs) => ({ input: inputs }),
      counterWeek: () => ({ draft: { schedule: { days: [] } } }),
      lockedKeys: () => new Set(),
      replacedDays: () => [],
      nameDaysFor: () => {}
    });
    const withSeen = await call("read_week_checks", asked, {
      run: answers([]),
      checks,
      edits: noLocks
    });
    expect(JSON.parse(withSeen.text)).toEqual({
      placed: "3 of 4 placed",
      locked: [],
      seen: "2,1"
    });
    expect(byName("lock_cells").inputSchema.required).toContain("seen");
    expect(byName("unlock_cells").inputSchema.required).toContain("seen");
    delete read.inputs.revision;
    expect(handed[0].namespace).toBe("shoresh");
    expect([...handed[0].given.setupDots]).toEqual([
      ["d|g|b", "Setup changed"]
    ]);

    // A line it doesn't list, or one with nothing to accept, is refused naming those it can.
    seen.length = 0;
    for (const finding of ["Art: 1 of 3", overlap.text]) {
      const refused = await call(
        "accept_finding",
        { ...asked, finding },
        { run: answers([]), checks }
      );
      expect(refused.ok).toBe(false);
      expect(refused.text).toMatch(
        /The lines that can be accepted: Swim: 2 of 4\.$/
      );
    }
    expect(seen.every((s) => s.args.includes("GET"))).toBe(true);

    seen.length = 0;
    const accepted = await call(
      "accept_finding",
      { ...asked, finding: " swim:  2 of 4" },
      { run: answers(['HTTP/1.1 200\n\n{"message":"Accepted."}']), checks }
    );
    expect(accepted).toEqual({
      ok: true,
      status: 200,
      text: "Accepted: Swim, 2 of 4."
    });
    expect(seen[1].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/accept_finding",
      "--method",
      "POST"
    ]);
    expect(JSON.parse(seen[1].stdin)).toEqual({
      ...asked,
      line: { k: "under|a1|2|4", s: "under|a1", n: 2 }
    });
  });

  // API-1.18: the inputs a read declares are the one list it sends from.
  it("readsSendWhatTheyDeclare: a read sends every input it declares, but what is used on this computer", () => {
    const local = CAPABILITIES.filter((c) => c.localFields).map((c) => [
      c.name,
      c.localFields
    ]);
    expect(local).toEqual([
      ["download_schedule", ["as", "view"]],
      ["download_elective_files", ["file"]],
      ["download_setup", ["list"]]
    ]);
    const special = byName("read_special_schedule");
    const input = Object.fromEntries(
      Object.keys(special.inputSchema.properties).map((f) => [f, "x"])
    );
    const { path } = requestFor(special, input, "");
    for (const field of Object.keys(input)) {
      expect(path).toContain(`${field}=x`);
    }
  });

  // API-1.32
  it("versionsOfAProgram: list_versions asks for the program it was told, so a camp with several programs can list a week's versions", async () => {
    const seen = [];
    await call(
      "list_versions",
      { season: "Summer 2026", week: "Week 1", program: "Teens" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({
            week: "Week 1",
            program: "Teens",
            built: true,
            versions: []
          }),
          seen
        ),
        versionWords
      }
    );
    expect(seen[0].args[3]).toBe(
      "/services/apexrest/v1/versions?season=Summer+2026&week=Week+1&program=Teens"
    );
  });

  // API-1.32
  // CORE-6.11
  it("versionsInThePanelsWords: list_versions reads the panel's own list and says each version in the panel's words", async () => {
    const seen = [];
    const rows = [
      {
        id: "a1",
        name: "Before Placed Soccer",
        origin: "Generated",
        reason: "ThroughAgent",
        savedAt: "2026-10-31T19:40:00.000Z",
        publishedAt: null,
        namedByPublish: false
      },
      {
        id: "a2",
        name: "Published Oct 18, 2:40 PM",
        origin: "Generated",
        reason: null,
        savedAt: "2026-10-18T18:40:00.000Z",
        publishedAt: "2026-10-18T18:40:00.000Z",
        namedByPublish: true
      }
    ];
    const asked = { season: "Summer 2026", week: "Week 1" };
    const got = await call("list_versions", asked, {
      run: sfAnswering(
        200,
        JSON.stringify({
          week: "Week 1",
          program: "Main",
          built: true,
          versions: rows
        }),
        seen
      ),
      versionWords
    });
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/versions?season=Summer+2026&week=Week+1",
      "--method",
      "GET"
    ]);
    const when = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(rows[0].savedAt));
    expect(got.about).toBe(byName("list_versions").about);
    expect(JSON.parse(got.text)).toEqual({
      week: "Week 1",
      program: "Main",
      versions: [
        {
          name: "Before Placed Soccer",
          says: `Generated Schedule · By your AI · ${when}`,
          saved: "2026-10-31T19:40:00.000Z",
          can_delete: true
        },
        {
          name: "Published Oct 18, 2:40 PM",
          says: "Generated Schedule",
          saved: "2026-10-18T18:40:00.000Z",
          can_delete: false
        }
      ]
    });
    // CORE-6.11: on the camp's clock when the camp has one, whatever this computer's is.
    const camps = await call("list_versions", asked, {
      run: sfAnswering(
        200,
        JSON.stringify({
          week: "Week 1",
          program: "Main",
          built: true,
          time_zone: "America/Los_Angeles",
          versions: rows
        })
      ),
      versionWords
    });
    expect(JSON.parse(camps.text).versions[0].says).toBe(
      "Generated Schedule · By your AI · Oct 31, 12:40 PM"
    );
    const none = await call("list_versions", asked, {
      run: sfAnswering(
        200,
        JSON.stringify({
          week: "Week 1",
          program: "Main",
          built: false,
          versions: []
        })
      ),
      versionWords
    });
    expect(JSON.parse(none.text).versions).toBe("None yet");
  });

  // API-1.33, API-1.34
  it("versionActionsAreThePanels: save, restore, rename and delete send the person's fields to their own addresses and pass on Shoresh's sentence", async () => {
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const cases = [
      ["save_version", { name: "Before the trip" }, "Saved Before the trip."],
      [
        "restore_version",
        { version: "Before Restore", saved: "2026-10-31T19:40:00.000Z" },
        "Restored Before Restore."
      ],
      [
        "rename_version",
        { version: "Before the trip", name: "Trip week" },
        "Renamed Before the trip to Trip week."
      ],
      ["delete_version", { version: "Trip week" }, "Deleted Trip week."]
    ];
    for (const [name, more, message] of cases) {
      const seen = [];
      const done = await call(
        name,
        { ...asked, ...more },
        { run: sfAnswering(200, JSON.stringify({ message }), seen) }
      );
      expect(seen[0].args.slice(3, 6)).toEqual([
        `/services/apexrest/v1/${name}`,
        "--method",
        "POST"
      ]);
      expect(JSON.parse(seen[0].stdin)).toEqual({ ...asked, ...more });
      expect(done).toEqual({ ok: true, status: 200, text: message });
    }
    const refused = await call(
      "delete_version",
      { ...asked, version: "Published Oct 18, 2:40 PM" },
      {
        run: sfAnswering(
          400,
          JSON.stringify({
            message:
              "Published Oct 18, 2:40 PM wasn't deleted. \"Published Oct 18, 2:40 PM\" was the published schedule, which is kept as history, so it can't be deleted."
          })
        )
      }
    );
    expect(refused.ok).toBe(false);
    expect(refused.text).toMatch(
      /^Published Oct 18, 2:40 PM wasn't deleted\. /
    );
  });

  // API-1.36, API-1.37, LOCK-4.7
  it("unpublishAndLocksAreTheScreens: unpublish_week, lock_cells and unlock_cells send the person's fields to their own addresses and pass on Shoresh's sentence", async () => {
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const cases = [
      ["unpublish_week", {}, "Unpublished Week 1."],
      [
        "lock_cells",
        { day: "Monday", group: "Bunk 3", time: "Period 2", seen: "1,1" },
        "Locked Bunk 3 · Monday · Period 2."
      ],
      [
        "unlock_cells",
        { day: "Monday", group: "all", seen: "1,1" },
        "Unlocked Monday."
      ]
    ];
    for (const [name, more, message] of cases) {
      const seen = [];
      const done = await call(
        name,
        { ...asked, ...more },
        { run: sfAnswering(200, JSON.stringify({ message }), seen) }
      );
      expect(seen[0].args.slice(3, 6)).toEqual([
        `/services/apexrest/v1/${name}`,
        "--method",
        "POST"
      ]);
      expect(JSON.parse(seen[0].stdin)).toEqual({ ...asked, ...more });
      expect(done).toEqual({ ok: true, status: 200, text: message });
    }
    const conflict = await call("unpublish_week", asked, {
      run: sfAnswering(
        409,
        JSON.stringify({
          message:
            "Someone else published or unpublished this week since, so nothing was unpublished."
        })
      )
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.text).toBe(
      "Someone else published or unpublished this week since, so nothing was unpublished."
    );
  });

  // API-1.108: every answer says which season Shoresh used, named or not, and the MCP answer
  // says it to the person.
  it("theSeasonUsedIsSaid: an answer naming its season carries it, and the tool result says it", async () => {
    const done = await call(
      "unpublish_week",
      { week: "Week 1" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({
            message: "Unpublished Week 1.",
            season: "Summer 2027"
          })
        )
      }
    );
    expect(done).toEqual({
      ok: true,
      status: 200,
      text: "Unpublished Week 1.",
      season: "Summer 2027"
    });
    const { toolResult } = require("../mcp");
    expect(toolResult(done).content.map((c) => c.text)).toEqual([
      "Unpublished Week 1.",
      "Season used: Summer 2027."
    ]);
  });

  // WEEK-1.7
  it("numberedDaysForAnAi: in a numbered season an AI may name the number, the date or the weekday, and its answers say the number", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const edits = async () =>
      Object.assign(
        {},
        ...[
          "shoreshGeneratedWeek/build.js",
          "shoreshTerms/shoreshTerms.js",
          "shoreshGeneratedSchedule/counter.js",
          "shoreshGeneratedSchedule/locks.js",
          "shoreshWeekEditor/measure.js",
          "shoreshWeekEditor/specials.js",
          "shoreshWeekEditor/slotEdits.js",
          "shoreshWeekEditor/locks.js",
          "shoreshWeekEditor/handEdits.js"
        ].map((f) => require(`${LWC}/${f}`))
      );
    const { camp, SMALL } = require(
      `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
    );
    const { FIELD } = require(`${LWC}/shoreshSchema/shoreshSchema.js`);
    const inputs = camp({ ...SMALL, scheduleId: "a0S000000000001AAA" });
    const [swim, art] = inputs.activities.map((a) => a.Id);
    inputs.days = inputs.days.map((day) => ({
      ...day,
      items: [
        ...day.items,
        { id: swim, name: "Swim", kind: "A", gone: false },
        { id: art, name: "Art", kind: "A", gone: false }
      ],
      rows: ["1,2,3,", "1,3,2,"],
      locks: ["", ""]
    }));
    const moveOn = async (numbered, day) => {
      const seen = [];
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify({
          inputs,
          labels: [],
          setup: { season: { [FIELD.Season.NumberedDays]: numbered } }
        })}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: "Done." })}`
      ];
      const done = await call(
        "move_cell",
        {
          season: "Summer 2026",
          week: "Week 1",
          program: "Main",
          day,
          group: "Bunk 1",
          time: "Period 1",
          was: "Swim",
          to_day: day,
          to_group: "Bunk 1",
          to_time: "Period 3"
        },
        {
          run: async (args, stdin) => {
            seen.push(stdin);
            return queue.shift();
          },
          edits
        }
      );
      return { done, sent: seen[1] };
    };
    for (const day of ["Day 1", "day 1", "2026-06-29", "Monday"]) {
      const { done, sent } = await moveOn(true, day);
      expect(done.ok).toBe(true);
      expect(sent).toContain("Day 1");
      expect(sent).not.toContain("Monday");
    }
    // A named-days season has no Day 1, and says Monday as before.
    const named = await moveOn(false, "Monday");
    expect(named.done.ok).toBe(true);
    expect(named.sent).toContain("Monday");
    expect((await moveOn(false, "Day 1")).done.ok).toBe(false);
  });

  // LOCK-4.1
  it("cellContextAsTheScreensEditor: an AI's edits work with what the week editor gives its edits, and a lock on any block of an activity locks all of it for an AI too", () => {
    const LWC = "../../force-app/main/default/lwc";
    const m = Object.assign(
      {},
      ...[
        "shoreshGeneratedWeek/build.js",
        "shoreshTerms/shoreshTerms.js",
        "shoreshGeneratedSchedule/counter.js",
        "shoreshGeneratedSchedule/locks.js",
        "shoreshWeekEditor/measure.js",
        "shoreshWeekEditor/specials.js",
        "shoreshWeekEditor/slotEdits.js",
        "shoreshWeekEditor/locks.js",
        "shoreshWeekEditor/handEdits.js"
      ].map((f) => require(`${LWC}/${f}`))
    );
    const { contextOf, lockedCells } = require("../cells");
    const { camp, SMALL } = require(
      `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
    );
    // Bunk 2 on Monday: Swim for Periods 2 and 3, with only Period 3 locked.
    const inputs = camp({ ...SMALL, scheduleId: "a0S000000000001AAA" });
    const [swim] = inputs.activities.map((a) => a.Id);
    inputs.days = inputs.days.map((day) => {
      const at = day.items.length + 1;
      return {
        ...day,
        items: [
          ...day.items,
          { id: swim, name: "Swim", kind: "A", gone: false }
        ],
        rows: [",,,", `,${at},^,`],
        locks: day.dateValue === "2026-06-29" ? ["", ",,1,"] : ["", ""]
      };
    });
    const generated = contextOf(m, { inputs, setup: {}, labels: [] });
    const manual = contextOf(m, {
      draft: { schedule: { days: generated.week }, activities: [], away: [] },
      setup: {},
      labels: []
    });

    // Every field the week editor gives its edits (shoreshWeekEditor editCtx), an AI's have too:
    // one added on screen and not here fails this.
    const source = fs.readFileSync(
      path.join(__dirname, `${LWC}/shoreshWeekEditor/shoreshWeekEditor.js`),
      "utf8"
    );
    const body = /get editCtx\(\) \{\s*return \{([\s\S]*?)\n {4}\};/.exec(
      source
    )[1];
    const keys = [...body.matchAll(/^ {6}(\w+):/gm)].map(([, key]) => key);
    expect(keys).toEqual(expect.arrayContaining(["week", "isLocked"]));
    for (const ctx of [generated, manual]) {
      for (const key of keys) {
        expect([key, key in ctx]).toEqual([key, true]);
      }
    }

    // Both blocks of the half-locked Swim are locked, as the grid shows them; Open is not.
    const monday = generated.week.findIndex(
      (day) => day.dateValue === "2026-06-29"
    );
    const cell = (block) => ({ day: monday, group: 1, block });
    expect([1, 2, 3].map((b) => generated.isLocked(cell(b)))).toEqual([
      true,
      true,
      false
    ]);
    expect(lockedCells(m, { inputs, setup: {}, labels: [] })).toHaveLength(2);
    // Manual Build has no locks.
    expect(manual.isLocked(cell(1))).toBe(false);
  });

  // API-1.38, API-1.39, API-1.40, API-1.138
  it("severalCellsAsTheGridDoes: move_cell, take_out_cell and copy_cells work the edit out with the week editor's own module and send its runs and words to their own addresses", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const edits = async () =>
      Object.assign(
        {},
        ...[
          "shoreshGeneratedWeek/build.js",
          "shoreshTerms/shoreshTerms.js",
          "shoreshGeneratedSchedule/counter.js",
          "shoreshGeneratedSchedule/locks.js",
          "shoreshWeekEditor/measure.js",
          "shoreshWeekEditor/specials.js",
          "shoreshWeekEditor/slotEdits.js",
          "shoreshWeekEditor/locks.js",
          "shoreshWeekEditor/handEdits.js"
        ].map((f) => require(`${LWC}/${f}`))
      );
    const { camp, SMALL } = require(
      `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
    );
    // Two days; Bunk 1: Flagpole, Swim, Art, Open; Bunk 2: Flagpole, Art, Swim, Open (locked
    // in Period 2 on Monday).
    const inputs = camp({ ...SMALL, scheduleId: "a0S000000000001AAA" });
    const [swim, art] = inputs.activities.map((a) => a.Id);
    inputs.days = inputs.days.map((day) => ({
      ...day,
      items: [
        ...day.items,
        { id: swim, name: "Swim", kind: "A", gone: false },
        { id: art, name: "Art", kind: "A", gone: false }
      ],
      rows: ["1,2,3,", "1,3,2,"],
      locks: day.dateValue === "2026-06-29" ? ["", ",,1,"] : ["", ""]
    }));
    const read = { inputs, setup: {}, labels: [] };
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const send = async (name, more, status = 200, message = "Done.") => {
      const seen = [];
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify(read)}`,
        `HTTP/1.1 ${status}\n\n${JSON.stringify({ message })}`
      ];
      const done = await call(
        name,
        { ...asked, ...more },
        {
          run: async (args, stdin) => {
            seen.push({ args, stdin });
            return queue.shift();
          },
          edits
        }
      );
      return { done, seen, sent: seen[1] && JSON.parse(seen[1].stdin) };
    };
    const monday = { day: "Monday", group: "Bunk 1" };

    // Onto Open: moved, keeping its length, with the screen's label.
    const moved = await send("move_cell", {
      ...monday,
      time: "Period 1",
      was: "Swim",
      to_day: "Monday",
      to_group: "Bunk 1",
      to_time: "Period 3"
    });
    expect(moved.seen[0].args[3]).toBe(
      "/services/apexrest/v1/week_checks?season=Summer+2026&week=Week+1&program=Main"
    );
    expect(moved.seen[1].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/move_cell",
      "--method",
      "POST"
    ]);
    expect(moved.sent.change).toBe("Moved Swim to Bunk 1 · Monday · Period 3");
    // Only the cells that change: Period 2 between them is left alone.
    expect(moved.sent.runs).toEqual([
      {
        day: "2026-06-29",
        groupId: inputs.groups[0].Id,
        firstBlockId: inputs.timeBlocks[1].Id,
        blockIds: [inputs.timeBlocks[1].Id],
        before: [`A:${swim}`],
        after: [""],
        locksBefore: [""]
      },
      expect.objectContaining({
        firstBlockId: inputs.timeBlocks[3].Id,
        before: [""],
        after: [`A:${swim}`]
      })
    ]);
    expect(moved.done).toEqual({ ok: true, status: 200, text: "Done." });
    expect(moved.sent.revision).toBeUndefined();

    // LOCK-4.8: the week as the agent read it goes with the edit, for the save to hold and compare.
    const withSeen = await send("move_cell", {
      ...monday,
      time: "Period 1",
      was: "Swim",
      to_day: "Monday",
      to_group: "Bunk 1",
      to_time: "Period 3",
      seen: "3,1"
    });
    expect(withSeen.sent.revision).toBe("3,1");

    // LOCK-4.8: read_week_checks names the locked cells as the screen names a cell.
    inputs.revision = "3,1";
    const checked = await call("read_week_checks", asked, {
      run: async () => `HTTP/1.1 200\n\n${JSON.stringify(read)}`,
      checks: async () => ({
        buildTerms: () => "terms",
        loadedOf: (given) => ({ input: given }),
        counterWeek: () => ({ draft: { schedule: { days: [] } } }),
        weekMeasure: () => "measure",
        readKept: () => [],
        counterWords: () => ({ placed: "6 of 8 placed" }),
        nameDaysFor: () => {}
      }),
      edits
    });
    expect(JSON.parse(checked.text)).toEqual({
      placed: "6 of 8 placed",
      locked: [`Bunk 2 · Monday · ${inputs.timeBlocks[2].Name}`],
      seen: "3,1"
    });
    delete inputs.revision;

    // Onto a filled cell: swapped.
    const swapped = await send("move_cell", {
      ...monday,
      time: "Period 1",
      was: "swim",
      to_day: "2026-06-29",
      to_group: "Bunk 2",
      to_time: "Period 1"
    });
    expect(swapped.sent.change).toBe("Swapped Swim and Art");

    // API-1.138: longer over Open, shorter, and what the bottom handle refuses, through the tool.
    const longer = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Art",
      ends_at: "Period 3"
    });
    expect(longer.seen[1].args[3]).toBe("/services/apexrest/v1/move_cell");
    expect(longer.sent.change).toBe(
      "Art runs 2 time blocks · Bunk 1 · Monday · Period 2"
    );
    expect(longer.sent.runs).toEqual([
      expect.objectContaining({
        firstBlockId: inputs.timeBlocks[2].Id,
        blockIds: [inputs.timeBlocks[2].Id, inputs.timeBlocks[3].Id],
        before: [`A:${art}`, ""],
        after: [`A:${art}`, `^A:${art}`]
      })
    ]);
    const noRoom = await send("change_cell_length", {
      ...monday,
      time: "Period 1",
      was: "Swim",
      ends_at: "Period 2"
    });
    expect(noRoom.done.ok).toBe(false);
    expect(noRoom.done.text).toContain("Swim doesn't fit there.");
    expect(noRoom.seen).toHaveLength(1);
    const beforeIt = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Art",
      ends_at: "Period 1"
    });
    expect(beforeIt.done.text).toContain("Art can't end before it starts.");
    expect(beforeIt.seen).toHaveLength(1);
    const lockedLonger = await send("change_cell_length", {
      day: "Monday",
      group: "Bunk 2",
      time: "Period 2",
      was: "Swim",
      ends_at: "Period 3"
    });
    expect(lockedLonger.done.text).toContain(
      "Bunk 2 · Monday · Period 2 is locked."
    );
    expect(lockedLonger.seen).toHaveLength(1);
    const sameEnd = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Art",
      ends_at: "Period 2"
    });
    expect(sameEnd.done.ok).toBe(true);
    expect(sameEnd.done.text).toBe(
      "Art already ends at Period 2. Nothing was changed."
    );
    expect(sameEnd.seen).toHaveLength(1);
    // An Open cell has no handle, whichever end is asked for.
    for (const ends_at of ["Period 3", "Period 1"]) {
      const openCell = await send("change_cell_length", {
        ...monday,
        time: "Period 3",
        was: "Open",
        ends_at
      });
      expect(openCell.done.ok).toBe(false);
      expect(openCell.done.text).toContain("no length to change");
    }
    // Someone else's change: the cell, and the week as read.
    const stale = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Swim",
      ends_at: "Period 3"
    });
    expect(stale.done.status).toBe(409);
    expect(stale.seen).toHaveLength(1);
    const withWeek = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Art",
      ends_at: "Period 3",
      seen: "3,1"
    });
    expect(withWeek.sent.revision).toBe("3,1");
    // A longer one, from a cell in its middle; a fixed activity, as a hand edit; an event's none.
    const asRead = inputs.days[0];
    inputs.days[0] = {
      ...asRead,
      rows: ["1,2,^,", "1,3,2,"],
      locks: ["", ""]
    };
    const shorter = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Swim",
      ends_at: "Period 1"
    });
    expect(shorter.sent.change).toBe(
      "Swim runs 1 time block · Bunk 1 · Monday · Period 1"
    );
    const longerStill = await send("change_cell_length", {
      ...monday,
      time: "Period 2",
      was: "Swim",
      ends_at: "Period 3"
    });
    expect(longerStill.sent.change).toBe(
      "Swim runs 3 time blocks · Bunk 1 · Monday · Period 1"
    );
    inputs.days[0] = { ...asRead, rows: ["1,,3,", "1,3,2,"], locks: ["", ""] };
    const fixedName = asRead.items[0].name;
    const firstBlock = asRead.blocks[0].name;
    const fixed = await send("change_cell_length", {
      ...monday,
      time: firstBlock,
      was: fixedName,
      ends_at: "Period 1"
    });
    expect(fixed.sent.change).toBe(
      `${fixedName} runs 2 time blocks · Bunk 1 · Monday · ${firstBlock}`
    );
    const event = "a1B000000000001AAA";
    inputs.days[0] = {
      ...asRead,
      items: [...asRead.items, { id: event, name: "Color War", kind: "S" }],
      rows: [`${asRead.items.length + 1},,3,`, "1,3,2,"],
      locks: ["", ""]
    };
    const onEvent = await send("change_cell_length", {
      ...monday,
      time: firstBlock,
      was: "Color War",
      ends_at: "Period 1"
    });
    expect(onEvent.done.ok).toBe(false);
    expect(onEvent.done.text).toContain("no length to change");
    inputs.days[0] = asRead;

    // A locked cell, someone else's change and a name that isn't there: refused, nothing sent.
    const locked = await send("move_cell", {
      ...monday,
      time: "Period 2",
      was: "Art",
      to_day: "Monday",
      to_group: "Bunk 2",
      to_time: "Period 2"
    });
    expect(locked.done).toEqual({
      ok: false,
      status: 400,
      text: "Bunk 2 · Monday · Period 2 is locked."
    });
    expect(locked.seen).toHaveLength(1);
    const changed = await send("take_out_cell", {
      ...monday,
      time: "Period 1",
      was: "Art"
    });
    expect(changed.done).toEqual({
      ok: false,
      status: 409,
      text: "Changed by someone else: Bunk 1 · Monday · Period 1 holds Swim now. Nothing was changed."
    });
    const unknown = await send("take_out_cell", {
      ...monday,
      group: "Bunk 9",
      time: "Period 1",
      was: "Swim"
    });
    expect(unknown.done.text).toBe(
      'There is no group called "Bunk 9" on that day. The groups: Bunk 1, Bunk 2.'
    );
    // API-1.143: Generated Schedule has no Clear day or Clear week; nothing is sent.
    const noClear = await send("clear_day", { ...monday });
    expect(noClear.done).toEqual({
      ok: false,
      status: 400,
      text: "Clear day is on Manual Build only. Nothing was changed."
    });
    expect(noClear.seen).toHaveLength(1);
    const noWeek = await send("clear_week", { ...monday });
    expect(noWeek.done.text).toBe(
      "Clear week is on Manual Build only. Nothing was changed."
    );
    expect(noWeek.seen).toHaveLength(1);

    // Taken out whole.
    const out = await send("take_out_cell", {
      ...monday,
      time: "Period 2",
      was: "Art"
    });
    expect(out.sent.change).toBe("Cleared Art · Bunk 1 · Monday · Period 2");
    expect(out.sent.runs[0].after).toEqual([""]);

    // Copied and pasted: the paste's own label, and a locked cell left as it is and said.
    const pasted = await send("copy_cells", {
      day: "Tuesday",
      groups: ["Bunk 1"],
      time: "Period 1",
      through_time: "Period 2",
      to_day: "Monday",
      to_group: "Bunk 2",
      to_time: "Period 1"
    });
    expect(pasted.sent.change).toBe(
      "Pasted 2 activities · Bunk 2 · Monday · Period 1"
    );
    expect(pasted.sent.said).toBe("1 left out: Art · Bunk 2 · Monday: locked.");
    expect(pasted.sent.runs).toEqual([
      expect.objectContaining({ before: [`A:${art}`], after: [`A:${swim}`] })
    ]);
    const same = await send("copy_cells", {
      day: "Tuesday",
      groups: ["Bunk 1"],
      time: "Period 1",
      to_day: "Monday",
      to_group: "Bunk 1",
      to_time: "Period 1"
    });
    expect(same.done).toEqual({
      ok: true,
      status: 200,
      text: "Nothing to paste: Bunk 1 · Monday · Period 1 already matches."
    });
    expect(same.seen).toHaveLength(1);

    // Shoresh's own conflict comes back as its sentence.
    const conflict = await send(
      "move_cell",
      {
        ...monday,
        time: "Period 1",
        was: "Swim",
        to_day: "Monday",
        to_group: "Bunk 1",
        to_time: "Period 3"
      },
      409,
      "Changed by someone else since you read the week: Moved Swim to Bunk 1 · Monday · Period 3. Nothing was changed."
    );
    expect(conflict.done.ok).toBe(false);
    expect(conflict.done.text).toMatch(/^Changed by someone else since/);
  });

  // API-1.73, API-1.74
  it("specialDaysWithWhatWasSeen: special days are read by season in the web address, put on and taken off a day with what the day had as seen, and a replace asks the person first", async () => {
    for (const name of ["put_special_day_on_day", "take_special_day_off_day"]) {
      expect(byName(name).inputSchema.required).toEqual([
        "special_day",
        "week",
        "day",
        "seen"
      ]);
    }
    expect(byName("put_special_day_on_day").description).toMatch(
      /ask the person, and only if they say yes send it again with replace: true/
    );
    const read = [];
    await call(
      "read_special_days",
      { season: "Summer 2026" },
      { run: sfAnswering(200, JSON.stringify({ message: "Days" }), read) }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/read_special_days?season=Summer+2026"
    );
    const asked = {
      put_special_day_on_day: {
        season: "Summer 2026",
        special_day: "Visiting Day",
        week: "Week 1",
        day: "Tuesday",
        replace: true,
        seen: "Field Day"
      },
      take_special_day_off_day: {
        special_day: "Field Day",
        week: "Week 1",
        day: "Tuesday",
        seen: "Field Day"
      }
    };
    for (const [name, body] of Object.entries(asked)) {
      const sent = [];
      await call(name, body, {
        run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
      });
      expect(sent[0].args[3]).toBe(`/services/apexrest/v1/${name}`);
      expect(JSON.parse(sent[0].stdin)).toEqual(body);
    }
  });

  // API-1.75
  it("specialEventAsTheScreensEditor: place_special_event works the cells out with the week editor's own special events and sends its runs and words", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const edits = async () =>
      Object.assign(
        {},
        ...[
          "shoreshGeneratedWeek/build.js",
          "shoreshTerms/shoreshTerms.js",
          "shoreshGeneratedSchedule/counter.js",
          "shoreshGeneratedSchedule/locks.js",
          "shoreshWeekEditor/measure.js",
          "shoreshWeekEditor/specials.js",
          "shoreshWeekEditor/slotEdits.js",
          "shoreshWeekEditor/locks.js",
          "shoreshWeekEditor/handEdits.js"
        ].map((f) => require(`${LWC}/${f}`))
      );
    const { camp, SMALL } = require(
      `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
    );
    // Flag, Period 1 to 3. Bunk 1: Flagpole, Swim, Art, Open; Bunk 2: Flagpole, Art, Swim, Open
    // (locked in Period 2 on Monday).
    const inputs = camp({ ...SMALL, scheduleId: "a0S000000000001AAA" });
    const [swim, art] = inputs.activities.map((a) => a.Id);
    inputs.days = inputs.days.map((day) => ({
      ...day,
      items: [
        ...day.items,
        { id: swim, name: "Swim", kind: "A", gone: false },
        { id: art, name: "Art", kind: "A", gone: false }
      ],
      rows: ["1,2,3,", "1,3,2,"],
      locks: day.dateValue === "2026-06-29" ? ["", ",,1,"] : ["", ""]
    }));
    const colorWar = "a0E000000000001AAA";
    const read = {
      inputs,
      setup: {
        special: { specialEvents: [{ Id: colorWar, Name: "Color War" }] }
      },
      labels: []
    };
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const send = async (more) => {
      const seen = [];
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify(read)}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: "Done." })}`
      ];
      const done = await call(
        "place_special_event",
        { ...asked, ...more },
        {
          run: async (args, stdin) => {
            seen.push({ args, stdin });
            return queue.shift();
          },
          edits
        }
      );
      return { done, seen, sent: seen[1] && JSON.parse(seen[1].stdin) };
    };

    const placed = await send({
      event: "color war",
      day: "Tuesday",
      groups: ["Bunk 1", "Bunk 2"],
      time: "Period 2",
      through_time: "Period 3"
    });
    expect(placed.seen[1].args[3]).toBe(
      "/services/apexrest/v1/place_special_event"
    );
    expect(placed.sent.change).toBe(
      "Placed Color War · Bunk 1 to Bunk 2 · Tuesday · Period 2 to Period 3"
    );
    expect(placed.sent).not.toHaveProperty("event");
    expect(placed.sent.runs).toHaveLength(2);
    expect(placed.sent.runs[0]).toEqual(
      expect.objectContaining({
        day: "2026-06-30",
        groupId: inputs.groups[0].Id,
        before: [`A:${art}`, ""],
        after: [`S:${colorWar}`, `^S:${colorWar}`]
      })
    );
    expect(placed.done).toEqual({ ok: true, status: 200, text: "Done." });

    // A locked cell refuses it, in the screen's words; nothing is sent.
    const locked = await send({
      event: "Color War",
      day: "Monday",
      groups: ["Bunk 2"],
      time: "Period 2"
    });
    expect(locked.done).toEqual({
      ok: false,
      status: 400,
      text: "Bunk 2 · Monday · Period 2 is locked."
    });
    expect(locked.seen).toHaveLength(1);
    const unknown = await send({
      event: "Carnival",
      day: "Monday",
      groups: ["Bunk 1"],
      time: "Period 1"
    });
    const none = await send({
      event: "Color War",
      day: "Monday",
      groups: [],
      time: "Period 1"
    });
    expect(none.done.text).toBe("Say which groups (groups), like Bunk 3.");
    expect(unknown.done.text).toBe(
      'There is no special event called "Carnival" in this season. The special events: Color War.'
    );
  });

  // API-1.76, API-1.77, API-1.78, API-1.79
  it("specialSchedulesWithWhatWasSeen: a special schedule is read by name in the web address, a cell sends what it held, a frame change sends the seen and says ask first before taking cells away, and Set it up sends the noted name", async () => {
    expect(
      byName("change_special_schedule_frame").inputSchema.required
    ).toEqual(["special", "action", "seen"]);
    expect(byName("change_special_schedule_frame").description).toMatch(
      /ask the person first/
    );
    expect(
      byName("change_special_schedule_cell").inputSchema.required
    ).toContain("was");
    const read = [];
    await call(
      "read_special_schedule",
      { season: "Summer 2026", special: "Color War" },
      { run: sfAnswering(200, JSON.stringify({ message: "Plan" }), read) }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/read_special_schedule?season=Summer+2026&special=Color+War"
    );
    const asked = {
      change_special_schedule_cell: {
        special: "Color War",
        column: "Blue",
        time: "Relays",
        was: "Open",
        activity: "Swim"
      },
      change_special_schedule_frame: {
        special: "Color War",
        action: "add_time_block",
        start_time: "1:00 PM",
        end_time: "2:00 PM",
        seen: "4"
      },
      set_up_noted_item: {
        week: "Week 1",
        kind: "special event",
        name: "Carnival"
      }
    };
    for (const [name, body] of Object.entries(asked)) {
      const sent = [];
      await call(name, body, {
        run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
      });
      expect(sent[0].args[3]).toBe(`/services/apexrest/v1/${name}`);
      expect(JSON.parse(sent[0].stdin)).toEqual(body);
    }
  });

  // API-1.66, API-1.67, API-1.68
  it("electiveSeatsAsTheSeatsScreen: the seats are read with their fields in the web address, assigned with the screen's own modules and the seats seen, and a move sends what was seen", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const electives = async () =>
      Object.assign(
        {},
        ...[
          "shoreshTerms/shoreshTerms.js",
          "shoreshElectiveEngine/shoreshElectiveEngine.js",
          "shoreshElectiveSeats/seats.js"
        ].map((f) => require(`${LWC}/${f}`))
      );
    const { runView } = require(
      `${LWC}/shoreshElectiveSeats/__tests__/data/run.js`
    );
    expect(byName("assign_elective_seats").inputSchema.required).toEqual([
      "week",
      "seen"
    ]);
    expect(byName("move_elective_seat").inputSchema.required).toEqual([
      "week",
      "camper",
      "day",
      "time",
      "elective",
      "seen"
    ]);
    const read = [];
    await call(
      "read_elective_seats_now",
      { season: "Summer 2026", week: "Week 1", elective_set: "Chugim" },
      { run: sfAnswering(200, JSON.stringify({ message: "Seats" }), read) }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/elective_seats_now?season=Summer+2026&week=Week+1&elective_set=Chugim"
    );

    const asked = {
      season: "Summer 2026",
      week: "Week 1",
      elective_set: "Chugim"
    };
    const view = runView();
    const PREVIEW =
      'Nothing has been done yet. This assigns seats in Chugim in Week 1, in the version being worked on: 20 seats placed from the campers\' choices. There is no undo. Show the person exactly this and ask. Only if they say yes, send the same request again with confirm: "t1".';
    const assign = async (seen, more = {}) => {
      const seen_ = [];
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify({ view, labels: [] })}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: more.confirm ? "Seats assigned in Chugim in Week 1." : PREVIEW })}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ view: { ...view, revision: 2, assigned: true }, labels: [] })}`
      ];
      const done = await call(
        "assign_elective_seats",
        { ...asked, seen, ...more },
        {
          run: async (args, stdin) => {
            seen_.push({ args, stdin });
            return queue.shift();
          },
          electives
        }
      );
      return { done, sent: seen_ };
    };
    // Shoresh asks first (API-1.106): its preview comes back as it is, nothing more read.
    const previewed = await assign("r1:1");
    expect(previewed.done).toEqual(
      expect.objectContaining({ ok: true, asksFirst: true, text: PREVIEW })
    );
    expect(previewed.sent).toHaveLength(2);
    expect(JSON.parse(previewed.sent[1].stdin).confirm).toBeUndefined();
    const done = await assign("r1:1", { confirm: "t1" });
    expect(done.sent[0].args[3]).toBe(
      "/services/apexrest/v1/assign_elective_seats?season=Summer+2026&week=Week+1&elective_set=Chugim"
    );
    const body = JSON.parse(done.sent[1].stdin);
    // The screen's own request, worked out by its own modules.
    const m = await electives();
    const run = m.readRun(view);
    const expected = m.assignRequest(
      run,
      m.assignSeats(m.engineInput(run, m.buildTerms([])).input)
    );
    expect(body).toEqual({
      ...asked,
      seen: "r1:1",
      seats: expected.seats,
      dropped: expected.dropped,
      confirm: "t1"
    });
    expect(body.seats.length).toBeGreaterThan(0);
    expect(done.done.ok).toBe(true);
    expect(done.done.text).toMatch(/^\d+ of \d+ placed\.$/);

    // Read at another revision: refused before anything is sent.
    const stale = await assign("r1:0");
    expect(stale.done).toEqual(
      expect.objectContaining({ ok: false, status: 409 })
    );
    expect(stale.sent).toHaveLength(1);
    // No seen: asked for, nothing read or sent.
    const none = await assign("");
    expect(none.done.status).toBe(400);
    expect(none.sent).toHaveLength(0);

    const moved = [];
    const move = {
      ...asked,
      camper: "#12",
      day: "Monday",
      time: "Period 1",
      elective: "Archery",
      seen: "2"
    };
    await call("move_elective_seat", move, {
      run: sfAnswering(200, JSON.stringify({ message: "Moved" }), moved)
    });
    expect(moved[0].args[3]).toBe("/services/apexrest/v1/move_elective_seat");
    expect(JSON.parse(moved[0].stdin)).toEqual(move);
  });

  // API-1.69, API-1.70, API-1.71, API-1.72
  it("restOfElectiveSeatsWithWhatWasSeen: a lock, a new version and the Clear send what was seen, the Clear's picture is read with the season in the web address, and the Clear says to ask first", async () => {
    expect(byName("clear_electives").description).toMatch(
      /ask the person first/
    );
    const read = [];
    await call(
      "read_electives_to_clear",
      { season: "Summer 2026" },
      { run: sfAnswering(200, JSON.stringify({ message: "Picture" }), read) }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/electives_to_clear?season=Summer+2026"
    );
    const asked = {
      lock_elective_seat: {
        season: "Summer 2026",
        week: "Week 1",
        camper: "#12",
        day: "Monday",
        time: "Period 1",
        locked: false,
        seen: "3"
      },
      start_new_elective_version: {
        season: "Summer 2026",
        week: "Week 1",
        seen: "4"
      },
      clear_electives: { season: "Summer 2026", week: "Week 1", seen: "a1b2" }
    };
    for (const [name, body] of Object.entries(asked)) {
      expect(byName(name).inputSchema.required).toContain("seen");
      const sent = [];
      await call(name, body, {
        run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
      });
      expect(sent[0].args[3]).toBe(`/services/apexrest/v1/${name}`);
      expect(JSON.parse(sent[0].stdin)).toEqual(body);
    }
  });

  // API-1.65
  it("rainyDayAsTheScreensEditor: switch_to_rain_plans works the day out with the week editor's own rainy day and sends its runs, marks, words and the day's marks as read", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const { nsRecord } = require("shoresh-jest/namespace");
    const edits = async () =>
      Object.assign(
        {},
        ...[
          "shoreshGeneratedWeek/build.js",
          "shoreshTerms/shoreshTerms.js",
          "shoreshGeneratedSchedule/counter.js",
          "shoreshGeneratedSchedule/locks.js",
          "shoreshWeekEditor/measure.js",
          "shoreshWeekEditor/specials.js",
          "shoreshWeekEditor/slotEdits.js",
          "shoreshWeekEditor/locks.js",
          "shoreshWeekEditor/handEdits.js",
          "shoreshWeekEditor/rain.js"
        ].map((f) => require(`${LWC}/${f}`))
      );
    const { camp, SMALL } = require(
      `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
    );
    // SMALL with Soccer outdoors (Art its rain plan) in both bunks' Monday Period 1, Bunk 2's
    // locked; a mark from before on the day.
    const inputs = camp({ ...SMALL, scheduleId: "a0S000000000001AAA" });
    const [, art, soccer] = inputs.activities;
    const outdoors = nsRecord({ Outdoor__c: true, RainPlan__c: art.Id });
    inputs.activities = inputs.activities.map((r) =>
      r.Id === soccer.Id ? { ...r, ...outdoors } : r
    );
    const item = { kind: "A", id: soccer.Id, name: "Soccer", gone: false };
    const [bunk1, bunk2] = inputs.groups.map((g) => g.Id);
    const [, p1, p2] = inputs.timeBlocks.map((b) => b.Id);
    const earlier = `${bunk1}|${p2}|${soccer.Id}`;
    inputs.days = inputs.days.map((day, d) => ({
      ...day,
      items: [...day.items, item],
      rows: d === 0 ? ["1,2,,", "1,2,,"] : day.rows,
      locks: d === 0 ? ["", ",1,,"] : day.locks,
      rain: d === 0 ? [earlier] : []
    }));
    const read = { inputs, setup: {}, labels: [] };
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const send = async (day, status = 200, message = "Done.") => {
      const seen = [];
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify(read)}`,
        `HTTP/1.1 ${status}\n\n${JSON.stringify({ message })}`
      ];
      const done = await call(
        "switch_to_rain_plans",
        { ...asked, day },
        {
          run: async (args, stdin) => {
            seen.push({ args, stdin });
            return queue.shift();
          },
          edits
        }
      );
      return { done, seen, sent: seen[1] && JSON.parse(seen[1].stdin) };
    };

    const monday = await send("Monday");
    expect(monday.seen[1].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/switch_to_rain_plans",
      "--method",
      "POST"
    ]);
    expect(monday.sent.change).toBe("Rainy Monday");
    expect(monday.sent.said).toBe(
      "1 switched to rain plans, 1 locked, left as is"
    );
    expect(monday.sent.runs).toEqual([
      expect.objectContaining({
        day: "2026-06-29",
        groupId: bunk1,
        firstBlockId: p1,
        before: [`A:${soccer.Id}`],
        after: [`A:${art.Id}`]
      })
    ]);
    expect(monday.sent.seen).toEqual([earlier]);
    expect(monday.sent.rain).toEqual([
      {
        day: "2026-06-29",
        cells: [earlier, `${bunk1}|${p1}|${art.Id}|switched`]
      }
    ]);
    expect(monday.done).toEqual({ ok: true, status: 200, text: "Done." });

    // Nothing outdoors: the screen's receipt, nothing sent.
    const tuesday = await send("Tuesday");
    expect(tuesday.done).toEqual({
      ok: true,
      status: 200,
      text: "Rainy Tuesday: nothing outdoors to switch"
    });
    expect(tuesday.seen).toHaveLength(1);

    // Shoresh's own refusal comes back as its sentence.
    const conflict = await send(
      "Monday",
      409,
      "Changed by someone else since you read the week: Rainy Monday. Nothing was changed."
    );
    expect(conflict.done.ok).toBe(false);
    expect(conflict.done.status).toBe(409);
  });

  // SPECIAL-2.6
  it("aSpecialDayListSaysWhatItLeftOut: an AI hears what new special days left out of the regular day, as the screen's summary says it", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const imports = async () =>
      importModules({
        engine: require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`),
        lists: require(`${LWC}/shoreshLists/shoreshLists.js`),
        table: require(`${LWC}/shoreshListImport/table.js`),
        terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
        screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
        remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
        patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
        choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
        flow: require(`${LWC}/shoreshImport/flow.js`),
        summary: require(`${LWC}/shoreshImport/summary.js`),
        fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
      });
    const read = JSON.stringify({
      season: "Summer 2026",
      setup: {
        season: { Id: "a00000000000001AAA", Name: "Summer 2026" },
        weeks: [],
        weekExceptions: [],
        locationTypes: [],
        locations: [],
        activities: [],
        programs: [],
        schedules: [],
        labels: [],
        special: { specialDays: [], specialEvents: [], briefs: [] }
      },
      answers: [],
      seen: "s1"
    });
    const save = async (result) => {
      const queue = [
        `HTTP/1.1 200\n\n${read}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: JSON.stringify(result) })}`
      ];
      return call(
        "import_list",
        {
          season: "Summer 2026",
          list: "specialEvents",
          file_name: "special.csv",
          csv_text: "Name,Type\nMaccabiah,Special day\nField Day,Special day",
          save: true,
          seen: "s1"
        },
        { run: async () => queue.shift(), imports }
      );
    };
    const leftOut = await save({
      added: { SpecialDay: 2 },
      seeded: {
        program: "Main",
        timeBlocks: 4,
        broughtIn: ["Lunch"],
        notEveryDay: ["Swim"],
        otherTimes: ["Rest", "Flag"]
      }
    });
    expect(leftOut.text).toMatch(
      /^Added 2 special days\. Not copied, since they don't run every day: Swim\. Not copied, since they are in other time blocks: Rest and Flag\. To undo this import, use undo_import/
    );
    const nothingLeftOut = await save({
      added: { SpecialDay: 2 },
      seeded: { program: "Main", timeBlocks: 4 }
    });
    expect(nothingLeftOut.text).toMatch(/^Added 2 special days\. To undo/);
    const noRegularDay = await save({
      added: { SpecialDay: 2 },
      seeded: { timeBlocks: 0 }
    });
    expect(noRegularDay.text).toMatch(/^Added 2 special days\. To undo/);
  });

  // API-1.80, API-1.81, API-1.82, API-1.83
  it("importsAsTheScreens: a file is reviewed with the import screen's own modules and saved with its own plan only with the seen, and undo asks first and says the screen's words", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const lists = require(`${LWC}/shoreshLists/shoreshLists.js`);
    const imports = async () =>
      importModules({
        engine: require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`),
        lists,
        table: require(`${LWC}/shoreshListImport/table.js`),
        terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
        screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
        remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
        patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
        choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
        flow: require(`${LWC}/shoreshImport/flow.js`),
        summary: require(`${LWC}/shoreshImport/summary.js`),
        fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
      });
    const setup = {
      season: { Id: "a00000000000001AAA", Name: "Summer 2026" },
      weeks: [],
      weekExceptions: [],
      locationTypes: [],
      locations: [
        { Id: "l1", Name: "Gym", GroupsThatFit__c: 2 },
        { Id: "l2", Name: "Pool", GroupsThatFit__c: 1 }
      ],
      activities: [
        {
          Id: "a1",
          Name: "Archery",
          Location__c: "l1",
          Length__c: 1,
          Priority__c: "Low",
          GroupsAtOnce__c: 1
        }
      ],
      programs: [],
      schedules: [],
      labels: []
    };
    const read = JSON.stringify({
      season: "Summer 2026",
      setup,
      answers: [],
      seen: "s1"
    });
    const file = {
      season: "Summer 2026",
      list: "activities",
      file_name: "activities.csv",
      csv_text: "Activity,Location\nArchery,Pool\nSwimming,Pool"
    };
    const send = async (
      input,
      saved = "{}",
      status = 200,
      name = "import_list"
    ) => {
      const sent = [];
      const queue = [
        `HTTP/1.1 200\n\n${read}`,
        `HTTP/1.1 ${status}\n\n${JSON.stringify({ message: saved })}`
      ];
      const done = await call(name, input, {
        run: async (args, stdin) => {
          sent.push({ args, stdin });
          return queue.shift();
        },
        imports
      });
      return { done, sent };
    };

    // The review: read as the screen reads it, nothing sent, with its questions and seen.
    const review = await send(file);
    expect(review.sent).toHaveLength(1);
    expect(review.sent[0].args[3]).toBe(
      "/services/apexrest/v1/import_list?season=Summer+2026"
    );
    expect(review.done.ok).toBe(true);
    const m = await imports();
    const t = m.buildTerms([]);
    const proposal = m.listProposal({
      screenKey: "activities",
      file: m.csvFile("activities.csv", file.csv_text),
      setup,
      terms: t,
      answers: {}
    });
    const difference = proposal.rows.find((r) => r.status === "changed")
      .differences[0];
    expect(review.done.text).toContain(
      `Keep or Change [id ${JSON.stringify(difference.id)}]`
    );
    expect(review.done.text).toContain("Swimming");
    expect(review.done.text).toContain('seen: "s1"');
    expect(review.done.text).toMatch(
      /Before it can be saved: 1 difference to Keep or Change/
    );

    // No seen: nothing read or sent. Another seen: refused before anything is sent.
    expect((await send({ ...file, save: true })).done.status).toBe(400);
    const stale = await send({ ...file, save: true, seen: "s0" });
    expect(stale.done.status).toBe(409);
    expect(stale.sent).toHaveLength(1);
    // Waiting for an answer: nothing sent.
    const waiting = await send({ ...file, save: true, seen: "s1" });
    expect(waiting.done.status).toBe(400);
    expect(waiting.done.text).toMatch(/^Nothing was saved\./);
    expect(waiting.sent).toHaveLength(1);

    // Answered: the screen's own plan, with the seen.
    const answers = { [difference.id]: lists.CHANGE };
    const saved = await send(
      { ...file, answers, save: true, seen: "s1" },
      JSON.stringify({ added: { Activity: 1 }, changed: { Activity: 1 } })
    );
    expect(saved.sent[1].args[3]).toBe("/services/apexrest/v1/import_list");
    const body = JSON.parse(saved.sent[1].stdin);
    const answered = m.listProposal({
      screenKey: "activities",
      file: m.csvFile("activities.csv", file.csv_text),
      setup,
      terms: t,
      answers
    });
    const plan = m.listPlan(
      answered,
      answers,
      setup.season.Id,
      "activities.csv (Activities)"
    );
    const cards = m.questionCards(answered, t, answers);
    plan.remember = m.withLearning(
      plan.remember,
      cards,
      m.suggestionsFor(cards, [], {})
    );
    expect(body).toEqual({
      season: "Summer 2026",
      seen: "s1",
      plan: JSON.stringify(plan)
    });
    expect(saved.done.text).toMatch(
      /^Added 1 activity, Changed 1 activity\. To undo this import, use undo_import/
    );
    // Someone changed it while it saved: Shoresh's own refusal.
    const conflict = await send(
      { ...file, answers, save: true, seen: "s1" },
      "Someone changed the setup",
      409
    );
    expect(conflict.done.status).toBe(409);

    // The worksheet is read at its own address.
    const sheet = await send(
      {
        season: "Summer 2026",
        file_name: "camp.xlsx",
        sheets: [{ name: "Activities", rows: [["Activity"], ["Archery"]] }]
      },
      "",
      200,
      "import_worksheet"
    );
    expect(sheet.sent[0].args[3]).toBe(
      "/services/apexrest/v1/import_worksheet?season=Summer+2026"
    );
    expect(sheet.done.ok).toBe(true);

    // Undo: what was read, asked first, said in the screen's words.
    const last = [];
    await call(
      "read_last_imports",
      { season: "Summer 2026" },
      { run: sfAnswering(200, JSON.stringify({ message: "Imports" }), last) }
    );
    expect(last[0].args[3]).toBe(
      "/services/apexrest/v1/read_last_imports?season=Summer+2026"
    );
    expect(byName("undo_import").description).toMatch(/ask the person first/);
    expect(byName("undo_import").inputSchema.required).toEqual(["seen"]);
    const undone = [];
    const result = {
      removed: 2,
      restored: 1,
      keptEdited: [],
      keptInUse: [],
      gone: []
    };
    const undo = await call(
      "undo_import",
      { season: "Summer 2026", seen: "a0I1" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({ message: JSON.stringify(result) }),
          undone
        ),
        imports
      }
    );
    expect(undone[0].args[3]).toBe("/services/apexrest/v1/undo_import");
    expect(JSON.parse(undone[0].stdin)).toEqual({
      season: "Summer 2026",
      seen: "a0I1"
    });
    expect(undo.text).toBe(m.undoMessage(result));
  });

  // API-1.91
  it("failedSendsAsSettings: the failed sends are read with a GET of the season and nothing else", async () => {
    const sent = [];
    const said = await call(
      "read_failed_sends",
      { season: "Summer 2026" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({ message: "Sends that failed: one" }),
          sent
        )
      }
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].args[3]).toBe(
      "/services/apexrest/v1/read_failed_sends?season=Summer+2026"
    );
    expect(said.text).toContain("Sends that failed: one");
    const capability = byName("read_failed_sends");
    expect(capability.method).toBe("GET");
    expect(Object.keys(capability.inputSchema.properties)).toEqual(["season"]);
  });

  // API-1.93, API-1.94, API-1.95, API-1.96, API-1.97
  it("learnedAsTheScreen: What Shoresh has learned is read with one GET and listed with the screen's own modules; each change is sent with what was read as seen, and forgetting tells the AI to ask first", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const answers = [
      {
        id: "a01",
        question: "kind|lunch",
        answer: "fixed",
        byYou: true,
        byName: "Pat",
        answeredOn: "2031-07-01",
        savedAt: "2031-07-01T10:00:00Z"
      }
    ];
    const sent = [];
    const said = await call(
      "read_learned_answers",
      { season: "Summer 2031" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({
            camp: "Pine Hollow (made up)",
            setup: { labels: [] },
            answers,
            events: []
          }),
          sent
        ),
        learned: async () => ({
          ...require(`${LWC}/shoreshLearned/history.js`),
          ...require(`${LWC}/shoreshLearned/builtIn.js`),
          ...require(`${LWC}/shoreshLearned/view.js`),
          ...require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
          ...require(`${LWC}/shoreshTerms/shoreshTerms.js`)
        })
      }
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].args[3]).toBe(
      "/services/apexrest/v1/read_learned_answers?season=Summer+2031"
    );
    expect(said.ok).toBe(true);
    expect(said.text).toContain(
      "lunch is a fixed activity (Answered as before)"
    );
    expect(said.text).toContain(
      'answer_id a01, seen "fixed", can be changed to recurring'
    );
    expect(said.text).toContain("What Shoresh already knew");
    for (const name of [
      "change_learned_answer",
      "forget_learned_answer",
      "forget_learned_pattern"
    ]) {
      expect(byName(name).inputSchema.required).toContain("seen");
    }
    expect(byName("forget_learned_answer").description).toContain(
      "Ask the person first"
    );
    expect(byName("forget_learned_pattern").description).toContain(
      "Ask the person first"
    );
    expect(byName("undo_learned_answer").inputSchema.required).toEqual([
      "undo"
    ]);
  });

  // API-1.96, API-1.25
  it("forgetsOnlyAPatternThatIsThere: a pattern the screen doesn't offer Forget pattern on is refused naming the ones there, before anything is asked", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const sent = [];
    const said = await call(
      "forget_learned_pattern",
      { season: "Summer 2031", pattern: "none", seen: "none" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({ setup: { labels: [] }, answers: [], events: [] }),
          sent
        ),
        learned: async () => ({
          ...require(`${LWC}/shoreshLearned/history.js`),
          ...require(`${LWC}/shoreshLearned/builtIn.js`),
          ...require(`${LWC}/shoreshLearned/view.js`),
          ...require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
          ...require(`${LWC}/shoreshTerms/shoreshTerms.js`)
        })
      }
    );
    expect(sent.map((s) => s.args[3])).toEqual([
      "/services/apexrest/v1/read_learned_answers?season=Summer+2031"
    ]);
    expect(said).toEqual({
      ok: false,
      status: 400,
      text: 'There is no pattern "none" on What Shoresh has learned now. There are no patterns there now.'
    });
  });

  // API-1.117
  it("bringsInChoicesAsTheSeatsScreen: a choices file is read and reviewed with the screen's own modules, checked by the screen's own check, and brought in only with save and the run as seen", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const choices = async () => ({
      ...require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`),
      ...require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
      ...require(`${LWC}/shoreshChoicesImport/review.js`),
      ...require(`${LWC}/shoreshTerms/shoreshTerms.js`),
      ...require(`${LWC}/shoreshSchema/shoreshSchema.js`)
    });
    const { FIELD } = require(`${LWC}/shoreshSchema/shoreshSchema.js`);
    const S = FIELD.Schedule;
    const read = {
      season: "Summer 2027",
      setup: {
        season: { Id: "s1" },
        labels: [],
        weeks: [{ Id: "w2", Name: "Week 2" }],
        programs: [
          {
            program: { Id: "p1", Name: "Main" },
            divisions: [
              {
                division: { Id: "d1", Name: "Juniors" },
                groups: [
                  { Id: "g1", Name: "Bunk 1" },
                  { Id: "g2", Name: "Bunk 2" }
                ]
              }
            ]
          }
        ],
        schedules: [
          {
            Id: "m2",
            [S.Week]: "w2",
            [S.Status]: "Draft",
            [S.Origin]: "Manual",
            [S.Program]: "p1"
          }
        ],
        activities: [
          { Id: "a1", Name: "Swim" },
          { Id: "a2", Name: "Art" }
        ],
        electives: {}
      },
      situation: {
        sets: [{ id: "e1", name: "Chugim", activityIds: ["a1", "a2"] }],
        runs: [],
        answers: []
      }
    };
    const check = {
      runId: null,
      runName: null,
      runRevision: null,
      isFinal: false,
      known: 0,
      added: 2,
      handChanged: [],
      differs: [],
      renamed: [],
      notOnSheet: 0
    };
    const input = {
      season: "Summer 2027",
      elective_set: "Chugim",
      week: "Week 2",
      file_name: "choices.csv",
      csv_text:
        "Camper,Bunk,Choice 1,Choice 2\nAvery Madeup,Bunk 1,Swim,Art\nCasey Madeup,Bunk 2,Art,Swim\n"
    };
    const answering = (answers, seen) => async (args, stdin) => {
      seen.push({ args, stdin });
      return answers.shift();
    };
    const ok = (body) =>
      `HTTP/1.1 200\ncontent-type: application/json\n\n${body}`;
    const message = (o) => ok(JSON.stringify({ message: JSON.stringify(o) }));

    const seen = [];
    const review = await call("bring_in_choices", input, {
      run: answering([ok(JSON.stringify(read)), message(check)], seen),
      choices
    });
    expect(review.ok).toBe(true);
    expect(review.text).toContain("2 campers: 2 new\n"); // no "0 already here" (CORE-6.13)

    // A name Shoresh doesn't have: the review says what the screen starts it at, for the AI to
    // offer the person (UX pass 2026-11-10: the screen starts every name at an answer).
    const unknown = await call(
      "bring_in_choices",
      {
        ...input,
        csv_text:
          "Camper,Bunk,Choice 1,Choice 2\nAvery Madeup,Bunk 1,Drama,Art\nCasey Madeup,Bunk 2,Art,Swim\n"
      },
      { run: answering([ok(JSON.stringify(read))], []), choices }
    );
    expect(unknown.text).toContain('"Drama" (the screen starts it at "add")');
    expect(unknown.text).toContain("at How often 0");
    expect(review.text).toContain('save: true and seen: "none"');
    const asked = JSON.parse(seen[1].stdin);
    expect(asked.save).toBeUndefined();
    expect(asked.request).toMatchObject({
      seasonId: "s1",
      electiveSetId: "e1",
      weekId: "w2",
      scheduleId: "m2",
      fileName: "choices.csv"
    });
    expect(
      asked.request.campers.map((c) => [
        c.name,
        c.groupId,
        c.choices.map((x) => x.a)
      ])
    ).toEqual([
      ["Avery Madeup", "g1", ["a1", "a2"]],
      ["Casey Madeup", "g2", ["a2", "a1"]]
    ]);

    const stale = await call(
      "bring_in_choices",
      { ...input, save: true, seen: "3" },
      {
        run: answering([ok(JSON.stringify(read)), message(check)], []),
        choices
      }
    );
    expect(stale).toMatchObject({ ok: false, status: 409 });

    const savedSeen = [];
    const done = await call(
      "bring_in_choices",
      { ...input, save: true, seen: "none" },
      {
        run: answering(
          [
            ok(JSON.stringify(read)),
            message(check),
            message({
              campers: 2,
              added: 2,
              runName: "Chugim · Week 2",
              runId: "r1"
            })
          ],
          savedSeen
        ),
        choices
      }
    );
    expect(done).toMatchObject({
      ok: true,
      text: 'Imported 2 campers to "Chugim · Week 2": 2 new.'
    });
    expect(JSON.parse(savedSeen[2].stdin).save).toBe(true);

    // A week with no schedule yet: said as the screen says it, with the step to take, never a
    // list of none to pick from.
    const unbuilt = await call("bring_in_choices", input, {
      run: answering(
        [
          ok(
            JSON.stringify({ ...read, setup: { ...read.setup, schedules: [] } })
          )
        ],
        []
      ),
      choices
    });
    expect(unbuilt).toMatchObject({
      ok: false,
      text: "No schedule for Week 2 yet: build it on Generated Schedule or start it on Manual Build first. Nothing was imported."
    });
    // A week with its Generated Schedule both drafted and published: the two are named apart,
    // as the screen's list names them, never both "Generated Schedule" (UX pass 2026-11-10).
    const generated = {
      [S.Week]: "w2",
      [S.Origin]: "Generated",
      [S.Program]: "p1"
    };
    const both = await call("bring_in_choices", input, {
      run: answering(
        [
          ok(
            JSON.stringify({
              ...read,
              setup: {
                ...read.setup,
                schedules: [
                  { ...generated, Id: "g2", [S.Status]: "Draft" },
                  { ...generated, Id: "g3", [S.Status]: "Published" }
                ]
              }
            })
          )
        ],
        []
      ),
      choices
    });
    expect(both).toMatchObject({
      ok: false,
      text: "Say which schedule (schedule). The schedules: Generated Schedule, Generated Schedule · Published."
    });
  });

  // API-1.98, API-1.99
  it("lastYearAsksTheScreensQuestionsAndMatchesItsBlocks: every question the screen asks is said with its choices and answered by choice, and a setup's times are read as the screen reads them, so its time blocks are matched, not added again", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const imports = async () =>
      importModules({
        engine: require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`),
        lists: require(`${LWC}/shoreshLists/shoreshLists.js`),
        table: require(`${LWC}/shoreshListImport/table.js`),
        terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
        screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
        remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
        patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
        choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
        flow: require(`${LWC}/shoreshImport/flow.js`),
        summary: require(`${LWC}/shoreshImport/summary.js`),
        fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
      });
    const m = await imports();
    const name = "maple-grove-2026-all-camp.xlsx";
    const { sheets } = m.workbookFile(
      require("xlsx"),
      name,
      fs.readFileSync(
        path.resolve(__dirname, "../../docs/samples/import", name)
      )
    );
    const files = [{ file_name: name, sheets }];
    const weeks = [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      },
      {
        Id: "w2",
        Name: "Week 2",
        StartDate__c: "2027-07-05",
        EndDate__c: "2027-07-09"
      }
    ];
    const empty = {
      season: { Id: "a00000000000001AAA", Name: "Summer 2027" },
      weeks,
      weekExceptions: [],
      programs: [],
      activities: [],
      locations: [],
      locationTypes: [],
      schedules: [],
      labels: [],
      electives: { sets: [], offerings: [], linkedChoices: [] }
    };
    const send = async (setup, input) => {
      const sent = [];
      const read = JSON.stringify({
        season: "Summer 2027",
        setup,
        answers: [],
        imported: {},
        seen: "s1"
      });
      const queue = [
        `HTTP/1.1 200\n\n${read}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: JSON.stringify({ added: {}, changed: {}, removed: {}, leftAsIs: [], openNotKept: 0 }) })}`
      ];
      const done = await call(
        "import_last_year",
        { season: "Summer 2027", files, ...input },
        {
          run: async (args, stdin) => {
            sent.push({ args, stdin });
            return queue.shift();
          },
          imports
        }
      );
      return { done, sent };
    };

    // API-1.98: the screen's questions, each with its choices, as the screen asks them.
    const review = await send(empty, {});
    const similar = "similar|activity|music|musik|Music|Musik";
    expect(review.done.text).toContain(
      `[id "${similar}"] Are “Music” and “Musik” the same activity? Answer with "a" = Same: call it “Music”, "b" = Same: call it “Musik”, "different" = Different: keep both, "leaveOut" = Leave it out for now.`
    );
    expect(review.done.text).toContain(
      `Which week is last year's schedule? Answer with "Week 1" = Week 1 (starts Jun 28), "Week 2" = Week 2 (starts Jul 5), "leaveOut" = Leave it out for now.`
    );
    // Answered by choice, the save keeps last year's week as a version, as the screen's does.
    const answers = { [similar]: "a", "week|the file's week": "Week 1" };
    const answered = await send(empty, { answers });
    expect(answered.done.text).toContain(
      "Last year's schedule: Week 1 (Main), kept as a version"
    );
    expect(answered.done.text).toMatch(/Ready to save: Add\./);
    const saved = await send(empty, { answers, save: true, seen: "s1" });
    const plan = JSON.parse(JSON.parse(saved.sent[1].stdin).plan);
    expect(plan.open).toEqual([]);
    expect(plan.versions.map((v) => v.weekId)).toEqual(["w1"]);

    // API-1.99: a second import into the setup the first made: its time blocks come from the web
    // address as "09:00:00.000Z" (the screen gets milliseconds) and are matched, not added again.
    const at = (h, min) =>
      `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000Z`;
    const blocks = [
      ["Period 1", 9, 0, 9, 45],
      ["Period 2", 9, 50, 10, 35],
      ["Period 3", 10, 40, 11, 25],
      ["Lunch", 11, 30, 12, 15],
      ["Period 4", 12, 20, 13, 5],
      ["Period 5", 13, 10, 13, 55],
      ["Period 6", 14, 0, 14, 45]
    ].map(([n, h1, m1, h2, m2], i) => ({
      Id: `tb${i + 1}`,
      Name: n,
      StartTime__c: at(h1, m1),
      EndTime__c: at(h2, m2),
      SortOrder__c: i + 1
    }));
    const days = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ];
    const program = { Id: "p1", Name: "Main" };
    days.forEach((d, i) => {
      program[`${d}__c`] = i < 5;
    });
    const bunks = (did, dname, names) => ({
      division: { Id: did, Name: dname, SortOrder__c: 1 },
      groups: names.map((g, i) => ({
        Id: `${did}g${i}`,
        Name: g,
        SortOrder__c: i + 1
      }))
    });
    const second = await send(
      {
        ...empty,
        programs: [
          {
            program,
            timeBlocks: blocks,
            divisions: [
              bunks("d1", "Juniors", ["Bunk 1", "Bunk 2", "Bunk 3"]),
              bunks("d2", "Seniors", ["Bunk 4", "Bunk 5", "Bunk 6"])
            ],
            fixedActivities: [],
            recurringActivities: []
          }
        ]
      },
      { answers }
    );
    const comes = second.done.text
      .split("\n")
      .find((l) => l.startsWith("Comes in:"));
    expect(comes).toBeDefined();
    expect(comes).not.toMatch(/time block/);
    expect(comes).not.toMatch(/group|division|program/);
  });

  // API-1.84, API-1.85, API-1.144
  it("lastYearAndSpecialFilesAsTheScreens: Import last year reviews with the screen's own steps and saves its own plan only with the seen; a special schedule's file is read with its page's own module", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const imports = async () =>
      importModules({
        engine: require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`),
        lists: require(`${LWC}/shoreshLists/shoreshLists.js`),
        table: require(`${LWC}/shoreshListImport/table.js`),
        terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
        screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
        remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
        patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
        choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
        flow: require(`${LWC}/shoreshImport/flow.js`),
        summary: require(`${LWC}/shoreshImport/summary.js`),
        fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
      });
    const setup = {
      season: { Id: "a00000000000001AAA", Name: "Summer 2026" },
      weeks: [],
      weekExceptions: [],
      programs: [],
      activities: [],
      locations: [],
      locationTypes: [],
      schedules: [],
      labels: [],
      electives: { sets: [], offerings: [], linkedChoices: [] }
    };
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const activities = ["Archery", "Swim", "Arts"];
    const files = ["Bunk 1", "Bunk 2"].map((g, gi) => ({
      file_name: `Camp - ${g}.csv`,
      csv_text: [
        ["Time", ...days],
        ...[
          "Period 1 9:00-9:45",
          "Period 2 9:50-10:35",
          "Lunch 11:30-12:15"
        ].map((b, bi) => [
          b,
          ...days.map((_, d) =>
            bi === 2 ? "Lunch" : activities[(gi + d + bi) % 3]
          )
        ])
      ]
        .map((r) => r.join(","))
        .join("\n")
    }));
    const read = JSON.stringify({
      season: "Summer 2026",
      setup,
      answers: [],
      imported: {},
      seen: "s1"
    });
    const send = async (input) => {
      const sent = [];
      const queue = [
        `HTTP/1.1 200\n\n${read}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: JSON.stringify({ added: { Group: 2 }, changed: {}, removed: {}, leftAsIs: [], openNotKept: 0 }) })}`
      ];
      const done = await call("import_last_year", input, {
        run: async (args, stdin) => {
          sent.push({ args, stdin });
          return queue.shift();
        },
        imports
      });
      return { done, sent };
    };
    const review = await send({ season: "Summer 2026", files });
    expect(review.sent).toHaveLength(1);
    expect(review.sent[0].args[3]).toBe(
      "/services/apexrest/v1/import_last_year?season=Summer+2026"
    );
    expect(review.done.text).toMatch(/Ready to save: Add\./);
    expect(review.done.text).toContain('seen: "s1"');
    const stale = await send({
      season: "Summer 2026",
      files,
      save: true,
      seen: "s0"
    });
    expect(stale.done.status).toBe(409);
    expect(stale.sent).toHaveLength(1);
    const saved = await send({
      season: "Summer 2026",
      files,
      save: true,
      seen: "s1"
    });
    expect(saved.sent[1].args[3]).toBe(
      "/services/apexrest/v1/import_last_year"
    );
    // The screen's own plan, from its own steps.
    const m = await imports();
    const t = m.buildTerms([]);
    const flow = {
      files: files.map((f) => m.csvFile(f.file_name, f.csv_text)),
      setup,
      terms: t,
      layouts: {},
      imported: [],
      inUse: {},
      versionUses: {}
    };
    let state = m.recomputed(flow, {}, {});
    state = m.appliedOnItsOwn(flow, state, {
      savedRows: [],
      remembered: {},
      autoUndone: []
    });
    state = m.recomputed(flow, state.answers, state.autoApplied);
    const plan = m.savePlan(flow, state.proposal, state.answers, {
      autoApplied: state.autoApplied,
      savedRows: [],
      remembered: {}
    });
    expect(JSON.parse(saved.sent[1].stdin)).toEqual({
      season: "Summer 2026",
      seen: "s1",
      plan: JSON.stringify(plan)
    });
    expect(saved.done.text).toMatch(/^Added 2 groups\./);

    // API-1.144: the last import's questions left for later, with the very files it read.
    const openRead = JSON.stringify({
      ...JSON.parse(read),
      open_files: JSON.stringify(flow.files)
    });
    const reopenSent = [];
    const reopened = await call(
      "import_last_year",
      { season: "Summer 2026", open_questions: true },
      {
        run: async (args, stdin) => {
          reopenSent.push({ args, stdin });
          return `HTTP/1.1 200\n\n${openRead}`;
        },
        imports
      }
    );
    expect(reopenSent[0].args[3]).toBe(
      "/services/apexrest/v1/import_last_year?season=Summer+2026&open_questions=true"
    );
    // The same review; only the way back names open_questions, since the AI never had the files.
    expect(reopened.text).toBe(
      review.done.text.replace(
        "send the review again with the same files",
        "send the review again with open_questions: true (no files)"
      )
    );
    expect(reopened.text).not.toBe(review.done.text);
    // Add saves them as a second import of the same files: the save is the plain one.
    const reopenSaved = [];
    await call(
      "import_last_year",
      { season: "Summer 2026", open_questions: true, save: true, seen: "s1" },
      {
        run: async (args, stdin) => {
          reopenSaved.push({ args, stdin });
          return reopenSaved.length === 1
            ? `HTTP/1.1 200\n\n${openRead}`
            : `HTTP/1.1 200\n\n${JSON.stringify({ message: JSON.stringify({ added: { Group: 2 }, changed: {}, removed: {}, leftAsIs: [], openNotKept: 0 }) })}`;
        },
        imports
      }
    );
    expect(reopenSaved[1].args[3]).toBe(
      "/services/apexrest/v1/import_last_year"
    );
    expect(JSON.parse(reopenSaved[1].stdin)).toEqual(
      JSON.parse(saved.sent[1].stdin)
    );
    const both = await send({
      season: "Summer 2026",
      files,
      open_questions: true
    });
    expect(both.done.ok).toBe(false);
    expect(both.sent).toHaveLength(0);

    // A special schedule's file: read with the page's own module, sent with what was seen.
    expect(byName("import_special_schedule").inputSchema.required).toEqual([
      "special",
      "seen",
      "file_name"
    ]);
    const special = [];
    const csvText =
      "Time,Blue,Gold\n9:00-9:45,Tug of war,Relay race\n9:50-11:20,Relay race,";
    await call(
      "import_special_schedule",
      {
        season: "Summer 2026",
        special: "Color War",
        seen: "4",
        file_name: "cw.csv",
        csv_text: csvText
      },
      {
        run: sfAnswering(200, JSON.stringify({ message: "Imported" }), special),
        imports
      }
    );
    const { pages } = m.pagesOf(m.csvFile("cw.csv", csvText));
    const { imported, noTimes, places } = m.planFromPage(pages[0]);
    expect(special[0].args[3]).toBe(
      "/services/apexrest/v1/import_special_schedule"
    );
    expect(JSON.parse(special[0].stdin)).toEqual({
      season: "Summer 2026",
      special: "Color War",
      seen: "4",
      file_name: "cw.csv",
      blocks: imported.blocks,
      columns: imported.columns,
      no_times: noTimes,
      places,
      page_count: 1,
      replace_edited: false
    });
    expect(byName("import_special_schedule").description).toMatch(
      /ask the person/
    );
  });

  it("engineShipsWithTheConnector: ShoreshConnect carries Generated Schedule's own build module and its counter's modules, unchanged but for where their imports point", () => {
    const {
      engineFiles,
      ENGINE_ENTRY,
      CHECKS_ENTRIES,
      VERSIONS_ENTRY,
      flatName,
      TO
    } = require("../../scripts/build-connect");
    const engine = engineFiles();
    expect(Object.keys(engine)).toContain(flatName(ENGINE_ENTRY));
    expect(
      fs
        .readdirSync(TO)
        .filter((f) => f.endsWith(".mjs"))
        .sort()
    ).toEqual(Object.keys(engine).sort());
    for (const [f, text] of Object.entries(engine)) {
      expect([f, fs.readFileSync(path.join(TO, f), "utf8")]).toEqual([f, text]);
    }
    const lwc = path.resolve(__dirname, "../../force-app/main/default/lwc");
    const unpointed = (text) =>
      text
        .replace(/^import \{ schemaName \} from "[^"]+";\n/, "")
        .replace(
          /^const (\w+) = schemaName\(("[^"]+")\);$/gm,
          (a, n, f) => `import ${n} from "@salesforce/schema/${JSON.parse(f)}";`
        )
        .replace(/ from "[^"]+";$/gm, "")
        .replace(/^import "[^"]+";$/gm, "");
    // The build module, and the counter's own modules a week's checks are read with (API-1.30).
    for (const entry of [ENGINE_ENTRY, ...CHECKS_ENTRIES, VERSIONS_ENTRY]) {
      const source = fs.readFileSync(path.join(lwc, entry), "utf8");
      expect(unpointed(engine[flatName(entry)])).toBe(unpointed(source));
    }
  });

  it("everyModuleTheConnectorLoadsShips: each screen module connect/client.js loads is one scripts/build-connect.js ships", () => {
    const { engineFiles } = require("../../scripts/build-connect");
    const shipped = Object.keys(engineFiles());
    const source = fs.readFileSync(
      path.join(__dirname, "../client.js"),
      "utf8"
    );
    const calls = [
      ...source.matchAll(/loadModules\(\s*namespace,\s*\[([^\]]*)\]/g)
    ];
    // Every call is read (all but the function's own line), so a new loader can't slip past.
    expect(calls.length).toBe(source.match(/\bloadModules\(/g).length - 1);
    // Each list holds only names written out, so none is skipped.
    for (const [, list] of calls) {
      expect(list.replace(/"[^"]+"/g, "").replace(/[\s,]/g, "")).toBe("");
    }
    const loaded = calls.flatMap(([, list]) =>
      [...list.matchAll(/"([^"]+)"/g)].map(([, name]) => name)
    );
    expect(loaded.length).toBeGreaterThan(10);
    for (const name of loaded) {
      expect([name, shipped.includes(`engine.${name}.mjs`)]).toEqual([
        name,
        true
      ]);
    }
  });

  // API-1.22, API-1.23
  it("publishesAndFinalizesAsThePerson: publish_week and finalize_electives send the person's fields to /v1/publish_week and /v1/finalize_electives", async () => {
    const seen = [];
    const published = await call(
      "publish_week",
      { season: "Summer 2026", week: "Week 1", program: "Main" },
      {
        run: sfAnswering(200, '{"message":"Published Week 1."}', seen)
      }
    );
    expect(seen[0].args[3]).toBe("/services/apexrest/v1/publish_week");
    expect(JSON.parse(seen[0].stdin)).toEqual({
      season: "Summer 2026",
      week: "Week 1",
      program: "Main"
    });
    expect(published.text).toBe("Published Week 1.");
    const refused = await call(
      "finalize_electives",
      { season: "Summer 2026", week: "Week 1", elective_set: "Chugim" },
      {
        run: sfAnswering(
          400,
          '{"message":"Not finalized. No seats are assigned yet."}',
          seen
        )
      }
    );
    expect(seen[1].args[3]).toBe("/services/apexrest/v1/finalize_electives");
    expect(JSON.parse(seen[1].stdin)).toEqual({
      season: "Summer 2026",
      week: "Week 1",
      elective_set: "Chugim"
    });
    expect(refused).toEqual({
      ok: false,
      status: 400,
      text: "Not finalized. No seats are assigned yet."
    });
  });

  it("sameNamesBothWays: the MCP tools and the command line take the same names", async () => {
    const init = await handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2099-01-01" }
    });
    expect(init.result.capabilities).toEqual({
      tools: {},
      resources: {},
      extensions: { "io.modelcontextprotocol/ui": {} }
    });
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect(
      await handle({ jsonrpc: "2.0", method: "notifications/initialized" })
    ).toBeNull();
    const names = tools()
      .map((t) => t.name)
      .filter((n) => n !== "run_shoresh_script");
    expect(names).toEqual(CAPABILITIES.map((c) => c.name));
    for (const name of names) {
      const words = byName(name).inputSchema.properties.records
        ? [name, "--file", "x.json"]
        : [name, "--season", "S", "--week", "W"].slice(
            0,
            byName(name).inputSchema.properties.week ? 5 : 1
          );
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
  // API-1.105
  it("refusalsLeaveItToThePerson: no sentence only an AI hears tells it to change something first", () => {
    // What a smaller AI read as orders (Hermes run 2026-11-02): "Fix it, then finalize", "First
    // choose another location", "Rename one in Shoresh, then ask again". The agent-only sentences
    // (Agent*.cls and the connector's own) may say to read again, never to repair. Shared screen
    // sentences hide their advice from an AI with AgentRefusal (ActivitiesAndLocationsTest).
    const REPAIR =
      /Fix it|then (retry|try again|ask again|finalize|delete|save)|\b(First|Build|Bring|Rename|Assign|Start|Change|Move|Delete|Take) [^.]*\bfirst\b|\binstead\.|Change it (on|there)/;
    const root = path.join(__dirname, "..", "..");
    const classes = path.join(root, "force-app/main/default/classes");
    const sources = [
      ...fs
        .readdirSync(classes)
        .filter(
          (f) =>
            (/^Agent.*\.cls$/.test(f) && !/Test(Data)?\.cls$/.test(f)) ||
            f === "OutgoingRows.cls"
        )
        .map((f) => path.join(classes, f)),
      ...[
        "cells.js",
        "client.js",
        "electives.js",
        "imports.js",
        "learned.js",
        "camp.js",
        "exports.js",
        "lastYear.js",
        "specialFile.js"
      ].map((f) => path.join(root, "connect", f))
    ];
    const said = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(
        /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g
      )) {
        const s = m[1] ?? m[2] ?? m[3];
        if (REPAIR.test(s)) said.push(`${path.basename(file)}: ${s}`);
      }
    }
    expect(said).toEqual([]);
  });

  // API-1.15
  it("tooBig: a Salesforce limit Apex can't catch is said as the screens say it", async () => {
    const run = sfAnswering(
      500,
      JSON.stringify([
        {
          errorCode: "APEX_ERROR",
          message:
            "System.LimitException: Too many SOQL queries: 101\n\nClass.AgentUndoImport.run: line 1"
        }
      ])
    );
    const done = await call("undo_import", { season: "Summer 2026" }, { run });
    expect(done).toEqual({ ok: false, status: 500, text: TOO_BIG });
    expect(TOO_BIG).toBe(
      require("../../force-app/main/default/lwc/shoreshErrors/shoreshErrors.js")
        .TOO_BIG
    );
  });

  it("shipsInsideThePackage: the connector is the ShoreshConnect static resource, the same files as connect/, needing only Node", () => {
    const { connectorFiles, FROM, TO } = require("../../scripts/build-connect");
    expect(
      fs
        .readdirSync(TO)
        .filter(
          (f) =>
            f !== "manifest.json" &&
            !f.endsWith(".mjs") &&
            !f.endsWith(".cjs") &&
            !f.endsWith(".html")
        )
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
          [
            "fs",
            "path",
            "child_process",
            "url",
            "vm",
            "worker_threads"
          ].includes(needed) || needed.startsWith("./")
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
    // First what Salesforce says of the camp's Shoresh (camp.js), then the read at its address.
    expect(seen[0].args[3]).toMatch(/^\/services\/data\/v\d+\.0\/query\?q=/);
    expect(seen[1].args).toEqual([
      "api",
      "request",
      "rest",
      "/services/apexrest/v1/group_schedule",
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
    expect(
      (await check({ org: "shoresh", run: async () => SIGNED_OUT })).text
    ).toBe(
      "Not signed in to Salesforce yet, or the Salesforce command line isn't installed."
    );
    // Signed in, but no answer: never sent to sign in again (API-1.126).
    expect((await check({ org: "shoresh", run: async () => "" })).text).toBe(
      "Salesforce didn't answer just now. Try the test again in a moment."
    );
  });
  // API-1.17
  it("signsInThroughTheBrowserOnce: the desktop extension opens Salesforce's sign-in page once, however many actions are asked meanwhile", async () => {
    const message = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "read_group_schedule", arguments: {} }
    };
    const signedInto = [];
    let signedIn = false;
    let finish;
    const callFn = async () => {
      if (!signedIn)
        throw new Error('Couldn\'t reach Salesforce as "shoresh".');
      return { ok: true, text: "the schedule" };
    };
    const sf = {
      installed: async () => true,
      signIn: (org, host) => {
        signedInto.push([org, host]);
        return new Promise((resolve) => {
          finish = () => {
            signedIn = true;
            resolve();
          };
        });
      }
    };
    const options = {
      org: "shoresh",
      browserSignIn: true,
      host: "maple-grove.my.salesforce.com",
      callFn,
      sf
    };
    const said =
      "Your browser has opened at Salesforce's sign-in page. Sign in and click Allow, then ask me again.";
    const [first, second] = await Promise.all([
      handle(message, options),
      handle(message, options)
    ]);
    expect(first.result).toEqual({
      content: [{ type: "text", text: said }],
      isError: true
    });
    expect(second.result.content[0].text).toBe(said);
    await Promise.resolve();
    expect(signedInto).toEqual([["shoresh", "maple-grove.my.salesforce.com"]]);
    finish();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const after = await handle(message, options);
    expect(after.result).toEqual({
      content: [{ type: "text", text: "the schedule" }],
      isError: false
    });
    // Without the extension's setting, no browser opens: the sentence says how to sign in.
    signedIn = false;
    const plain = await handle(message, { org: "shoresh", callFn, sf });
    expect(plain.result.content[0].text).toMatch(/^Couldn't reach Salesforce/);
    expect(signedInto).toHaveLength(1);
    // Salesforce didn't answer (API-1.126): said as it is, and no browser opens.
    const noAnswer = await handle(message, {
      ...options,
      callFn: async () => {
        throw new Error("Salesforce didn't answer just now.");
      }
    });
    expect(noAnswer.result.content[0].text).toBe(
      "Salesforce didn't answer just now."
    );
    expect(signedInto).toHaveLength(1);
    // No Salesforce command line: one plain sentence, no browser.
    const none = await handle(message, {
      ...options,
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
  // API-1.18
  it("codeModeSameNamesSameAnswers: a script gets one async function per MCP tool, same name, same answer", async () => {
    const code = require("../code");
    const names = tools()
      .map((t) => t.name)
      .filter((n) => n !== "run_shoresh_script");
    expect(
      Object.keys(code)
        .filter((k) => k !== "ACTIONS")
        .sort()
    ).toEqual([...names].sort());
    for (const name of names) {
      const seenScript = [];
      const seenMcp = [];
      const input = { season: "S", week: "W", records: [] };
      const fromScript = await code[name](input, {
        run: sfAnswering(
          409,
          '{"message":"Changed by someone else"}',
          seenScript
        )
      });
      const fromMcp = await callTool(
        name,
        input,
        sfAnswering(409, '{"message":"Changed by someone else"}', seenMcp)
      );
      // The script asks Salesforce for the camp's namespace too; the actions themselves are the same.
      const actions = (seen) =>
        seen.filter((s) => s.args[3].startsWith("/services/apexrest/"));
      expect(actions(seenScript)).toEqual(seenMcp);
      expect(fromMcp.result).toEqual({
        content: [{ type: "text", text: fromScript.text }],
        isError: !fromScript.ok
      });
    }
  });

  // API-1.18
  it("codeModeOneDescription: the MCP tool list and code mode come from the same one description of every action", () => {
    const { ACTIONS } = require("../code");
    expect(ACTIONS).toBe(CAPABILITIES);
    const listed = tools();
    // Last, the AI's code mode, its function list made from the same ACTIONS (API-1.119).
    expect(listed.pop()).toEqual(require("../script").scriptTool(ACTIONS));
    expect(listed.map(({ _meta, ...tool }) => tool)).toEqual(
      ACTIONS.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema
      }))
    );
  });

  // API-1.47, API-1.48
  it("setupRecordsAsCampSetup: renaming and deleting a setup record send its kind, name and program to their own web address, with no week", async () => {
    for (const name of ["rename_setup_record", "delete_setup_record"]) {
      const schema = byName(name).inputSchema;
      expect(schema.required).toEqual(
        name === "rename_setup_record"
          ? ["kind", "name", "new_name"]
          : ["kind", "name"]
      );
      expect(schema.properties.week).toBeUndefined();
    }
    expect(byName("delete_setup_record").description).toMatch(
      /Ask the person first/
    );
    const asked = {
      season: "Summer 2026",
      kind: "bunk",
      name: "Bunk 3",
      new_name: "Cedar"
    };
    const seen = [];
    const done = await call("rename_setup_record", asked, {
      run: sfAnswering(
        200,
        JSON.stringify({ message: 'Renamed the bunk "Bunk 3" to "Cedar".' }),
        seen
      )
    });
    expect(seen[0].args[3]).toBe("/services/apexrest/v1/rename_setup_record");
    expect(JSON.parse(seen[0].stdin)).toEqual(asked);
    expect(done.text).toBe('Renamed the bunk "Bunk 3" to "Cedar".');
    const refused = await call(
      "delete_setup_record",
      { kind: "location", name: "Gym" },
      {
        run: sfAnswering(
          400,
          JSON.stringify({
            message:
              '"Gym" not deleted. Nothing was removed. This can\'t be deleted yet: "Gym games" happens here.'
          }),
          []
        )
      }
    );
    expect(refused.ok).toBe(false);
    expect(refused.text).toMatch(/not deleted. Nothing was removed./);
  });

  // API-1.102
  it("askBeforeDeleteAsCampSetup: Camp Setup's question before a delete is read from the delete's own web address, by name", async () => {
    expect(byName("delete_setup_record").description).toMatch(
      /read_setup_delete/
    );
    const question = 'Delete "Main"? Anything inside it is deleted too.';
    const read = [];
    const done = await call(
      "read_setup_delete",
      { season: "Summer 2026", kind: "program", name: "Main" },
      {
        run: sfAnswering(200, JSON.stringify({ message: question }), read)
      }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/delete_setup_record?season=Summer+2026&kind=program&name=Main"
    );
    expect(done.text).toBe(question);
  });

  // API-1.49, API-1.50
  it("setupFieldsAsCampSetup: changing a setup record's fields and adding one send kind, name, program and fields to their own web address, with no week", async () => {
    expect(byName("change_setup_record").inputSchema.required).toEqual([
      "kind",
      "name",
      "fields",
      "seen"
    ]);
    expect(byName("change_setup_record").description).toMatch(
      /read_setup_record and send what it said as seen/
    );
    expect(byName("read_setup_record").inputSchema.required).toEqual([
      "kind",
      "name"
    ]);
    expect(byName("add_setup_record").inputSchema.required).toEqual([
      "kind",
      "name"
    ]);
    for (const name of ["change_setup_record", "add_setup_record"]) {
      const schema = byName(name).inputSchema;
      expect(schema.properties.week).toBeUndefined();
      expect(schema.properties.fields.type).toBe("object");
    }
    expect(
      byName("add_setup_record").inputSchema.properties.name.description
    ).toBe("What to call it.");
    const asked = {
      season: "Summer 2026",
      kind: "activity",
      name: "Swim",
      fields: { length: "2", location: "Pool" },
      seen: { length: "1", location: "Gym" }
    };
    const seen = [];
    const done = await call("change_setup_record", asked, {
      run: sfAnswering(
        200,
        JSON.stringify({
          message: 'Changed the activity "Swim": length 2, location Pool.'
        }),
        seen
      )
    });
    expect(seen[0].args[3]).toBe("/services/apexrest/v1/change_setup_record");
    expect(JSON.parse(seen[0].stdin)).toEqual(asked);
    expect(done.text).toBe(
      'Changed the activity "Swim": length 2, location Pool.'
    );
    const added = [];
    await call(
      "add_setup_record",
      { kind: "location", name: "Lake" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({ message: 'Added the location "Lake".' }),
          added
        )
      }
    );
    expect(added[0].args[3]).toBe("/services/apexrest/v1/add_setup_record");
    const read = [];
    await call(
      "read_setup_record",
      { season: "Summer 2026", kind: "time block", name: "Lunch" },
      {
        run: sfAnswering(
          200,
          JSON.stringify({ message: "The time block" }),
          read
        )
      }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/read_setup_record?season=Summer+2026&kind=time+block&name=Lunch"
    );
    expect(JSON.parse(added[0].stdin)).toEqual({
      kind: "location",
      name: "Lake"
    });
  });

  // API-1.51, API-1.52
  it("activityRulesAndWeeksAsCampSetup: an activity's details are read by name in the web address and changed with what was seen; filling in weeks sends the season's dates as seen", async () => {
    expect(byName("change_activity_rules").inputSchema.required).toEqual([
      "name",
      "fields",
      "seen"
    ]);
    expect(byName("fill_in_weeks").inputSchema.required).toEqual(["seen"]);
    const read = [];
    await call(
      "read_activity_rules",
      { season: "Summer 2026", name: "Swim" },
      {
        run: sfAnswering(200, JSON.stringify({ message: "The activity" }), read)
      }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/read_activity_rules?season=Summer+2026&name=Swim"
    );
    const asked = {
      season: "Summer 2026",
      name: "Swim",
      fields: { who_can_do_it: "Juniors" },
      seen: { who_can_do_it: "everyone" }
    };
    const changed = [];
    await call("change_activity_rules", asked, {
      run: sfAnswering(200, JSON.stringify({ message: "Changed" }), changed)
    });
    expect(changed[0].args[3]).toBe(
      "/services/apexrest/v1/change_activity_rules"
    );
    expect(JSON.parse(changed[0].stdin)).toEqual(asked);
    const weeks = {
      season: "Summer 2026",
      seen: { start_date: "2026-06-29", end_date: "2026-08-07" }
    };
    const filled = [];
    await call("fill_in_weeks", weeks, {
      run: sfAnswering(200, JSON.stringify({ message: "Added" }), filled)
    });
    expect(filled[0].args[3]).toBe("/services/apexrest/v1/fill_in_weeks");
    expect(JSON.parse(filled[0].stdin)).toEqual(weeks);
  });

  // API-1.56, API-1.57, API-1.58
  it("campWordsSeasonAndMergeAsCampSetup: camp words and the season are changed with what was seen, the matching places are read by name in the web address, and a merge asks the person first and sends each place as seen", async () => {
    expect(byName("change_camp_words").inputSchema.required).toEqual([
      "words",
      "seen"
    ]);
    expect(byName("change_season").inputSchema.required).toEqual([
      "fields",
      "seen"
    ]);
    expect(byName("merge_locations").inputSchema.required).toEqual([
      "name",
      "seen"
    ]);
    expect(byName("merge_locations").description).toMatch(
      /ask the person first/
    );
    const read = [];
    await call(
      "read_camp_words",
      { season: "Summer 2026" },
      { run: sfAnswering(200, JSON.stringify({ message: "Words" }), read) }
    );
    await call(
      "read_same_locations",
      { season: "Summer 2026", name: "Pool" },
      { run: sfAnswering(200, JSON.stringify({ message: "Places" }), read) }
    );
    expect(read.map((r) => r.args[3])).toEqual([
      "/services/apexrest/v1/read_camp_words?season=Summer+2026",
      "/services/apexrest/v1/read_same_locations?season=Summer+2026&name=Pool"
    ]);
    const asked = {
      change_camp_words: {
        season: "Summer 2026",
        words: { Group: "Bunk / Bunks" },
        seen: { Group: "Group / Groups" }
      },
      change_season: {
        season: "Summer 2026",
        fields: { name: "Summer 2027" },
        seen: { name: "Summer 2026" }
      },
      merge_locations: {
        season: "Summer 2026",
        name: "Pool",
        keep: "Pool",
        seen: { Pool: "1", pool: "2" }
      }
    };
    for (const [name, body] of Object.entries(asked)) {
      const sent = [];
      await call(name, body, {
        run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
      });
      expect(sent[0].args[3]).toBe(`/services/apexrest/v1/${name}`);
      expect(JSON.parse(sent[0].stdin)).toEqual(body);
    }
  });

  // API-1.59, API-1.60
  it("guessesReadAndConfirmedWithTheValueSeen: the guesses are read by season in the web address, and Looks right sends the guess's kind, name, field and value as seen", async () => {
    expect(byName("confirm_setup_guess").inputSchema.required).toEqual([
      "kind",
      "name",
      "field",
      "seen"
    ]);
    const read = [];
    await call(
      "read_setup_guesses",
      { season: "Summer 2026" },
      { run: sfAnswering(200, JSON.stringify({ message: "Guesses" }), read) }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/read_setup_guesses?season=Summer+2026"
    );
    const body = {
      season: "Summer 2026",
      kind: "activity",
      name: "Swim",
      field: "how_often",
      seen: "1 to 2 a week"
    };
    const sent = [];
    await call("confirm_setup_guess", body, {
      run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
    });
    expect(sent[0].args[3]).toBe("/services/apexrest/v1/confirm_setup_guess");
    expect(JSON.parse(sent[0].stdin)).toEqual(body);
  });

  // API-1.61, API-1.62, API-1.63, API-1.64
  it("copySeasonAndUpdateToMatchWithWhatWasSeen: the copy and the setup changes are read with their fields in the web address, and the copy and the update send what was seen", async () => {
    expect(byName("copy_season").inputSchema.required).toEqual([
      "name",
      "start_date",
      "seen"
    ]);
    expect(byName("update_to_match_setup").inputSchema.required).toEqual([
      "week",
      "changes",
      "seen"
    ]);
    expect(byName("update_to_match_setup").description).toMatch(
      /ask the person first/
    );
    const read = [];
    await call(
      "read_season_copy",
      { season: "Summer 2026", start_date: "2027-06-28" },
      { run: sfAnswering(200, JSON.stringify({ message: "Copy" }), read) }
    );
    await call(
      "read_setup_changes",
      { season: "Summer 2026", week: "Week 1", schedule: "Manual Build" },
      { run: sfAnswering(200, JSON.stringify({ message: "Changes" }), read) }
    );
    expect(read.map((r) => r.args[3])).toEqual([
      "/services/apexrest/v1/read_season_copy?season=Summer+2026&start_date=2027-06-28",
      "/services/apexrest/v1/read_setup_changes?season=Summer+2026&week=Week+1&schedule=Manual+Build"
    ]);
    const asked = {
      copy_season: {
        season: "Summer 2026",
        name: "Summer 2027",
        start_date: "2027-06-28",
        seen: { season: "2027-06-28 to 2027-08-06" }
      },
      update_to_match_setup: {
        season: "Summer 2026",
        week: "Week 1",
        changes: ["a1b2"],
        seen: "c3d4"
      }
    };
    for (const [name, body] of Object.entries(asked)) {
      const sent = [];
      await call(name, body, {
        run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
      });
      expect(sent[0].args[3]).toBe(`/services/apexrest/v1/${name}`);
      expect(JSON.parse(sent[0].stdin)).toEqual(body);
    }
  });

  // API-1.100, API-1.101
  it("proposedReadAndConfirmedWithProposedSeen: the proposed offerings are read by season in the web address, and Confirm sends the activity, its elective set and seen proposed", async () => {
    expect(byName("confirm_proposed_offering").inputSchema.required).toEqual([
      "activity",
      "seen"
    ]);
    const read = [];
    await call(
      "read_proposed_offerings",
      { season: "Summer 2026" },
      { run: sfAnswering(200, JSON.stringify({ message: "Proposed" }), read) }
    );
    expect(read[0].args[3]).toBe(
      "/services/apexrest/v1/read_proposed_offerings?season=Summer+2026"
    );
    const body = {
      season: "Summer 2026",
      elective_set: "Chugim",
      activity: "Drama",
      seen: "proposed"
    };
    const sent = [];
    await call("confirm_proposed_offering", body, {
      run: sfAnswering(200, JSON.stringify({ message: "Done" }), sent)
    });
    expect(sent[0].args[3]).toBe(
      "/services/apexrest/v1/confirm_proposed_offering"
    );
    expect(JSON.parse(sent[0].stdin)).toEqual(body);
  });

  // API-1.53, API-1.54, API-1.55
  it("runsInCoversAndWhoAsLists: the weeks something runs in, who a recurring activity covers and who can do an activity go as lists, so a name with a comma stays one name", async () => {
    const fields = byName("change_setup_record").inputSchema.properties.fields
      .description;
    expect(fields).toMatch(/runs_in: a list of the week names/);
    expect(fields).toMatch(/covers: a list of the division and group names/);
    expect(
      byName("add_setup_record").inputSchema.properties.fields.description
    ).not.toMatch(/runs_in/);
    expect(
      byName("change_activity_rules").inputSchema.properties.fields.description
    ).toMatch(/who_can_do_it \(a list of division and group names/);
    const asked = {
      season: "Summer 2026",
      kind: "recurring activity",
      name: "Rest",
      fields: { runs_in: ["Week 1", "Week 3"], covers: ["Bunk 4, boys"] },
      seen: { runs_in: ["Week 1", "Week 2"], covers: ["Seniors"] }
    };
    const sent = [];
    await call("change_setup_record", asked, {
      run: sfAnswering(200, JSON.stringify({ message: "Changed" }), sent)
    });
    expect(sent[0].args[3]).toBe("/services/apexrest/v1/change_setup_record");
    expect(JSON.parse(sent[0].stdin)).toEqual(asked);
  });

  it("manualBuildWeeksSayWhichSchedule: a cell change, the grid's multi-cell edits, checks and accepts, undo, versions, publish, unpublish and locks take schedule and send it; build stays Generated Schedule's", async () => {
    const either = [
      "change_schedule_cell",
      "move_cell",
      "change_cell_length",
      "take_out_cell",
      "copy_cells",
      "read_week_checks",
      "accept_finding",
      "undo_last_agent_change",
      "save_version",
      "restore_version",
      "delete_version",
      "apply_to_other_weeks",
      "publish_week",
      "unpublish_week",
      "lock_cells",
      "unlock_cells"
    ];
    for (const name of either) {
      expect(byName(name).inputSchema.properties.schedule).toBeDefined();
    }
    for (const name of [
      "build_week",
      "start_manual_week",
      "list_versions",
      "rename_version"
    ]) {
      expect(byName(name).inputSchema.properties.schedule).toBeUndefined();
    }
    const asked = {
      season: "Summer 2026",
      week: "Week 1",
      schedule: "Manual Build"
    };
    const seen = [];
    const done = await call("publish_week", asked, {
      run: sfAnswering(
        200,
        JSON.stringify({ message: "Published Week 1." }),
        seen
      )
    });
    expect(seen[0].args[3]).toBe("/services/apexrest/v1/publish_week");
    expect(JSON.parse(seen[0].stdin)).toEqual(asked);
    expect(done).toEqual({ ok: true, status: 200, text: "Published Week 1." });
  });

  // API-1.123
  it("draftReadAsItsScreen: read_week_draft reads what the counter reads at its own address, gives the counter and, on Generated Schedule, seen ahead of compact rows laid out with the cell edits' own reading (the grid's padlocks, away, Open, kinds, special days, days not read), and narrows the rows to a day or group", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const modules = (files) => async () =>
      Object.assign({}, ...files.map((f) => require(`${LWC}/${f}`)));
    const shared = [
      "shoreshGeneratedWeek/build.js",
      "shoreshTerms/shoreshTerms.js",
      "shoreshGeneratedSchedule/counter.js",
      "shoreshWeekEditor/measure.js"
    ];
    const checks = modules([
      ...shared,
      "shoreshWeekEditor/manualChecks.js",
      "shoreshWeekChecks/lines.js"
    ]);
    const edits = modules([
      ...shared,
      "shoreshGeneratedSchedule/locks.js",
      "shoreshWeekEditor/specials.js",
      "shoreshWeekEditor/slotEdits.js",
      "shoreshWeekEditor/locks.js",
      "shoreshWeekEditor/handEdits.js"
    ]);
    const reading =
      (body, seen = []) =>
      async (args) => {
        seen.push(args);
        return `HTTP/1.1 200\n\n${JSON.stringify(body)}`;
      };

    // Generated Schedule: Bunk 1 Flagpole, Swim, Art, Open; Bunk 2 Flagpole, Art, Swim (locked
    // on Monday), Open (mornings only, so away).
    const { camp, SMALL } = require(
      `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
    );
    const inputs = camp({ ...SMALL, scheduleId: "a0S000000000001AAA" });
    const [swim, art] = inputs.activities.map((a) => a.Id);
    inputs.days = inputs.days.map((day) => ({
      ...day,
      items: [
        ...day.items,
        { id: swim, name: "Swim", kind: "A", gone: false },
        { id: art, name: "Art", kind: "A", gone: false }
      ],
      rows: ["1,2,3,", "1,3,2,"],
      locks: day.dateValue === "2026-06-29" ? ["", ",,1,"] : ["", ""]
    }));
    const read = { inputs, setup: {}, labels: [], accepted: "[]" };
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const seen = [];
    const got = await call("read_week_draft", asked, {
      run: reading(read, seen),
      checks,
      edits
    });
    expect(seen[0][3]).toBe(
      "/services/apexrest/v1/read_week_draft?season=Summer+2026&week=Week+1&program=Main"
    );
    expect(got.ok).toBe(true);
    expect(got.about).toBe(byName("read_week_draft").about);
    // A long answer cut short loses cells, never the problems or seen.
    expect(got.text).not.toContain("\n");
    expect(got.text.indexOf('"checks"')).toBeLessThan(
      got.text.indexOf('"records"')
    );
    expect(got.text.indexOf('"seen"')).toBeLessThan(
      got.text.indexOf('"records"')
    );
    const answer = JSON.parse(got.text);
    const rows = (a) =>
      a.records.map((r) =>
        Object.fromEntries(r.map((value, i) => [a.columns[i], value]))
      );
    expect(answer.schedule).toBe("Generated Schedule");
    expect(answer.records).toHaveLength(16);
    expect(rows(answer).slice(4, 8)).toEqual([
      {
        date: "2026-06-29",
        day: "Monday",
        group: "Bunk 2",
        time_block: "Flag",
        start_time: "08:30",
        end_time: "09:00",
        activity: "Flagpole",
        // The grid's padlock on a fixed activity, though no one locked it.
        notes: "locked, fixed activity"
      },
      expect.objectContaining({ time_block: "Period 1", activity: "Art" }),
      expect.objectContaining({
        time_block: "Period 2",
        activity: "Swim",
        notes: "locked"
      }),
      expect.objectContaining({
        time_block: "Period 3",
        activity: "Open",
        notes: "away"
      })
    ]);
    // Monday and Tuesday's four Flagpoles, and the one cell the director locked.
    expect(
      rows(answer).filter((r) => r.notes?.includes("locked"))
    ).toHaveLength(5);
    expect(answer.seen).toBe("2026-06-29:1");

    // One day or one group: fewer rows, the same counter; never no rows for a wrong name.
    const narrowed = async (extra) =>
      call(
        "read_week_draft",
        { ...asked, ...extra },
        {
          run: reading(read),
          checks,
          edits
        }
      );
    const monday = JSON.parse((await narrowed({ day: "monday" })).text);
    expect(monday.records).toHaveLength(8);
    expect(rows(monday).every((r) => r.date === "2026-06-29")).toBe(true);
    expect(monday.checks).toEqual(answer.checks);
    const byDate = JSON.parse((await narrowed({ day: "2026-06-30" })).text);
    expect(rows(byDate).every((r) => r.day === "Tuesday")).toBe(true);
    const bunk = JSON.parse((await narrowed({ group: "bunk 2" })).text);
    expect(bunk.records).toHaveLength(8);
    expect(rows(bunk).every((r) => r.group === "Bunk 2")).toBe(true);
    const both = JSON.parse(
      (await narrowed({ day: "Monday", group: "Bunk 2" })).text
    );
    expect(both.records).toHaveLength(4);
    expect(await narrowed({ day: "Sunday" })).toMatchObject({
      ok: false,
      text: 'Week 1 has no day "Sunday" in its schedule. The days: Monday, Tuesday.'
    });
    expect(await narrowed({ group: "Bunk 9" })).toMatchObject({
      ok: false,
      text: 'There is no group called "Bunk 9" on Week 1. The groups: Bunk 1, Bunk 2.'
    });

    // What a cell holds, and a day that can't be read: said, never left out.
    const varied = {
      ...read,
      inputs: {
        ...inputs,
        days: inputs.days.map((day, d) =>
          d === 0
            ? {
                ...day,
                items: [
                  ...day.items,
                  {
                    id: "a0X000000000001AAA",
                    name: "Color War",
                    kind: "S",
                    gone: false
                  },
                  {
                    id: "a0E000000000001AAA",
                    name: "Chug A",
                    kind: "E",
                    gone: false
                  },
                  {
                    id: "a0R000000000001AAA",
                    name: "Rest",
                    kind: "R",
                    gone: false
                  }
                ],
                rows: [
                  `1,${day.items.length + 1},${day.items.length + 2},${day.items.length + 3}`,
                  day.rows[1]
                ]
              }
            : { ...day, problem: "It can't be opened." }
        )
      }
    };
    const kinds = JSON.parse(
      (
        await call("read_week_draft", asked, {
          run: reading(varied),
          checks,
          edits
        })
      ).text
    );
    expect(rows(kinds).slice(1, 4)).toEqual([
      expect.objectContaining({
        activity: "Color War",
        notes: "special event"
      }),
      expect.objectContaining({ activity: "Chug A", notes: "elective set" }),
      expect.objectContaining({
        activity: "Rest",
        notes: "locked, recurring activity"
      })
    ]);
    expect(kinds.days_not_read).toEqual([
      { date: "2026-06-30", day: "Tuesday", problem: "It can't be opened." }
    ]);
    expect(kinds.records).toHaveLength(8);

    // CORE-1.0: the kinds in the camp's own words, as typed; the standard ones in lower case.
    const custom = (term, singular) => ({
      term,
      singular,
      plural: `${singular}s`,
      isCustom: true
    });
    const inCampWords = JSON.parse(
      (
        await call("read_week_draft", asked, {
          run: reading({
            ...varied,
            labels: [
              custom("ElectiveSet", "Chug"),
              custom("SpecialEvent", "Maccabiah"),
              custom("FixedActivity", "Flag time"),
              custom("RecurringActivity", "Rest time")
            ]
          }),
          checks,
          edits
        })
      ).text
    );
    expect(rows(inCampWords).slice(0, 4)).toEqual([
      expect.objectContaining({ notes: "locked, Flag time" }),
      expect.objectContaining({ activity: "Color War", notes: "Maccabiah" }),
      expect.objectContaining({ activity: "Chug A", notes: "Chug" }),
      expect.objectContaining({ activity: "Rest", notes: "locked, Rest time" })
    ]);

    // The counter, exactly as read_week_checks gives it on the same week.
    const counted = await call("read_week_checks", asked, {
      run: reading(read),
      checks,
      edits
    });
    const { seen: _, locked, ...words } = JSON.parse(counted.text);
    expect(answer.checks).toEqual(words);
    expect(locked).toEqual(["Bunk 2 · Monday · Period 2"]);

    // Manual Build: no locks and no seen; Tuesday is a special day, said by its name.
    const fixture = require(
      `${LWC}/shoreshWeekEditor/__tests__/data/draftFixture.js`
    );
    const draft = {
      ...fixture.draft(fixture.WITH_SOCCER, ["1,2,", "1,,"]),
      specials: { days: [{ dateValue: "2026-06-30", name: "Color War" }] }
    };
    const manual = await call(
      "read_week_draft",
      { ...asked, schedule: "Manual Build" },
      {
        run: reading({ draft, setup: {}, labels: [], accepted: "[]" }),
        checks,
        edits
      }
    );
    const manualAnswer = JSON.parse(manual.text);
    expect(manualAnswer.schedule).toBe("Manual Build");
    expect(manualAnswer.seen).toBeUndefined();
    expect(manualAnswer.special_days).toEqual([
      { date: "2026-06-30", day: "Tuesday", special_day: "Color War" }
    ]);
    expect(
      rows(manualAnswer).map((r) => [r.group, r.time_block, r.activity])
    ).toEqual([
      ["Bunk 1", "Period 1", "Flagpole"],
      ["Bunk 1", "Period 2", "Soccer"],
      ["Bunk 1", "Lunch", "Open"],
      ["Bunk 2", "Period 1", "Flagpole"],
      ["Bunk 2", "Period 2", "Open"],
      ["Bunk 2", "Lunch", "Open"]
    ]);
    expect(manualAnswer.checks.placed).toBe("1 of 3 placed");

    // A week never built: Shoresh's own sentence, passed on.
    const refused = await call("read_week_draft", asked, {
      run: async () =>
        `HTTP/1.1 400\n\n${JSON.stringify({ message: "Week 1 hasn't been built for Main yet, so it has no draft." })}`,
      checks,
      edits
    });
    expect(refused).toMatchObject({
      ok: false,
      text: "Week 1 hasn't been built for Main yet, so it has no draft."
    });
  });

  /** read_week_draft on a Manual Build week of Bunk 1 and Bunk 2, changed by `change`. */
  const draftAnswer = async (change, extra = {}) => {
    const LWC = "../../force-app/main/default/lwc";
    const modules = (files) => async () =>
      Object.assign({}, ...files.map((f) => require(`${LWC}/${f}`)));
    const shared = [
      "shoreshGeneratedWeek/build.js",
      "shoreshTerms/shoreshTerms.js",
      "shoreshGeneratedSchedule/counter.js",
      "shoreshWeekEditor/measure.js"
    ];
    const fixture = require(
      `${LWC}/shoreshWeekEditor/__tests__/data/draftFixture.js`
    );
    const draft = fixture.draft(fixture.WITH_SOCCER, ["1,2,", "1,,"]);
    draft.schedule.days = draft.schedule.days.map(change);
    return call(
      "read_week_draft",
      {
        season: "Summer 2026",
        week: "Week 1",
        program: "Main",
        schedule: "Manual Build",
        ...extra
      },
      {
        run: async () =>
          `HTTP/1.1 200\n\n${JSON.stringify({ draft, setup: {}, labels: [], accepted: "[]" })}`,
        checks: modules([
          ...shared,
          "shoreshWeekEditor/manualChecks.js",
          "shoreshWeekChecks/lines.js"
        ]),
        edits: modules([
          ...shared,
          "shoreshGeneratedSchedule/locks.js",
          "shoreshWeekEditor/specials.js",
          "shoreshWeekEditor/slotEdits.js",
          "shoreshWeekEditor/locks.js",
          "shoreshWeekEditor/handEdits.js"
        ])
      }
    );
  };

  // API-1.123
  it("draftSameNamedGroupsStayApart: two groups with one name are said, each row says which it is, and a filter that can't tell them apart is refused in the cell edits' words", async () => {
    const twoBunkOnes = (day) => ({
      ...day,
      groups: day.groups.map((g) => ({ ...g, name: "Bunk 1" }))
    });
    const got = await draftAnswer(twoBunkOnes);
    expect(got.ok).toBe(true);
    expect(got.text.indexOf("groups_with_the_same_name")).toBeLessThan(
      got.text.indexOf('"records"')
    );
    const answer = JSON.parse(got.text);
    expect(answer.groups_with_the_same_name).toEqual(["Bunk 1"]);
    const notes = answer.columns.indexOf("notes");
    const time = answer.columns.indexOf("time_block");
    const activity = answer.columns.indexOf("activity");
    expect(
      answer.records
        .filter((r) => r[time] === "Period 2")
        .slice(0, 2)
        .map((r) => [r[activity], r[notes]])
    ).toEqual([
      ["Soccer", "group 1 of 2 called Bunk 1"],
      ["Open", "group 2 of 2 called Bunk 1"]
    ]);
    expect(await draftAnswer(twoBunkOnes, { group: "bunk 1" })).toMatchObject({
      ok: false,
      text: 'Two groups are called "bunk 1" on that day. Nothing was changed.'
    });
  });

  // API-1.123
  it("draftDaysNotReadAreNeverRefused: when no day can be read the answer says so, for any group or day asked for, instead of refusing the group", async () => {
    const unread = (day) => ({ ...day, problem: "It can't be opened." });
    for (const extra of [{}, { group: "Bunk 1" }, { group: "Bunk 9" }]) {
      const got = await draftAnswer(unread, extra);
      expect(got.ok).toBe(true);
      const answer = JSON.parse(got.text);
      expect(answer.days_not_read.length).toBeGreaterThan(0);
      expect(answer.days_not_read[0].problem).toBe("It can't be opened.");
      expect(answer.records).toEqual([]);
      expect(answer.checks).toBeDefined();
    }
  });

  // API-1.44, API-1.45, API-1.143
  it("manualBuildAsItsScreen: on a Manual Build week, read_week_checks measures the draft as its week editor does, and move_cell works the edit out with the editor's own module and sends it without locks", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const modules = (files) => async () =>
      Object.assign({}, ...files.map((f) => require(`${LWC}/${f}`)));
    const shared = [
      "shoreshGeneratedWeek/build.js",
      "shoreshTerms/shoreshTerms.js",
      "shoreshGeneratedSchedule/counter.js",
      "shoreshWeekEditor/measure.js"
    ];
    const checks = modules([
      ...shared,
      "shoreshWeekEditor/manualChecks.js",
      "shoreshWeekChecks/lines.js"
    ]);
    const edits = modules([
      ...shared,
      "shoreshGeneratedSchedule/locks.js",
      "shoreshWeekEditor/specials.js",
      "shoreshWeekEditor/slotEdits.js",
      "shoreshWeekEditor/locks.js",
      "shoreshWeekEditor/handEdits.js"
    ]);
    const fixture = require(
      `${LWC}/shoreshWeekEditor/__tests__/data/draftFixture.js`
    );
    // Bunk 1: Flagpole, Soccer, Open on Monday; Flagpole, Open, Open on Tuesday.
    const draft = fixture.draft(fixture.WITH_SOCCER, ["1,2,", "1,,"]);
    const read = { draft, setup: {}, labels: [], accepted: "[]" };
    const asked = {
      season: "Summer 2026",
      week: "Week 1",
      program: "Main",
      schedule: "Manual Build"
    };
    const answering = (seen) => {
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify(read)}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ message: "Done." })}`
      ];
      return async (args, stdin) => {
        seen.push({ args, stdin });
        return queue.shift();
      };
    };

    const seen = [];
    const got = await call("read_week_checks", asked, {
      run: answering(seen),
      checks
    });
    expect(seen[0].args[3]).toBe(
      "/services/apexrest/v1/week_checks?season=Summer+2026&week=Week+1&program=Main&schedule=Manual+Build"
    );
    const m = await checks();
    const t = m.buildTerms([]);
    expect(got.ok).toBe(true);
    expect(JSON.parse(got.text)).toEqual(
      m.counterWords(
        m.manualMeasure(draft, { t, setup: {}, setupDots: new Map() }),
        m.readKept("[]")
      )
    );

    const sent = [];
    const moved = await call(
      "move_cell",
      {
        ...asked,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Soccer",
        to_day: "Tuesday",
        to_group: "Bunk 1",
        to_time: "Period 2"
      },
      { run: answering(sent), edits }
    );
    expect(moved).toEqual({ ok: true, status: 200, text: "Done." });
    expect(sent[1].args[3]).toBe("/services/apexrest/v1/move_cell");
    const body = JSON.parse(sent[1].stdin);
    expect(body).toMatchObject({ ...asked, said: "" });
    expect(body.change).toMatch(/^Moved Soccer to Bunk 1 · Tuesday · Period 2/);
    expect(body.runs.length).toBeGreaterThan(0);
    for (const run of body.runs) {
      expect(run.locksBefore).toBeUndefined();
    }

    // API-1.143: Clear day and Clear week, as Manual Build's Edit menu runs them.
    const { toolRuns } = require(`${LWC}/shoreshWeekEditor/tools.js`);
    const { serverRunsOf } = require(`${LWC}/shoreshWeekEditor/handEdits.js`);
    const asTheScreen = (tool) =>
      serverRunsOf(
        toolRuns(tool, draft.schedule.days, { isAway: () => false }).runs,
        draft.schedule.days
      );
    const clearSent = [];
    const cleared = await call(
      "clear_day",
      { ...asked, day: "Monday" },
      { run: answering(clearSent), edits }
    );
    expect(cleared.ok).toBe(true);
    expect(clearSent[1].args[3]).toBe("/services/apexrest/v1/copy_cells");
    const dayBody = JSON.parse(clearSent[1].stdin);
    expect(dayBody.change).toBe("Cleared Monday");
    expect(dayBody.runs).toEqual(
      asTheScreen({
        kind: "clear",
        dates: [draft.schedule.days[0].dateValue],
        name: "Monday"
      })
    );
    const groupSent = [];
    await call(
      "clear_day",
      { ...asked, day: "Monday", group: "Bunk 1" },
      { run: answering(groupSent), edits }
    );
    const groupBody = JSON.parse(groupSent[1].stdin);
    expect(groupBody.change).toBe("Cleared Bunk 1 · Monday");
    const monday = draft.schedule.days[0];
    expect(groupBody.runs).toEqual(
      asTheScreen({
        kind: "clear",
        dates: [monday.dateValue],
        groupId: monday.groups.find((g) => g.name === "Bunk 1").id,
        name: "Bunk 1 · Monday"
      })
    );
    // Bunk 2 has nothing on Monday: its own day clears nothing, Bunk 1's cells untouched.
    const otherSent = [];
    const other = await call(
      "clear_day",
      { ...asked, day: "Monday", group: "Bunk 2" },
      { run: answering(otherSent), edits }
    );
    expect(other.text).toMatch(/^Nothing to clear/);
    expect(otherSent).toHaveLength(1);
    // The week as it is called, though the AI spelled it loosely.
    read.week_name = "Week 1";
    const weekSent = [];
    await call(
      "clear_week",
      { ...asked, week: "week 1" },
      { run: answering(weekSent), edits }
    );
    delete read.week_name;
    const weekBody = JSON.parse(weekSent[1].stdin);
    expect(weekBody.change).toBe("Cleared Week 1");
    expect(weekBody.runs).toEqual(
      asTheScreen({
        kind: "clear",
        dates: draft.schedule.days.map((d) => d.dateValue),
        name: "Week 1",
        inWeek: true
      })
    );
    // Nothing to clear is said, and nothing is sent.
    const emptySent = [];
    const empty = await call(
      "clear_day",
      { ...asked, day: "Tuesday" },
      { run: answering(emptySent), edits }
    );
    expect(empty.ok).toBe(true);
    expect(empty.text).toMatch(/^Nothing to clear/);
    expect(emptySent).toHaveLength(1);
    // A day a special day replaces: offered, as on the screen, and its tool's words said.
    draft.specials = {
      days: [
        { dateValue: draft.schedule.days[1].dateValue, name: "Visiting Day" }
      ]
    };
    const specialSent = [];
    const special = await call(
      "clear_day",
      { ...asked, day: "Tuesday" },
      { run: answering(specialSent), edits }
    );
    delete draft.specials;
    expect(special).toEqual({
      ok: true,
      status: 200,
      text: "Tuesday is Visiting Day: left as it is."
    });
    expect(specialSent).toHaveLength(1);
  });
});

describe("a list import says its days as its own season (WEEK-2.6)", () => {
  // WEEK-2.6
  it("a Sunday-to-Thursday camp's first call, a list import, reads Day 2 as Monday", async () => {
    const LWC = "../../force-app/main/default/lwc";
    const imports = async () =>
      importModules({
        engine: require(`${LWC}/shoreshImportEngine/shoreshImportEngine.js`),
        lists: require(`${LWC}/shoreshLists/shoreshLists.js`),
        table: require(`${LWC}/shoreshListImport/table.js`),
        terms: require(`${LWC}/shoreshTerms/shoreshTerms.js`),
        screens: require(`${LWC}/shoreshScreens/shoreshScreens.js`),
        remembered: require(`${LWC}/shoreshRemembered/shoreshRemembered.js`),
        patterns: require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
        choices: require(`${LWC}/shoreshChoicesReader/shoreshChoicesReader.js`),
        flow: require(`${LWC}/shoreshImport/flow.js`),
        summary: require(`${LWC}/shoreshImport/summary.js`),
        fromFile: require(`${LWC}/shoreshSpecialSchedule/fromFile.js`)
      });
    // A camp read before, whose week starts on Monday: what the call must not lean on.
    require(`${LWC}/shoreshDayNames/shoreshDayNames.js`).setDayNaming({
      numbered: true,
      firstDay: 1
    });
    const sunToThu = {
      Id: "p1",
      Name: "Main",
      Sunday__c: true,
      Monday__c: true,
      Tuesday__c: true,
      Wednesday__c: true,
      Thursday__c: true,
      Friday__c: false,
      Saturday__c: false
    };
    const setup = {
      season: {
        Id: "a00000000000001AAA",
        Name: "Summer 2026",
        NumberedDays__c: true,
        StartDate__c: "2026-06-28"
      },
      weeks: [],
      weekExceptions: [],
      locationTypes: [],
      locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 2 }],
      activities: [
        {
          Id: "a1",
          Name: "Archery",
          Location__c: "l1",
          Length__c: 1,
          Priority__c: "Low",
          GroupsAtOnce__c: 1,
          EarlyWeekCount__c: 2,
          EarlyWeekByDay__c: "Monday"
        }
      ],
      programs: [
        {
          program: sunToThu,
          timeBlocks: [],
          divisions: [],
          fixedActivities: [],
          recurringActivities: []
        }
      ],
      schedules: [],
      labels: []
    };
    const read = JSON.stringify({
      season: "Summer 2026",
      setup,
      answers: [],
      seen: "s1"
    });
    const done = await call(
      "import_list",
      {
        season: "Summer 2026",
        list: "activities",
        file_name: "activities.csv",
        csv_text: "Activity,Location,Early in week\nArchery,Gym,2 by Day 2"
      },
      { run: async () => `HTTP/1.1 200\n\n${read}`, imports }
    );
    expect(done.ok).toBe(true);
    // Day 2 of a Sunday-first week is Monday, as set up: nothing differs.
    expect(done.text).not.toContain("Keep or Change");
  });
});
