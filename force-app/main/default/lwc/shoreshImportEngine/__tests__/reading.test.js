import {
  buildProposal,
  foundLists,
  importNotes,
  questionCards
} from "./data/engine";
import {
  cellName,
  dayOf,
  divisionInTitle,
  timeRange,
  withoutTimes,
  listedNames
} from "../text";
import { parseCsv, sheetToPages, distinctName, sharedPrefix } from "../sheets";
import { csv, samples, terms, findSamplesFrom } from "./data/samples";

findSamplesFrom(__dirname);

const at = (h, m = 0) => h * 60 + m;

describe("reading a cell", () => {
  it("reads times the way a day camp writes them", () => {
    expect(timeRange("9:00-9:45")).toMatchObject({
      start: at(9),
      end: at(9, 45)
    });
    expect(timeRange("Period 1 (9:00 - 9:45)")).toMatchObject({
      start: at(9),
      end: at(9, 45)
    });
    // A bare 1 to 6 is the afternoon; 7 to 11 the morning; 12 noon (desktop's camp-day rule).
    expect(timeRange("1:10 - 1:55")).toMatchObject({
      start: at(13, 10),
      end: at(13, 55)
    });
    expect(timeRange("11:30 - 12:15")).toMatchObject({
      start: at(11, 30),
      end: at(12, 15)
    });
    expect(timeRange("12:20 - 1:05")).toMatchObject({
      start: at(12, 20),
      end: at(13, 5)
    });
    expect(timeRange("1:30 - 2:15 PM")).toMatchObject({
      start: at(13, 30),
      end: at(14, 15)
    });
    expect(timeRange("11:30 - 12:15 PM")).toMatchObject({
      start: at(11, 30),
      end: at(12, 15)
    });
    expect(timeRange("14:00")).toMatchObject({ start: at(14), end: null });
    expect(timeRange("Period 2")).toBeNull();
    // A bare hour that starts a range (review finding 1).
    expect(timeRange("9 - 9:45am")).toMatchObject({
      start: at(9),
      end: at(9, 45)
    });
    expect(timeRange("9-10am")).toMatchObject({ start: at(9), end: at(10) });
    expect(timeRange("1-2pm")).toMatchObject({ start: at(13), end: at(14) });
    expect(timeRange("12-12:45")).toMatchObject({
      start: at(12),
      end: at(12, 45)
    });
    expect(timeRange("Period 1 - 2")).toBeNull();
  });

  it("takes times out of names", () => {
    expect(withoutTimes("Period 1 (9:00-9:45)")).toBe("Period 1");
    expect(withoutTimes("Lunch 11:30 - 12:15")).toBe("Lunch");
    expect(withoutTimes("9:00 to 9:45")).toBe("");
    expect(withoutTimes("Period 1 9-10am")).toBe("Period 1");
  });

  it("reads a name and its place, and skips what names nothing", () => {
    // A bracket's place is kept only where two activities are there (INGEST-2.21, reading.js).
    expect(cellName("Swim (Pool)")).toMatchObject({
      name: "Swim",
      place: "Pool",
      bracket: true
    });
    expect(cellName("Art @ Art room")).toMatchObject({
      name: "Art",
      place: "Art room",
      bracket: false
    });
    expect(cellName("Lunch 12:00")).toMatchObject({
      name: "Lunch",
      place: null
    });
    expect(cellName("")).toBeNull();
    expect(cellName("-")).toBeNull();
    expect(cellName("Change")).toBeNull();
    expect(cellName("12")).toBeNull();
  });

  it("knows days written in full or short", () => {
    expect(dayOf("MONDAY")).toBe("Monday");
    expect(dayOf("Tues")).toBe("Tuesday");
    expect(dayOf("Weds.")).toBe("Wednesday");
    expect(dayOf("Swim")).toBeNull();
    expect(dayOf("S")).toBeNull();
  });

  it("finds a division in a group's name only where the file says so", () => {
    expect(divisionInTitle("Juniors - Bunk 1")).toEqual({
      division: "Juniors",
      group: "Bunk 1"
    });
    expect(divisionInTitle("Yeladim 3")).toEqual({
      division: "Yeladim",
      group: "Yeladim 3"
    });
    expect(divisionInTitle("Bunk 3")).toEqual({
      division: null,
      group: "Bunk 3"
    });
    expect(divisionInTitle("2-3A")).toEqual({ division: null, group: "2-3A" });
  });

  it("lists the groups in a by-activity cell", () => {
    expect(listedNames("Bunk 1, Bunk 2")).toEqual(["Bunk 1", "Bunk 2"]);
    expect(listedNames("Bunk 1 & Bunk 2 / Bunk 3")).toEqual([
      "Bunk 1",
      "Bunk 2",
      "Bunk 3"
    ]);
  });
});

describe("INGEST-2.25: a cell timed line by line", () => {
  it("INGEST-2.25: a swim period's lines read as its activities, without the change and the times", () => {
    expect(
      cellName(
        "9:30-9:40 Change\n9:40-10:10- Swim Lessons\n10:10-10:40- Open Swim\n10:40- 10:55 Change"
      ).name
    ).toBe("Swim Lessons - Open Swim");
    expect(
      cellName("11:40-12:00 Change\n12:00-12:30 Open Swim\n12:30-12:55 Change")
        .name
    ).toBe("Open Swim");
    expect(
      cellName("1:00-1:20- Change\n1:20-1:50 Open Swim\n1:50-2:15- Change").name
    ).toBe("Open Swim");
  });

  it("INGEST-2.25: counter-case: Change joined to a word, with a time or not, is part of the name", () => {
    expect(cellName("Change/Gear Up").name).toBe("Change/Gear Up");
    expect(cellName("Change Time/Water Break").name).toBe(
      "Change Time/Water Break"
    );
    expect(cellName("Puppet Show 2:15-2:45").name).toBe("Puppet Show");
    expect(cellName("Change/Gear Up 10:00").name).toBe("Change/Gear Up");
    expect(cellName("Change Time/Water Break 2:00-2:15").name).toBe(
      "Change Time/Water Break"
    );
    expect(cellName("Change of Pace 2:00").name).toBe("Change of Pace");
    expect(cellName("Arts - Crafts 9:00").name).toBe("Arts - Crafts");
    expect(cellName("Change Over 9:00")).toBeNull();
  });
});

