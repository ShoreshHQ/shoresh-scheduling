/**
 * What Generated Schedule works out from the week on screen, in Manual Build's day shape
 * (ScheduleViews.DayView: blocks, groups, items, rows of "1,^,"): the week Start over leaves, the
 * cells left Open, and the cells a counter lights up. Pure: no server, no screen.
 */
import { BUSY, NO_FIT, reasonFor } from "./engine.shoreshEngine.shoreshEngine.mjs";
import { dayLabel, groupCells } from "./engine.shoreshScheduleViews.shoreshScheduleViews.mjs";

const CARRIES_ON = "^";

function minutes(hhmm) {
  if (!hhmm) {
    return null;
  }
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

/** Whether two blocks' clock times overlap (touching times don't). */
function overlaps(a, b) {
  const [as, ae, bs, be] = [
    minutes(a.startTime),
    minutes(a.endTime),
    minutes(b.startTime),
    minutes(b.endTime)
  ];
  return [as, ae, bs, be].every((n) => n !== null) && as < be && bs < ae;
}

/**
 * Start over (ADR 0010 decision 2): every activity cleared, so each of those cells is Open again;
 * fixed and recurring activities and things not set up yet (elective, trip...) stay, as a full
 * build keeps them. Items no cell uses any more are dropped and the rest numbered in the order
 * cells use them, as the engine writes a day. A day a special day replaces (replacedDates) is kept
 * as it is: its cells are out of sight, and come back as they were when it is taken off.
 */
export function clearedDays(days, replacedDates = new Set()) {
  return (days || []).map((day) => {
    if (replacedDates.has(day.dateValue)) {
      return day;
    }
    const items = [];
    const numbers = new Map();
    const rows = (day.rows || []).map((row) => {
      let cleared = false;
      return String(row || "")
        .split(",")
        .map((token) => {
          if (token === CARRIES_ON) {
            return cleared ? "" : token;
          }
          const item = /^\d+$/.test(token)
            ? (day.items || [])[Number(token) - 1]
            : null;
          cleared = !item || item.kind === "A";
          if (cleared) {
            return "";
          }
          if (!numbers.has(token)) {
            items.push(item);
            numbers.set(token, String(items.length));
          }
          return numbers.get(token);
        })
        .join(",");
    });
    return { ...day, items, rows };
  });
}

/**
 * How many cells hold an activity where the group is at camp (what Start over clears), each block
 * of a longer one. isAway(groupId, blockId), when given, leaves out cells where the group isn't.
 */
export function activityCells(days, isAway = () => false) {
  let n = 0;
  (days || []).forEach((day) => {
    if (day.problem) {
      return;
    }
    (day.groups || []).forEach((grp, g) =>
      groupCells(day, g).forEach((c) => {
        if (c.item && c.item.kind === "A") {
          for (let b = c.blockIndex; b < c.blockIndex + c.length; b++) {
            n += isAway(grp.id, day.blocks[b].id) ? 0 : 1;
          }
        }
      })
    );
  });
  return n;
}

/** The blocks a cell covers: from the one it starts in, for as many as it carries on. */
export function coveredBlocks(day, groupIndex, firstBlock) {
  const cell = groupCells(day, groupIndex).find(
    (c) => c.blockIndex === firstBlock
  );
  const length = cell ? cell.length : 1;
  return day.blocks.slice(firstBlock, firstBlock + length);
}

/**
 * The cells left Open where the group is at camp (what the Open counter counts: Filled's "of"
 * less its filled), one line each, "Bunk 3 · Monday · Period 2", with the engine's reason when
 * the grid shows it (the same words, reasonFor): "Already busy then" when the group holds
 * something at an overlapping time; "No activity fits here" when the run of Open cells it is
 * in is shorter than the shortest activity (shortest, in blocks). A cell Start over just cleared
 * has neither: something fits, it just isn't built yet. lockedOpen(dateValue, groupId, blockId)
 * says a cell is locked empty: it isn't listed and isn't room for an activity. Worked out from the
 * week as it stands, so a saved week reads the same as one just built. engineWhy: the engine's
 * own reasons for the cells its build left Open ("date|groupId|blockId" to words; wiki engine
 * care plan Q18): when it names a cell, its words are used instead of these.
 */
export function openCells(
  days,
  isAway,
  terms,
  shortest = null,
  lockedOpen = () => false,
  engineWhy = new Map()
) {
  const busy = reasonFor(BUSY, { terms });
  const noFit = reasonFor(NO_FIT, { terms });
  const out = [];
  (days || []).forEach((day) => {
    if (day.problem) {
      return;
    }
    (day.groups || []).forEach((grp, g) => {
      const cells = groupCells(day, g);
      const filled = new Set();
      cells.forEach((c) => {
        if (c.item) {
          for (let b = c.blockIndex; b < c.blockIndex + c.length; b++) {
            filled.add(b);
          }
        }
      });
      // A cell locked empty is kept empty: it is neither Open nor room for an activity.
      const open = (b) =>
        b >= 0 &&
        b < day.blocks.length &&
        !filled.has(b) &&
        !isAway(grp.id, day.blocks[b].id) &&
        !lockedOpen(day.dateValue, grp.id, day.blocks[b].id);
      cells.forEach((c) => {
        const block = day.blocks[c.blockIndex];
        if (c.item || !block || !open(c.blockIndex)) {
          return;
        }
        const taken = day.blocks.some(
          (other, b) => filled.has(b) && overlaps(block, other)
        );
        // The run of Open, at-camp cells this one is in.
        let first = c.blockIndex;
        let last = c.blockIndex;
        while (open(first - 1)) {
          first -= 1;
        }
        while (open(last + 1)) {
          last += 1;
        }
        let reason =
          engineWhy.get(`${day.dateValue}|${grp.id}|${block.id}`) || null;
        if (reason) {
          // The engine's own words for a cell its build left Open.
        } else if (taken) {
          reason = busy;
        } else if (shortest !== null && last - first + 1 < shortest) {
          reason = noFit;
        }
        const where = [
          grp.name,
          dayLabel(day.dateValue).label,
          block.name
        ].join(" · ");
        out.push({
          dateValue: day.dateValue,
          groupId: grp.id,
          blockId: block.id,
          reason,
          text: reason ? `${where}: ${reason}` : where
        });
      });
    });
  });
  return out;
}

/**
 * The cells these hand edits change ("date|groupId|blockId": each run's blocks, from its first, as
 * many as it holds before or after): a cell changed after the build no longer has the engine's
 * reason, it says what the week as it stands shows (wiki engine care plan Q18). days: the week's
 * days (their blocks). A new Set.
 */
export function editedKeys(edits, days) {
  const out = new Set();
  (edits || []).forEach((edit) =>
    ((edit && edit.runs) || []).forEach((run) => {
      const day = (days || []).find((d) => d.dateValue === run.day);
      const blocks = (day && day.blocks) || [];
      const first = blocks.findIndex((b) => b.id === run.firstBlockId);
      if (first < 0) {
        out.add(`${run.day}|${run.groupId}|${run.firstBlockId}`);
        return;
      }
      const length = Math.max(
        1,
        (run.after || []).length,
        (run.before || []).length
      );
      blocks
        .slice(first, first + length)
        .forEach((b) => out.add(`${run.day}|${run.groupId}|${b.id}`));
    })
  );
  return out;
}
