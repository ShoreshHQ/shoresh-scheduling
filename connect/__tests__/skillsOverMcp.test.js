/**
 * The Shoresh skill served over MCP's Skills extension (io.modelcontextprotocol/skills,
 * API-1.164): skills/list, skills/get and skill:// reads under 2026-07-28 only, from the files
 * shipped; 2025-06-18's answers unchanged. No Salesforce here.
 */
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const yaml = require("js-yaml");
const { handle, tools } = require("../mcp");
const skills = require("../skills");
const { TO, skillFiles } = require("../../scripts/build-connect");

const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28" };
const URI = "skill://shoresh-camp-scheduling/SKILL.md";
const SKILL_DIR = path.join(__dirname, "../skill/shoresh-camp-scheduling");
const quiet = { log: () => {} };
const ask = (method, params = {}, id = 1) =>
  handle({ jsonrpc: "2.0", id, method, params }, quiet);
const modern = (method, params = {}) => ask(method, { ...params, _meta: META });
const sha = (bytes) =>
  `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;

/** Every file in the skill folder, its path from the folder, "/" between. */
function filesIn(dir, at = dir, out = []) {
  for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
    const full = path.join(at, entry.name);
    if (entry.isDirectory()) filesIn(dir, full, out);
    else out.push(path.relative(dir, full).split(path.sep).join("/"));
  }
  return out.sort();
}

/**
 * The connector run as Claude desktop runs it: each line sent waits for its answer, so a crash
 * shows as a request left unanswered.
 */
function connector() {
  const child = spawn(process.execPath, [path.join(__dirname, "../mcp.js")], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  let out = "";
  const waiting = [];
  const settle = () => {
    let end;
    while (waiting.length && (end = out.indexOf("\n")) >= 0) {
      const line = out.slice(0, end);
      out = out.slice(end + 1);
      waiting.shift().resolve(JSON.parse(line));
    }
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
    settle();
  });
  child.on("exit", (code) => {
    while (waiting.length) waiting.shift().reject(new Error(`exited ${code}`));
  });
  return {
    send: (line) =>
      new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        child.stdin.write(`${line}\n`);
        settle();
      }),
    stop: () => child.kill()
  };
}

afterEach(() => jest.restoreAllMocks());

// API-1.164
describe("the skill over MCP (API-1.164)", () => {
  it("theOldRevisionIsByteForByteAsBefore: initialize, tools/list and resources/list under 2025-06-18 are unchanged, and no skills method or skill:// read is answered", async () => {
    expect(
      JSON.stringify(
        await ask("initialize", { protocolVersion: "2025-06-18" }, 0)
      )
    ).toBe(
      // Pinned byte for byte; the only change since API-1.164 is the golden rules (API-1.165).
      '{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{},"resources":{},"extensions":{"io.modelcontextprotocol/ui":{}}},"serverInfo":{"name":"shoresh","version":"0.0.0"},"instructions":' +
        JSON.stringify(skills.goldenRules()) +
        "}}"
    );
    expect(JSON.stringify(await ask("tools/list", {}, 1))).toBe(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: tools() } })
    );
    expect(JSON.stringify(await ask("resources/list", {}, 2))).toBe(
      '{"jsonrpc":"2.0","id":2,"result":{"resources":[{"uri":"ui://shoresh/week-view.html","name":"Shoresh week","mimeType":"text/html;profile=mcp-app"}]}}'
    );
    expect((await ask("skills/list")).error.code).toBe(-32601);
    expect((await ask("skills/get", { uri: URI })).error.code).toBe(-32601);
    expect((await ask("resources/read", { uri: URI })).error.code).toBe(-32002);
  });

  it("discoverDeclaresSkills: server/discover declares resources and the skills extension, without directory reads", async () => {
    const init = await ask("initialize", {}, 0);
    const found = await modern("server/discover");
    expect(found.result.capabilities).toEqual({
      ...init.result.capabilities,
      resources: {},
      extensions: {
        ...init.result.capabilities.extensions,
        "io.modelcontextprotocol/skills": { directoryRead: false }
      }
    });
  });

  it("listsTheSkill: skills/list gives SKILL.md's URI, its header unchanged and every file with its digest and size, the same each time", async () => {
    const listed = await modern("skills/list");
    expect(Object.keys(listed.result).sort()).toEqual([
      "cacheScope",
      "resultType",
      "skills",
      "ttlMs"
    ]);
    expect(listed.result.resultType).toBe("complete");
    expect(listed.result.ttlMs).toBe(0);
    const [entry, ...others] = listed.result.skills;
    expect(others).toEqual([]);
    expect(entry.uri).toBe(URI);
    const text = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
    expect(entry.frontmatter).toEqual(
      yaml.load(/^---\n([\s\S]*?)\n---\n/.exec(text)[1])
    );
    expect(entry.frontmatter.name).toBe(URI.split("/")[2]);
    expect(entry.resources).toEqual(
      filesIn(SKILL_DIR).map((f) => {
        const bytes = fs.readFileSync(path.join(SKILL_DIR, f));
        return {
          uri: `skill://shoresh-camp-scheduling/${f}`,
          digest: sha(bytes),
          size: bytes.length
        };
      })
    );
    expect(entry.resources.length).toBeLessThanOrEqual(512);
    expect(await modern("skills/list")).toEqual(listed);
  });

  it("getsTheSkill: skills/get gives the same entry as the list, by SKILL.md's URI", async () => {
    const listed = await modern("skills/list");
    const got = await modern("skills/get", { uri: URI });
    expect(got.result).toEqual({
      resultType: "complete",
      skill: listed.result.skills[0],
      ttlMs: 0,
      cacheScope: "private"
    });
  });

  it("readsEachFile: resources/read gives every file the list names, as markdown, matching its digest and size", async () => {
    const [entry] = (await modern("skills/list")).result.skills;
    for (const { uri, digest, size } of entry.resources) {
      const read = await modern("resources/read", { uri });
      expect(read.result.resultType).toBe("complete");
      const [content, ...more] = read.result.contents;
      expect(more).toEqual([]);
      expect([content.uri, content.mimeType]).toEqual([uri, "text/markdown"]);
      const bytes = Buffer.from(content.text, "utf8");
      expect([uri, sha(bytes), bytes.length]).toEqual([uri, digest, size]);
    }
  });

  it("aSkillOrFileNotServedIsInvalidParams: an unknown skill, a file not in it, a path out of it, or no URI is -32602", async () => {
    for (const uri of [
      "skill://another-skill/SKILL.md",
      "skill://shoresh-camp-scheduling",
      "skill://shoresh-camp-scheduling/reference/nothing.md",
      "skill://shoresh-camp-scheduling/../mcp.js",
      undefined
    ]) {
      expect([uri, (await modern("skills/get", { uri })).error.code]).toEqual([
        uri,
        -32602
      ]);
    }
    for (const uri of [
      "skill://shoresh-camp-scheduling/reference/nothing.md",
      "skill://shoresh-camp-scheduling/../mcp.js",
      "skill://shoresh-camp-scheduling/reference",
      "skill://another-skill/SKILL.md"
    ]) {
      const read = await modern("resources/read", { uri });
      expect([uri, read.error.code]).toEqual([uri, -32602]);
      expect(read.error.message).toBe(`No skill is served at ${uri}`);
    }
  });

  it("aUriThatIsntTextIsInvalidParams: skills/get and resources/read refuse a uri that isn't a string with -32602, under either revision", async () => {
    for (const uri of [{ toString: 1 }, 7, ["skill://x"], null]) {
      expect((await modern("skills/get", { uri })).error.code).toBe(-32602);
      expect((await modern("resources/read", { uri })).error.code).toBe(-32602);
      expect((await ask("resources/read", { uri })).error.code).toBe(-32602);
    }
  });

  it("theConnectorStaysUp: a uri that isn't text, or a request that throws, is answered and the next ping is still answered", async () => {
    const c = connector();
    try {
      const bad = { uri: { toString: 1 }, _meta: META };
      for (const [id, method] of [
        [1, "skills/get"],
        [2, "resources/read"]
      ]) {
        const answer = await c.send(
          JSON.stringify({ jsonrpc: "2.0", id, method, params: bad })
        );
        expect([id, answer.error.code]).toEqual([id, -32602]);
        expect(
          await c.send(
            JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })
          )
        ).toEqual({ jsonrpc: "2.0", id: 9, result: {} });
      }
      // `null` is JSON that handle() throws on: answered -32603, and the connector carries on.
      const thrown = await c.send("null");
      expect(thrown).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Shoresh couldn't answer that." }
      });
      expect(
        await c.send(JSON.stringify({ jsonrpc: "2.0", id: 10, method: "ping" }))
      ).toEqual({ jsonrpc: "2.0", id: 10, result: {} });
    } finally {
      c.stop();
    }
  });

  it("aFileGoneIsInvalidParamsNotACrash: a skill file missing from disk is -32602, a file that can't be read -32603", async () => {
    const real = fs.readFileSync;
    const failing = (code) =>
      jest.spyOn(fs, "readFileSync").mockImplementation((file, ...rest) => {
        if (String(file).endsWith(`camp-words.md`)) {
          throw Object.assign(new Error(`${code}: ${file}`), { code });
        }
        return real(file, ...rest);
      });
    const uri = "skill://shoresh-camp-scheduling/reference/camp-words.md";
    failing("ENOENT");
    expect((await modern("resources/read", { uri })).error.code).toBe(-32602);
    expect((await modern("skills/get", { uri: URI })).error.code).toBe(-32602);
    jest.restoreAllMocks();
    failing("EACCES");
    expect((await modern("resources/read", { uri })).error.code).toBe(-32603);
    expect((await modern("skills/list")).error.code).toBe(-32603);
  });

  it("anUnreadableFileSaysNoPath: a file that can't be read is answered in fixed words, and nothing logged holds its path", async () => {
    const real = fs.readFileSync;
    const secret = "/Users/someone/Library/skill/reference/camp-words.md";
    jest.spyOn(fs, "readFileSync").mockImplementation((file, ...rest) => {
      if (String(file).endsWith("camp-words.md")) {
        throw Object.assign(
          new Error(`EACCES: permission denied, open '${secret}'`),
          { code: "EACCES" }
        );
      }
      return real(file, ...rest);
    });
    const logged = [];
    const uri = "skill://shoresh-camp-scheduling/reference/camp-words.md";
    for (const [method, params] of [
      ["resources/read", { uri }],
      ["skills/list", {}]
    ]) {
      const answer = await handle(
        {
          jsonrpc: "2.0",
          id: 1,
          method,
          params: { ...params, _meta: META }
        },
        { log: (line) => logged.push(line) }
      );
      expect(answer.error).toEqual({
        code: -32603,
        message: "The skill couldn't be read."
      });
    }
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain("someone");
      expect(line).not.toContain("camp-words");
    }
  });

  it("anUnreadableHeaderIsAnInternalError: a SKILL.md header the connector can't read is -32603, never a crash", async () => {
    const real = fs.readFileSync;
    jest
      .spyOn(fs, "readFileSync")
      .mockImplementation((file, ...rest) =>
        String(file).endsWith("SKILL.md")
          ? Buffer.from("# no header\n")
          : real(file, ...rest)
      );
    expect((await modern("skills/list")).error.code).toBe(-32603);
    expect((await modern("skills/get", { uri: URI })).error.code).toBe(-32603);
  });

  it("readsTheFlatCopiesTheSame: the static resource's flat skill.* copies give the same entries as connect/skill", () => {
    expect(skills.skills(TO)).toEqual(skills.skills());
    const header =
      "---\nname: made-up\ndescription: A made-up skill.\n---\n\nHi.\n";
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-skill-"));
    try {
      fs.writeFileSync(path.join(tmp, "skill.made-up.SKILL.md"), header);
      fs.writeFileSync(path.join(tmp, "skill.made-up.reference.a.md"), "A\n");
      fs.writeFileSync(path.join(tmp, "shoresh.js"), "");
      expect(skills.skills(tmp)).toEqual([
        {
          uri: "skill://made-up/SKILL.md",
          frontmatter: { name: "made-up", description: "A made-up skill." },
          resources: [
            {
              uri: "skill://made-up/SKILL.md",
              digest: sha(header),
              size: header.length
            },
            {
              uri: "skill://made-up/reference/a.md",
              digest: sha("A\n"),
              size: 2
            }
          ]
        }
      ]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("flatNamesComeBackWhole: no folder or file name in connect/skill has a dot but its extension's, so a flat copy names one file only", () => {
    for (const f of filesIn(path.join(__dirname, "../skill"))) {
      const parts = f.split("/");
      const file = parts.pop();
      expect([f, parts.every((p) => !p.includes("."))]).toEqual([f, true]);
      expect([f, file.split(".").length]).toEqual([f, 2]);
    }
  });

  it("onlyPlainMarkdownShips: the build refuses a skill file with another dot or no .md ending, and the repo listing skips files that aren't .md", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-skill-"));
    const put = (rel, text = "A\n") => {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel), text);
    };
    try {
      put(
        "skill/made-up/SKILL.md",
        "---\nname: made-up\ndescription: B.\n---\n"
      );
      put("skill/made-up/reference/a.md");
      expect(skillFiles(path.join(tmp, "skill"))).toEqual({
        "skill.made-up.SKILL.md": path.join(tmp, "skill/made-up/SKILL.md"),
        "skill.made-up.reference.a.md": path.join(
          tmp,
          "skill/made-up/reference/a.md"
        )
      });
      put("skill/made-up/.DS_Store");
      expect(skills.shippedFiles(tmp).map(([, f]) => f)).toEqual([
        "SKILL.md",
        "reference/a.md"
      ]);
      for (const bad of [
        ".DS_Store",
        "reference/notes.txt",
        "reference/a.b.md",
        "ref.x/c.md"
      ]) {
        const root = path.join(tmp, `case-${bad.replace(/\W/g, "_")}`);
        fs.mkdirSync(path.dirname(path.join(root, "made-up", bad)), {
          recursive: true
        });
        fs.writeFileSync(path.join(root, "made-up", bad), "A\n");
        expect(() => skillFiles(root)).toThrow(
          `Skill file made-up/${bad} can't ship`
        );
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("theHeaderReaderRefusesWhatItCantRead: quoted, literal or nested header values are refused, not misread", () => {
    expect(skills.frontmatter("---\nname: a\ndescription: b c\n---\n")).toEqual(
      { name: "a", description: "b c" }
    );
    for (const header of [
      'name: "a"',
      "description: |\n  a",
      "metadata:\n  a: b",
      "name: a # b"
    ]) {
      expect(() => skills.frontmatter(`---\n${header}\n---\n`)).toThrow();
    }
  });
});

// API-1.165
describe("the golden rules at startup (API-1.165)", () => {
  const START = "<!-- golden-rules:start";
  const END = "<!-- golden-rules:end -->";
  const skillText = () =>
    fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  /** The section between the markers, read here without the connector's own reader. */
  const marked = (text) => {
    const from = text.indexOf("\n", text.indexOf(START)) + 1;
    return text.slice(from, text.indexOf(END)).trim();
  };

  it("theMarkersAreThereOnce: SKILL.md marks its never-do-silently rules once, start before end", () => {
    const text = skillText();
    expect(text.split(START).length).toBe(2);
    expect(text.split(END).length).toBe(2);
    expect(text.indexOf(START)).toBeLessThan(text.indexOf(END));
    expect(marked(text)).toMatch(/^## Never do these silently\n/);
    expect(marked(text)).not.toMatch(/\n## /);
  });

  it("bothStartupAnswersSayTheGoldenRules: initialize and server/discover carry SKILL.md's marked section as instructions, word for word", async () => {
    const rules = marked(skillText());
    const init = await ask("initialize", { protocolVersion: "2025-06-18" }, 0);
    expect(init.result.instructions).toBe(rules);
    const found = await modern("server/discover");
    expect(found.result.instructions).toBe(rules);
    expect(skills.goldenRules(TO)).toBe(rules);
  });

  it("theRulesStayShort: under the 4,096 characters Claude Code keeps of a server's instructions", () => {
    expect(marked(skillText()).length).toBeLessThanOrEqual(4096);
  });

  it("theRulesFollowTheSkill: a changed section changes the instructions, and without markers the connector still starts", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-rules-"));
    const write = (text) =>
      fs.writeFileSync(
        path.join(tmp, "skill.shoresh-camp-scheduling.SKILL.md"),
        text
      );
    try {
      write(skillText().replace("out of sight", "out of view"));
      expect(skills.goldenRules(tmp)).toBe(
        marked(skillText()).replace("out of sight", "out of view")
      );
      write(skillText().replace(END, ""));
      expect(skills.goldenRules(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    jest.spyOn(skills, "goldenRules").mockReturnValue(null);
    expect(
      JSON.stringify(
        await ask("initialize", { protocolVersion: "2025-06-18" }, 0)
      )
    ).toBe(
      '{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{},"resources":{},"extensions":{"io.modelcontextprotocol/ui":{}}},"serverInfo":{"name":"shoresh","version":"0.0.0"}}}'
    );
  });
});

describe("a uri sent back (API-1.164)", () => {
  it("aUriCantAddLogLines: line breaks and other controls in a uri are dropped from the log and the answer", async () => {
    const lines = [];
    const uri = "skill://nothing/SKILL.md\nShoresh: made-up line\r\u0007\u2028";
    const answer = await handle(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "skills/get",
        params: { uri, _meta: META }
      },
      { log: (line) => lines.push(line) }
    );
    expect(answer.error.code).toBe(-32602);
    expect(answer.error.message).toBe(
      "No skill is served at skill://nothing/SKILL.mdShoresh: made-up line"
    );
    expect(lines).toEqual([
      "Shoresh: no skill file at skill://nothing/SKILL.mdShoresh: made-up line"
    ]);
    const page = await ask("resources/read", { uri: "ui://x\ny" });
    expect(page.error.message).toBe("No such page: ui://xy");
  });
});