// INGEST-2.27: cells written "Activity" over "Room". Made-up camp only.
describe("INGEST-2.27: a file that writes each cell's room on its second line", () => {
  const GROUPS = ["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4"];
  const TIMES = ["9:00-9:45", "10:00-10:45", "11:00-11:45", "1:00-1:45"];
  const ACTS = ["Art", "Drama", "Music", "Science"];
  // Each activity's own room; Art and Music share 101.
  const ROOM_OF = {
    Art: "101",
    Drama: "Gym",
    Music: "101",
    Science: "Studio"
  };
  const ROOMS = ["101", "Gym", "Studio"];
  const DAYS = ["Monday", "Tuesday", "Wednesday"];
  const sheetFile = (cell, { groups = GROUPS, days = DAYS } = {}) => ({
    name: "Rooms camp.xlsx",
    sheets: days.map((day, d) => ({
      name: day,
      rows: [
        ["Time", ...groups],
        ...TIMES.map((t, b) => [t, ...GROUPS.map((_, g) => cell(g, b, d))])
      ]
    }))
  });
  const roomed = (g, b, d) => {
    const act = ACTS[(g + b + d) % 4];
    return `${act}\n${ROOM_OF[act]}`;
  };
  const propose = (file, answers = {}) =>
    buildProposal({ files: [file], existing: null, terms, answers });

  const ADD_ALL = Object.fromEntries(ROOMS.map((r) => [`place|${r}`, "add"]));

  it("INGEST-2.27 INGEST-2.33: the second line is asked about as a place, unticked, and the name stays the activity", () => {
    const p = propose(sheetFile(roomed));
    expect(p.activities.map((a) => a.name).sort()).toEqual(ACTS);
    expect(p.offeredPlaces.map((x) => [x.name, x.ticked])).toEqual(
      ROOMS.map((r) => [r, false])
    );
    expect(p.locations).toEqual([]);
    expect(p.activities.every((a) => a.locationKey === null)).toBe(true);
  });

  it("INGEST-2.33: the review names an activity's room only once it comes in", () => {
    const detail = (p) =>
      foundLists(p, terms)
        .find((l) => l.key === "activities")
        .items.find((i) => i.name === "Drama").detail;
    expect(detail(propose(sheetFile(roomed)))).not.toContain("Gym");
    expect(detail(propose(sheetFile(roomed), ADD_ALL))).toContain("Gym");
  });

  it("INGEST-2.33: ticked, the rooms come in and each activity is at its room", () => {
    const p = propose(sheetFile(roomed), ADD_ALL);
    expect(p.locations.map((l) => l.name)).toEqual(ROOMS);
    expect(p.activities.find((a) => a.name === "Drama").locationKey).toBe(
      "L|Gym"
    );
  });

  it("INGEST-2.27: empty cells and a sheet with nothing on it change nothing", () => {
    const file = sheetFile(roomed);
    file.sheets[0].rows[1].push(null, undefined);
    file.sheets.push({ name: "Notes" });
    const p = propose(file);
    expect(p.offeredPlaces.map((x) => x.name)).toEqual(ROOMS);
  });

  it("INGEST-2.33: a room not ticked stays out", () => {
    const p = propose(sheetFile(roomed), {
      "place|101": "add",
      "place|Studio": "add",
      "place|Gym": "leave"
    });
    expect(p.offeredPlaces.find((x) => x.name === "Gym").ticked).toBe(false);
    expect(p.locations.map((l) => l.name)).toEqual(["101", "Studio"]);
    expect(p.activities.find((a) => a.name === "Drama").locationKey).toBe(null);
  });

  it("INGEST-2.27: counter-case: two activities in a cell are no activity and room", () => {
    const pair = (g, b, d) =>
      `${ACTS[(g + b + d) % 4]}\n${ACTS[(g + b + d + 1) % 4]}`;
    const p = propose(sheetFile(pair));
    expect(p.offeredPlaces).toEqual([]);
    expect(p.activities.map((a) => a.name)).toContain("Art Drama");
  });

  it("INGEST-2.27: counter-case: a second line under every activity is no room", () => {
    const under = (g, b, d) =>
      `${ACTS[(g + b + d) % 4]}\n${["Rest", "Snack"][(g + d) % 2]}`;
    const p = propose(sheetFile(under));
    expect(p.offeredPlaces).toEqual([]);
    expect(p.activities.map((a) => a.name)).toContain("Art Rest");
  });

  it("INGEST-2.27: counter-case: a heading on two lines stays the group's name", () => {
    const groups = GROUPS.map((g) => `${g}\nJuniors`);
    const p = propose(sheetFile(roomed, { groups }));
    expect(p.groups.map((g) => g.name).join(" ")).not.toContain("@");
    expect(p.offeredPlaces.map((x) => x.name)).toEqual(ROOMS);
  });

  it("INGEST-2.27: counter-case: rooms that each hold one activity, or under a fifth of the cells, are no rooms", () => {
    const own = (g, b, d) => {
      const act = ACTS[(g + b + d) % 4];
      return `${act}\nRoom ${act}`;
    };
    expect(propose(sheetFile(own)).offeredPlaces).toEqual([]);
    // Five days of 16 cells: 15 two-line cells are under a fifth, 20 are not.
    const days = [...DAYS, "Thursday", "Friday"];
    const some = (rows) => (g, b, d) => {
      return g === 0 && b < rows ? roomed(g, b, d) : ACTS[(g + b + d) % 4];
    };
    expect(propose(sheetFile(some(3), { days })).offeredPlaces).toEqual([]);
    expect(
      propose(sheetFile(some(4), { days })).offeredPlaces.length
    ).toBeGreaterThan(0);
  });

  it("INGEST-2.27: an activity named for its room leaves the room a room, a slip over it too", () => {
    // Drama is played in the Gym and also written "Gym" over "Gym"; one cell slips: "Gyms" / "Gym".
    const slip = (g, b, d) => {
      if (g === 0 && b === 0 && d === 0) return "Gyms\nGym";
      if (g === 1 && b === 3) return "Gym\nGym";
      return roomed(g, b, d);
    };
    const p = propose(sheetFile(slip));
    // Bunk 2's Gym every day in one block is a set time.
    const names = [...p.activities, ...p.recurring].map((a) => a.name);
    expect(names).not.toContain("Gyms Gym");
    expect(names).not.toContain("Drama Gym");
    expect(names).toEqual(expect.arrayContaining(["Gym", "Gyms"]));
    expect(p.offeredPlaces.map((x) => x.name)).toContain("Gym");
    expect(
      questionCards(p, terms, {}).some(
        (c) => c.id.startsWith("similar|activity|") && /Gyms/.test(c.id)
      )
    ).toBe(true);
  });

  it("INGEST-2.27: counter-case: a few two-line cells keep both lines in the name, with no place", () => {
    const few = (g, b, d) => {
      return g === 0 && b === 0 ? `Art\n${ROOMS[d]}` : ACTS[(g + b + d) % 4];
    };
    const p = propose(sheetFile(few));
    expect(p.offeredPlaces).toEqual([]);
    expect(p.activities.map((a) => a.name)).toEqual(
      expect.arrayContaining(["Art 101"])
    );
  });
});

