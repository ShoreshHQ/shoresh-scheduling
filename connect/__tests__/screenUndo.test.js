/**
 * An AI's change leaves exactly what the same action on the screen leaves, and its Undo is the
 * screen's Undo (docs/protocol/api.md API-1.14, API-1.148; Greg 2026-11-15): typing in a cell places
 * an activity for its full length, as the week editor does; Undo is held by the connector for
 * this conversation only (connect/undo.js), sending a hand edit's runs back or a Rebuild's or
 * Start over's version, and saying plainly what the screen has no Undo for. No Salesforce here:
 * the sf command line is a stand-in.
 */
const { call: callAs } = require("../client");
const { forgetAll } = require("../undo");
const { main, NO_UNDO_HERE } = require("../cli");

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
      "shoreshWeekEditor/handEdits.js",
      "shoreshWeekEditor/rain.js",
      "shoreshWeekEditor/moves.js"
    ].map((f) => require(`${LWC}/${f}`))
  );
const { camp, SMALL } = require(
  `${LWC}/shoreshGeneratedSchedule/__tests__/data/camp.js`
);

const SCHEDULE = "a0S000000000001AAA";
// Two days; Bunk 1: Flag, Swim, Art, Open; Bunk 2: Flag, Art, Swim, Open (locked in Period 2 on
// Monday). Soccer runs two time blocks.
const inputs = camp({
  ...SMALL,
  activities: [
    ...SMALL.activities.slice(0, 2),
    { ...SMALL.activities[2], length: 2 }
  ],
  scheduleId: SCHEDULE
});
const [swim, art, soccer] = inputs.activities.map((a) => a.Id);
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
const READ = `HTTP/1.1 200\n\n${JSON.stringify({ inputs, setup: {}, labels: [] })}`;
const WEEK = { season: "Summer 2026", week: "Week 1", program: "Main" };

const call = (name, input, options) =>
  callAs(name, input, {
    camp: async () => ({ namespace: "", version: null }),
    edits,
    ...options
  });

/** sf answering each request in turn, every request recorded. */
function sfAnswering(answers) {
  const seen = [];
  return {
    seen,
    run: async (args, stdin) => {
      seen.push({ args, stdin, body: stdin ? JSON.parse(stdin) : null });
      return answers.shift();
    }
  };
}

const answer = (body, status = 200) =>
  `HTTP/1.1 ${status}\n\n${JSON.stringify(body)}`;

/** What a change's answer says its Undo needs (AgentUndoHeld). */
const undoOf = (kind, label, more = {}) => ({
  schedule: SCHEDULE,
  kind,
  label,
  seen: "after",
  version: null,
  version_name: null,
  ...more
});

beforeEach(() => forgetAll());

