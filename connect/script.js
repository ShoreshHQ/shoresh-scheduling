/**
 * Code mode for an AI in a chat (API-1.118 to API-1.122): the AI writes one short script that makes
 * many calls, and the connector runs it on the person's computer as the person, with nothing but
 * Shoresh's own actions in reach. The script runs in a worker thread (so a time limit can always
 * stop it) inside a Node vm context that holds only `shoresh` (one async function per action, the
 * same names, inputs and answers as the MCP tools) and `print`. Node's vm is not a security
 * boundary; the script runs with the person's own access on their own computer, as the command
 * line does, so the aim is that nothing beyond Shoresh is reachable by accident.
 */
const {
  Worker,
  isMainThread,
  parentPort,
  workerData
} = require("worker_threads");
const { CAPABILITIES } = require("./capabilities");

const NAME = "run_shoresh_script";
const TIME_LIMIT_MS = 120000;
const CALL_LIMIT = 40;

/** One action as a line of the function list: its name, its fields (? when optional), what it does. */
function signature({ name, description, inputSchema }) {
  const required = new Set(inputSchema?.required ?? []);
  const fields = Object.keys(inputSchema?.properties ?? {}).map((f) =>
    required.has(f) ? f : `${f}?`
  );
  const first = String(description).split(/(?<=\.)\s/)[0];
  return `- shoresh.${name}({ ${fields.join(", ")} }): ${first}`;
}

/** The tool an AI sees; its function list comes from the one description of every action (API-1.18). */
function scriptTool(actions = CAPABILITIES) {
  return {
    name: NAME,
    description: [
      "Runs one short JavaScript script that makes many calls to Shoresh at once, on the person's computer, as the person. Use it instead of calling tools one at a time when a task needs several calls (read many weeks, change many cells).",
      "The script is the body of an async function. It can use only `shoresh` and `print(...)`, and `return` a value; nothing else (no require, process, files, network or timers).",
      `Each call answers { ok, status, text, season, asksFirst } exactly as its own tool would, and has the same fields as that tool (read the tool's own description for them). At most ${CALL_LIMIT} calls and ${TIME_LIMIT_MS / 1000} seconds per script.`,
      "A refusal (ok false) is for the person to decide: don't change anything to work around it. An answer with asksFirst true did nothing yet: show its text to the person and send its confirm only after they say yes. The answer lists every call the script made, in order, with what each answered.",
      'Example: const r = await shoresh.read_group_schedule({ week: "Week 1" }); print(r.text);',
      "Functions:",
      ...actions.map(signature)
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description:
            "The script: the body of an async function using only shoresh and print."
        }
      },
      required: ["script"]
    }
  };
}

/**
 * Runs the script; `callAction(name, input)` answers { answer, lines }: what the script is given
 * back and the lines its MCP tool answers. Answers { ok, text }, text listing every call in order.
 */
async function runScript(
  script,
  {
    callAction,
    timeLimitMs = TIME_LIMIT_MS,
    callLimit = CALL_LIMIT,
    names = CAPABILITIES.map((c) => c.name)
  }
) {
  if (typeof script !== "string" || !script.trim()) {
    return { ok: false, text: "No script was given." };
  }
  const calls = [];
  const printed = [];
  const inFlight = [];
  let stopped = false;
  const worker = new Worker(__filename, { workerData: { script, names } });
  const finished = new Promise((resolve) => {
    worker.on("message", (m) => {
      if (m.kind === "print") printed.push(m.text);
      else if (m.kind === "done") resolve({ ok: true, value: m.value });
      else if (m.kind === "error") resolve({ ok: false, why: m.text });
      else if (m.kind === "call") {
        if (stopped) return;
        if (calls.length >= callLimit) {
          worker.postMessage({
            id: m.id,
            error: `A script may make at most ${callLimit} calls; this call was not made.`
          });
          return;
        }
        let input;
        try {
          input = JSON.parse(m.input ?? "{}") ?? {};
        } catch {
          input = {};
        }
        const entry = { name: m.name, input, lines: null };
        calls.push(entry);
        const p = Promise.resolve()
          .then(() => callAction(m.name, input))
          .then(
            ({ answer, lines }) => {
              entry.lines = lines;
              if (!stopped)
                worker.postMessage({
                  id: m.id,
                  answer: JSON.stringify(answer)
                });
            },
            (e) => {
              entry.lines = [e.message];
              if (!stopped)
                worker.postMessage({
                  id: m.id,
                  answer: JSON.stringify({ ok: false, text: e.message })
                });
            }
          );
        inFlight.push(p);
      }
    });
    worker.on("error", (e) => resolve({ ok: false, why: e.message }));
    worker.on("exit", () =>
      resolve({ ok: false, why: "The script stopped before it finished." })
    );
  });
  let timer;
  const outOfTime = new Promise((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          ok: false,
          why: `The script ran out of time (${timeLimitMs / 1000} seconds) and was stopped.`
        }),
      timeLimitMs
    );
  });
  const end = await Promise.race([finished, outOfTime]);
  clearTimeout(timer);
  stopped = true;
  await worker.terminate();
  // A call already sent still finishes in Shoresh: say what it answered.
  await Promise.all(inFlight);
  return { ok: end.ok, text: answerText(calls, printed, end) };
}

