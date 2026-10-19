/**
 * Publish and Unpublish on the Generated Schedule screen (ADR 0010 "Publish"), as on Manual Build
 * (ADR 0008 part 5): a clean first publish goes at once; otherwise the box shows what changes and
 * what is still to do; Unpublish asks first; a week changed or published since publishes nothing.
 * Publish waits for builds, reads, hand edits and Lock, and they wait for it. One test per
 * connection, each failing if that connection is taken away. Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { find, editorRoot } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import previewPublish from "@salesforce/apex/GeneratedScheduleController.previewPublish";
import publish from "@salesforce/apex/GeneratedScheduleController.publish";
import unpublish from "@salesforce/apex/GeneratedScheduleController.unpublish";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { PROGRAM, SCHEDULE, SMALL, WEEK, WEEK_2, camp } from "./data/camp";
import { nextTurn } from "../pieces";

const apex = () => ({ default: jest.fn() });
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveWeek",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.setLocks",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveSlots",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.previewPublish",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.publish",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.unpublish",
  () => apex(),
  { virtual: true }
);

const SETUP = nsRecord({
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [{ Id: WEEK, Name: "Week 1" }],
  programs: [
    {
      program: { Id: PROGRAM, Name: "Main", Monday__c: true },
      divisions: [
        {
          division: { Id: "a0D000000000001AAA", Name: "Juniors" },
          groups: [{ Id: "a0G000000000001AAA" }]
        }
      ],
      timeBlocks: [{ Id: "a0B000000000001AAA", Name: "Period 1" }]
    }
  ],
  activities: [{ Id: "a0A000000000001AAA", Name: "Swim" }],
  locations: []
});
const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);

const REVISION = "2026-06-29:1";
const PUBLISHED_ID = "a0S000000000009AAA";
const PUBLISHED = {
  id: PUBLISHED_ID,
  publishedAt: "2026-10-18T14:04:00.000Z",
  publishedBy: "Pat",
  origin: "Generated",
  changedSince: false
};

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
async function until(done, tries = 200) {
  await flush();
  if (done() || !tries) {
    return;
  }
  await nextTurn();
  await until(done, tries - 1);
}
const slow = () => {
  const held = {};
  held.promise = new Promise((resolve) => {
    held.answer = resolve;
  });
  return held;
};

/** A saved week of SMALL with Swim in Bunk 1's Period 1 both days: some cells still Open. */
function openWeek({ published = null } = {}) {
  const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
  const swim = {
    kind: "A",
    id: inputs.activities[0].Id,
    name: "Swim",
    gone: false
  };
  inputs.days = inputs.days.map((day) => ({
    ...day,
    items: [...day.items, swim],
    rows: ["1,2,,", "1,,,"]
  }));
  inputs.published = published;
  return inputs;
}

/**
 * A finished week: one bunk, one day, Flag then Period 1 holding Swim (no weekly minimum), so
 * nothing is Open and nothing has a dot. maxSwim 0 puts Swim over its weekly limit (a dot).
 */
function cleanWeek({ published = null, maxSwim = 5 } = {}) {
  const inputs = camp({
    bunks: [{ name: "Bunk 1" }],
    days: 1,
    blocks: [
      { name: "Flag", start: "08:30", end: "09:00" },
      { name: "Period 1", start: "09:00", end: "10:00" }
    ],
    activities: [{ name: "Swim", min: 0, max: maxSwim, atOnce: 1 }],
    scheduleId: SCHEDULE
  });
  inputs.days = inputs.days.map((day) => ({
    ...day,
    items: [
      ...day.items,
      { kind: "A", id: inputs.activities[0].Id, name: "Swim", gone: false }
    ],
    rows: ["1,2"]
  }));
  inputs.published = published;
  return inputs;
}

/**
 * Two bunks, one day, each with Swim once in Period 1, where Swim wants 2 a week: nothing Open, no
 * dots, and two still needed lines.
 */