describe("an AI's change is the screen's, and so is its Undo", () => {
  // API-1.11, API-1.13
  it("typingPlacesTheFullLength: an activity typed in goes in for its length, as the week editor's placeStep does", async () => {
    const sf = sfAnswering([READ, answer({ message: "Done." })]);
    const done = await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Art",
        activity: "Soccer",
        seen: "before"
      },
      sf
    );
    expect(done).toEqual({ ok: true, status: 200, text: "Done." });
    expect(sf.seen[1].args[3]).toBe("/services/apexrest/v1/schedule_cell");
    const sent = sf.seen[1].body;
    expect(sent.change).toBe("Placed Soccer · Bunk 1 · Monday · Period 2");
    expect(sent.revision).toBe("before");
    expect(sent.runs).toEqual([
      expect.objectContaining({
        day: "2026-06-29",
        groupId: inputs.groups[0].Id,
        firstBlockId: inputs.timeBlocks[2].Id,
        blockIds: [inputs.timeBlocks[2].Id, inputs.timeBlocks[3].Id],
        before: [`A:${art}`, ""],
        after: [`A:${soccer}`, `^A:${soccer}`]
      })
    ]);
  });

  it("typingWhereItRunsOutOfRoomSaysHowFar: and typing into a longer placement replaces it whole", async () => {
    const short = sfAnswering([READ, answer({ message: "Done." })]);
    await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 3",
        was: "Open",
        activity: "Soccer",
        seen: "before"
      },
      short
    );
    expect(short.seen[1].body.change).toBe(
      "Placed Soccer · Bunk 1 · Monday · Period 3 (1 of 2)"
    );

    // Swim runs Period 1 and Period 2 for Bunk 1 on Tuesday: typing Art into Period 2 replaces it
    // from Period 1, as the screen does (no refusal).
    const longer = JSON.parse(READ.slice(READ.indexOf("{")));
    longer.inputs.days[1].rows = ["1,2,^,", "1,3,2,"];
    const sf = sfAnswering([
      `HTTP/1.1 200\n\n${JSON.stringify(longer)}`,
      answer({ message: "Done." })
    ]);
    await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Tuesday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Swim",
        activity: "Art",
        seen: "before"
      },
      sf
    );
    expect(sf.seen[1].body.change).toBe(
      "Placed Art · Bunk 1 · Tuesday · Period 1"
    );
    expect(sf.seen[1].body.runs[0]).toEqual(
      expect.objectContaining({
        before: [`A:${swim}`, `^A:${swim}`],
        after: [`A:${art}`, ""]
      })
    );
  });

  // API-1.13, API-1.124
  it("typingIsRefusedAsTheScreenRefuses: someone else's change, a locked cell and a name the season doesn't have, with nothing sent", async () => {
    const asked = async (more) => {
      const sf = sfAnswering([READ]);
      const done = await call(
        "change_schedule_cell",
        { ...WEEK, day: "Monday", seen: "before", ...more },
        sf
      );
      expect(sf.seen).toHaveLength(1);
      return done;
    };
    expect(
      await asked({
        group: "Bunk 1",
        time: "Period 2",
        was: "Swim",
        activity: "Soccer"
      })
    ).toEqual({
      ok: false,
      status: 409,
      text: "Changed by someone else: Bunk 1 · Monday · Period 2 holds Art now. Nothing was changed."
    });
    expect(
      await asked({
        group: "Bunk 2",
        time: "Period 2",
        was: "Swim",
        activity: "Soccer"
      })
    ).toEqual({
      ok: false,
      status: 400,
      text: "Bunk 2 · Monday · Period 2 is locked."
    });
    const unknown = await asked({
      group: "Bunk 1",
      time: "Period 2",
      was: "Art",
      activity: "Archery"
    });
    expect(unknown.status).toBe(400);
    expect(unknown.text).toBe(
      'There is no activity or elective set called "Archery" in this season. The activities and elective sets: Art, Soccer, Swim.'
    );
  });

  // API-1.14
  it("aCellEditIsUndoneByItsRunsBack: Undo sends the edit's runs back with the locks from before it, through the same save, and then holds nothing", async () => {
    const label = "Placed Soccer · Bunk 1 · Monday · Period 2";
    const sf = sfAnswering([
      READ,
      answer({ message: `${label}.`, undo: undoOf("edit", label) }),
      answer({ message: "Nothing has been done yet. This undoes ..." }),
      answer({
        message: `Undone: ${label}.`,
        undo: undoOf("undone", label, { seen: "undone" })
      }),
      answer(
        {
          message: "Nothing to undo: this conversation hasn't changed Week 1."
        },
        400
      )
    ]);
    const done = await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Art",
        activity: "Soccer",
        seen: "before"
      },
      sf
    );
    // What Undo needs stays here; the person's AI hears only the answer.
    expect(done.text).toBe(`${label}.`);
    const asked = await call("undo_last_agent_change", WEEK, sf);
    expect(asked.asksFirst).toBe(true);
    expect(sf.seen[2].args[3]).toBe(
      "/services/apexrest/v1/undo_last_agent_change"
    );
    const held = sf.seen[2].body.held[SCHEDULE];
    expect(held).toEqual(
      expect.objectContaining({ kind: "edit", label, seen: "after" })
    );
    expect(held.runs).toEqual([
      expect.objectContaining({
        before: [`A:${soccer}`, `^A:${soccer}`],
        after: [`A:${art}`, ""],
        // Locked by the edit (a hand edit is a lock), unlocked again by its Undo, as on screen.
        locksBefore: ["1", "1"],
        locksAfter: ["", ""]
      })
    ]);
    await call("undo_last_agent_change", { ...WEEK, confirm: "yes" }, sf);
    expect(sf.seen[3].body.held[SCHEDULE].seen).toBe("after");
    // Undone: nothing left to take back in that week.
    await call("undo_last_agent_change", WEEK, sf);
    expect(sf.seen[4].body.held).toEqual({});
  });

  it("eachUndoTakesBackTheOneBefore: two edits are undone newest first, the second from the week the first Undo left", async () => {
    const first = "Placed Soccer · Bunk 1 · Monday · Period 2";
    const second = "Cleared Swim · Bunk 1 · Monday · Period 1";
    const sf = sfAnswering([
      READ,
      answer({ message: "1", undo: undoOf("edit", first, { seen: "r2" }) }),
      READ,
      answer({ message: "2", undo: undoOf("edit", second, { seen: "r3" }) }),
      answer({
        message: "Undone.",
        undo: undoOf("undone", second, { seen: "r4" })
      }),
      answer({ message: "Undone." })
    ]);
    const cell = { ...WEEK, day: "Monday", group: "Bunk 1", seen: "r1" };
    await call(
      "change_schedule_cell",
      { ...cell, time: "Period 2", was: "Art", activity: "Soccer" },
      sf
    );
    await call(
      "change_schedule_cell",
      { ...cell, time: "Period 1", was: "Swim", activity: "Open" },
      sf
    );
    await call("undo_last_agent_change", { ...WEEK, confirm: "c" }, sf);
    expect(sf.seen[4].body.held[SCHEDULE].label).toBe(second);
    await call("undo_last_agent_change", { ...WEEK, confirm: "c" }, sf);
    expect(sf.seen[5].body.held[SCHEDULE]).toEqual(
      expect.objectContaining({ label: first, seen: "r4" })
    );
  });

  it("aRebuildOrStartOverIsUndoneWithTheVersionItsSaveKept: Generate, Try another and Fill the open cells hold no Undo", async () => {
    const checks = async () => ({
      menuForAgent: (read, how) => ({
        ok: true,
        said: "3 of 4 placed.",
        save: { action: how.action, revision: "r1", option: 1, days: [] }
      })
    });
    const started = "Started Week 1 over";
    const sf = sfAnswering([
      answer({ inputs: {}, setup: {}, labels: {} }),
      answer({
        message: `${started}.`,
        undo: undoOf("build", started, {
          version: "a0S000000000009AAA",
          version_name: "Before Start over"
        })
      }),
      answer({ message: "Nothing has been done yet." })
    ]);
    const done = await call("start_over_week", WEEK, { ...sf, checks });
    expect(done.text).toBe(`${started}. 3 of 4 placed.`);
    await call("undo_last_agent_change", WEEK, sf);
    expect(sf.seen[2].body.held).toEqual({
      [SCHEDULE]: expect.objectContaining({
        kind: "build",
        label: started,
        seen: "after",
        version: "a0S000000000009AAA",
        version_name: "Before Start over"
      })
    });

    // Fill the open cells has no Undo on the screen: it replaces what was held, and Undo is
    // refused in Shoresh's words (the server's, from what is held).
    const filled = "Placed what fits in the open cells of Week 1";
    const fill = sfAnswering([
      answer({ inputs: {}, setup: {}, labels: {} }),
      answer({ message: `${filled}.`, undo: undoOf("none", filled) }),
      answer(
        {
          message: `The screen has no Undo for "${filled}", so nothing was undone.`
        },
        400
      )
    ]);
    await call("fill_open_cells", WEEK, { ...fill, checks });
    const refused = await call("undo_last_agent_change", WEEK, fill);
    expect(fill.seen[2].body.held[SCHEDULE]).toEqual(
      expect.objectContaining({ kind: "none", label: filled })
    );
    expect(refused.ok).toBe(false);
    expect(refused.text).toContain("The screen has no Undo for");
  });

  // API-1.14: a Lock between an edit and its Undo, as on the screen (shoreshWeekEditor lockChosen).
  it("undoGoesOnPastALock: the history is kept, Undo is from the week the Lock left, and a cell the Lock reached keeps its lock", async () => {
    const label = "Placed Soccer · Bunk 1 · Monday · Period 2";
    // The week as the edit left it: Soccer over Period 2 and 3 for Bunk 1, both locked.
    const edited = JSON.parse(READ.slice(READ.indexOf("{")));
    edited.inputs.days = edited.inputs.days.map((day, d) =>
      d === 0
        ? {
            ...day,
            items: [
              ...day.items,
              { id: soccer, name: "Soccer", kind: "A", gone: false }
            ],
            rows: ["1,2,4,^", "1,3,2,"],
            locks: [",,1,1", ",,1,"]
          }
        : day
    );
    const sf = sfAnswering([
      READ,
      answer({ message: `${label}.`, undo: undoOf("edit", label) }),
      // Lock Bunk 1 · Monday: the week is read first, as the Lock menu has it.
      `HTTP/1.1 200\n\n${JSON.stringify(edited)}`,
      answer({
        message: "Locked Bunk 1 · Monday.",
        undo: {
          schedule: SCHEDULE,
          kind: "lock",
          label: "Locked Bunk 1 · Monday",
          seen: "locked",
          action: "Lock",
          dateValue: "2026-06-29",
          groupId: inputs.groups[0].Id,
          blockId: null
        }
      }),
      answer({ message: "Nothing has been done yet." })
    ]);
    await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Art",
        activity: "Soccer",
        seen: "before"
      },
      sf
    );
    const locked = await call(
      "lock_cells",
      { ...WEEK, day: "Monday", group: "Bunk 1", seen: "after" },
      sf
    );
    expect(locked.text).toBe("Locked Bunk 1 · Monday.");
    expect(sf.seen[2].args[3]).toBe(
      "/services/apexrest/v1/week_checks?season=Summer+2026&week=Week+1&program=Main"
    );
    expect(sf.seen[3].args[3]).toBe("/services/apexrest/v1/lock_cells");
    await call("undo_last_agent_change", WEEK, sf);
    const held = sf.seen[4].body.held[SCHEDULE];
    // Still the edit, from the week as the Lock left it.
    expect(held).toEqual(
      expect.objectContaining({ kind: "edit", label, seen: "locked" })
    );
    // The Lock chose both of Soccer's cells since the edit: Undo leaves them locked, as the
    // person chose, where it would otherwise take the edit's locks back with it.
    expect(held.runs).toEqual([
      expect.objectContaining({
        before: [`A:${soccer}`, `^A:${soccer}`],
        after: [`A:${art}`, ""],
        locksBefore: ["1", "1"],
        locksAfter: ["1", "1"]
      })
    ]);
  });

  it("undoGoesOnPastSetItUp: the screen reads the week again and keeps its history, so Undo takes back the edit before", async () => {
    const label = "Placed Soccer · Bunk 1 · Monday · Period 2";
    const sf = sfAnswering([
      READ,
      answer({ message: `${label}.`, undo: undoOf("edit", label) }),
      answer({
        message: '"Carnival" is set up as a special event.',
        undo: undoOf("kept", "Set up Carnival", { seen: "set up" })
      }),
      answer({ message: "Nothing has been done yet." })
    ]);
    await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Art",
        activity: "Soccer",
        seen: "before"
      },
      sf
    );
    await call(
      "set_up_noted_item",
      { ...WEEK, kind: "special event", name: "Carnival" },
      sf
    );
    await call("undo_last_agent_change", WEEK, sf);
    expect(sf.seen[3].body.held[SCHEDULE]).toEqual(
      expect.objectContaining({ kind: "edit", label, seen: "set up" })
    );
  });

  it("aLockWithNothingHeldIsOneRequest: and a Lock after Start over ends its Undo, as the screen's", async () => {
    const lock = {
      ...WEEK,
      day: "Monday",
      group: "Bunk 1",
      time: "Period 1",
      seen: "s"
    };
    const plain = sfAnswering([answer({ message: "Locked." })]);
    await call("lock_cells", lock, plain);
    expect(plain.seen).toHaveLength(1);

    const checks = async () => ({
      menuForAgent: (read, how) => ({
        ok: true,
        said: "3 of 4 placed.",
        save: { action: how.action, revision: "r1", option: 1, days: [] }
      })
    });
    const started = "Started Week 1 over";
    const sf = sfAnswering([
      answer({ inputs: {}, setup: {}, labels: {} }),
      answer({
        message: `${started}.`,
        undo: undoOf("build", started, {
          version: "a0S000000000009AAA",
          version_name: "Before Start over"
        })
      }),
      READ,
      answer({
        message: "Locked Bunk 1 · Monday · Period 1.",
        undo: {
          schedule: SCHEDULE,
          kind: "lock",
          label: "Locked Bunk 1 · Monday · Period 1",
          seen: "locked",
          action: "Lock",
          dateValue: "2026-06-29",
          groupId: inputs.groups[0].Id,
          blockId: inputs.timeBlocks[1].Id
        }
      }),
      answer({ message: "The screen has no Undo." }, 400)
    ]);
    await call("start_over_week", WEEK, { ...sf, checks });
    await call("lock_cells", lock, sf);
    await call("undo_last_agent_change", WEEK, sf);
    expect(sf.seen[4].body.held[SCHEDULE]).toEqual(
      expect.objectContaining({
        kind: "none",
        label: started,
        version_name: "Before Start over"
      })
    );
  });

  // API-1.77, SPECIAL-1.3: an event's cells don't take elective sets, as its page offers none.
  it("anEventsCellIsNotOfferedTheElectiveSets: a set's name typed into an event is refused as a name it doesn't have, with nothing sent", async () => {
    const plan = {
      itemId: "a0X000000000002AAA",
      kind: "SpecialEvent",
      name: "Color War",
      schedule: {
        days: [
          {
            dateValue: "2000-01-01",
            problem: null,
            blocks: [
              {
                id: "b1",
                name: "Opening",
                startTime: "09:00",
                endTime: "09:45"
              }
            ],
            groups: [{ id: "g1", name: "Blue" }],
            items: [],
            rows: [","]
          }
        ]
      },
      activities: [{ id: "a1", name: "Swim", length: 1, notFor: [] }]
    };
    const setup = { electives: { sets: [{ Id: "e1", Name: "Chugim" }] } };
    const sf = sfAnswering([answer({ plan, setup, labels: [] })]);
    const done = await call(
      "change_special_schedule_cell",
      {
        season: "Summer 2026",
        special: "Color War",
        column: "Blue",
        time: "Opening",
        was: "Open",
        activity: "Chugim"
      },
      sf
    );
    expect(done.ok).toBe(false);
    expect(done.text).not.toMatch(/Chugim[^"]*,|, Chugim/);
    expect(sf.seen).toHaveLength(1);
  });

  // CORE-1.0, CORE-1.35: a column asked for that isn't there is refused in the camp's own words:
  // an event's columns are its stations, a special day's its groups, each with its own plural.
  it("aSpecialColumnIsRefusedInTheCampsWords: Tachana / Tachanot on an event, Edah / Edot on a special day, nothing sent", async () => {
    const day = {
      dateValue: "2000-01-01",
      problem: null,
      blocks: [
        { id: "b1", name: "Opening", startTime: "09:00", endTime: "09:45" }
      ],
      groups: [{ id: "g1", name: "Blue" }],
      items: [],
      rows: [","]
    };
    const labels = [
      {
        term: "Station",
        singular: "Tachana",
        plural: "Tachanot",
        isCustom: true
      },
      { term: "Group", singular: "Edah", plural: "Edot", isCustom: true }
    ];
    const refused = await Promise.all(
      ["SpecialEvent", "SpecialDay"].map(async (kind) => {
        const plan = {
          itemId: "a0X1",
          kind,
          name: "Color War",
          schedule: { days: [day] },
          activities: []
        };
        const sf = sfAnswering([answer({ plan, setup: {}, labels })]);
        const done = await call(
          "change_special_schedule_cell",
          {
            season: "Summer 2026",
            special: "Color War",
            column: "Red",
            time: "Opening",
            was: "Open",
            activity: "Open"
          },
          sf
        );
        expect(sf.seen).toHaveLength(1);
        return done.text;
      })
    );
    expect(refused).toEqual([
      expect.stringMatching(
        /^There is no Tachana called "Red" in this schedule\. The Tachanot: Blue\./
      ),
      expect.stringMatching(
        /^There is no Edah called "Red" in this schedule\. The Edot: Blue\./
      )
    ]);
  });

  // API-1.14, API-1.77: a special day's or event's own schedule, typed as its page types and
  // undone as its page's Undo.
  it("aSpecialCellIsTypedAndUndoneAsItsPage: full length through the page's own editor, its runs back held for that plan; a frame change ends it", async () => {
    const ITEM = "a0X000000000001AAA";
    const plan = {
      itemId: ITEM,
      name: "Color War",
      schedule: {
        days: [
          {
            dateValue: "2000-01-01",
            problem: null,
            blocks: [
              {
                id: "b1",
                name: "Opening",
                startTime: "09:00",
                endTime: "09:45"
              },
              { id: "b2", name: "Relays", startTime: "09:50", endTime: "11:20" }
            ],
            groups: [
              { id: "g1", name: "Blue" },
              { id: "g2", name: "Gold" }
            ],
            items: [],
            rows: [",", ","]
          }
        ]
      },
      activities: [{ id: "a1", name: "Swim", length: 2, notFor: [] }]
    };
    const opened = answer({ plan, setup: {}, labels: [] });
    const special = { season: "Summer 2026", special: "Color War" };
    const label = "Placed Swim · Blue · Color War · Opening";
    const sf = sfAnswering([
      opened,
      answer({
        message: `${label}.`,
        undo: { schedule: ITEM, kind: "edit", label, special: true }
      }),
      answer({ message: "Nothing has been done yet." }),
      answer({
        message: 'Done: add station "Purple" in "Color War". seen is now 5.',
        undo: {
          schedule: ITEM,
          kind: "none",
          label: "add station",
          special: true
        }
      }),
      answer({ message: "The page has no Undo." }, 400)
    ]);
    const done = await call(
      "change_special_schedule_cell",
      {
        ...special,
        column: "Blue",
        time: "Opening",
        was: "Open",
        activity: "swim"
      },
      sf
    );
    expect(done.text).toBe(`${label}.`);
    expect(sf.seen[0].args[3]).toBe(
      "/services/apexrest/v1/change_special_schedule_cell?season=Summer+2026&special=Color+War"
    );
    expect(sf.seen[1].body).toEqual({
      ...special,
      change: label,
      runs: [
        expect.objectContaining({
          groupId: "g1",
          firstBlockId: "b1",
          blockIds: ["b1", "b2"],
          before: ["", ""],
          after: ["A:a1", "^A:a1"]
        })
      ]
    });
    await call("undo_last_agent_change", special, sf);
    expect(sf.seen[2].body).toEqual({
      ...special,
      held: {
        [ITEM]: expect.objectContaining({
          kind: "edit",
          label,
          runs: [
            expect.objectContaining({
              before: ["A:a1", "^A:a1"],
              after: ["", ""]
            })
          ]
        })
      }
    });
    await call(
      "change_special_schedule_frame",
      { ...special, action: "add_station", name: "Purple", seen: "4" },
      sf
    );
    await call("undo_last_agent_change", special, sf);
    expect(sf.seen[4].body.held[ITEM]).toEqual(
      expect.objectContaining({ kind: "none", label: "add station" })
    );
  });

  it("aLockOnAWeekThisConversationHasntChangedKeepsNothing: Undo there still has nothing to undo", async () => {
    const OTHER = "a0S000000000002AAA";
    const label = "Placed Soccer · Bunk 1 · Monday · Period 2";
    const sf = sfAnswering([
      READ,
      answer({
        message: `${label}.`,
        undo: { ...undoOf("edit", label), schedule: OTHER }
      }),
      READ,
      answer({
        message: "Locked Bunk 1 · Monday.",
        undo: {
          schedule: SCHEDULE,
          kind: "lock",
          label: "Locked Bunk 1 · Monday",
          seen: "locked",
          action: "Lock",
          dateValue: "2026-06-29",
          groupId: inputs.groups[0].Id,
          blockId: null
        }
      }),
      answer({ message: "Nothing to undo." }, 400)
    ]);
    // Another week was changed in this conversation, so the Lock's week is read first.
    await call(
      "change_schedule_cell",
      {
        ...WEEK,
        day: "Monday",
        group: "Bunk 1",
        time: "Period 2",
        was: "Art",
        activity: "Soccer",
        seen: "before"
      },
      sf
    );
    await call(
      "lock_cells",
      { ...WEEK, day: "Monday", group: "Bunk 1", seen: "s" },
      sf
    );
    await call("undo_last_agent_change", WEEK, sf);
    expect(Object.keys(sf.seen[4].body.held)).toEqual([OTHER]);
  });

  it("aNewConversationHoldsNothing: and the command line says it can't undo", async () => {
    const sf = sfAnswering([answer({ message: "Nothing to undo." }, 400)]);
    await call("undo_last_agent_change", WEEK, sf);
    expect(sf.seen[0].body).toEqual({ ...WEEK, held: {} });

    let said = "";
    const asked = [];
    const code = await main(
      ["undo_last_agent_change", "--week", "Week 1"],
      {},
      { write: () => {} },
      { write: (text) => (said += text) },
      async (...args) => {
        asked.push(args[0]);
        return {
          ok: false,
          status: 400,
          text: "Nothing to undo: this conversation hasn't changed Week 1.",
          season: "Summer 2026"
        };
      }
    );
    expect(code).toBe(2);
    expect(asked).toEqual(["undo_last_agent_change"]);
    expect(said).toContain(NO_UNDO_HERE);
    expect(said).toContain("Season used: Summer 2026.");
  });
});
