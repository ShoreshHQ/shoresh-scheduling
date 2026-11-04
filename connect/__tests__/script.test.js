/**
 * Code mode for an AI in a chat: run_shoresh_script (docs/protocol/api.md, API-1.118 to API-1.122).
 */
const { handle } = require("../mcp");
const { CAPABILITIES } = require("../capabilities");
const { scriptTool, signature, runScript } = require("../script");
const { PERSON_DECIDES } = require("../client");

const PREVIEW =
  "Nothing has been done yet. Delete Try 2 from Week 1? Show this to the person; send confirm abc123 when they say yes.";

/** Shoresh as a stub: what each call is answered, and the calls it was asked. */
function shoresh(asked = []) {
  return async (name, input) => {
    asked.push({ name, input });
    if (name === "unpublish_week")
      return { ok: false, status: 409, text: "Week 1 isn't published." };
    if (name === "delete_version") {
      return input.confirm === "abc123"
        ? { ok: true, status: 200, text: "Deleted Try 2." }
        : { ok: true, status: 200, text: PREVIEW, asksFirst: true };
    }
    return {
      ok: true,
      status: 200,
      text: `${name} for ${input.week ?? "the camp"}`,
      season: "Summer 2026"
    };
  };
}

let id = 0;
async function tool(name, args, callFn) {
  const said = await handle(
    {
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name, arguments: args }
    },
    { callFn, log: () => {} }
  );
  return said.result;
}
const lines = (result) => result.content.map((c) => c.text);
const runs = (script, callFn = shoresh()) =>
  tool("run_shoresh_script", { script }, callFn);

describe("Code mode for an AI: run_shoresh_script", () => {
  // API-1.118
  it("sandboxHasNothingElse: a script reaches only shoresh and print, never require, process, the network, timers or new code", async () => {
    const seen = await runs(
      "return [typeof require, typeof process, typeof fetch, typeof setTimeout, typeof module, typeof globalThis.shoresh].join(',')"
    );
    expect(lines(seen)[0]).toMatch(
      /Returned: undefined,undefined,undefined,undefined,undefined,undefined/
    );
    for (const reach of [
      'require("fs")',
      "process.exit(1)",
      'await fetch("https://example.com")',
      'eval("1")',
      'shoresh.list_seasons.constructor("return process")()',
      '(await shoresh.list_seasons({})).constructor.constructor("return process")()'
    ]) {
      const said = await runs(reach);
      expect(said.isError).toBe(true);
      expect(lines(said)[0]).toMatch(
        /The script didn't finish: The script stopped with an error: /
      );
    }
  });

  // API-1.119
  it("descriptionFromActions: the tool's function list is every action's line, made from ACTIONS", async () => {
    const listed = await handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    });
    const tool = listed.result.tools.find(
      (t) => t.name === "run_shoresh_script"
    );
    expect(tool).toEqual(scriptTool(CAPABILITIES));
    for (const action of CAPABILITIES) {
      expect(tool.description).toContain(signature(action));
    }
    expect(
      signature(CAPABILITIES.find((c) => c.name === "read_group_schedule"))
    ).toMatch(/^- shoresh\.read_group_schedule\(\{ .*week.* \}\): /);
  });

  // API-1.120
  it("answersAsOneByOne: each call the script makes is answered with the lines the same tool call answers", async () => {
    const script = `
      const a = await shoresh.read_group_schedule({ week: "Week 1" });
      const b = await shoresh.unpublish_week({ week: "Week 1" });
      return { a: a.ok, season: a.season, b: b.ok, refused: b.text };`;
    const said = await runs(script);
    const one = await tool(
      "read_group_schedule",
      { week: "Week 1" },
      shoresh()
    );
    const two = await tool("unpublish_week", { week: "Week 1" }, shoresh());
    expect(lines(said)[0]).toBe(
      [
        "The script made 2 calls to Shoresh, in this order:",
        '1. read_group_schedule {"week":"Week 1"}',
        ...lines(one),
        '2. unpublish_week {"week":"Week 1"}',
        ...lines(two),
        `Returned: ${JSON.stringify({
          a: true,
          season: "Summer 2026",
          b: false,
          refused: `Week 1 isn't published. ${PERSON_DECIDES}`
        })}`
      ].join("\n")
    );
    expect(lines(one)).toContain("Season used: Summer 2026.");
    expect(said.isError).toBe(false);
  });

  // API-1.121
  it("timeAndCallLimits: a script stops at its call limit and its time limit, even in an endless loop, and says what it did", async () => {
    const asked = [];
    const many = await runScript("for (;;) await shoresh.list_seasons({});", {
      callLimit: 3,
      callAction: async (name, input) => {
        asked.push(name);
        return { answer: { ok: true, text: "ok" }, lines: ["ok"] };
      }
    });
    expect(asked).toHaveLength(3);
    expect(many.ok).toBe(false);
    expect(many.text).toMatch(/at most 3 calls; this call was not made/);
    const endless = await runScript(
      "await shoresh.list_seasons({}); while (true) {}",
      {
        timeLimitMs: 500,
        callAction: async () => ({
          answer: { ok: true, text: "ok" },
          lines: ["Seasons."]
        })
      }
    );
    expect(endless.ok).toBe(false);
    expect(endless.text).toContain("1. list_seasons {}\nSeasons.");
    expect(endless.text).toMatch(/ran out of time/);
  });

  // API-1.122
  it("askFirstAndErrorsArePlain: a preview's text is in the answer with no confirm added, a confirm the script got may be sent, errors are said plainly", async () => {
    const asked = [];
    const said = await runs(
      `const p = await shoresh.delete_version({ week: "Week 1", version: "Try 2" });
       return p.asksFirst;`,
      shoresh(asked)
    );
    expect(lines(said)[0]).toContain(PREVIEW);
    expect(lines(said)[0]).toMatch(/Returned: true$/);
    expect(asked).toEqual([
      { name: "delete_version", input: { week: "Week 1", version: "Try 2" } }
    ]);
    const sent = await runs(
      `await shoresh.delete_version({ week: "Week 1", version: "Try 2", confirm: "abc123" });`
    );
    expect(lines(sent)[0]).toContain("Deleted Try 2.");
    expect(lines(await runs("this is not ("))[0]).toMatch(
      /^The script made no calls to Shoresh\.\nThe script didn't finish: The script can't be read: /
    );
    expect(lines(await runs('throw new Error("no week 9")'))[0]).toMatch(
      /stopped with an error: no week 9$/
    );
    expect(lines(await runs("await shoresh.no_such_thing({})"))[0]).toMatch(
      /stopped with an error: shoresh\.no_such_thing is not a function/
    );
    expect((await runs("")).isError).toBe(true);
  });
});