function owedWeek() {
  const inputs = camp({
    bunks: [{ name: "Bunk 1" }, { name: "Bunk 2" }],
    days: 1,
    blocks: [
      { name: "Flag", start: "08:30", end: "09:00" },
      { name: "Period 1", start: "09:00", end: "10:00" }
    ],
    activities: [{ name: "Swim", min: 2, max: 5, atOnce: 2 }],
    scheduleId: SCHEDULE
  });
  inputs.days = inputs.days.map((day) => ({
    ...day,
    items: [
      ...day.items,
      { kind: "A", id: inputs.activities[0].Id, name: "Swim", gone: false }
    ],
    rows: ["1,2", "1,2"]
  }));
  return inputs;
}

/** The season read again with only Week 2 in it: the screen moves on to Week 2. */
async function showWeek2(element, inputs) {
  getInputs.mockResolvedValue(inputs);
  element.setup = { ...SETUP, weeks: [{ Id: WEEK_2, Name: "Week 2" }] };
  await flush();
}

function preview({
  published = null,
  changes = [],
  revisions = REVISION
} = {}) {
  return {
    revisions,
    published,
    changes,
    changeCount: changes.length,
    moreLines: 0
  };
}

async function render(inputs = openWeek()) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const publishButton = (element) => q(element, '[data-id="publish"]');
const unpublishButton = (element) => q(element, '[data-id="unpublish"]');
const publishedLine = (element) => q(element, '[data-id="published"]');
const ask = (element) => q(element, '[data-id="publish-ask"]');
const unpublishAsk = (element) => q(element, '[data-id="unpublish-ask"]');
const action = (element, name) => q(element, `[data-action="${name}"]`);
const notice = (element) => {
  const line = editorRoot(element).querySelector('[data-id="notice"]');
  return line ? line.textContent : null;
};
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cellAt = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);

async function answer(target, yes) {
  target.dispatchEvent(new CustomEvent("answer", { detail: { yes } }));
  await flush();
}
async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}
/**
 * A browser drops focus to the page from a button that is disabled; jsdom keeps it there (and
 * won't blur a disabled button), so focus is moved off and its holder removed.
 */
function dropFocus() {
  const away = document.createElement("button");
  document.body.appendChild(away);
  away.focus();
  document.body.removeChild(away);
}
async function clickPublish(element) {
  publishButton(element).click();
  await flush();
}

