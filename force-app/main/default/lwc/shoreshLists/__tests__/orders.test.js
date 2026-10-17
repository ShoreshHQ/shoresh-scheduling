// Review round 3: every reference resolves the same way whatever order the rows are in, and
// follows the director's answers. Each scenario runs in file order, reversed, and shuffled.
import { buildTerms } from "c/shoreshTerms";
import { csvFile, LEAVE_OUT, looseKey } from "c/shoreshImportEngine";
import {
  listPlan,
  listProposal,
  questionCards,
  waitingFor
} from "c/shoreshLists";

const terms = buildTerms([]);

function setup() {
  return {
    season: { Id: "s1", Camp__c: "c1" },
    locationTypes: [{ Id: "lt1", Name: "Field" }],
    locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 1 }],
    activities: [
      {
        Id: "a1",
        Name: "Archery",
        Length__c: 1,
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 1,
        Priority__c: "Low",
        GroupsAtOnce__c: 1
      },
      {
        Id: "a2",
        Name: "Music",
        Length__c: 1,
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 1,
        Priority__c: "Low",
        GroupsAtOnce__c: 1
      }
    ],
    programs: []
  };
}

/** The rows in several orders: as written, reversed, and five seeded shuffles. */
function orders(rows) {
  const result = [rows, [...rows].reverse()];
  for (let seed = 1; seed <= 5; seed++) {
    let x = seed * 9301 + 49297;
    const shuffled = [...rows];
    for (let i = shuffled.length - 1; i > 0; i--) {
      x = (x * 9301 + 49297) % 233280;
      const j = Math.floor((x / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    result.push(shuffled);
  }
  return result;
}

function file(heading, rows) {
  return csvFile(
    "list.csv",
    [heading, ...rows].map((r) => r.join(",")).join("\n")
  );
}

/** Reads the list, answering every question by policy(card), until nothing new is asked. */
function settle(screenKey, heading, rows, policy) {
  const answers = {};
  let p;
  for (let round = 0; round < 6; round++) {
    p = listProposal({
      screenKey,
      file: file(heading, rows),
      setup: setup(),
      terms,
      answers
    });
    const open = questionCards(p, terms, answers).filter((c) => !c.answer);
    if (!open.length) {
      break;
    }
    open.forEach((card) => {
      answers[card.id] = policy(card);
    });
  }
  return { p, answers };
}

/** What the save does, independent of row order and spelling of repeats. */
function outcome(p, answers) {
  expect(waitingFor(p, terms, answers)).toEqual([]);
  const plan = listPlan(p, answers, "s1", "f");
  const keys = new Set(plan.records.map((r) => r.key).filter((k) => k));
  const linkOf = (v) => {
    if (!v) {
      return null;
    }
    if (v.includes(":")) {
      expect(keys.has(v)).toBe(true);
      return `new ${looseKey(v.split(":")[1])}`;
    }
    return v;
  };
  return plan.records
    .map((r) => ({
      what: r.id || `new ${r.kind} ${looseKey(r.fields.Name)}`,
      links: Object.fromEntries(
        Object.entries(r.refs || {}).map(([f, v]) => [f, linkOf(v)])
      )
    }))
    .sort((a, b) => a.what.localeCompare(b.what));
}

function sameInEveryOrder(screenKey, heading, rows, policy) {
  const results = orders(rows).map((rowsInOrder) => {
    const { p, answers } = settle(screenKey, heading, rowsInOrder, policy);
    return outcome(p, answers);
  });
  results.forEach((r) => expect(r).toEqual(results[0]));
  return results[0];
}

const leaveOut = () => LEAVE_OUT;
const pick = (word) => (card) =>
  (card.options.find((o) => o.label.includes(`“${word}”`)) || card.options[0])
    .value;

describe("a rain plan follows the rows as the director settled them, in any order", () => {
  it("1. a plan in other capitals naming a row left out adds it as by hand, once", () => {
    const result = sameInEveryOrder(
      "activities",
      ["Activity", "Rain plan"],
      [
        ["Archry", ""],
        ["archry", ""],
        ["Swim", "ARCHRY"]
      ],
      leaveOut
    );
    expect(result).toEqual([
      {
        what: "new Activity archry",
        links: { Location__c: null, RainPlan__c: null }
      },
      {
        what: "new Activity swim",
        links: { Location__c: null, RainPlan__c: "new archry" }
      }
    ]);
  });

  it("2. a plan naming a row answered the same as another follows it", () => {
    const result = sameInEveryOrder(
      "activities",
      ["Activity", "Rain plan"],
      [
        ["Golf", "Tenis"],
        ["Tenis", ""],
        ["Tennis", ""]
      ],
      pick("Tennis")
    );
    expect(result.map((r) => r.what)).toEqual([
      "new Activity golf",
      "new Activity tennis"
    ]);
    expect(result[0].links.RainPlan__c).toBe("new tennis");
  });

  it("2. with an item set up: Musik and Musick are Music, and a plan naming either is Music", () => {
    const result = sameInEveryOrder(
      "activities",
      ["Activity", "Rain plan", "Times a week: at least"],
      [
        ["Musik", "", "1"],
        ["Musick", "", "1"],
        ["Arts", "Musick", "1"]
      ],
      pick("Music")
    );
    expect(result).toEqual([
      {
        what: "new Activity arts",
        links: { Location__c: null, RainPlan__c: "a2" }
      }
    ]);
  });

  it("3 and 4. a repeat follows its row: can't be read, or waiting with it", () => {
    const p = listProposal({
      screenKey: "activities",
      file: file(
        ["Activity", "Times a week: at least"],
        [
          ["Golf", "x"],
          ["golf", "2"],
          ["Musik", "1"],
          ["musik", "1"]
        ]
      ),
      setup: setup(),
      terms,
      answers: {}
    });
    expect(p.rows.map((r) => [r.name, r.status])).toEqual([
      ["Golf", "unreadable"],
      ["golf", "unreadable"],
      ["Musik", "asked"],
      ["musik", "asked"]
    ]);
  });

  it("location types in any capitals are one type, and every link resolves", () => {
    const result = sameInEveryOrder(
      "locations",
      ["Location", "Location type", "Groups that fit"],
      [
        ["Barn", "indoors", "1"],
        ["Hall", "Indoors", "1"],
        ["Shed", "INDOORS", "1"],
        ["Meadow", "FIELD", "1"]
      ],
      leaveOut
    );
    expect(result.map((r) => r.what)).toEqual([
      "new Location barn",
      "new Location hall",
      "new Location meadow",
      "new Location shed",
      "new LocationType indoors"
    ]);
    expect(result.find((r) => r.what === "new Location meadow").links).toEqual({
      LocationType__c: "lt1"
    });
  });

  it("a rain plan to a row whose own plan is still asked about waits, then follows", () => {
    const result = sameInEveryOrder(
      "activities",
      ["Activity", "Rain plan"],
      [
        ["Kayak", "Canoe"],
        ["Canoe", "Archry"],
        ["Archry", ""]
      ],
      pick("Archery")
    );
    expect(result.map((r) => [r.what, r.links.RainPlan__c])).toEqual(
      [
        ["a1", undefined],
        ["new Activity canoe", "a1"],
        ["new Activity kayak", "new canoe"]
      ].filter((x) => x[0] !== "a1")
    );
  });
});

describe("own review of round 3", () => {
  const read = (rows, answers = {}, s = setup()) =>
    listProposal({
      screenKey: "activities",
      file: file(rows[0], rows.slice(1)),
      setup: s,
      terms,
      answers
    });

  it("HIGH 1: a plan that turns out to be its own row can't be read, in any order", () => {
    orders([
      ["Tennis", "Tenis"],
      ["Tenis", ""]
    ]).forEach((rows) => {
      const { p, answers } = settle(
        "activities",
        ["Activity", "Rain plan"],
        rows,
        pick("Tennis")
      );
      const tennis = p.rows.find((r) => r.name === "Tennis");
      expect(tennis.problems).toEqual(["Rain plan: can't be itself"]);
      // Nothing is left to ask: Tenis is Tennis, and Tennis can't be read.
      expect(questionCards(p, terms, answers).filter((c) => !c.answer)).toEqual(
        []
      );
    });
    const [card] = questionCards(
      read([
        ["Activity", "Rain plan"],
        ["Musik", "Music"]
      ]),
      terms,
      {}
    );
    const p = read(
      [
        ["Activity", "Rain plan"],
        ["Musik", "Music"]
      ],
      { [card.id]: "b" }
    );
    expect(p.rows[0].problems).toEqual(["Rain plan: can't be itself"]);
  });

  it("HIGH 2: a rain-plan question answered Leave out stays, and can be changed", () => {
    const rows = [
      ["Activity", "Rain plan"],
      ["Kayak", "Archry"],
      ["Golf", ""]
    ];
    const [card] = questionCards(read(rows), terms, {});
    const answers = { [card.id]: LEAVE_OUT };
    const p = read(rows, answers);
    expect(p.rows[0].status).toBe("leftOut");
    expect(questionCards(p, terms, answers).map((c) => c.id)).toEqual([
      card.id
    ]);
  });

  it("MEDIUM 3: answers that go round in a circle keep one row, never none", () => {
    const rows = [
      ["Activity", "Rain plan"],
      ["Golf", ""],
      ["Golfes", ""],
      ["Golfs", ""],
      ["Swim", "Golf"]
    ];
    const cards = questionCards(read(rows), terms, {});
    const answers = {};
    cards.forEach((c) => {
      const [x, y] = c.options.filter(
        (o) => o.value === "a" || o.value === "b"
      );
      // Golf/Golfes -> Golfes; Golfes/Golfs -> Golfs; Golf/Golfs -> Golf.
      const wants = {
        "Golf|Golfes": "Golfes",
        "Golfes|Golfs": "Golfs",
        "Golf|Golfs": "Golf"
      };
      const names = c.title.match(/“([^”]+)”/g).map((n) => n.slice(1, -1));
      const want = wants[names.join("|")];
      answers[c.id] = x.label.includes(`“${want}”`) ? x.value : y.value;
    });
    const p = read(rows, answers);
    const saved = p.rows.filter((r) => r.status === "new").map((r) => r.name);
    expect(saved).toHaveLength(2);
    expect(saved).toContain("Swim");
    expect(waitingFor(p, terms, answers)).toEqual([]);
  });

  it("LOW 4: an added name is spelled the same whatever the row order", () => {
    const spellings = orders([
      ["Barn", "indoors", "1"],
      ["Hall", "INDOORS", "1"],
      ["Shed", "Indoors", "1"]
    ]).map((rows) => {
      const p = listProposal({
        screenKey: "locations",
        file: file(["Location", "Location type", "Groups that fit"], rows),
        setup: setup(),
        terms,
        answers: {}
      });
      return p.alsoAdd.locationType;
    });
    expect(spellings[0]).toHaveLength(1);
    spellings.forEach((s) => expect(s).toEqual(spellings[0]));
  });

  it("LOW 5: a plan naming a new item of the same name as one set up is a difference", () => {
    const s = setup();
    s.activities.push({ ...s.activities[0], Id: "a3" });
    s.activities[1].RainPlan__c = "a1";
    const rows = [
      ["Activity", "Rain plan"],
      ["Archery", ""],
      ["Music", "Archery"]
    ];
    const which = questionCards(read(rows, {}, s), terms, {})[0];
    const p = read(rows, { [which.id]: "new" }, s);
    expect(p.rows.find((r) => r.name === "Music").status).toBe("changed");
  });
});
