/**
 * scripts/run-apex-tests.mjs against a pretend org: a fake `sf` on the PATH (login only) and a
 * mock Tooling API. Nothing here touches a real org.
 */
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

// Each test starts a Node process; give it room when the machine is busy.
jest.setTimeout(30000);

const SCRIPT = path.resolve(__dirname, "..", "run-apex-tests.mjs");
const CLASSES = ["AlphaTest", "BetaTest"];

let server;
let port;
let work;
let calls;
let behave;

const reply = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** What a passing class returns from runTestsSynchronous. */
const passed = (name, tests = 2) => ({
  numTestsRun: tests,
  numFailures: 0,
  failures: [],
  successes: [{ id: `id-${name}`, name, methodName: "works" }]
});

beforeAll((done) => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const url = decodeURIComponent(req.url);
      calls.push({ url, auth: req.headers.authorization, body });
      if (req.headers.authorization !== "Bearer good-token") {
        return reply(res, 401, [
          { errorCode: "INVALID_SESSION_ID", message: "Session expired" }
        ]);
      }
      if (url.includes("runTestsSynchronous")) {
        return behave.run(JSON.parse(body).tests[0].className, res);
      }
      if (url.includes("FROM ApexCodeCoverage WHERE")) {
        return reply(res, 200, {
          done: true,
          records: behave.perTest ?? [{ ApexClassOrTriggerId: "code-1" }]
        });
      }
      return reply(res, 200, {
        done: true,
        records: [
          {
            ApexClassOrTriggerId: "code-1",
            ApexClassOrTrigger: { Name: "Widget" },
            Coverage: { coveredLines: [1, 2, 3, 4], uncoveredLines: [5] }
          }
        ]
      });
    });
  });
  server.listen(0, "127.0.0.1", () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  server.closeAllConnections();
  server.close(done);
});

beforeEach(() => {
  calls = [];
  behave = { run: (name, res) => reply(res, 200, passed(name)) };
  work = fs.mkdtempSync(path.join(os.tmpdir(), "run-apex-tests-"));
  const classes = path.join(work, "force-app", "main", "default", "classes");
  fs.mkdirSync(classes, { recursive: true });
  CLASSES.forEach((name) =>
    fs.writeFileSync(
      path.join(classes, `${name}.cls`),
      `@IsTest\nprivate class ${name} {\n  @IsTest static void works() {}\n}\n`
    )
  );
  fs.writeFileSync(
    path.join(classes, "Widget.cls"),
    "public class Widget {\n  public void a() {\n    b();\n  }\n}\n"
  );
  fs.writeFileSync(
    path.join(work, "sfdx-project.json"),
    JSON.stringify({ sourceApiVersion: "67.0" })
  );
  // The fake CLI: `org display` hides the token as the real one does; `show-access-token` gives
  // it (the first time a stale one when STALE_FIRST is set, to test a re-login).
  const bin = path.join(work, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "sf"),
    `#!/bin/sh
case "$*" in
  *"org display"*) echo '{"result":{"accessToken":"[REDACTED]","instanceUrl":"http://127.0.0.1:'"$PORT"'"}}' ;;
  *"show-access-token"*)
    if [ -n "$STALE_FIRST" ] && [ ! -f "$STALE_FIRST" ]; then
      touch "$STALE_FIRST"; echo '{"result":{"accessToken":"stale-token"}}'
    else echo '{"result":{"accessToken":"good-token"}}'; fi ;;
  *) echo '{"message":"unexpected"}'; exit 1 ;;
esac
`,
    { mode: 0o755 }
  );
});

afterEach(() => fs.rmSync(work, { recursive: true, force: true }));

/** Runs the script in the temp project; resolves { code, out }. */
const run = (extraEnv = {}) =>
  new Promise((resolve) => {
    const child = spawn("node", [SCRIPT], {
      cwd: work,
      env: {
        ...process.env,
        PATH: `${path.join(work, "bin")}:${process.env.PATH}`,
        PORT: String(port),
        ...extraEnv
      }
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
  });

const runCalls = () =>
  calls.filter((c) => c.url.includes("runTestsSynchronous"));

describe("run-apex-tests.mjs", () => {
  it("runs each class once, on its own, synchronously, and passes", async () => {
    const { code, out } = await run();
    expect(out).toContain("2/2 classes passed");
    expect(code).toBe(0);
    const sent = runCalls().map((c) => JSON.parse(c.body));
    expect(sent.map((s) => s.tests)).toEqual([
      [{ className: "AlphaTest" }],
      [{ className: "BetaTest" }]
    ]);
    // Only the synchronous endpoint is used, never an async test run.
    expect(
      calls.some((c) => /runTestsAsynchronous|\/runTests\b/.test(c.url))
    ).toBe(false);
    // The token never reaches the output.
    expect(out).not.toContain("good-token");
  });

  it("fails the run when a test method fails", async () => {
    behave.run = (name, res) =>
      name === "BetaTest"
        ? reply(res, 200, {
            numTestsRun: 2,
            numFailures: 1,
            failures: [
              {
                id: "id-b",
                name,
                methodName: "breaks",
                message: "Expected 1, got 2"
              }
            ],
            successes: []
          })
        : reply(res, 200, passed(name));
    const { code, out } = await run();
    expect(code).toBe(1);
    expect(out).toContain("FAIL  BetaTest");
    expect(out).toContain("breaks: Expected 1, got 2");
  });

  it("fails the run when a class does not compile", async () => {
    behave.run = (name, res) =>
      reply(res, 400, [
        { errorCode: "INVALID_INPUT", message: "Compile error in AlphaTest" }
      ]);
    const { code, out } = await run();
    expect(code).toBe(1);
    expect(out).toContain("could not run");
    expect(out).toContain("Compile error in AlphaTest");
  });

  it("fails the run when a class runs no tests", async () => {
    behave.run = (name, res) =>
      reply(res, 200, {
        numTestsRun: 0,
        numFailures: 0,
        failures: [],
        successes: []
      });
    const { code, out } = await run();
    expect(code).toBe(1);
    expect(out).toContain("no tests ran");
  });

  it("logs in again once when the session is refused", async () => {
    const marker = path.join(work, "stale-marker");
    const { code } = await run({ STALE_FIRST: marker });
    expect(code).toBe(0);
    const auths = runCalls().map((c) => c.auth);
    expect(auths[0]).toBe("Bearer stale-token");
    expect(auths.slice(1).every((a) => a === "Bearer good-token")).toBe(true);
  });

  it("fails when coverage is below 75%", async () => {
    fs.writeFileSync(
      path.join(work, "force-app", "main", "default", "classes", "Other.cls"),
      "public class Other {\n  public void a() {\n    b();\n    c();\n    d();\n    e();\n  }\n}\n"
    );
    const { code, out } = await run();
    expect(code).toBe(1);
    expect(out).toContain("Not run by any test");
  });

  it("uses the aggregate totals when the org keeps no per-test coverage", async () => {
    behave.perTest = [];
    const { code, out } = await run();
    expect(out).toContain("Coverage of this repository's Apex: 80%");
    expect(code).toBe(0);
  });

  it("stops with a clear message when there is no login", async () => {
    fs.writeFileSync(
      path.join(work, "bin", "sf"),
      '#!/bin/sh\necho \'{"message":"No authorization found"}\'; exit 1\n',
      { mode: 0o755 }
    );
    const { code, out } = await run();
    expect(code).toBe(1);
    expect(out).toContain("Could not reach the test org");
  });
});