// INGEST-2.33: an activity written at two places. Made-up camp only.
describe("INGEST-2.33: an activity written at two places is asked its usual one", () => {
  const ROOMS = { Art: "101", Drama: "Gym", Music: "Hall", Science: "Studio" };
  const ACTS = Object.keys(ROOMS);
  // Drama in the Studio on Monday, the Gym after; every other activity in its own room.
  const file = {
    name: "Rooms camp.xlsx",
    sheets: ["Monday", "Tuesday", "Wednesday"].map((day, d) => ({
      name: day,
      rows: [
        ["Time", "Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4"],
        ...["9:00-9:45", "10:00-10:45", "11:00-11:45", "1:00-1:45"].map(
          (time, b) => [
            time,
            ...[0, 1, 2, 3].map((g) => {
              const act = ACTS[(g + b + d) % 4];
              const room = act === "Drama" && d === 0 ? "Studio" : ROOMS[act];
              return `${act}\n${room}`;
            })
          ]
        )
      ]
    }))
  };
  const ADD = { "place|Gym": "add", "place|Studio": "add" };
  const propose = (answers) =>
    buildProposal({ files: [file], existing: null, terms, answers });
  const drama = (p) => p.activities.find((a) => a.name === "Drama");
  const card = (p, answers) =>
    questionCards(p, terms, answers).find((c) => c.id === "usualPlace|Drama");

  it("INGEST-2.33: both rooms ticked, it is asked which is usual, none until picked", () => {
    const p = propose(ADD);
    expect(card(p, ADD)).toMatchObject({
      title: "Where is “Drama” usually?",
      answer: "none"
    });
    expect(
      card(p, ADD)
        .options.map((o) => o.value)
        .sort()
    ).toEqual(["Gym", "Studio", "none"]);
    expect(drama(p).locationKey).toBe(null);
  });

  it("INGEST-2.33: the room picked is its place", () => {
    const answers = { ...ADD, "usualPlace|Drama": "Gym" };
    const p = propose(answers);
    expect(drama(p)).toMatchObject({ place: "Gym", locationKey: "L|Gym" });
    expect(card(p, answers).answer).toBe("Gym");
  });

  it("INGEST-2.33: counter-case: no room ticked asks nothing, and the name keeps no room", () => {
    const p = propose({});
    expect(card(p, {})).toBeUndefined();
    expect(drama(p).locationKey).toBe(null);
    expect(p.activities.map((a) => a.name).sort()).toEqual(ACTS.sort());
  });

  it("INGEST-2.33: one room ticked is still asked, none until picked", () => {
    const answers = { "place|Gym": "add" };
    const p = propose(answers);
    expect(card(p, answers).options.map((o) => o.value)).toEqual([
      "Gym",
      "none"
    ]);
    expect(drama(p).locationKey).toBe(null);
  });

  it("INGEST-2.33: a room picked, then unticked, is none again and blocks nothing", () => {
    const answers = { "place|Studio": "add", "usualPlace|Drama": "Gym" };
    const p = propose(answers);
    expect(card(p, answers).answer).toBe("none");
    expect(drama(p).locationKey).toBe(null);
  });

  it("INGEST-2.33: “@” places are asked the same way", () => {
    const atPlaces = csv("Week.csv", [
      ["Time", "Monday", "Tuesday", "Wednesday"],
      ["9:00-9:45", "Archery @ Field", "Archery @ Barn", "Archery @ Field"],
      ["10:00-10:45", "Canoe @ Lake", "Canoe @ Lake", "Canoe @ Lake"]
    ]);
    const answers = { "place|Field": "add", "place|Barn": "add" };
    const p = buildProposal({
      files: [atPlaces],
      existing: null,
      terms,
      answers
    });
    const cards = questionCards(p, terms, answers);
    expect(cards.find((c) => c.id === "usualPlace|Archery")).toMatchObject({
      answer: "none"
    });
    expect(p.offeredPlaces.find((x) => x.name === "Lake").ticked).toBe(false);
  });
});

describe("INGEST-2.33: the same set time in two programs is asked in each", () => {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"];
  const program = (name, groups, times, lunchAt) => ({
    name,
    sheets: DAYS.map((day, d) => ({
      name: day,
      rows: [
        ["Time", ...groups],
        [times[0], ...groups.map((_, i) => ["Swim", "Art"][(i + d) % 2])],
        [times[1], ...groups.map(() => `Lunch @ ${lunchAt[d % 2]}`)],
        [times[2], ...groups.map((_, i) => ["Art", "Swim"][(i + d) % 2])]
      ]
    }))
  });
  const files = [
    program(
      "Juniors.xlsx",
      ["Bunk 1", "Bunk 2"],
      ["9:00-9:45", "12:00-12:45", "1:00-1:45"],
      ["Dining", "Pavilion"]
    ),
    program(
      "Seniors.xlsx",
      ["Senior 1", "Senior 2"],
      ["8:15-9:05", "11:20-12:10", "2:30-3:20"],
      ["Lodge", "Field"]
    )
  ];
  const ADD = Object.fromEntries(
    ["Dining", "Pavilion", "Lodge", "Field"].map((x) => [`place|${x}`, "add"])
  );
  const lunches = (p) =>
    [...p.fixed, ...p.recurring].filter((r) => r.name === "Lunch");

  it("INGEST-2.33: each program's Lunch has its own question and its own answer", () => {
    const asks = buildProposal({
      files,
      existing: null,
      terms,
      answers: ADD
    }).asks.filter((a) => a.type === "usualPlace");
    expect(asks.map((a) => a.options.slice().sort())).toEqual(
      expect.arrayContaining([
        ["Dining", "Pavilion"],
        ["Field", "Lodge"]
      ])
    );
    expect(new Set(asks.map((a) => a.id)).size).toBe(2);
    const juniors = asks.find((a) => a.options.includes("Dining"));
    const answers = { ...ADD, [juniors.id]: "Dining" };
    const p = buildProposal({ files, existing: null, terms, answers });
    expect(
      lunches(p)
        .map((r) => r.place)
        .sort()
    ).toEqual(["Dining", null]);
    expect(
      questionCards(p, terms, answers).find((c) => c.id === juniors.id).answer
    ).toBe("Dining");
  });
});

// INGEST-2.28: a cell over two blocks written one line per block. Made-up camp only.
describe("INGEST-2.28: a cell over blocks, a line for each", () => {
  const sheet = (cell, other = "Swim") => ({
    name: "Monday",
    rows: [
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", cell, "Art"],
      ["10:00-10:45", "", "Music"],
      ["11:00-11:45", "Swim", other]
    ],
    merges: [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }]
  });
  const bunk1 = (page) => page.rows.map((row) => [row.cells[0], row.spans[0]]);

  it("INGEST-2.28: each block gets its own line when each is an activity of the file", () => {
    const [page] = sheetToPages(sheet("Art / Swim\nMusic"));
    expect(bunk1(page)).toEqual([
      ["Art / Swim", 1],
      ["Music", 1],
      ["Swim", 1]
    ]);
    expect(page.oneName).toEqual([]);
  });

  it("INGEST-2.28: more lines than blocks stay one name over both, and the review says so once", () => {
    const [page] = sheetToPages(sheet("Art\nMusic\nSwim"));
    expect(bunk1(page)[0]).toEqual(["Art Music Swim", 2]);
    expect(page.oneName).toEqual([{ text: "Art Music Swim", blocks: 2 }]);
    const days = ["Monday", "Tuesday"].map((name) => ({
      ...sheet("Art\nMusic\nSwim"),
      name
    }));
    const p = buildProposal({
      files: [{ name: "Week.xlsx", sheets: days }],
      existing: null,
      terms,
      answers: {}
    });
    const said = importNotes(p, terms)
      .map((n) => n.text)
      .filter((text) => text.includes("without a line for each"));
    expect(said).toEqual([
      "Week.xlsx: “Art Music Swim” is over 2 time blocks without a line for each, so it is one activity over both."
    ]);
  });

  it("INGEST-2.28: counter-case: a name wrapped over two lines stays one name, with no note", () => {
    const [page] = sheetToPages(sheet("Outdoor\nAdventure"));
    expect(bunk1(page)[0]).toEqual(["Outdoor Adventure", 2]);
    expect(page.oneName).toEqual([]);
  });

  it("INGEST-2.28: counter-case: the same words on one line elsewhere keep the cell one name", () => {
    const [page] = sheetToPages(sheet("Art\nMusic", "Art Music"));
    expect(bunk1(page)[0]).toEqual(["Art Music", 2]);
  });

  it("INGEST-2.28: counter-case: on another sheet of the file too, and a wrapped name over three blocks has no note", () => {
    const monday = sheet("Art\nMusic");
    const tuesday = { ...sheet("Swim", "Art Music"), name: "Tuesday" };
    const p = buildProposal({
      files: [{ name: "Week.xlsx", sheets: [monday, tuesday] }],
      existing: null,
      terms,
      answers: {}
    });
    expect(p.activities.map((a) => a.name)).toContain("Art Music");
    const [page] = sheetToPages({
      ...sheet("Outdoor\nAdventure"),
      merges: [{ s: { r: 1, c: 1 }, e: { r: 3, c: 1 } }]
    });
    expect(page.oneName).toEqual([]);
  });

  it("INGEST-2.28: counter-case: the same words broken two ways are not split", () => {
    const twice = sheet("Art\nMusic Swim");
    twice.rows[3][2] = "Art Music\nSwim";
    const [page] = sheetToPages(twice);
    expect(bunk1(page)[0]).toEqual(["Art Music Swim", 2]);
  });

  it("INGEST-2.28: counter-case: a two-line cell in one block keeps both lines in its name", () => {
    const [page] = sheetToPages({
      ...sheet("Art\nMusic"),
      merges: []
    });
    expect(bunk1(page)[0]).toEqual(["Art Music", 1]);
  });
});

