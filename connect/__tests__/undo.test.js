/**
 * Every action's web address has its Apex class, and an action whose description tells the AI to
 * undo it with undo_last_agent_change keeps the week before it changes it (AgentWeeks.keepBefore),
 * so that Undo has something to bring back. Reads the Apex source; no Salesforce here.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES } = require("../capabilities");

const CLASSES = path.join(__dirname, "../../force-app/main/default/classes");

// Each class's source, without its tests.
const sources = new Map(
  fs
    .readdirSync(CLASSES)
    .filter((file) => file.endsWith(".cls") && !file.endsWith("Test.cls"))
    .map((file) => [
      file.slice(0, -4),
      fs.readFileSync(path.join(CLASSES, file), "utf8")
    ])
);

// The class at each web address (/v1/<api>).
const atAddress = new Map();
for (const [name, source] of sources) {
  const mapping = /urlMapping='\/v1\/([^'/*]+)'/.exec(source);
  if (mapping) atAddress.set(mapping[1], name);
}

// The class and every class it uses, so a thin address shell counts what its verb does.
function reached(start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const words = sources.get(queue.shift()).match(/\b[A-Z]\w+\b/g) || [];
    for (const word of words) {
      if (sources.has(word) && !seen.has(word)) {
        seen.add(word);
        queue.push(word);
      }
    }
  }
  return seen;
}

const keepsBefore = (name) =>
  [...reached(name)].some((each) =>
    sources.get(each).includes("AgentWeeks.keepBefore(")
  );

// What a description says when undo_last_agent_change is that action's undo.
const PROMISES_UNDO =
  /undo it with undo_last_agent_change|undo_last_agent_change brings/i;

describe("actions and their Apex", () => {
  it.each(CAPABILITIES.map((capability) => [capability.name, capability]))(
    "%s has a class at its web address",
    (name, capability) => {
      expect(atAddress.get(capability.api)).toBeDefined();
    }
  );

  const undone = CAPABILITIES.filter((capability) =>
    PROMISES_UNDO.test(capability.description)
  );

  it("finds the actions that promise an Undo", () => {
    expect(undone.map((capability) => capability.name)).toEqual(
      expect.arrayContaining(["move_cell", "place_special_event"])
    );
  });

  it.each(undone.map((capability) => [capability.name, capability]))(
    "%s keeps the week before it changes it, so undo_last_agent_change can bring it back",
    (name, capability) => {
      expect(keepsBefore(atAddress.get(capability.api))).toBe(true);
    }
  );
});