function answerText(calls, printed, end) {
  const out = [
    calls.length
      ? `The script made ${calls.length} call${calls.length === 1 ? "" : "s"} to Shoresh, in this order:`
      : "The script made no calls to Shoresh."
  ];
  calls.forEach(({ name, input, lines }, i) => {
    out.push(
      `${i + 1}. ${name} ${JSON.stringify(input)}`,
      ...(lines ?? ["(no answer)"])
    );
  });
  if (printed.length) out.push("Printed:", ...printed);
  if (end.ok) {
    if (end.value !== undefined) out.push(`Returned: ${end.value}`);
  } else {
    out.push(`The script didn't finish: ${end.why}`);
  }
  return out.join("\n");
}

/** Inside the worker: the script in a context holding only shoresh and print. */
function inWorker() {
  const vm = require("vm");
  const { script, names } = workerData;
  const waiting = new Map();
  let next = 0;
  parentPort.on("message", ({ id, answer, error }) => {
    const w = waiting.get(id);
    waiting.delete(id);
    if (w) error ? w.reject(error) : w.resolve(answer);
  });
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false }
  });
  // The bridges are taken into the context's own closures and removed from its globals, and only
  // text crosses them, so nothing the script holds leads back to the worker's own functions.
  context.__call = (name, input) =>
    new Promise((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      parentPort.postMessage({ kind: "call", id, name, input });
    });
  context.__print = (text) => parentPort.postMessage({ kind: "print", text });
  context.__names = JSON.stringify(names);
  const { shoresh, print, text } = vm.runInContext(
    `(() => {
      const call = __call, say = __print, names = JSON.parse(__names);
      delete globalThis.__call; delete globalThis.__print; delete globalThis.__names;
      const text = (v) => typeof v === "string" ? v : JSON.stringify(v);
      const shoresh = Object.create(null);
      for (const name of names) {
        shoresh[name] = (input) => new Promise((resolve, reject) => {
          call(name, JSON.stringify(input ?? {})).then(
            (a) => resolve(JSON.parse(a)),
            (e) => reject(new Error(String(e)))
          );
        });
      }
      Object.freeze(shoresh);
      const print = (...parts) => { say(parts.map(text).join(" ")); };
      return { shoresh, print, text };
    })()`,
    context
  );
  // Compiled into the context's realm: its globals are the context's, not the worker's.
  let fn;
  try {
    fn = vm.compileFunction(
      `return (async () => {\n${script}\n})();`,
      ["shoresh", "print"],
      {
        parsingContext: context
      }
    );
  } catch (e) {
    parentPort.postMessage({
      kind: "error",
      text: `The script can't be read: ${e.message}`
    });
    return;
  }
  Promise.resolve()
    .then(() => fn(shoresh, print))
    .then(
      (value) =>
        parentPort.postMessage({
          kind: "done",
          value: value === undefined ? undefined : text(value)
        }),
      (e) =>
        parentPort.postMessage({
          kind: "error",
          text: `The script stopped with an error: ${e?.message ?? String(e)}`
        })
    );
}

if (!isMainThread && workerData?.script !== undefined) inWorker();

module.exports = {
  NAME,
  TIME_LIMIT_MS,
  CALL_LIMIT,
  scriptTool,
  runScript,
  signature
};