// INGEST-2.29: times written in cells. Made-up camp only.
describe("INGEST-2.29: a cell with its own times", () => {
  const day = (name, monday, notes = "") =>
    csv(`${name}.csv`, [
      ["Time", "Bunk 1", "Bunk 2", "Notes"],
      ["9:00-9:45", monday, "Art", notes],
      ["10:00-10:45", "Music", "Drama", ""],
      ["11:00-11:45", "Swim", "Swim", ""]
    ]);
  const notesOf = (files) =>
    importNotes(
      buildProposal({ files, existing: null, terms, answers: {} }),
      terms
    ).map((n) => n.text);
  const timed = (notes) =>
    notes.filter((text) => text.startsWith("Times written in cells"));

  it("INGEST-2.29: the review says which cells had times their block doesn't hold", () => {
    const notes = notesOf([
      day("Monday", "Story Time 9:30-10:15"),
      day("Tuesday", "Hiking 8:45-9:30"),
      day("Wednesday", "Pottery 9:10-10:00"),
      day("Thursday", "Gaga 9:00-10:00")
    ]);
    expect(timed(notes)).toEqual([
      "Times written in cells are not kept; each is in its row's time block: “Story Time 9:30-10:15”, “Gaga 9:00-10:00”, “Hiking 8:45-9:30” and 1 more."
    ]);
  });

  it("INGEST-2.29: a cell with more than two times is named by what it is read as", () => {
    const notes = notesOf([
      day("Monday", "9.00-9.10 Change 9.10-9.50 Swim 9.50-10.00 Change"),
      day("Tuesday", "Art")
    ]);
    expect(timed(notes)).toEqual([
      "Times written in cells are not kept; each is in its row's time block: “Swim”."
    ]);
  });

  it("INGEST-2.29: a name repeated into the next block is judged over both blocks", () => {
    const twoRows = (name, first, second) =>
      csv(`${name}.csv`, [
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", first, "Art"],
        ["10:00-10:45", second, "Drama"],
        ["11:00-11:45", "Swim", "Swim"]
      ]);
    const notes = notesOf([
      twoRows("Monday", "Hike", "Hike 10:15-11:30"),
      twoRows("Tuesday", "Hike 9:00-10:45", "Hike 9:00-10:45")
    ]);
    expect(timed(notes)).toEqual([
      "Times written in cells are not kept; each is in its row's time block: “Hike 10:15-11:30”."
    ]);
  });

  it("INGEST-2.29: counter-case: times inside the row's block, in a column not read, or none, have no note", () => {
    const notes = notesOf([
      day("Monday", "Story Time 9:15-9:40", "Bus leaves 9:30"),
      day("Tuesday", "Lunch 9:00-9:45")
    ]);
    expect(timed(notes)).toEqual([]);
    expect(
      timed(notesOf([day("Monday", "Puppet Show"), day("Tuesday", "Art")]))
    ).toEqual([]);
  });
});

describe("reading a file", () => {
  it("reads comma-separated files, quotes and all", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"]
    ]);
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });

  it("splits a sheet holding one day under another, with times beside the names", () => {
    const pages = sheetToPages({
      name: "Week",
      rows: [
        ["Monday"],
        ["Period", "Time", "Bunk 1", "Bunk 2"],
        ["Period 1", "9:00-9:45", "Swim", "Art"],
        ["Lunch", "12:00-12:45", "Lunch", "Lunch"],
        [],
        ["Tuesday"],
        ["Period", "Time", "Bunk 1", "Bunk 2"],
        ["Period 1", "9:00-9:45", "Art", "Swim"]
      ]
    });
    expect(pages.map((p) => p.title)).toEqual(["Monday", "Tuesday"]);
    expect(pages[0].columns).toEqual(["Bunk 1", "Bunk 2"]);
    expect(pages[0].rows.map((r) => r.label)).toEqual([
      "Period 1 9:00-9:45",
      "Lunch 12:00-12:45"
    ]);
  });

  it("reads divisions written over the group columns, and merged cells as blocks spanned", () => {
    const [page] = sheetToPages({
      name: "Monday",
      rows: [
        ["", "Juniors", "", "Seniors"],
        ["Time", "Bunk 1", "Bunk 2", "Bunk 3"],
        ["9:00-9:45", "Boating", "Art", "Swim"],
        ["9:50-10:35", "", "Swim", "Art"]
      ],
      merges: [{ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }]
    });
    expect(page.divisions).toEqual(["Juniors", "Juniors", "Seniors"]);
    expect(page.rows[0].spans).toEqual([2, 1, 1]);
  });

  it("names a group after its file, keeping a short code readable", () => {
    const names = ["Camp 2026 - Bunk 1.csv", "Camp 2026 - Bunk 2.csv"];
    expect(distinctName(names[0], sharedPrefix(names))).toBe("Bunk 1");
    expect(
      distinctName(
        "camp-bunk-1.csv",
        sharedPrefix(["camp-bunk-1.csv", "camp-bunk-2.csv"])
      )
    ).toBe("bunk 1");
    expect(
      distinctName(
        "Camp - Juniors - Bunk 1.csv",
        sharedPrefix([
          "Camp - Juniors - Bunk 1.csv",
          "Camp - Seniors - Bunk 3.csv"
        ])
      )
    ).toBe("Juniors - Bunk 1");
    expect(distinctName("Rainbows.xlsx", sharedPrefix(["Rainbows.xlsx"]))).toBe(
      "Rainbows"
    );
  });
});

