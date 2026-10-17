// The promise behind "keep theirs or use yours", checked on the screen (ADR 0008 §21): every
// cell Use yours sends a change to, whose content isn't what the director saw, is listed in the
// question; and every listed cell is sent. Each conflict test calls it.
import { slots } from "../../slotEdits";

/** "day|group|block" for each row of the open question. */
export function listedCells(element) {
  return [
    ...element.shadowRoot
      .querySelector('[data-id="conflict"]')
      .querySelectorAll(".conflict-row")
  ].map((row) => row.dataset.cell);
}

/**
 * Clicks Use yours and checks what it sent against what the question listed. seenSchedule: the
 * week as the director saw it when making the edit.
 */
export async function useYoursSendsWhatWasShown(
  element,
  saveSlots,
  seenSchedule,
  flush
) {
  const listed = listedCells(element).sort();
  const calls = saveSlots.mock.calls.length;
  element.shadowRoot.querySelector('[data-id="use-yours"]').click();
  await flush();
  const sent = [];
  const mustList = [];
  saveSlots.mock.calls[calls][0].edits[0].runs.forEach((run) => {
    const d = seenSchedule.days.findIndex((day) => day.dateValue === run.day);
    const day = seenSchedule.days[d];
    const g = day.groups.findIndex((grp) => grp.id === run.groupId);
    const first = day.blocks.findIndex((b) => b.id === run.firstBlockId);
    const seen = slots(day, g);
    run.before.forEach((theirs, i) => {
      if (theirs === run.after[i]) {
        return;
      }
      const cell = `${d}|${g}|${first + i}`;
      sent.push(cell);
      if (seen[first + i] !== theirs) {
        mustList.push(cell);
      }
    });
  });
  expect(listed).toEqual(mustList.sort());
  listed.forEach((cell) => expect(sent).toContain(cell));
}
