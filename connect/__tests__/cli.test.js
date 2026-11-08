/**
 * The command line and code mode as their own layers over MCP's actions
 * (docs/protocol/api.md, Command line and Code mode). Salesforce is a stand-in here; the same
 * rules are checked against the test org by hand with scripts/e2e-connect.js.
 */
const fs = require("fs");
const path = require("path");
const { parse, main, EXIT } = require("../cli");
const { toolResult } = require("../mcp");
const { call: callAs, NOT_YET, PERSON_DECIDES } = require("../client");

const call = (name, input, options) =>
  callAs(name, input, {
    camp: async () => ({ namespace: "", version: null }),
    ...options
  });

const sfAnswering =
  (status, body, seen = []) =>
  async (args, stdin) => {
    seen.push({ args, stdin });
    return `HTTP/1.1 ${status}\ncontent-type: application/json\nset-cookie: sid=SECRET\n\n${body}`;
  };

/** One command, as typed, against a stand-in Salesforce: what it printed and its exit code. */
async function command(argv, status, body, seen = []) {
  const out = [];
  const err = [];
  const code = await main(
    argv,
    {},
    { write: (t) => out.push(t) },
    { write: (t) => err.push(t) },
    (name, input, options) =>
      call(name, input, { ...options, run: sfAnswering(status, body, seen) })
  );
  return { code, out: out.join(""), err: err.join(""), seen };
}

const PREVIEW = `${NOT_YET} Version "Try 2" would be deleted for good. Show the person exactly this and ask. Only if they say yes, send the same request again with confirm: "abc123".`;

describe("Command line", () => {
  // API-1.109
  it("typedAsTheToolsFields: each input by the tool's own field name, a non-text field as JSON", () => {
    expect(
      parse([
        "copy_cells",
        "--week",
        "Week 1",
        "--groups",
        '["Bunk 1", "Bunk 2"]',
        "--season",
        "Summer 2026"
      ]).input
    ).toEqual({
      week: "Week 1",
      groups: ["Bunk 1", "Bunk 2"],
      season: "Summer 2026"
    });
    expect(
      parse(["put_special_day_on_day", "--replace", "true"]).input.replace
    ).toBe(true);
    expect(
      parse(["change_setup_record", "--fields", '{"place": "Pool"}']).input
    ).toEqual({ fields: { place: "Pool" } });
    expect(
      parse(["read_week_checks", "--week", "Week 1", "--program", "Juniors"])
        .input
    ).toEqual({ week: "Week 1", program: "Juniors" });
  });

  // API-1.109
  it("wrongInputsAreRefusedBeforeAsking: an unknown action, input or value is named and nothing is asked", async () => {
    expect(() => parse(["read_group_schedule", "--bunk", "3"])).toThrow(
      /read_group_schedule has no --bunk\. Its inputs: --season, --week, --as_csv\./
    );
    expect(() => parse(["copy_cells", "--groups", "Bunk 1"])).toThrow(
      /--groups needs JSON, like: --groups '\["Bunk 1", "Bunk 2"\]'/
    );
    expect(() => parse(["read_group_schedule", "--week"])).toThrow(
      "--week needs a value."
    );
    expect(() => parse(["read_group_schedule", "Week 1"])).toThrow(
      /isn't an input/
    );
    const typo = await command(["delete_everything"], 200, "{}");
    expect(typo.code).toBe(EXIT.couldNotAsk);
    expect(typo.seen).toEqual([]);
    expect(typo.err).toMatch(/^Usage/);
  });

  // API-1.110
  it("printsWhatMcpSays: the MCP tool's lines, in order, one a line; a refusal ends with the person decides", async () => {
    const body = JSON.stringify({
      message: "Unpublished Week 1.",
      season: "Summer 2027"
    });
    const done = await command(
      ["unpublish_week", "--week", "Week 1"],
      200,
      body
    );
    const mcp = toolResult(
      await call(
        "unpublish_week",
        { week: "Week 1" },
        {
          run: sfAnswering(200, body)
        }
      )
    );
    expect(done.out).toBe(`${mcp.content.map((c) => c.text).join("\n")}\n`);
    expect(done.out).toBe("Unpublished Week 1.\nSeason used: Summer 2027.\n");
    expect(done.err).toBe("");

    const refused = await command(
      ["unpublish_week", "--week", "Week 1"],
      409,
      JSON.stringify({ message: "Week 1 isn't published.", season: "S" })
    );
    expect(refused.out).toBe("");
    expect(refused.err).toBe(
      `Week 1 isn't published. ${PERSON_DECIDES}\nSeason used: S.\n`
    );
  });

  // API-1.110
  it("aCsvStaysACsv: with --csv only the file is on standard output; the season named is said beside it", async () => {
    const said = await command(
      [
        "read_group_schedule",
        "--season",
        "Summer 2027",
        "--week",
        "Week 1",
        "--csv"
      ],
      200,
      "week,group\nWeek 1,Bunk 1"
    );
    expect(said.code).toBe(0);
    expect(said.out).toBe("week,group\nWeek 1,Bunk 1\n");
    expect(said.err).toBe("Season used: Summer 2027.\n");
  });

  // API-1.111
  it("exitSaysDoneRefusedOrAsksFirst: 0 done, 3 asks first, 2 refused, 1 couldn't ask", async () => {
    const week = ["--season", "S", "--week", "Week 1"];
    expect(
      (await command(["unpublish_week", ...week], 200, '{"message":"Done."}'))
        .code
    ).toBe(0);
    const preview = await command(
      ["delete_version", ...week, "--version", "Try 2"],
      200,
      JSON.stringify({ message: PREVIEW })
    );
    expect(preview.code).toBe(3);
    expect(preview.out).toBe(`${PREVIEW}\nSeason used: S.\n`);
    expect(
      (await command(["unpublish_week", ...week], 409, '{"message":"No."}'))
        .code
    ).toBe(2);
    expect(
      (await command(["unpublish_week", "--org", "-x"], 200, "{}")).code
    ).toBe(1);
    expect(EXIT).toEqual({ done: 0, couldNotAsk: 1, refused: 2, asksFirst: 3 });
    // The ask-first answer's opening is Shoresh's own.
    expect(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../force-app/main/default/classes/AgentAskFirst.cls"
        ),
        "utf8"
      )
    ).toContain(`NOT_YET = '${NOT_YET}'`);
  });

  // API-1.112
  it("confirmOnlyAsTyped: the confirm goes only when typed, unchanged, and the command line asks once", async () => {
    const seen = [];
    await command(
      ["delete_version", "--week", "Week 1", "--version", "Try 2"],
      200,
      JSON.stringify({ message: PREVIEW }),
      seen
    );
    const sent = seen.filter((s) =>
      s.args[3].startsWith("/services/apexrest/")
    );
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].stdin).confirm).toBeUndefined();
    const again = [];
    await command(
      [
        "delete_version",
        "--week",
        "Week 1",
        "--version",
        "Try 2",
        "--confirm",
        "abc123"
      ],
      200,
      '{"message":"Deleted."}',
      again
    );
    expect(JSON.parse(again[0].stdin).confirm).toBe("abc123");
  });

  // API-1.113
  it("printsNoSignIn: only Shoresh's answer is printed, never sf's headers or a sign-in", async () => {
    const said = await command(
      ["unpublish_week", "--week", "Week 1"],
      200,
      '{"message":"Done."}'
    );
    expect(said.out + said.err).not.toMatch(
      /SECRET|sid=|login\.salesforce|frontdoor/
    );
    const out = [];
    const err = [];
    const code = await main(
      ["unpublish_week", "--org", "camp"],
      {},
      { write: (t) => out.push(t) },
      { write: (t) => err.push(t) },
      (name, input, options) =>
        call(name, input, {
          ...options,
          run: async () =>
            "Error (NamedOrgNotFoundError): No authorization information found for camp."
        })
    );
    expect(code).toBe(1);
    expect(err.join("")).toBe(
      'Couldn\'t reach Salesforce as "camp". Sign in once with: sf org login web --alias camp\n'
    );
    expect(err.join("")).not.toMatch(/https?:/);
  });
});