describe("the three layouts", () => {
  const read = (files) =>
    buildProposal({ files, existing: null, terms, answers: {} });

  it.each([
    ["all-camp", "allCamp", 5],
    ["Bunk", "byGroup", 6],
    ["by-activity", "byActivity", 5]
  ])("recognises the %s sample as %s", (filter, layout, pages) => {
    const proposal = read(samples(filter));
    expect(proposal.reading.pages).toHaveLength(pages);
    expect(
      proposal.reading.pages.every((p) => p.layout === layout && p.confident)
    ).toBe(true);
  });

  it.each(["all-camp", "Bunk", "by-activity"])(
    "reads the same week from the %s sample",
    (filter) => {
      const proposal = read(samples(filter));
      expect(proposal.groups.map((g) => g.name)).toEqual([
        "Bunk 1",
        "Bunk 2",
        "Bunk 3",
        "Bunk 4",
        "Bunk 5",
        "Bunk 6"
      ]);
      expect(proposal.timetables[0].blocks.map((b) => b.name)).toEqual([
        "Period 1",
        "Period 2",
        "Period 3",
        "Lunch",
        "Period 4",
        "Period 5",
        "Period 6"
      ]);
      expect(proposal.fixed.map((f) => f.name)).toEqual(["Lunch"]);
      // Library time is all of Juniors once, in a one-week file: recurring where the file shows
      // the divisions (all camp, rule 7, Greg 2026-10-27); half the bunks once, with no
      // divisions shown, is an activity. Never asked.
      expect(proposal.recurring.map((r) => r.name)).toEqual(
        filter === "all-camp"
          ? ["Library time", "Morning meeting"]
          : ["Morning meeting"]
      );
      expect(proposal.asks.filter((a) => a.type === "kind")).toEqual([]);
      expect(proposal.noted.map((n) => [n.name, n.kind])).toEqual([
        ["Field day", "D"],
        ["Zoo trip", "T"]
      ]);
      expect(proposal.electives.sets.map((s) => s.name)).toEqual(["Chugim"]);
      const boating = proposal.activities.find((a) => a.name === "Boating");
      expect(boating.length).toBe(2);
    }
  );

  it("only the all-camp file says which bunks are Juniors and Seniors", () => {
    expect(read(samples("all-camp")).groups.map((g) => g.division)).toEqual([
      "Juniors",
      "Juniors",
      "Juniors",
      "Seniors",
      "Seniors",
      "Seniors"
    ]);
    expect(
      new Set(read(samples("Bunk")).groups.map((g) => g.division))
    ).toEqual(new Set([null])); // DIV-1.1: no division, never "Main"
  });

  it("the layout can be changed by the director, and is then read that way", () => {
    const files = samples("all-camp");
    const first = read(files);
    const layouts = Object.fromEntries(
      first.reading.pages.map((p) => [p.key, "byActivity"])
    );
    const changed = buildProposal({
      files,
      existing: null,
      terms,
      answers: {},
      layouts
    });
    expect(changed.reading.pages.every((p) => p.layout === "byActivity")).toBe(
      true
    );
    expect(changed.groups.map((g) => g.name)).toContain("Swim");
  });

  // INGEST-2.6
  describe("rule 6: telling a by-activity page from an all-camp page without numbers", () => {
    const layoutOf = (rows) => read([csv("Monday.csv", rows)]).reading.pages[0];

    it("every block naming each animal group once is a by-activity page", () => {
      const page = layoutOf([
        ["Time", "Archery", "Canoeing", "Drama", "Gaga", "Lunch"],
        ["9:00-9:45", "Otters", "", "Wolves", "Little Herons", ""],
        ["10:00-10:45", "", "Little Herons", "Otters", "Wolves", ""],
        ["11:00-11:45", "Wolves", "Otters", "", "Little Herons", ""],
        ["12:00-12:45", "", "", "", "", "Otters; Wolves; Little Herons"]
      ]);
      expect(page).toMatchObject({ layout: "byActivity", confident: true });
    });

    it("counter-case: animal groups across, everyone at Lunch, is an all-camp page", () => {
      const page = layoutOf([
        ["Time", "Otters", "Wolves", "Little Herons"],
        ["9:00-9:45", "Archery", "Drama", "Gaga"],
        ["10:00-10:45", "Canoeing", "Archery", "Drama"],
        ["11:00-11:45", "Drama", "Gaga", "Canoeing"],
        ["12:00-12:45", "Lunch", "Lunch", "Lunch"],
        ["13:00-13:45", "Gaga", "Canoeing", "Archery"]
      ]);
      expect(page).toMatchObject({ layout: "allCamp", confident: true });
    });

    it("a page that reads both ways is left for the director to say", () => {
      const page = layoutOf([
        ["Time", "Otters", "Wolves", "Herons"],
        ["9:00-9:45", "Archery", "Drama", "Gaga"],
        ["10:00-10:45", "Gaga", "Archery", "Drama"],
        ["11:00-11:45", "Drama", "Gaga", "Archery"]
      ]);
      expect(page.confident).toBe(false);
    });
  });

  describe("INGEST-2.32: a division gone after Lunch still calls a roll", () => {
    const layoutOf = (rows) => read([csv("Monday.csv", rows)]).reading.pages[0];

    it("INGEST-2.32: the afternoon blocks calling the same shorter roll is a by-activity page", () => {
      const page = layoutOf([
        ["Time", "Archery", "Canoeing", "Drama", "Gaga", "Lunch"],
        ["9:00-9:45", "Otters", "Herons", "Wolves", "Foxes", ""],
        ["10:00-10:45", "Foxes", "Otters", "Herons", "Wolves", ""],
        ["11:00-11:45", "", "", "", "", "Otters; Wolves; Herons; Foxes"],
        ["13:00-13:45", "Wolves", "", "Foxes", "", ""],
        ["14:00-14:45", "", "Foxes", "", "Wolves", ""],
        ["15:00-15:45", "Foxes", "Wolves", "", "", ""]
      ]);
      expect(page).toMatchObject({ layout: "byActivity", confident: true });
    });

    it("INGEST-2.32: counter-case: a rotation, two groups gone after Lunch, still reads both ways and is asked", () => {
      const page = layoutOf([
        ["Time", "Otters", "Wolves", "Herons", "Foxes"],
        ["9:00-9:45", "Archery", "Canoe", "Drama", "Gaga"],
        ["10:00-10:45", "Canoe", "Drama", "Gaga", "Archery"],
        ["11:00-11:45", "Drama", "Gaga", "Archery", "Canoe"],
        ["13:00-13:45", "", "", "Archery", "Canoe"],
        ["14:00-14:45", "", "", "Canoe", "Archery"]
      ]);
      expect(page.confident).toBe(false);
    });

    it("INGEST-2.32: counter-case: groups across, one off each morning block, two gone after Lunch, is asked", () => {
      const page = layoutOf([
        ["Time", "Otters", "Herons", "Wolves", "Foxes", "Bears"],
        ["9:00-9:45", "", "Archery", "Canoeing", "Drama", "Gaga"],
        ["10:00-10:45", "Gaga", "", "Archery", "Canoeing", "Drama"],
        ["11:00-11:45", "Drama", "Gaga", "", "Archery", "Canoeing"],
        ["13:00-13:45", "", "", "", "Archery", "Canoeing"],
        ["14:00-14:45", "", "", "", "Canoeing", "Archery"]
      ]);
      expect(page.confident).toBe(false);
    });

    it("INGEST-2.32: counter-case: an activity named with “&” is no list of groups", () => {
      const page = layoutOf([
        ["Time", "Otters", "Herons", "Wolves", "Foxes", "Bears"],
        ["9:00-9:45", "", "Archery", "Canoeing", "Drama", "Arts & Crafts"],
        ["10:00-10:45", "Arts & Crafts", "", "Archery", "Canoeing", "Drama"],
        ["11:00-11:45", "Drama", "Arts & Crafts", "", "Archery", "Canoeing"],
        ["13:00-13:45", "", "", "", "Archery", "Canoeing"],
        ["14:00-14:45", "", "", "", "Canoeing", "Archery"]
      ]);
      expect(page.confident).toBe(false);
    });

    it("INGEST-2.32: counter-case: a period split in two is no list of groups", () => {
      const page = layoutOf([
        ["Time", "Otters", "Herons", "Wolves", "Foxes", "Bears"],
        ["9:00-9:45", "", "Archery / Canoeing", "Drama", "Gaga", ""],
        ["10:00-10:45", "Gaga", "", "Archery", "Canoeing", "Drama"],
        ["11:00-11:45", "Drama", "Gaga", "", "Archery", "Canoeing"],
        ["13:00-13:45", "", "", "", "Archery", "Canoeing"],
        ["14:00-14:45", "", "", "", "Canoeing", "Archery"]
      ]);
      expect(page.confident).toBe(false);
    });

    it("INGEST-2.32: counter-case: a period split in two on a page of three activities is no list", () => {
      const page = layoutOf([
        ["Time", "Otters", "Herons", "Wolves"],
        ["9:00-9:45", "Archery / Canoe", "Drama", ""],
        ["10:00-10:45", "Drama", "Archery", "Canoe"],
        ["11:00-11:45", "Canoe", "Drama", "Archery"],
        ["13:00-13:45", "", "Archery", "Canoe"],
        ["14:00-14:45", "", "Canoe", "Archery"]
      ]);
      expect(page.confident).toBe(false);
    });

    it("INGEST-2.32: counter-case: a shorter roll written once is not a roll", () => {
      const page = layoutOf([
        ["Time", "Archery", "Canoeing", "Drama", "Gaga"],
        ["9:00-9:45", "Otters", "", "Wolves", "Herons"],
        ["10:00-10:45", "", "Herons", "Otters", "Wolves"],
        ["11:00-11:45", "Wolves", "", "", "Herons"],
        ["13:00-13:45", "", "Otters", "", "Herons"],
        ["14:00-14:45", "Otters", "", "Wolves", ""]
      ]);
      expect(page.confident).toBe(false);
    });
  });

  describe("INGEST-2.7: a note line written above every page names none of them", () => {
    const groupPage = (name, note) =>
      csv(`Camp - ${name}.csv`, [
        [name],
        [note],
        ["Time", "Monday", "Tuesday"],
        ["9:00-9:45", "Archery", "Drama"],
        ["10:00-10:45", "Drama", "Archery"],
        [""],
        ["Rain plan: indoor activities in the gym"]
      ]);

    it("INGEST-2.7: a page per group with a note under each title keeps each group's name", () => {
      const note = "Updated June 2 - subject to change";
      const proposal = read([
        groupPage("Otters", note),
        groupPage("Wolves", note)
      ]);
      expect(proposal.groups.map((g) => g.name).sort()).toEqual([
        "Otters",
        "Wolves"
      ]);
      // "June 2" in the note is not read as the week.
      expect(proposal.reading.pages.map((p) => p.week)).toEqual(["", ""]);
    });

    it("INGEST-2.7: days stacked on one sheet, a note and footnotes on each, keep their days", () => {
      const day = (d) => [
        [`Camp - ${d}`],
        ["DRAFT v3"],
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", "Archery", "Drama"],
        ["10:00-10:45", "Drama", "Archery"],
        [""],
        ["Rain plan: indoor activities in the gym"],
        [""]
      ];
      const proposal = read([
        csv("Camp.csv", [
          ...day("Monday"),
          ...day("Tuesday"),
          ...day("Wednesday")
        ])
      ]);
      expect(proposal.reading.pages.map((p) => p.day)).toEqual([
        "Monday",
        "Tuesday",
        "Wednesday"
      ]);
    });

    it("INGEST-2.7: a sheet per group whose only line is the shared note is named by its sheet", () => {
      const proposal = read([
        {
          name: "Camp.xlsx",
          sheets: ["Otters", "Wolves"].map((name) => ({
            name,
            merges: [],
            rows: [
              ["Questions? Ask the head counselor"],
              ["Time", "Monday", "Tuesday"],
              ["9:00-9:45", "Archery", "Drama"],
              ["10:00-10:45", "Drama", "Archery"]
            ]
          }))
        }
      ]);
      expect(proposal.groups.map((g) => g.name).sort()).toEqual([
        "Otters",
        "Wolves"
      ]);
    });

    it("INGEST-2.7: counter-case: one group's only title, the same in a file per week, is still its name", () => {
      const week = (w) =>
        csv(`Camp - Week ${w}.csv`, [
          ["Otters"],
          ["Time", "Monday", "Tuesday"],
          ["9:00-9:45", "Archery", "Drama"],
          ["10:00-10:45", "Drama", "Archery"]
        ]);
      const proposal = read([week(1), week(2)]);
      expect(proposal.groups.map((g) => g.name)).toEqual(["Otters"]);
    });

    it("INGEST-2.7: counter-case: the same only title on sheets named for weeks is still the name", () => {
      const proposal = read([
        {
          name: "Otters 2026.xlsx",
          sheets: ["Week 1", "Week 2"].map((name) => ({
            name,
            merges: [],
            rows: [
              ["Otters"],
              ["Time", "Monday", "Tuesday"],
              ["9:00-9:45", "Archery", "Drama"],
              ["10:00-10:45", "Drama", "Archery"]
            ]
          }))
        }
      ]);
      expect(proposal.groups.map((g) => g.name)).toEqual(["Otters"]);
    });

    it("INGEST-2.7: counter-case: one page's two title lines keep the last, as before", () => {
      const proposal = read([groupPage("Otters", "Herons")]);
      expect(proposal.groups.map((g) => g.name)).toEqual(["Herons"]);
    });

    // Greg, 2026-11-04 (build log decision 69): what was left out is said, never dropped quietly.
    const leftOut = (proposal) =>
      importNotes(proposal, terms)
        .filter((n) => n.key.startsWith("skipped|"))
        .map((n) => n.text);

    it("INGEST-2.7: a note over every page is listed in the notes once", () => {
      const note = "Updated June 2 - subject to change";
      const proposal = read([
        groupPage("Otters", note),
        groupPage("Wolves", note)
      ]);
      expect(leftOut(proposal).sort()).toEqual([
        "“Rain plan: indoor activities in the gym” was left out.",
        `“${note}” was left out.`
      ]);
    });

    it("INGEST-2.7: notes and footnotes of days stacked on one sheet are listed once each", () => {
      const day = (d) => [
        [`Camp - ${d}`],
        ["DRAFT v3"],
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", "Archery", "Drama"],
        ["10:00-10:45", "Drama", "Archery"],
        ["* Bring water"],
        [""]
      ];
      const proposal = read([
        csv("Camp.csv", [...day("Monday"), ...day("Tuesday")])
      ]);
      expect(leftOut(proposal).sort()).toEqual([
        "“* Bring water” was left out.",
        "“DRAFT v3” was left out."
      ]);
    });

    it("INGEST-2.7: the title line a page is not named by is listed", () => {
      const proposal = read([groupPage("Otters", "Herons")]);
      expect(leftOut(proposal)).toContain("“Otters” was left out.");
    });

    it("INGEST-2.7: counter-case: a title that names its page is not listed", () => {
      const week = (w) =>
        csv(`Camp - Week ${w}.csv`, [
          ["Otters"],
          ["Time", "Monday", "Tuesday"],
          ["9:00-9:45", "Archery", "Drama"],
          ["10:00-10:45", "Drama", "Archery"]
        ]);
      expect(leftOut(read([week(1), week(2)]))).toEqual([]);
    });

    it("INGEST-2.7: counter-case: a sheet with no schedule is said once, its lines not listed", () => {
      const proposal = read([
        {
          name: "Camp.xlsx",
          sheets: [
            {
              name: "Otters",
              merges: [],
              rows: [
                ["Time", "Monday", "Tuesday"],
                ["9:00-9:45", "Archery", "Drama"]
              ]
            },
            { name: "Read me", merges: [], rows: [["Packing list"]] }
          ]
        }
      ]);
      expect(leftOut(proposal)).toEqual([]);
    });
  });

  describe("INGEST-2.23: a note line under a grid is a note, even with a time in it", () => {
    const leftOut = (proposal) =>
      importNotes(proposal, terms)
        .filter((n) => n.key.startsWith("skipped|"))
        .map((n) => n.text);
    const blocksOf = (proposal) =>
      proposal.timetables.flatMap((t) => t.blocks.map((b) => b.name));
    const day = (d, notes) => [
      [d],
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", "Archery", "Drama"],
      ["10:00-10:45", "Drama", "Archery"],
      ...notes
    ];

    it("INGEST-2.23: a note naming a time adds no time block and no page", () => {
      const note =
        "• The printed sheet said 10:00-10:45 PM; it is the morning.";
      const proposal = read([
        csv("Camp.csv", [
          ...day("Monday", []),
          ...day("Tuesday", [[""], ["Notes"], [note]])
        ])
      ]);
      expect(proposal.reading.pages.map((p) => p.day)).toEqual([
        "Monday",
        "Tuesday"
      ]);
      expect(blocksOf(proposal)).toEqual(["9:00-9:45", "10:00-10:45"]);
      expect(JSON.stringify(leftOut(proposal))).toBe(
        JSON.stringify([`“${note}” was left out.`, "“Notes” was left out."])
      );
    });

    it("INGEST-2.23: a note heading under a page per group makes no group, division or program", () => {
      const sheet = (name, notes) => ({
        name,
        merges: [],
        rows: [
          ["Time", "Monday", "Tuesday"],
          ["9:00-9:45", "Archery", "Drama"],
          ["10:00-10:45", "Drama", "Archery"],
          ...notes
        ]
      });
      const proposal = read([
        {
          name: "Camp.xlsx",
          sheets: [
            sheet("Otters", []),
            sheet("Wolves", [
              [""],
              ["Notes"],
              ["• Early pickup group: leaves at 12:30 PM; Friday at 12:00 PM."]
            ])
          ]
        }
      ]);
      expect(proposal.groups.map((g) => g.name).sort()).toEqual([
        "Otters",
        "Wolves"
      ]);
      expect(proposal.timetables).toHaveLength(1);
      expect(blocksOf(proposal)).toEqual(["9:00-9:45", "10:00-10:45"]);
    });

    it("INGEST-2.23: counter-case: a blank row named first stays a block, in one or two label columns", () => {
      const one = read([
        csv("Camp.csv", [
          ["Monday"],
          ["Time", "Bunk 1", "Bunk 2"],
          ["9:00-9:45", "Archery", "Drama"],
          ["Lunch 12:00-12:30", "", ""],
          ["1:00-1:45", "Drama", "Archery"]
        ])
      ]);
      expect(blocksOf(one)).toHaveLength(3);
      const named = read([
        csv("Camp.csv", [
          ["Monday"],
          ["Time", "Bunk 1", "Bunk 2"],
          ["9:00-9:45", "Archery", "Drama"],
          ["Lunch 12:00-12:30 p.m. Dining Hall", "", ""],
          ["Free swim at the lake 1:00-1:45", "", ""],
          ["2:00-2:45", "Drama", "Archery"]
        ])
      ]);
      expect(blocksOf(named)).toHaveLength(4);
      const two = read([
        csv("Camp.csv", [
          ["Monday"],
          ["Period", "Time", "Bunk 1", "Bunk 2"],
          ["Period 1", "9:00-9:45", "Archery", "Drama"],
          ["Lunch", "12:00-12:30", "", ""],
          ["Period 2", "1:00-1:45", "Drama", "Archery"],
          ["Rest hour", "2:00-2:45", "", ""]
        ])
      ]);
      expect(blocksOf(two)).toHaveLength(4);
    });

    it("INGEST-2.23: counter-case: a blank row whose time follows an invisible mark stays a block", () => {
      const proposal = read([
        csv("Camp.csv", [
          ...day("Monday", [["\u200e11:00-11:45", "", ""]]),
          ...day("Tuesday", [["11:00-11:45", "Swim", "Swim"]])
        ])
      ]);
      expect(blocksOf(proposal)).toHaveLength(3);
    });

    it("INGEST-2.23: counter-case: a row that starts with its time stays a block, cells or not", () => {
      const proposal = read([
        csv("Camp.csv", [
          ...day("Monday", [["11:00-11:45", "", ""]]),
          ...day("Tuesday", [["11:00-11:45", "Swim", "Swim"]])
        ])
      ]);
      expect(blocksOf(proposal)).toEqual([
        "9:00-9:45",
        "10:00-10:45",
        "11:00-11:45"
      ]);
    });
  });

  describe("INGEST-2.24: sheets named for their groups under one shared heading", () => {
    const book = (titles) => ({
      name: "Camp.xlsx",
      sheets: Object.entries(titles).map(([name, title]) => ({
        name,
        merges: [],
        rows: [
          [title],
          ["Time", "Monday", "Tuesday"],
          ["9:00-9:45", "Archery", "Drama"],
          ["10:00-10:45", "Drama", "Archery"]
        ]
      }))
    });

    it("INGEST-2.24: each group is named by its sheet, and the shared heading is no division", () => {
      const proposal = read([
        book({
          Otters: "Camp Pine — 2025 — Otters",
          Wolves: "Camp Pine — 2025 — Wolves",
          "P1 (Pre-K)": "Camp Pine — 2025 — P1 (Pre-K)"
        })
      ]);
      expect(proposal.groups.map((g) => g.name).sort()).toEqual([
        "Otters",
        "P1 (Pre-K)",
        "Wolves"
      ]);
      expect(proposal.groups.every((g) => !g.division)).toBe(true);
      expect(questionCards(proposal, terms, {}).map((c) => c.id)).not.toContain(
        expect.stringMatching(/^similar\|group/)
      );
    });

    it("INGEST-2.24: the shared heading is listed once as left out", () => {
      const proposal = read([
        book({
          Otters: "Camp Pine — 2025 — Otters",
          Wolves: "Camp Pine — 2025 — Wolves"
        })
      ]);
      expect(
        importNotes(proposal, terms)
          .filter((n) => n.key.startsWith("skipped|"))
          .map((n) => n.text)
      ).toEqual(["“Camp Pine — 2025” was left out."]);
    });

    it("INGEST-2.24: counter-case: a heading naming a week keeps its week", () => {
      const proposal = read([
        book({
          Otters: "Camp Pine — Week 3 — Otters",
          Wolves: "Camp Pine — Week 3 — Wolves"
        })
      ]);
      expect(proposal.reading.pages.map((p) => p.week)).toEqual([
        "Week 3",
        "Week 3"
      ]);
    });

    it("INGEST-2.24: counter-case: a file per division keeps its divisions", () => {
      const file = (division, bunks) => ({
        ...book(
          Object.fromEntries(bunks.map((b) => [b, `${division} - ${b}`]))
        ),
        name: `${division}.xlsx`
      });
      const one = read([file("Juniors", ["Bunk 1", "Bunk 2"])]);
      expect(one.groups.map((g) => `${g.division}/${g.name}`).sort()).toEqual([
        "Juniors/Bunk 1",
        "Juniors/Bunk 2"
      ]);
      const proposal = read([
        file("Juniors", ["Bunk 1", "Bunk 2"]),
        file("Seniors", ["Bunk 3", "Bunk 4"])
      ]);
      expect(
        proposal.groups.map((g) => `${g.division}/${g.name}`).sort()
      ).toEqual([
        "Juniors/Bunk 1",
        "Juniors/Bunk 2",
        "Seniors/Bunk 3",
        "Seniors/Bunk 4"
      ]);
    });

    it("INGEST-2.24: counter-case: a heading that differs from sheet to sheet is still a division", () => {
      const proposal = read([
        book({ Otters: "Juniors - Otters", Wolves: "Seniors - Wolves" })
      ]);
      expect(
        proposal.groups.map((g) => `${g.division}/${g.name}`).sort()
      ).toEqual(["Juniors/Otters", "Seniors/Wolves"]);
    });
  });

  describe("INGEST-2.8: a page whose layout is unsure takes its file's sure layout", () => {
    const sure = (d) => [
      [`Camp - ${d}`],
      ["Time", "Archery", "Canoeing", "Drama", "Gaga"],
      ["9:00-9:45", "Otters", "", "Wolves", "Herons"],
      ["10:00-10:45", "", "Herons", "Otters", "Wolves"],
      ["11:00-11:45", "Wolves", "Otters", "", "Herons"],
      ["12:00-12:45", "Herons", "Wolves", "", "Otters"],
      ["13:00-13:45", "Otters", "Herons", "Wolves", ""],
      [""]
    ];
    // Herons left early: two of five blocks do not call the full roll.
    const unsure = (d) => [
      [`Camp - ${d}`],
      ["Time", "Archery", "Canoeing", "Drama", "Gaga"],
      ["9:00-9:45", "Otters", "", "Wolves", "Herons"],
      ["10:00-10:45", "", "Herons", "Otters", "Wolves"],
      ["11:00-11:45", "Wolves", "Otters", "", "Herons"],
      ["12:00-12:45", "", "Wolves", "", "Otters"],
      ["13:00-13:45", "Otters", "", "Wolves", ""],
      [""]
    ];

    it("INGEST-2.8: Tuesday's short roll follows Monday's sure by-activity page in the same file", () => {
      const pages = read([
        csv("Camp.csv", [...sure("Monday"), ...unsure("Tuesday")])
      ]).reading.pages;
      expect(pages.map((p) => [p.day, p.layout, p.confident])).toEqual([
        ["Monday", "byActivity", true],
        ["Tuesday", "byActivity", true]
      ]);
    });

    it("INGEST-2.8: counter-case: alone in its file it is still unsure, and asked", () => {
      const pages = read([
        csv("Monday.csv", sure("Monday")),
        csv("Tuesday.csv", unsure("Tuesday"))
      ]).reading.pages;
      expect(pages.map((p) => p.confident)).toEqual([true, false]);
    });
  });

  it("a page that does not say its day is read as nothing, and said so (a file of several such pages)", () => {
    const proposal = read([
      {
        name: "Camp.xlsx",
        sheets: ["Sheet1", "Sheet2"].map((name) => ({
          name,
          merges: [],
          rows: [
            ["Time", "Bunk 1", "Bunk 2"],
            ["9:00-9:45", "Swim", "Art"]
          ]
        }))
      }
    ]);
    expect(proposal.reading.pages[0].noDay).toBe(true);
    expect(proposal.reading.placements).toHaveLength(0);
  });

  it("a short change-over row with nothing in it is not a time block", () => {
    const proposal = read([
      csv("Monday.csv", [
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", "Swim", "Art"],
        ["9:45-9:50", "Change", ""],
        ["9:50-10:35", "Art", "Swim"]
      ])
    ]);
    expect(proposal.timetables[0].blocks).toHaveLength(2);
  });
});

