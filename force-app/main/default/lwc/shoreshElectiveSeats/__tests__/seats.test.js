// The seats screen's working (electives slice E7; repo ADR 0018 choices 28 to 37): the engine's
// input from a run, what Assign seats sends, the two views, the counter and the problems.
import { assignSeats } from "c/shoreshElectiveEngine";
import { buildTerms } from "c/shoreshTerms";
import {
  assignRequest,
  buildBoard,
  choicesOf,
  engineInput,
  locksOf,
  moveTargets,
  needsLook,
  problemSections,
  rankAt,
  rankWords,
  readRun,
  timeLabel,
  timeOfChoice
} from "../seats";
import { MONDAY, TUESDAY, assignedView, runView, seat } from "./data/run";

const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Seats", singular: "Seats", plural: "Seats", isCustom: false }
]);

describe("reading a run", () => {
  it("gives each camper their bunk's times, and one with no bunk the first division's", () => {
    const run = readRun(
      runView({
        times: [
          ...runView().times,
          {
            ...runView().times[0],
            key: `${MONDAY}|b1|d2`,
            divisionId: "d2",
            divisionOrder: 2,
            groupIds: ["g3"]
          }
        ]
      })
    );
    const aspen = run.camperById.get("c1");
    const noBunk = run.camperById.get("c4");
    expect(run.timesOf(aspen).map((x) => x.key)).toEqual([
      `${MONDAY}|b1|d1`,
      `${TUESDAY}|b1|d1`
    ]);
    // No bunk: one time per day and block, never two at once.
    expect(run.timesOf(noBunk).map((x) => x.key)).toEqual([
      `${MONDAY}|b1|d1`,
      `${TUESDAY}|b1|d1`
    ]);
    expect(run.timeOf(aspen, MONDAY, "b9")).toBeNull();
  });

  it("names a time by its day and start", () => {
    expect(timeLabel(runView().times[1])).toBe("Tue 12:30");
    expect(timeLabel({ ...runView().times[1], startTime: null })).toBe(
      "Tue Period 1"
    );
  });
});

describe("choices", () => {
  it("matches a choice for a day and period to that time, by the period's name or number", () => {
    const run = readRun(runView());
    const camper = run.camperById.get("c1");
    expect(timeOfChoice(run, camper, { d: "Tuesday", p: "Period 1" })).toEqual({
      timeKey: `${TUESDAY}|b1|d1`
    });
    expect(timeOfChoice(run, camper, { d: "Tue", p: "1" })).toEqual({
      timeKey: `${TUESDAY}|b1|d1`
    });
    expect(timeOfChoice(run, camper, { d: "Monday", p: "12:30" })).toEqual({
      timeKey: `${MONDAY}|b1|d1`
    });
    // For the whole week: no day or period.
    expect(timeOfChoice(run, camper, {})).toEqual({ timeKey: null });
  });

  it("uses a choice for a time this schedule doesn't have for the whole week, and says so", () => {
    const run = readRun(runView());
    const camper = run.camperById.get("c1");
    expect(timeOfChoice(run, camper, { d: "Friday", p: "Period 9" })).toEqual({
      timeKey: null,
      unmatched: "No session at Friday Period 9 on this schedule."
    });
    expect(timeOfChoice(run, camper, { d: "Friday" })).toEqual({
      timeKey: null,
      unmatched: "Day or period missing: Friday (no period)."
    });
  });

  it("never makes choices in no order into ranks: each is one of their choices", () => {
    const run = readRun(runView());
    const { choices } = choicesOf(run);
    const bea = choices.filter((c) => c.camperId === "c4");
    expect(bea.map((c) => [c.key, c.rank, c.rankKind])).toEqual([
      ["a2", 1, "unordered-set"],
      ["a3", 1, "unordered-set"]
    ]);
    expect(rankWords(rankAt(choices, "c4", `${MONDAY}|b1|d1`, "a3"))).toBe(
      "One of their choices"
    );
    expect(rankWords(rankAt(choices, "c1", `${MONDAY}|b1|d1`, "a1"))).toBe("");
    expect(rankWords(rankAt(choices, "c1", `${MONDAY}|b1|d1`, "a2"))).toBe(
      "2nd"
    );
    expect(rankWords(rankAt(choices, "c1", `${MONDAY}|b1|d1`, "a3"))).toBe(
      "Not chosen"
    );
  });

  it("prefers a choice for the time itself over one for the week", () => {
    const choices = [
      {
        camperId: "c1",
        key: "a1",
        timeId: null,
        rank: 1,
        rankKind: "ordered-fallback"
      },
      {
        camperId: "c1",
        key: "a1",
        timeId: "T2",
        rank: 3,
        rankKind: "cell-choice"
      }
    ];
    expect(rankAt(choices, "c1", "T2", "a1").rank).toBe(3);
    expect(rankAt(choices, "c1", "T1", "a1").rank).toBe(1);
  });
});

