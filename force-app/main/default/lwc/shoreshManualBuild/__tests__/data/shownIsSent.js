// The promise behind "keep theirs or use yours", checked on the screen (ADR 0008 §21): Use yours
// may leave unlisted only the director's own cells that still hold what the director saw there;
// every other cell it changes is listed, and every listed cell is changed. Cells are compared by
// day, group, and time block Id, in the server's week as it was when the question opened.
// Each test that clicks Use yours calls it.
import { slots } from "../../slotEdits";

/** "day|group|block" positions of each row of the open question. */
export function listedCells(element) {
  return [
    ...element.shadowRoot
      .querySelector('[data-id="conflict"]')
      .querySelectorAll(".conflict-row")
  ].map((row) => row.dataset.cell);
}

function cellsOf(runs, week) {
  const cells = [];
  runs.forEach((run) => {
    const d = week.days.findIndex((day) => day.dateValue === run.day);
    const day = week.days[d];
    const g = day.groups.findIndex((grp) => grp.id === run.groupId);
    const first = day.blocks.findIndex((b) => b.id === run.firstBlockId);
    run.after.forEach((after, i) => {
      cells.push({
        key: `${run.day}|${run.groupId}|${day.blocks[first + i].id}`,
        position: `${d}|${g}|${first + i}`,
        before: run.before[i],
        after
      });
    });
  });
  return cells;
}

/** What each cell held in a week, by "day|group|block Id". */
function contents(week) {
  const held = new Map();
  week.days.forEach((day) =>
    day.groups.forEach((grp, g) =>
      slots(day, g).forEach((slot, b) =>
        held.set(`${day.dateValue}|${grp.id}|${day.blocks[b].id}`, slot)
      )
    )
  );
  return held;
}

/**
 * Clicks Use yours and checks it against the question. seenSchedule: the week as the director
 * saw it when making the edit. The edit is the save that got the question (the last one sent:
 * saves wait while a question is open), and its answer is the server's week at question time.
 */
export async function useYoursSendsWhatWasShown(
  element,
  saveSlots,
  seenSchedule,
  flush
) {
  const asked = saveSlots.mock.calls.length - 1;
  const answer = await saveSlots.mock.results[asked].value;
  const atQuestion = answer.schedule;
  const own = new Set(
    cellsOf(saveSlots.mock.calls[asked][0].edits[0].runs, seenSchedule).map(
      (c) => c.key
    )
  );
  const seen = contents(seenSchedule);
  // Rows name positions in the server's week at question time; turn them into block Ids.
  const listed = listedCells(element)
    .map((position) => {
      const [d, g, b] = position.split("|").map(Number);
      const day = atQuestion.days[d];
      return `${day.dateValue}|${day.groups[g].id}|${day.blocks[b].id}`;
    })
    .sort();
  element.shadowRoot.querySelector('[data-id="use-yours"]').click();
  await flush();
  const sent = cellsOf(
    saveSlots.mock.calls[asked + 1][0].edits[0].runs,
    atQuestion
  ).filter((c) => c.before !== c.after);
  const mustList = sent
    .filter((c) => !(own.has(c.key) && seen.get(c.key) === c.before))
    .map((c) => c.key)
    .sort();
  expect(listed).toEqual(mustList);
  const sentKeys = sent.map((c) => c.key);
  listed.forEach((key) => expect(sentKeys).toContain(key));
}