describe("files that cover the same week", () => {
  it("asks which is right where they disagree, and uses the answer", () => {
    const files = [...samples("all-camp"), ...samples("Bunk")];
    const first = buildProposal({ files, existing: null, terms, answers: {} });
    expect(first.reading.disagreements).toHaveLength(1);
    const [d] = first.reading.disagreements;
    expect(d).toMatchObject({
      group: "Bunk 3",
      day: "Tuesday",
      block: "Period 2"
    });
    expect(d.versions.map((v) => v.text).sort()).toEqual(["Art", "Soccer"]);
    const answered = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [d.id]: "Soccer" }
    });
    const cell = answered.reading.placements.filter(
      (p) =>
        p.group === "Bunk 3" && p.day === "Tuesday" && p.blockKey === "590-635"
    );
    expect(cell.map((p) => p.text)).toEqual(["Soccer"]);
  });

  it("files that agree raise nothing", () => {
    const files = [...samples("all-camp"), ...samples("by-activity")];
    expect(
      buildProposal({ files, existing: null, terms, answers: {} }).reading
        .disagreements
    ).toEqual([]);
  });
});

describe("times the review found misread (PR 15 review, finding 4)", () => {
  it("reads ranges of bare hours", () => {
    expect(timeRange("9-10")).toMatchObject({ start: at(9), end: at(10) });
    expect(timeRange("12-1")).toMatchObject({ start: at(12), end: at(13) });
    expect(timeRange("Lunch 12-1")).toMatchObject({
      start: at(12),
      end: at(13)
    });
    expect(timeRange("Period 1 - 2")).toBeNull();
    expect(timeRange("Bunk 3-4")).toBeNull();
  });

  it("a 5 or 6 o'clock block without AM or PM is asked about, never guessed (round 2)", () => {
    // Written first, nothing above it settles it (INGEST-2.10: under the day it would be read on).
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["6:00-6:30", "Late pickup", "Late pickup"],
      ["7:00-8:00", "Early care", "Early care"],
      ["9:00-9:45", "Swim", "Art"]
    ];
    const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
    const first = buildProposal({ files, existing: null, terms, answers: {} });
    const card = questionCards(first, terms, {}).find((c) =>
      c.id.startsWith("ampm|")
    );
    expect(card.title).toBe(
      "Is Late pickup 6:00\u20136:30 in the morning or the evening?"
    );
    expect(card.stage).toBe("preview");
    expect(card.answer).toBeNull();
    expect(card.options.map((o) => o.label)).toEqual([
      "In the morning (6:00\u20136:30 AM)",
      "In the evening (6:00\u20136:30 PM)",
      "Leave it out for now"
    ]);
    const evening = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [card.id]: "evening" }
    });
    expect(evening.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(7),
      at(9),
      at(18)
    ]);
    const morning = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [card.id]: "morning" }
    });
    expect(morning.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(6),
      at(7),
      at(9)
    ]);
    const left = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [card.id]: "leaveOut" }
    });
    expect(left.activities.map((x) => x.name)).not.toContain("Late pickup");
  });

  it("INGEST-2.10: an evening without AM or PM runs on from the afternoon, not asked", () => {
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", "Swim", "Art"],
      ["2:45-3:35", "Art", "Swim"],
      ["6:00-6:45", "Dinner", "Dinner"],
      ["7:00-8:00", "Campfire", "Campfire"],
      ["8:15-9:00", "Cabin Time", "Cabin Time"]
    ];
    const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
    const p = buildProposal({ files, existing: null, terms, answers: {} });
    expect(p.timetables[0].blocks.map((b) => [b.start, b.end])).toEqual([
      [at(9), at(9, 45)],
      [at(14, 45), at(15, 35)],
      [at(18), at(18, 45)],
      [at(19), at(20)],
      [at(20, 15), at(21)]
    ]);
    expect(
      questionCards(p, terms, {}).filter((c) => c.id.startsWith("ampm|"))
    ).toEqual([]);
  });

  it("INGEST-2.10: a 6 o'clock block under the morning is the evening, not asked", () => {
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["7:00-8:00", "Early care", "Early care"],
      ["9:00-9:45", "Swim", "Art"],
      ["6:00-6:30", "Late pickup", "Late pickup"]
    ];
    const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
    const p = buildProposal({ files, existing: null, terms, answers: {} });
    expect(p.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(7),
      at(9),
      at(18)
    ]);
    expect(
      questionCards(p, terms, {}).filter((c) => c.id.startsWith("ampm|"))
    ).toEqual([]);
  });

  it("INGEST-2.10 counter-case: a time written out of order either way round is still asked", () => {
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", "Swim", "Art"],
      ["7:00-8:00", "Campfire", "Campfire"],
      ["6:00-6:45", "Dinner", "Dinner"]
    ];
    const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
    const p = buildProposal({ files, existing: null, terms, answers: {} });
    expect(
      questionCards(p, terms, {})
        .filter((c) => c.id.startsWith("ampm|"))
        .map((c) => c.title)
    ).toEqual(["Is Dinner 6:00\u20136:45 in the morning or the evening?"]);
  });

  it("INGEST-2.10 counter-case: a time with nothing later above it keeps the camp-day rule", () => {
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["7:30-8:15", "Breakfast", "Breakfast"],
      ["8:30-9:15", "Swim", "Art"],
      ["1:00-1:45", "Art", "Swim"]
    ];
    const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
    const p = buildProposal({ files, existing: null, terms, answers: {} });
    expect(p.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(7, 30),
      at(8, 30),
      at(13)
    ]);
  });

  it("Periods 1-2 and Period 1-2 are not times", () => {
    expect(timeRange("Periods 1-2")).toBeNull();
    expect(timeRange("Period 1-2")).toBeNull();
  });
});
