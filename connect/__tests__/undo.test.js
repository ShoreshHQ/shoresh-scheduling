/**
 * Every action's web address has its Apex class; no class keeps a version of its own for an AI
 * change (API-1.148); and an action whose description promises undo_last_agent_change is one the
 * screen undoes: a hand edit or a build (API-1.14). Reads the Apex source; no Salesforce here.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES, byName } = require("../capabilities");

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

// What a description says when undo_last_agent_change is that action's Undo.
const PROMISES_UNDO =
  /undo_last_agent_change (takes it back|switches the day back|brings it back)/i;

describe("actions and their Apex", () => {
  it.each(CAPABILITIES.map((capability) => [capability.name, capability]))(
    "%s has a class at its web address",
    (name, capability) => {
      expect(atAddress.get(capability.api)).toBeDefined();
    }
  );

  // API-1.148: an AI change leaves exactly what the screen leaves, so no class keeps a version of
  // its own (the old "Through an agent" mark) or saves anything for Undo in Salesforce.
  it.each([...sources.keys()].map((name) => [name]))(
    "API-1.148: %s keeps no version marked Through an agent",
    (name) => {
      expect(sources.get(name)).not.toMatch(
        /ThroughAgent|THROUGH_AGENT|keepBefore/
      );
    }
  );

  const undone = CAPABILITIES.filter((capability) =>
    PROMISES_UNDO.test(capability.description)
  );

  it("finds the actions that promise an Undo", () => {
    expect(undone.map((capability) => capability.name)).toEqual(
      expect.arrayContaining([
        "change_schedule_cell",
        "move_cell",
        "place_special_event",
        "switch_to_rain_plans",
        "build_week",
        "start_over_week"
      ])
    );
  });

  // API-1.14: the screen's Undo is a hand edit's runs back (worked out by the connector, which
  // holds them) or a build's version; what promises an Undo is one of those.
  it.each(undone.map((capability) => [capability.name, capability]))(
    "%s is a hand edit the connector holds the runs back of, or a build",
    (name, capability) => {
      expect(
        Boolean(capability.editsWithEngine || capability.buildsWithEngine)
      ).toBe(true);
    }
  );

  // As on the screen, these have no Undo, and their descriptions don't promise one.
  it.each(
    [
      "try_another_option",
      "bring_back_option",
      "fill_open_cells",
      "set_up_noted_item",
      "update_to_match_setup"
    ].map((name) => [name])
  )("%s promises no Undo, as the screen offers none", (name) => {
    expect(byName(name).description).not.toMatch(PROMISES_UNDO);
    expect(byName(name).description).toMatch(/no Undo/);
  });

  // API-1.106: Shoresh, not the description, makes the AI ask first. Every action that takes
  // something away for good is an Apex class that asks first (AgentAskFirst.Preview), and its
  // description and fields say so; no class asks first behind an action that doesn't say it.
  const ASKING = new Set(
    [...sources]
      .filter(([, source]) =>
        /implements[^{]*AgentAskFirst\.Preview/.test(source)
      )
      .map(([name]) => name)
  );

  it.each(
    [
      "delete_setup_record",
      "delete_version",
      "merge_locations",
      "undo_last_agent_change",
      "undo_import",
      "forget_learned_answer",
      "forget_learned_pattern",
      "finalize_electives",
      "clear_electives",
      "copy_season",
      "change_special_schedule_frame",
      "assign_elective_seats",
      // API-1.147: only a fixed activity over a recurring one asks.
      "add_setup_record",
      "change_setup_record"
    ].map((name) => [name])
  )("API-1.106: %s asks first, enforced by its Apex", (name) => {
    const capability = CAPABILITIES.find((each) => each.name === name);
    expect(capability.asksFirst).toBe(true);
    expect(ASKING.has(atAddress.get(capability.api))).toBe(true);
    expect(capability.inputSchema.properties.confirm).toBeDefined();
    expect(capability.description).toMatch(/Shoresh asks first/);
    expect(capability.description).not.toMatch(/without asking first/);
  });

  it("API-1.106: every Apex class that asks first is an action that says so", () => {
    const saying = new Set(
      CAPABILITIES.filter((each) => each.asksFirst).map((each) =>
        atAddress.get(each.api)
      )
    );
    expect([...ASKING].sort()).toEqual([...saying].sort());
  });
});
