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
  call,
  check,
  sfPath,
  signIn
} = require("../client");
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
      // What Shoresh's view of a week draws: part of a schedule read, not an action (API-1.26).
      .filter((a) => a !== "week_view")
      .sort();
    expect(CAPABILITIES.map((c) => c.api).sort()).toEqual(addresses);
    expect(CAPABILITIES).toHaveLength(61);
    for (const c of CAPABILITIES) {
      expect(
        requestFor(c, { season: "S", week: "W", records: [] }).path
      ).toMatch(new RegExp(`^/services/apexrest/v1/${c.api}(\\?|$)`));
      expect(c.method).toBe(/^(read|list)_/.test(c.name) ? "GET" : "POST");
    }
  });

  // API-1.6, API-1.5
  // API-1.19
  it("plainNames: every action is list_seasons, read_<thing>, bring_in_<things>, change_<thing>, build_week, publish_week, unpublish_week, lock_cells, unlock_cells, move_cell, take_out_cell, copy_cells, start_manual_week, finalize_electives, accept_finding, undo_last_agent_change, <verb>_version, rename/delete/add_setup_record, fill_in_weeks, merge_locations, confirm_setup_guess, copy_season, update_to_match_setup, switch_to_rain_plans, assign_elective_seats, move_elective_seat, lock_elective_seat, start_new_elective_version, clear_electives, put_special_day_on_day, take_special_day_off_day or place_special_event, said without jargon", () => {
    for (const c of CAPABILITIES) {
      expect(c.name).toMatch(
        /^((read|bring_in|change)_[a-z]+(_[a-z]+)*|list_seasons|undo_last_agent_change|build_week|(un)?publish_week|(un)?lock_cells|move_cell|take_out_cell|copy_cells|start_manual_week|finalize_electives|accept_finding|(list|save|restore|rename|delete)_versions?|(rename|delete|add)_setup_record|fill_in_weeks|merge_locations|confirm_setup_guess|copy_season|update_to_match_setup|switch_to_rain_plans|assign_elective_seats|move_elective_seat|lock_elective_seat|start_new_elective_version|clear_electives|put_special_day_on_day|take_special_day_off_day|place_special_event)$/
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
      { run, engine }
    );
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/build_week?season=Summer+2026&week=Week+1",
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
      "/services/apexrest/v1/build_week",
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
      keptLine: (l) => JSON.stringify({ k: l.key, s: l.same, n: l.size })
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
      checks
    });
    expect(seen[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/week_checks?season=Summer+2026&week=Week+1&program=Main",
      "--method",
      "GET"
    ]);
    expect(got).toEqual({
      ok: true,
      status: 200,
      about: byName("read_week_checks").about,
      text: JSON.stringify({ placed: "3 of 4 placed" }, null, 2)
    });
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

  // API-1.32
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
          says: `Generated Schedule · Through an agent · ${when}`,
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

  // API-1.36, API-1.37
  it("unpublishAndLocksAreTheScreens: unpublish_week, lock_cells and unlock_cells send the person's fields to their own addresses and pass on Shoresh's sentence", async () => {
    const asked = { season: "Summer 2026", week: "Week 1", program: "Main" };
    const cases = [
      ["unpublish_week", {}, "Unpublished Week 1."],
      [
        "lock_cells",
        { day: "Monday", group: "Bunk 3", time: "Period 2" },
        "Locked Bunk 3 · Monday · Period 2."
      ],
      ["unlock_cells", { day: "Monday" }, "Unlocked Monday."]
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

  // API-1.38, API-1.39, API-1.40
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
    expect(unknown.done.text).toBe(
      'There is no special event called "Carnival" in this season. The special events: Color War.'
    );
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
    const assign = async (seen, status = 200) => {
      const seen_ = [];
      const queue = [
        `HTTP/1.1 200\n\n${JSON.stringify({ view, labels: [] })}`,
        `HTTP/1.1 ${status}\n\n${JSON.stringify({ message: "Seats assigned in Chugim in Week 1." })}`,
        `HTTP/1.1 200\n\n${JSON.stringify({ view: { ...view, revision: 2, assigned: true }, labels: [] })}`
      ];
      const done = await call(
        "assign_elective_seats",
        { ...asked, seen },
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
    const done = await assign("r1:1");
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
      dropped: expected.dropped
    });
    expect(body.seats.length).toBeGreaterThan(0);
    expect(done.done.ok).toBe(true);
    expect(done.done.text).toMatch(/^Seats assigned: \d+ of \d+ placed\.$/);

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
          '{"message":"Not finalized. Assign seats first."}',
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
      text: "Not finalized. Assign seats first."
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
        .filter(
          (f) =>
            f !== "manifest.json" && !f.endsWith(".mjs") && !f.endsWith(".html")
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
          ["fs", "path", "child_process", "url"].includes(needed) ||
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
    expect((await check({ org: "shoresh", run: async () => "" })).text).toBe(
      "Not signed in to Salesforce yet, or the Salesforce command line isn't installed."
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
    const names = tools().map((t) => t.name);
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
      expect(seenScript).toEqual(seenMcp);
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
    expect(tools().map(({ _meta, ...tool }) => tool)).toEqual(
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
      "take_out_cell",
      "copy_cells",
      "read_week_checks",
      "accept_finding",
      "undo_last_agent_change",
      "save_version",
      "restore_version",
      "delete_version",
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

  // API-1.44, API-1.45
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
  });
});