describe("Code mode", () => {
  const code = require("../code");

  // API-1.114
  it("codeModeAnswersWhatMcpSays: plain values in, the answer MCP's lines are made from out", async () => {
    const seen = [];
    const body = JSON.stringify({ message: "Copied.", season: "Summer 2026" });
    const said = await code.add_setup_record(
      { kind: "location", name: "Pool", fields: { type: "Water" } },
      { run: sfAnswering(200, body, seen) }
    );
    const sent = seen.filter((s) =>
      s.args[3].startsWith("/services/apexrest/")
    );
    expect(JSON.parse(sent[0].stdin).fields).toEqual({ type: "Water" });
    expect(said.season).toBe("Summer 2026");
    const mcp = toolResult(said);
    expect(mcp.content.map((c) => c.text)).toEqual([
      said.text,
      "Season used: Summer 2026."
    ]);
    expect(mcp.isError).toBe(!said.ok);
    const refused = await code.unpublish_week(
      { week: "Week 1" },
      { run: sfAnswering(409, '{"message":"No."}') }
    );
    expect(refused.ok).toBe(false);
    expect(refused.text.endsWith(PERSON_DECIDES)).toBe(true);
  });

  // API-1.115
  it("codeModeTellsAPreviewFromDone: asksFirst only when Shoresh did nothing yet", async () => {
    const preview = await code.delete_version(
      { week: "Week 1", version: "Try 2" },
      { run: sfAnswering(200, JSON.stringify({ message: PREVIEW })) }
    );
    expect(preview).toMatchObject({ ok: true, asksFirst: true, text: PREVIEW });
    const done = await code.delete_version(
      { week: "Week 1", version: "Try 2", confirm: "abc123" },
      { run: sfAnswering(200, '{"message":"Deleted."}') }
    );
    expect(done.asksFirst).toBeUndefined();
  });

  // API-1.116
  it("codeModeNeverConfirmsOnItsOwn: a preview is answered once, with no confirm added", async () => {
    const seen = [];
    await code.delete_version(
      { week: "Week 1", version: "Try 2" },
      { run: sfAnswering(200, JSON.stringify({ message: PREVIEW }), seen) }
    );
    const sent = seen.filter((s) =>
      s.args[3].startsWith("/services/apexrest/")
    );
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0].stdin)).not.toHaveProperty("confirm");
  });
});
