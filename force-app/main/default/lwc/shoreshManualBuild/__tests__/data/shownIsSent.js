// The promise behind "keep theirs or use yours", checked on the screen (ADR 0008 §21): Use yours
// may leave unlisted only the director's own cells that still hold what the director expected
// there; every other cell it changes is listed, and every listed cell is changed. Cells are
// compared by day, group, and time block Id, in the server's week as it was when the question
// opened.
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

// A further question about the same edit carries on from the one before: what the director
// owns, and what they have seen (updated with each question's rows), by element.
const chains = new WeakMap();

const editCells = (call, week) =>
  call[0].edits.flatMap((edit) => cellsOf(edit.runs, week));

/**
 * Clicks Use yours and checks it against the question. seenSchedule: the week the director's own
 * edit (or Undo or Redo) was made on. The director's own cells and what they expected there come
 * from that save (each run's before: the screen for an edit, what the step left for an Undo); a
 * further question about the same edit keeps them, with what each question showed now seen.
 * The save that got the question is the last one sent (saves wait while a question is open), and
 * its answer is the server's week at question time.
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
  let chain = chains.get(element);
  // Use yours's save carries on to this question if every save since met someone else's change
  // (one with nothing to list is sent again without asking); otherwise this is a new edit.
  // (Only those saves are awaited: each was answered, since a later one was sent after it.)
  const since =
    chain && chain.call <= asked
      ? await Promise.all(
          saveSlots.mock.results
            .slice(chain.call, asked)
            .map((result) => result.value)
        )
      : null;
  const carriesOn =
    Boolean(since) && since.every((a) => a.conflicts.length > 0);
  if (!carriesOn) {
    const own = editCells(saveSlots.mock.calls[asked], seenSchedule);
    chain = {
      own: new Set(own.map((c) => c.key)),
      seen: new Map(own.map((c) => [c.key, c.before]))
    };
  }
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
  const sent = editCells(saveSlots.mock.calls[asked + 1], atQuestion).filter(
    (c) => c.before !== c.after
  );
  const mustList = sent
    .filter(
      (c) => !(chain.own.has(c.key) && chain.seen.get(c.key) === c.before)
    )
    .map((c) => c.key)
    .sort();
  expect(listed).toEqual(mustList);
  const sentKeys = sent.map((c) => c.key);
  listed.forEach((key) => expect(sentKeys).toContain(key));
  // The director has now seen what this question listed.
  const held = contents(atQuestion);
  listed.forEach((key) => chain.seen.set(key, held.get(key)));
  chains.set(element, { ...chain, call: asked + 1 });
}