describe("Publish on the Generated Schedule screen", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.resetAllMocks();
  });

  it("sits last on the editor's toolbar, with no Unpublish while nothing is published", async () => {
    const element = await render();
    const button = publishButton(element);
    expect(button).not.toBeNull();
    expect(button.closest('[data-id="publish-area"]').assignedSlot.name).toBe(
      "tools"
    );
    expect(unpublishButton(element)).toBeNull();
    expect(publishedLine(element)).toBeNull();
  });

  it("a finished week's first publish goes at once, then says when it was published", async () => {
    const element = await render(cleanWeek());
    previewPublish.mockResolvedValue(preview());
    publish.mockResolvedValue({
      published: PUBLISHED,
      draftChanged: false,
      publishedChanged: false,
      unchanged: false
    });
    await clickPublish(element);
    expect(previewPublish).toHaveBeenCalledWith({ scheduleId: SCHEDULE });
    expect(ask(element)).toBeNull();
    expect(publish).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      seenRevisions: REVISION,
      seenPublishedId: null
    });
    expect(notice(element)).toBe("Published Week 1.");
    // It names the screen it was published from (Greg, 2026-10-19).
    expect(publishedLine(element).textContent).toContain(
      "Published from Generated Schedule "
    );
    expect(publishedLine(element).textContent).toContain(" by Pat");
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    expect(unpublishButton(element)).not.toBeNull();
  });

  it("a first publish with Open cells asks first, naming them; Cancel publishes nothing", async () => {
    const element = await render(openWeek());
    previewPublish.mockResolvedValue(preview());
    await clickPublish(element);
    expect(ask(element).heading).toBe("Publish Week 1?");
    expect(ask(element).lines.join(" ")).toMatch(/of \d+ cells still Open\./);
    expect(ask(element).confirmLabel).toBe("Publish");
    expect(publish).not.toHaveBeenCalled();
    await answer(ask(element), false);
    expect(ask(element)).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(publishButton(element).disabled).toBe(false);
  });

  it("a placement with a dot is still to do: the box says it needs a look", async () => {
    const element = await render(cleanWeek({ maxSwim: 0 }));
    previewPublish.mockResolvedValue(preview());
    await clickPublish(element);
    expect(ask(element).lines).toContain("1 activity needs a look.");
    publish.mockResolvedValue({ published: PUBLISHED });
    await answer(ask(element), true);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("publishing again lists what changes, then replaces the published schedule", async () => {
    const element = await render(
      cleanWeek({ published: { ...PUBLISHED, changedSince: true } })
    );
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
    previewPublish.mockResolvedValue(
      preview({
        published: PUBLISHED,
        changes: ["Bunk 1 · Monday · Period 1: Art → Swim"]
      })
    );
    publish.mockResolvedValue({
      published: { ...PUBLISHED, id: "a0S000000000010AAA" }
    });
    await clickPublish(element);
    expect(ask(element).heading).toBe("Publish Week 1 again?");
    expect(ask(element).lines).toEqual([
      "This replaces the published schedule. 1 cell changes:",
      "Bunk 1 · Monday · Period 1: Art → Swim"
    ]);
    await answer(ask(element), true);
    expect(publish).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      seenRevisions: REVISION,
      seenPublishedId: PUBLISHED_ID
    });
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
  });

  it("a week already published as it is publishes nothing and says so", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    previewPublish.mockResolvedValue(preview({ published: PUBLISHED }));
    await clickPublish(element);
    expect(publish).not.toHaveBeenCalled();
    expect(ask(element)).toBeNull();
    expect(notice(element)).toBe("Week 1 is already published as it is.");
  });

  it("a week someone else saved since it was read publishes nothing, says so and reads it again", async () => {
    const element = await render(cleanWeek());
    previewPublish.mockResolvedValue(preview({ revisions: "2026-06-29:2" }));
    getInputs.mockClear();
    await clickPublish(element);
    expect(publish).not.toHaveBeenCalled();
    expect(notice(element)).toBe(
      "Someone else changed this week since, so nothing was published."
    );
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("a week someone else published since the preview replaces nothing, says so and reads it again", async () => {
    const element = await render(cleanWeek());
    previewPublish.mockResolvedValue(preview());
    publish.mockResolvedValue({ publishedChanged: true });
    getInputs.mockClear();
    await clickPublish(element);
    expect(notice(element)).toBe(
      "Someone else published this week since, so nothing was replaced."
    );
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("a refused publish shows the server's reason", async () => {
    const element = await render(cleanWeek());
    previewPublish.mockRejectedValue({
      body: {
        message: "There is nothing to publish yet, so nothing was published."
      }
    });
    await clickPublish(element);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Week 1 was not published."
    );
    expect(publishButton(element).disabled).toBe(false);
  });

  it("Unpublish asks first, then leaves the week with nothing published", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    unpublishButton(element).click();
    await flush();
    expect(unpublishAsk(element).heading).toBe("Unpublish Week 1?");
    expect(unpublishAsk(element).lines).toEqual([
      "Nothing will be published for this week."
    ]);
    // Builds wait while the question is open.
    expect(action(element, "Rebuild").disabled).toBe(true);
    unpublish.mockResolvedValue({ publishedChanged: false });
    await answer(unpublishAsk(element), true);
    expect(unpublish).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      seenPublishedId: PUBLISHED_ID
    });
    expect(unpublishButton(element)).toBeNull();
    expect(publishedLine(element)).toBeNull();
    expect(notice(element)).toBe("Unpublished Week 1.");
    expect(action(element, "Rebuild").disabled).toBe(false);
  });

  it("Unpublish's Cancel changes nothing", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    unpublishButton(element).click();
    await flush();
    await answer(unpublishAsk(element), false);
    expect(unpublish).not.toHaveBeenCalled();
    expect(unpublishButton(element)).not.toBeNull();
  });

  it("an Unpublish after someone else published or unpublished does nothing, says so and reads the week again", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    unpublish.mockResolvedValue({ publishedChanged: true });
    unpublishButton(element).click();
    await flush();
    getInputs.mockClear();
    await answer(unpublishAsk(element), true);
    expect(notice(element)).toBe(
      "Someone else published or unpublished this week since, so nothing was unpublished."
    );
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("builds, Lock, edits and the week picker wait while a publish is on its way", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    publishButton(element).click();
    await flush();
    expect(action(element, "Rebuild").disabled).toBe(true);
    expect(action(element, "TryAnother").disabled).toBe(true);
    expect(action(element, "StartOver").disabled).toBe(true);
    expect(q(element, '[data-id="lock-menu"]').disabled).toBe(true);
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    expect(publishButton(element).disabled).toBe(true);
    // A hand edit waits too: nothing is sent.
    await press(cellAt(element, "0-1"), "Delete");
    expect(saveSlots).not.toHaveBeenCalled();
    publish.mockResolvedValue({ published: PUBLISHED });
    held.answer(preview());
    await flush();
    expect(action(element, "Rebuild").disabled).toBe(false);
    expect(q(element, '[data-id="week"]').disabled).toBe(false);
  });

  it("Publish waits while a build is on its way", async () => {
    const element = await render(cleanWeek());
    saveWeekOnServer.mockReturnValue(new Promise(() => {}));
    action(element, "TryAnother").click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    expect(publishButton(element).disabled).toBe(true);
  });

  it("Publish waits while a hand edit saves", async () => {
    const element = await render(cleanWeek());
    saveSlots.mockReturnValue(new Promise(() => {}));
    await press(cellAt(element, "0-1"), "Delete");
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(publishButton(element).disabled).toBe(true);
  });

  it("Publish waits while a Lock saves", async () => {
    const element = await render(cleanWeek());
    setLocksOnServer.mockReturnValue(new Promise(() => {}));
    const item = [
      ...element.shadowRoot.querySelectorAll("lightning-menu-item")
    ].find((i) => i.label.startsWith("Lock "));
    q(element, '[data-id="lock-menu"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: item.value } })
    );
    await flush();
    expect(setLocksOnServer).toHaveBeenCalledTimes(1);
    expect(publishButton(element).disabled).toBe(true);
  });

  it("Publish waits while the week is read again", async () => {
    const element = await render(cleanWeek());
    getInputs.mockReturnValue(new Promise(() => {}));
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
    expect(publishButton(element).disabled).toBe(true);
  });

  it("Unpublish waits while a build, a hand edit, a Lock or a read of the week is on its way", async () => {
    // A build.
    let element = await render(cleanWeek({ published: PUBLISHED }));
    saveWeekOnServer.mockReturnValue(new Promise(() => {}));
    action(element, "TryAnother").click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    expect(unpublishButton(element).disabled).toBe(true);
    // The button is held, and so is what it does: no question is asked.
    unpublishButton(element).dispatchEvent(new CustomEvent("click"));
    await flush();
    expect(unpublishAsk(element)).toBeNull();
    document.body.removeChild(element);

    // A hand edit.
    element = await render(cleanWeek({ published: PUBLISHED }));
    saveSlots.mockReturnValue(new Promise(() => {}));
    await press(cellAt(element, "0-1"), "Delete");
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(unpublishButton(element).disabled).toBe(true);
    document.body.removeChild(element);

    // A Lock.
    element = await render(cleanWeek({ published: PUBLISHED }));
    setLocksOnServer.mockReturnValue(new Promise(() => {}));
    const item = [
      ...element.shadowRoot.querySelectorAll("lightning-menu-item")
    ].find((i) => i.label.startsWith("Lock "));
    q(element, '[data-id="lock-menu"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: item.value } })
    );
    await flush();
    expect(setLocksOnServer).toHaveBeenCalledTimes(1);
    expect(unpublishButton(element).disabled).toBe(true);
    document.body.removeChild(element);

    // A read of the week, coming back to the window.
    element = await render(cleanWeek({ published: PUBLISHED }));
    getInputs.mockReturnValue(new Promise(() => {}));
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(unpublishButton(element).disabled).toBe(true);
  });

  it("Unpublish does nothing while it is held, even if its click arrives", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    getInputs.mockReturnValue(new Promise(() => {}));
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    // A disabled button gets no click from a person; the handler must still refuse one.
    const button = unpublishButton(element);
    button.disabled = false;
    button.click();
    await flush();
    expect(unpublishAsk(element)).toBeNull();
  });

  it("a week someone else saved between the preview and Publish publishes nothing, says so and reads it again", async () => {
    const element = await render(cleanWeek());
    previewPublish.mockResolvedValue(preview());
    publish.mockResolvedValue({ draftChanged: true, publishedChanged: false });
    getInputs.mockClear();
    await clickPublish(element);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(notice(element)).toBe(
      "Someone else changed this week since, so nothing was published."
    );
    expect(publishedLine(element)).toBeNull();
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("a publish the server finds already published as it is says so", async () => {
    // The preview saw changes, but by the time Publish arrived the published copy matched.
    const element = await render(cleanWeek());
    previewPublish.mockResolvedValue(preview());
    publish.mockResolvedValue({
      published: PUBLISHED,
      draftChanged: false,
      publishedChanged: false,
      unchanged: true
    });
    await clickPublish(element);
    expect(notice(element)).toBe("Week 1 is already published as it is.");
    expect(publishedLine(element)).not.toBeNull();
  });

  it("a failed Unpublish says the week was not unpublished", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    unpublish.mockRejectedValue({ body: { message: "Something went wrong." } });
    unpublishButton(element).click();
    await flush();
    await answer(unpublishAsk(element), true);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Week 1 was not unpublished."
    );
    expect(unpublishButton(element).disabled).toBe(false);
  });

  it("focus goes back to Publish after the week is read again on coming back to the window", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    publishButton(element).focus();
    expect(element.shadowRoot.activeElement).toBe(publishButton(element));
    const held = slow();
    getInputs.mockReturnValue(held.promise);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(publishButton(element).disabled).toBe(true);
    dropFocus();
    expect(element.shadowRoot.activeElement).toBeNull();
    held.answer(cleanWeek({ published: PUBLISHED }));
    await flush();
    expect(publishButton(element).disabled).toBe(false);
    expect(element.shadowRoot.activeElement).toBe(publishButton(element));
  });

  it("focus goes back to Unpublish after the week is read again on coming back to the window", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    unpublishButton(element).focus();
    const held = slow();
    getInputs.mockReturnValue(held.promise);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(unpublishButton(element).disabled).toBe(true);
    dropFocus();
    expect(element.shadowRoot.activeElement).toBeNull();
    held.answer(cleanWeek({ published: PUBLISHED }));
    await flush();
    expect(element.shadowRoot.activeElement).toBe(unpublishButton(element));
  });

  it("a hand edit marks the week changed since it was published, at once", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    saveSlots.mockReturnValue(new Promise(() => {}));
    await press(cellAt(element, "0-1"), "Delete");
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
  });

  it("after a build, the published line follows the server's answer: a Rebuild that changed nothing isn't changed since", async () => {
    const element = await render(
      cleanWeek({ published: { ...PUBLISHED, changedSince: true } })
    );
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2",
      versionId: null,
      locks: [],
      published: PUBLISHED
    });
    action(element, "TryAnother").click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    expect(publishedLine(element)).not.toBeNull();
  });

  it("focus goes back to Publish once the publish is over (it fell while Publish was held)", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    publish.mockResolvedValue({ published: PUBLISHED });
    // A browser drops focus from a button that is disabled, so it is on the page meanwhile.
    await clickPublish(element);
    expect(publishButton(element).disabled).toBe(true);
    expect(element.shadowRoot.activeElement).toBeNull();
    held.answer(preview());
    await flush();
    expect(element.shadowRoot.activeElement).toBe(publishButton(element));
  });

  it("focus goes back to Publish once Unpublish is gone", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    unpublish.mockResolvedValue({ publishedChanged: false });
    unpublishButton(element).click();
    await flush();
    await answer(unpublishAsk(element), true);
    await flush();
    expect(element.shadowRoot.activeElement).toBe(publishButton(element));
  });

  it("a week already published as it is is no longer changed since", async () => {
    // As after a hand edit that was undone: the published copy matches the week again.
    const element = await render(
      cleanWeek({ published: { ...PUBLISHED, changedSince: true } })
    );
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
    previewPublish.mockResolvedValue(preview({ published: PUBLISHED }));
    await clickPublish(element);
    expect(notice(element)).toBe("Week 1 is already published as it is.");
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    expect(publishedLine(element)).not.toBeNull();
  });

  it("while the Publish box is open, builds, Lock and the pickers wait, and the week isn't read again until it is answered", async () => {
    const element = await render(openWeek());
    previewPublish.mockResolvedValue(preview());
    await clickPublish(element);
    expect(ask(element)).not.toBeNull();
    expect(action(element, "Rebuild").disabled).toBe(true);
    expect(q(element, '[data-id="lock-menu"]').disabled).toBe(true);
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    getInputs.mockClear();
    // The season read again, and coming back to the window.
    element.setup = { ...SETUP };
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).not.toHaveBeenCalled();
    await answer(ask(element), false);
    expect(getInputs).toHaveBeenCalledTimes(1);
    expect(action(element, "Rebuild").disabled).toBe(false);
  });

  it("the season read again while a publish is on its way waits for it, then reads the week", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    publish.mockResolvedValue({ published: PUBLISHED });
    await clickPublish(element);
    getInputs.mockClear();
    element.setup = { ...SETUP };
    await flush();
    expect(getInputs).not.toHaveBeenCalled();
    held.answer(preview());
    await flush();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("coming back to the window while a publish is on its way doesn't read the week", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    publish.mockResolvedValue({ published: PUBLISHED });
    await clickPublish(element);
    getInputs.mockClear();
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).not.toHaveBeenCalled();
    held.answer(preview());
    await flush();
    expect(getInputs).not.toHaveBeenCalled();
  });

  it("hand edits all saved during a publish don't read the week until it is over", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    publish.mockResolvedValue({ published: PUBLISHED });
    await clickPublish(element);
    getInputs.mockClear();
    // The season was read again (a read is owed), then the editor says its saves are done.
    element.setup = { ...SETUP };
    q(element, '[data-id="week-editor"]').dispatchEvent(
      new CustomEvent("editstate", {
        detail: { busy: false, queueEmpty: true }
      })
    );
    await flush();
    expect(getInputs).not.toHaveBeenCalled();
    held.answer(preview());
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("focus stays where the director put it while Publish was held", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    publish.mockResolvedValue({ published: PUBLISHED });
    await clickPublish(element);
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    held.answer(preview());
    await flush();
    expect(document.activeElement).toBe(elsewhere);
  });

  // A publish or unpublish whose answer comes back once another week is shown: it was for the
  // week it was asked from, so the week shown now keeps its own published line and words.
  it("a publish still under way when another week is shown leaves that week as it is", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockResolvedValue(preview());
    publish.mockReturnValue(held.promise);
    await clickPublish(element);
    expect(publish).toHaveBeenCalledTimes(1);
    await showWeek2(element, cleanWeek());
    expect(publishedLine(element)).toBeNull();
    held.answer({ published: PUBLISHED, unchanged: false });
    await flush();
    // Week 2 was not published: no line, no "Published", and its Publish is free.
    expect(publishedLine(element)).toBeNull();
    expect(notice(element) || "").not.toContain("Published");
    expect(publishButton(element).disabled).toBe(false);
  });

  it("a publish that fails once another week is shown says nothing on that week", async () => {
    const element = await render(cleanWeek());
    const held = slow();
    previewPublish.mockReturnValue(held.promise);
    await clickPublish(element);
    await showWeek2(element, cleanWeek());
    held.answer(Promise.reject({ body: { message: "Too late." } }));
    await flush();
    expect(q(element, '[data-id="build-error"]')).toBeNull();
    expect(publishButton(element).disabled).toBe(false);
  });

  it("an unpublish still under way when another week is shown leaves that week's published line", async () => {
    const element = await render(cleanWeek({ published: PUBLISHED }));
    const held = slow();
    unpublish.mockReturnValue(held.promise);
    unpublishButton(element).click();
    await flush();
    await answer(unpublishAsk(element), true);
    expect(unpublish).toHaveBeenCalledTimes(1);
    const week2Published = {
      ...PUBLISHED,
      id: "a0S000000000019AAA",
      publishedBy: "Sam"
    };
    await showWeek2(element, cleanWeek({ published: week2Published }));
    expect(publishedLine(element).textContent).toContain(" by Sam");
    held.answer({ publishedChanged: false });
    await flush();
    // Week 2 is still published: its line and Unpublish stay, and nothing says "Unpublished".
    expect(publishedLine(element).textContent).toContain(" by Sam");
    expect(unpublishButton(element)).not.toBeNull();
    expect(notice(element) || "").not.toContain("Unpublished");
  });

  // The box counts what the counters count now, the lines the director accepted aside (as on
  // Manual Build), not the week's checks alone.
  it("asks with the counters' own lines: one of two still needed lines accepted leaves 1", async () => {
    const element = await render(owedWeek());
    const checks = q(element, "c-shoresh-week-checks");
    const counter = () =>
      checks.shadowRoot.querySelector('[data-counter="stillNeeded"]');
    expect(counter().textContent).toContain("2");
    counter().click();
    await flush();
    const accepts = [
      ...checks.shadowRoot.querySelectorAll('[aria-label^="Accept: "]')
    ];
    expect(accepts).toHaveLength(2);
    accepts[0].click();
    await flush();
    expect(counter().textContent).toContain("1");
    previewPublish.mockResolvedValue(preview());
    await clickPublish(element);
    // The week's checks alone would say 2; the box says what the counter shows.
    expect(ask(element).lines).toEqual(["Still needed: 1"]);
    await answer(ask(element), false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("a week whose still needed lines were all accepted publishes at once, as its counters say", async () => {
    const element = await render(owedWeek());
    const checks = q(element, "c-shoresh-week-checks");
    const counter = () =>
      checks.shadowRoot.querySelector('[data-counter="stillNeeded"]');
    counter().click();
    await flush();
    const accepts = [
      ...checks.shadowRoot.querySelectorAll('[aria-label^="Accept: "]')
    ];
    accepts[0].click();
    await flush();
    accepts[1].click();
    await flush();
    expect(counter().textContent).toContain("0");
    previewPublish.mockResolvedValue(preview());
    publish.mockResolvedValue({ published: PUBLISHED, unchanged: false });
    await clickPublish(element);
    expect(ask(element)).toBeNull();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(notice(element)).toBe("Published Week 1.");
  });
});