describe("the engine's input, and what Assign seats sends", () => {
  it("offers each time its confirmed offerings, keyed by activity; a set with no linked choices sends none", () => {
    const { input } = engineInput(readRun(runView()), t);
    expect(input.campers.map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(input.times.map((x) => x.id)).toEqual([
      `${MONDAY}|b1|d1`,
      `${TUESDAY}|b1|d1`
    ]);
    const monday = input.offerings.filter(
      (o) => o.timeId === `${MONDAY}|b1|d1`
    );
    expect(monday.map((o) => [o.key, o.seats, o.noLimit, o.minimum])).toEqual([
      ["a1", 2, false, null],
      ["a2", null, true, null],
      ["a3", 10, false, 3]
    ]);
    expect(input.linkedChoices).toEqual([]);
    expect(input.linkedChoiceTimes).toEqual([]);
    expect(input.attendance.c4).toEqual([
      `${MONDAY}|b1|d1`,
      `${TUESDAY}|b1|d1`
    ]);
  });

  it("passes the locks that still fit, and keeps the others aside", () => {
    const run = readRun(
      assignedView({
        seats: [
          seat("x2", "c2", MONDAY, "o1", { locked: true }),
          // Ceramics is not confirmed: this lock no longer fits.
          seat("x9", "c3", TUESDAY, "o4", { locked: true }),
          // A time the schedule no longer has.
          seat("x8", "c1", "2027-07-09", "o2", { locked: true })
        ]
      })
    );
    const { locks, stray } = locksOf(run);
    expect(locks).toEqual([
      { camperId: "c2", timeId: `${MONDAY}|b1|d1`, activityId: "a1" }
    ]);
    expect(stray.map((s) => s.id)).toEqual(["x9", "x8"]);
  });

  it("never places a camper over a lock that no longer fits, so Assign is not refused", () => {
    const run = readRun(
      assignedView({
        // Ceramics is not confirmed, but c3 still takes Tuesday: the lock still holds it.
        seats: [seat("x9", "c3", TUESDAY, "o4", { locked: true })]
      })
    );
    const { input, stray } = engineInput(run, t);
    expect(stray.map((s) => s.id)).toEqual(["x9"]);
    expect(input.attendance.c3).toEqual([`${MONDAY}|b1|d1`]);
    const result = assignSeats(input);
    expect(result.ok).toBe(true);
    const request = assignRequest(run, result);
    // Nothing sent at the locked seat's camper, day and block (the server refuses a changed lock).
    expect(
      request.seats.filter((s) => s.camperId === "c3" && s.day === TUESDAY)
    ).toEqual([]);
    expect(
      request.seats.filter((s) => s.camperId === "c3" && s.day === MONDAY)
    ).toHaveLength(1);
  });

  it("sends the engine's seats except the locks, and what did not run", () => {
    const run = readRun(runView());
    const { input } = engineInput(run, t);
    const result = assignSeats(input);
    expect(result.ok).toBe(true);
    const request = assignRequest(run, result);
    expect(request.runId).toBe("r1");
    expect(request.revision).toBe(1);
    // Archery holds 2: three asked for it first each day.
    const archeryMonday = request.seats.filter(
      (s) => s.day === MONDAY && s.offeringId === "o1"
    );
    expect(archeryMonday).toHaveLength(2);
    expect(request.seats).toHaveLength(8);
    request.seats.forEach((s) => expect(s.blockId).toBe("b1"));
    // Pottery needs 3 and nobody is left for it: it did not run.
    expect(request.dropped).toEqual(
      expect.arrayContaining([expect.objectContaining({ a: "a3", m: 3 })])
    );
  });

  it("gives the same seats for the same run, whatever order its records came in", () => {
    const first = readRun(runView());
    const shuffled = readRun(
      runView({
        campers: [...runView().campers].reverse(),
        offerings: [...runView().offerings].reverse()
      })
    );
    const a = assignRequest(first, assignSeats(engineInput(first, t).input));
    const b = assignRequest(
      shuffled,
      assignSeats(engineInput(shuffled, t).input)
    );
    const key = (s) => `${s.camperId}|${s.day}|${s.offeringId}`;
    expect(b.seats.map(key).sort()).toEqual(a.seats.map(key).sort());
  });

  it("places an offering with blank or 0 seats as no limit, and says so", () => {
    const run = readRun(
      runView({
        offerings: runView().offerings.map((o) => ({
          ...o,
          seats: o.id === "o3" ? null : o.id === "o1" ? 0 : o.seats
        }))
      })
    );
    const result = assignSeats(engineInput(run, t).input);
    expect(result.ok).toBe(true);
    expect(
      result.findings
        .filter((f) => f.kind === "NO_SEATS_SET")
        .map((f) => f.message)
    ).toEqual([
      "Choose how many seats “Archery” has.",
      "Choose how many seats “Pottery” has."
    ]);
    const board = buildBoard(run, t);
    const section = problemSections(board, t).find((s) => s.key === "noSeats");
    expect(section.head).toBe("2 need their seats chosen");
    expect(section.rows.map((r) => [r.text, r.aside])).toEqual([
      ["Archery", 'Choose how many seats "Archery" has'],
      ["Pottery", 'Choose how many seats "Pottery" has']
    ]);
    expect(needsLook(board)).toBe(true);
  });

  it("places 260 campers at every time they take, within the seats", () => {
    const campers = [];
    for (let i = 1; i <= 260; i++) {
      campers.push({
        id: `c${String(i).padStart(3, "0")}`,
        name: `Synthetic Camper ${i}`,
        groupId: i % 2 ? "g1" : "g2",
        choices: JSON.stringify([
          { n: "Archery", a: "a1", r: 1, k: "ranked" },
          { n: "Pottery", a: "a3", r: 2, k: "ranked" }
        ])
      });
    }
    const run = readRun(runView({ campers }));
    const result = assignSeats(engineInput(run, t).input);
    const request = assignRequest(run, result);
    expect(request.seats).toHaveLength(520);
    ["o1", "o3"].forEach((o) => {
      [MONDAY, TUESDAY].forEach((day) => {
        const n = request.seats.filter(
          (s) => s.day === day && s.offeringId === o
        ).length;
        expect(n).toBeLessThanOrEqual(o === "o1" ? 2 : 10);
      });
    });
  });
});

describe("the board", () => {
  it("counts each offering at each time, with its dots and what is free", () => {
    const board = buildBoard(readRun(assignedView()), t);
    expect(board.columns.map((c) => c.label)).toEqual([
      "Mon 12:30",
      "Tue 12:30"
    ]);
    // Ceramics is only proposed: not on the board.
    expect(board.offeringRows.map((r) => r.name)).toEqual([
      "Archery",
      "Drama",
      "Pottery"
    ]);
    const archery = board.offeringRows[0];
    expect(archery.subs.map((s) => s.text)).toEqual(["2 seats"]);
    expect(archery.cells[0]).toMatchObject({ count: 2, of: "of 2", free: 0 });
    expect(archery.cells[0].dots.map((d) => d.className)).toEqual([
      "dot dot_on",
      "dot dot_on"
    ]);
    const drama = board.offeringRows[1];
    expect(drama.subs.map((s) => s.text)).toEqual(["No limit"]);
    expect(drama.cells[0]).toMatchObject({ count: 2, of: "", free: null });
    const pottery = board.offeringRows[2];
    expect(pottery.subs.map((s) => s.text)).toEqual(["10 seats", "at least 3"]);
    // One camper where three are needed, kept (they are there): marked.
    expect(pottery.cells[1]).toMatchObject({ count: 1, look: true });
  });

  it("shows what did not run as Dropped, with what it had", () => {
    const board = buildBoard(
      readRun(
        assignedView({
          dropped: JSON.stringify([
            { t: `${MONDAY}|b1|d1`, a: "a3", h: 2, m: 3 }
          ])
        })
      ),
      t
    );
    const cell = board.offeringRows[2].cells[0];
    expect(cell).toMatchObject({ dropped: { had: 2, needed: 3 }, look: true });
    expect(board.problems.dropped).toHaveLength(1);
  });

  it("counts who is placed, and lists every problem in the counter's words", () => {
    const board = buildBoard(readRun(assignedView()), t);
    expect(board.counter).toEqual({ placed: 3, total: 4 });
    expect(needsLook(board)).toBe(true);
    const sections = problemSections(board, t);
    expect(sections.map((s) => s.head)).toEqual([
      "1 couldn't be placed",
      "1 kept below minimum",
      "3 not their first choice",
      "Also"
    ]);
    expect(sections[0].rows[0]).toMatchObject({
      text: "Bea Stonebridge",
      aside: "Tue 12:30",
      target: { view: "camper", camperId: "c4" }
    });
    // Ari's Pottery (2nd), Bea's Drama (in no order), Eli's Drama (not one he chose).
    expect(sections[2].rows.map((r) => [r.text, r.aside])).toEqual([
      ["Second choice", "1"],
      ["One of their choices", "1"],
      ["Not one they chose", "1"]
    ]);
    expect(sections[3].rows.map((r) => r.text)).toEqual([
      "No Bunk on the sheet"
    ]);
  });

  it("lists campers by bunk, then those with no bunk, with how each seat ranked", () => {
    const board = buildBoard(readRun(assignedView()), t);
    expect(board.camperSections.map((s) => [s.name, s.count])).toEqual([
      ["Aspen", 2],
      ["Willow", 1],
      ["No Bunk", 1]
    ]);
    const ari = board.camperSections[0].rows[0];
    expect(ari.camper.name).toBe("Ari Brookfield");
    expect(ari.cells.map((c) => [c.name, c.words, c.locked])).toEqual([
      ["Archery", "", true],
      ["Pottery", "2nd", false]
    ]);
    const bea = board.camperSections[2].rows[0];
    expect(bea.cells[1]).toMatchObject({ unplaced: true });
  });

  it("says when a hand move put an offering over its seats", () => {
    const view = assignedView();
    view.seats.push(
      seat("x10", "c4", TUESDAY, "o1", { locked: true, byHand: true })
    );
    const board = buildBoard(readRun(view), t);
    expect(board.problems.overSeats).toEqual([
      expect.objectContaining({ count: 3, seats: 2 })
    ]);
    expect(problemSections(board, t).map((s) => s.head)).toContain(
      "1 over seats"
    );
  });

  it("offers the other offerings of a time to move to", () => {
    const run = readRun(runView());
    expect(moveTargets(run, run.times[0], "o1")).toEqual([
      { value: "o2", label: "Drama" },
      { value: "o3", label: "Pottery" }
    ]);
  });
});
