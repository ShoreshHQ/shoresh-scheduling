/**
 * Every word an AI receives from Shoresh, and sends to it, in the screens' words (API-1.6): the
 * one screen-words adapter, connect/screenWords.js. No Salesforce here: the sf command line is a
 * stand-in.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { call: callAs } = require("../client");
const { tools, handle } = require("../mcp");
const { NAME: SCRIPT } = require("../script");
const { aiWord, engineWord, forAi, LISTS } = require("../screenWords");

const LWC = "../../force-app/main/default/lwc";
const V1 = "/services/apexrest/v1/";
const call = (name, input, options) =>
  callAs(name, input, {
    camp: async () => ({ namespace: "", version: null }),
    ...options
  });

/** A stand-in sf: answers by web address (the first that starts it), and records each one asked. */
const sfAnswering =
  (answers, seen = []) =>
  async (args, stdin) => {
    seen.push({ address: args[3], stdin });
    const [status, body] = Object.entries(answers).find(([start]) =>
      args[3].startsWith(start)
    )?.[1] ?? [404, "[]"];
    return `HTTP/1.1 ${status}\ncontent-type: application/json\n\n${body}`;
  };

// Words the screens never use (design guide §2; API-1.6), as a key or a value an AI reads or sends.
const NOT_THE_SCREENS =
  /^(records?|offerings?|answer_id|.*_ids?|id)$|bring_?in|proposed|setup_?record|agent|finding|period|json/i;
const CAMEL = /[a-z][A-Z]/;

/** Every key, at any depth, of the JSON parts of what an AI was told. */
function keysIn(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const keys = [];
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        keys.push(key);
        walk(v);
      }
    }
  };
  walk(parsed);
  return keys;
}

/** Every input name and every value an input allows, at any depth. */
const namesIn = (schema) =>
  schema && typeof schema === "object"
    ? [
        ...Object.keys(schema.properties || {}),
        ...(schema.enum || []),
        ...Object.values(schema.properties || {}).flatMap(namesIn),
        ...namesIn(schema.items)
      ]
    : [];

