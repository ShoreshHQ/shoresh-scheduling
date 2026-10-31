/**
 * Shoresh in an AI chat, asked in plain words (docs/protocol/api.md API-1.24 to API-1.27): the
 * seasons listed so nothing is guessed, Shoresh's own view of the week, and answers that say
 * what they are and are not. No Salesforce here: the sf command line is a stand-in.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { CAPABILITIES, byName } = require("../capabilities");
const { call } = require("../client");
const { tools, handle, WEEK_VIEW } = require("../mcp");

/** A stand-in sf: answers by web address, and records each one asked. */
const sfAnswering =
  (answers, seen = []) =>
  async (args) => {
    const address = args[3];
    seen.push(address);
    const [status, body] = Object.entries(answers).find(([start]) =>
      address.startsWith(start)
    )?.[1] ?? [404, "[]"];
    return `HTTP/1.1 ${status}\ncontent-type: application/json\n\n${body}`;
  };

const callTool = (name, args, run) =>
  handle(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args }
    },
    { callFn: (n, input, opts) => call(n, input, { ...opts, run }) }
  );

const V1 = "/services/apexrest/v1/";

describe("Shoresh in an AI chat", () => {
  // API-1.24
  it("weekOneJustWorks: list_seasons names what exists, and no action needs a season", async () => {
    const seen = [];
    const run = sfAnswering(
      { [`${V1}seasons`]: [200, '{"opens_on":"Summer 2026","seasons":[]}'] },
      seen
    );
    const listed = await call("list_seasons", {}, { run });
    expect(seen).toEqual([`${V1}seasons`]);
    expect(listed.ok).toBe(true);
    expect(byName("list_seasons").description).toMatch(/opens_on/);
    for (const c of CAPABILITIES) {
      expect([c.name, c.inputSchema.required ?? []]).not.toEqual([
        c.name,
        expect.arrayContaining(["season"])
      ]);
      if (c.inputSchema.properties.season) {
        expect(c.inputSchema.properties.season.description).toMatch(
          /Leave it out .* the season its screens open on/
        );
      }
    }
    seen.length = 0;
    await call("read_elective_offerings", { week: "Week 1" }, { run });
    expect(seen).toEqual([`${V1}elective_offerings?week=Week+1`]);
  });

  // API-1.25
  it("unknownNamesComeBackWithTheNamesThatExist: Shoresh's sentence naming them reaches the AI as it is", async () => {
    const sentence =
      'There is no week called "Week 9" in Summer 2026. Its weeks: Week 1, Week 2.';
    const answer = await callTool(
      "read_group_schedule",
      { week: "Week 9" },
      sfAnswering({ [V1]: [400, JSON.stringify({ message: sentence })] })
    );
    expect(answer.result).toEqual({
      content: [{ type: "text", text: sentence }],
      isError: true
    });
    for (const c of CAPABILITIES) {
      expect(c.description).toMatch(
        /A name that isn't there comes back with the names that are\./
      );
    }
  });

  // API-1.26
  it("theWeekIsShownInShoreshsOwnView: a schedule read carries the Schedules screen's view, in Shoresh's own page", async () => {
    const shown = tools().filter((t) => t._meta);
    expect(shown.map((t) => t.name)).toEqual([
      "read_group_schedule",
      "read_activity_schedule"
    ]);
    for (const t of shown) {
      expect(t._meta).toEqual({
        ui: { resourceUri: "ui://shoresh/week-view.html" }
      });
    }
    const view = {
      season: "Summer 2026",
      week: "Week 1",
      labels: [],
      programs: []
    };
    const seen = [];
    const answer = await callTool(
      "read_group_schedule",
      { week: "Week 1" },
      sfAnswering(
        {
          [`${V1}group_schedule`]: [
            200,
            '{"season":"Summer 2026","week":"Week 1","records":[]}'
          ],
          [`${V1}week_view`]: [200, JSON.stringify(view)]
        },
        seen
      )
    );
    expect(seen).toEqual([
      `${V1}group_schedule?week=Week+1`,
      `${V1}week_view?week=Week+1`
    ]);
    expect(answer.result.structuredContent).toEqual({ week_view: view });

    // The view is extra: a read whose view can't be had still answers.
    const noView = await callTool(
      "read_group_schedule",
      { week: "Week 1" },
      sfAnswering({
        [`${V1}group_schedule`]: [200, '{"records":[]}'],
        [`${V1}week_view`]: [200, "not JSON"]
      })
    );
    expect(noView.result.isError).toBe(false);
    expect(noView.result.structuredContent).toBeUndefined();

    // The page as shipped, beside the connector (scripts/build-connect.js makes it).
    const { TO } = require("../../scripts/build-connect");
    const shipped = require(path.join(TO, "mcp.js"));
    const listed = await shipped.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/list"
    });
    expect(listed.result.resources).toEqual([WEEK_VIEW]);
    const page = await shipped.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/read",
      params: { uri: WEEK_VIEW.uri }
    });
    expect(page.result.contents[0].mimeType).toBe("text/html;profile=mcp-app");
    expect(page.result.contents[0].text).toMatch(/ui\/initialize/);
  });

  // API-1.26
  it("theViewIsTheScreensOwnGrid: the shipped page is Generated Schedule's grid and the Schedules view module, compiled unchanged", async () => {
    const { VIEW_FILE, TO } = require("../../scripts/build-connect");
    // Built again here, in Node itself (the compiler doesn't run in Jest's page).
    const built = execFileSync(
      process.execPath,
      [
        "-e",
        'require("./scripts/build-connect").viewFile().then((t) => process.stdout.write(t))'
      ],
      { cwd: path.resolve(__dirname, "../.."), maxBuffer: 64 * 1024 * 1024 }
    ).toString();
    expect(fs.readFileSync(path.join(TO, VIEW_FILE), "utf8") === built).toBe(
      true
    );
    const wrapper = fs.readFileSync(
      path.join(__dirname, "../view/lwc/weekView/weekView.js"),
      "utf8"
    );
    expect(wrapper).toMatch(/from "c\/shoreshScheduleViews"/);
    expect(
      fs.readFileSync(
        path.join(__dirname, "../view/lwc/weekView/weekView.html"),
        "utf8"
      )
    ).toMatch(/<c-shoresh-schedule-grid/);
  }, 120000);

  // API-1.26
  it("theViewIsAttachedNeverSaidToBeShown: a schedule read says its view is attached, never that the person sees it, and the rows are the schedule", () => {
    for (const name of ["read_group_schedule", "read_activity_schedule"]) {
      const c = byName(name);
      for (const text of [c.description, c.about]) {
        expect(text).toMatch(
          /view of the week is attached for chat apps that can show it, but it may not be shown: never say the person can see it/
        );
        expect(text).toMatch(/don't draw, chart or redraw the schedule/);
        expect(text).toMatch(
          /if the person can't see the view, those rows are the schedule/
        );
      }
    }
    for (const c of CAPABILITIES) {
      expect([c.name, `${c.description} ${c.about ?? ""}`]).not.toEqual([
        c.name,
        expect.stringMatching(/shows the week in the chat|shown above|is shown/)
      ]);
    }
  });

  // API-1.27
  it("answersSayWhatTheyAreAndAreNot: each read says what its answer is, and a schedule says it holds no findings", async () => {
    for (const c of CAPABILITIES.filter((c) => c.method === "GET")) {
      expect([c.name, typeof c.about]).toEqual([c.name, "string"]);
    }
    for (const name of ["read_group_schedule", "read_activity_schedule"]) {
      const c = byName(name);
      for (const text of [c.about, c.description]) {
        expect(text).toMatch(
          /exactly as published in Shoresh, and nothing else/
        );
        expect(text).toMatch(/holds no findings, checks or problems/);
        expect(text).toMatch(
          /anything this answer doesn't say, Shoresh didn't say/
        );
      }
    }
    const answer = await callTool(
      "read_activity_schedule",
      { week: "Week 1" },
      sfAnswering({ [V1]: [200, '{"records":[]}'] })
    );
    expect(answer.result.content.map((c) => c.text)).toEqual([
      byName("read_activity_schedule").about,
      '{"records":[]}'
    ]);
  });

  // API-1.28
  it("aScheduleReadOpensTheWeekOnTheSchedulesScreen: the answer gives the camp's own link to the week on the Schedules screen, and the tool says to give it", async () => {
    const opens =
      "https://maple-grove.my.salesforce.com/lightning/n/Shoresh_Camp_Setup?c__preview=schedules&c__camp=a01&c__season=a02&c__program=a03&c__week=a04&c__schedule=a05";
    const answer = await callTool(
      "read_activity_schedule",
      { week: "Week 1" },
      sfAnswering({
        [`${V1}activity_schedule`]: [200, '{"records":[]}'],
        [`${V1}week_view`]: [200, JSON.stringify({ programs: [], opens })]
      })
    );
    const texts = answer.result.content.map((c) => c.text);
    expect(texts[texts.length - 1]).toBe(
      `Open this week on Shoresh's Schedules screen: ${opens}`
    );
    for (const name of ["read_group_schedule", "read_activity_schedule"]) {
      expect(byName(name).description).toMatch(
        /give the person that link, as it is, so they can open the real view/
      );
    }
    // No view, no link: nothing is made up in its place.
    const noView = await callTool(
      "read_activity_schedule",
      { week: "Week 1" },
      sfAnswering({
        [`${V1}activity_schedule`]: [200, '{"records":[]}'],
        [`${V1}week_view`]: [400, '{"message":"no"}']
      })
    );
    expect(JSON.stringify(noView.result.content)).not.toMatch(/https:/);
  });
});