describe("The words an AI receives", () => {
  // API-1.6
  it("everyWordTheAiReceives: every tool's inputs, the values they allow, and the keys of every tool's answer are the screens' words", async () => {
    for (const tool of tools()) {
      for (const name of namesIn(tool.inputSchema)) {
        expect([tool.name, name]).not.toEqual([
          tool.name,
          expect.stringMatching(CAMEL)
        ]);
        expect([tool.name, name]).not.toEqual([
          tool.name,
          expect.stringMatching(NOT_THE_SCREENS)
        ]);
      }
    }

    // Every tool answered as Salesforce answers outside systems too (API-1.3): its keys are the
    // API's own, and the AI hears them in the screens' words whatever the tool.
    const shared = JSON.stringify({
      season: "Summer 2031",
      week: "Week 1",
      records: [{ group: "Bunk 4", activity: "Swim" }],
      offerings: [{ activity: "Pottery" }]
    });
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-words-"));
    const run = sfAnswering({ [V1]: [200, shared] });
    const answered = [];
    for (const tool of tools().filter((t) => t.name !== SCRIPT)) {
      const reply = await handle(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: tool.name, arguments: { week: "Week 1" } }
        },
        {
          callFn: (n, input, opts) => call(n, input, { ...opts, run, folder }),
          ask: async () => "no",
          log: () => {}
        }
      );
      for (const part of reply.result.content) {
        answered.push(tool.name);
        for (const key of keysIn(part.text)) {
          expect([tool.name, key]).not.toEqual([
            tool.name,
            expect.stringMatching(NOT_THE_SCREENS)
          ]);
          expect([tool.name, key]).not.toEqual([
            tool.name,
            expect.stringMatching(CAMEL)
          ]);
        }
      }
    }
    // The shared answer reached the AI as JSON, renamed, at least through the schedule reads.
    expect(answered).toContain("read_group_schedule");
    fs.rmSync(folder, { recursive: true, force: true });
  });

  // API-1.6, API-1.3
  it("scheduleReadsSayRows: a schedule read's rows reach the AI as rows, as its about says, while outside systems keep the API's records", async () => {
    const body = JSON.stringify({
      season: "Summer 2031",
      week: "Week 1",
      records: [{ group: "Bunk 4", date: "2031-07-01", activity: "Swim" }]
    });
    const said = await handle(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_group_schedule", arguments: { week: "Week 1" } }
      },
      {
        callFn: (n, input, opts) =>
          call(n, input, {
            ...opts,
            run: sfAnswering({ [`${V1}group_schedule`]: [200, body] })
          }),
        log: () => {}
      }
    );
    const answer = said.result.content.map((c) => c.text).join("\n");
    expect(answer).toContain(
      '{"season":"Summer 2031","week":"Week 1","rows":[{"group":"Bunk 4","date":"2031-07-01","activity":"Swim"}]}'
    );
    expect(answer).not.toMatch(/records/);
    // The adapter keeps a laid-out answer laid out, and leaves sentences and CSV alone.
    expect(forAi('{\n  "offerings": []\n}')).toBe('{\n  "electives": []\n}');
    expect(forAi("Done. 3 records")).toBe("Done. 3 records");
    expect(forAi("group,records\nBunk 4,2")).toBe("group,records\nBunk 4,2");
  });

  // API-1.6
  it("listNamesInTheScreensWords: a setup list is named time_blocks, fixed_activities, recurring_activities, special_events, and read back in the modules' own words", async () => {
    for (const name of ["import_list", "download_setup"]) {
      const { list } = tools().find((t) => t.name === name).inputSchema
        .properties;
      expect(list.enum.filter((w) => CAMEL.test(w))).toEqual([]);
      for (const word of list.enum.filter((w) => w !== "worksheet")) {
        expect(LISTS).toContain(engineWord(word));
      }
    }
    expect(LISTS.map((w) => aiWord(w))).toEqual([
      "programs",
      "divisions",
      "groups",
      "time_blocks",
      "locations",
      "staff",
      "activities",
      "fixed_activities",
      "recurring_activities",
      "electives",
      "special_events"
    ]);
    // A camp's own word is never changed, even one that looks like the modules'.
    expect(aiWord("iPad")).toBe("iPad");
    expect(engineWord("time_blocks")).toBe("timeBlocks");
    expect(engineWord("Bunk_4")).toBe("Bunk_4");
    // The import engine's words, too.
    const engine = ["leaveOut", "allCamp", "byGroup", "byActivity"];
    expect(engine.map((w) => aiWord(w, engine))).toEqual([
      "leave_out",
      "all_camp",
      "by_group",
      "by_activity"
    ]);
    expect(
      ["leave_out", "all_camp", "by_group", "by_activity", "b"].map((w) =>
        engineWord(w, engine)
      )
    ).toEqual([...engine, "b"]);
  });

  // API-1.150, API-1.93 to API-1.95
  it("learnedAnswersAreNamedByTheirLine: read_learned_answers gives no Id; a change or forget names the answer by its line and Salesforce is sent its own Id; a line no answer reads is refused with nothing sent", async () => {
    const learned = async () => ({
      ...require(`${LWC}/shoreshLearned/history.js`),
      ...require(`${LWC}/shoreshLearned/builtIn.js`),
      ...require(`${LWC}/shoreshLearned/view.js`),
      ...require(`${LWC}/shoreshPatterns/shoreshPatterns.js`),
      ...require(`${LWC}/shoreshTerms/shoreshTerms.js`)
    });
    const learnedNow = JSON.stringify({
      camp: "Pine Hollow (made up)",
      setup: { labels: [] },
      answers: [
        {
          id: "a0Learned000001",
          question: "kind|lunch",
          answer: "fixed",
          byYou: true,
          byName: "Pat",
          answeredOn: "2031-07-01",
          savedAt: "2031-07-01T10:00:00Z"
        }
      ],
      events: []
    });
    const read = await call(
      "read_learned_answers",
      { season: "Summer 2031" },
      {
        run: sfAnswering({ [V1]: [200, learnedNow] }),
        learned
      }
    );
    const listed = read.text
      .split("\n")
      .find((l) => l.includes("remembered now: seen"));
    expect(listed).toMatch(
      /^- .+: lunch is a fixed activity \(Answered as before\) - remembered now: seen "fixed", can be changed to recurring/
    );
    expect(read.text).not.toMatch(/a0Learned|answer_id/);

    const seen = [];
    const changed = await call(
      "change_learned_answer",
      {
        season: "Summer 2031",
        // The line as listed, its date and all, up to its (how).
        line: listed.slice(2, listed.indexOf(" (Answered")),
        answer: "recurring",
        seen: "fixed"
      },
      {
        run: sfAnswering(
          {
            [`${V1}read_learned_answers`]: [200, learnedNow],
            [`${V1}change_learned_answer`]: [
              200,
              JSON.stringify({ message: 'Changed "fixed" to "recurring".' })
            ]
          },
          seen
        ),
        learned
      }
    );
    expect(changed).toMatchObject({ ok: true });
    expect(seen.map((s) => s.address)).toEqual([
      `${V1}read_learned_answers?season=Summer+2031`,
      `${V1}change_learned_answer`
    ]);
    expect(JSON.parse(seen[1].stdin)).toEqual({
      season: "Summer 2031",
      answer_id: "a0Learned000001",
      answer: "recurring",
      seen: "fixed"
    });

    const none = [];
    const refused = await call(
      "forget_learned_answer",
      { season: "Summer 2031", line: "swim is recurring", seen: "fixed" },
      {
        run: sfAnswering({ [V1]: [200, learnedNow] }, none),
        learned
      }
    );
    expect(refused).toMatchObject({ ok: false, status: 400 });
    expect(refused.text).toBe(
      'No answer remembered now reads "swim is recurring" on What Shoresh has learned. Nothing was changed.'
    );
    expect(none.map((s) => s.address)).toEqual([
      `${V1}read_learned_answers?season=Summer+2031`
    ]);
  });
});
