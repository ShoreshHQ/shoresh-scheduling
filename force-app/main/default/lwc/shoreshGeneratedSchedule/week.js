/**
 * What Generated Schedule works out from the week on screen, in Manual Build's day shape
 * (ScheduleViews.DayView: blocks, groups, items, rows of "1,^,"): the week Start over leaves, the
 * cells left Open, and the cells a counter lights up. Pure: no server, no screen.
 */
import { BUSY, reasonFor } from "c/shoreshEngine";
import { dayLabel, groupCells } from "c/shoreshScheduleViews";

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
 * cells use them, as the engine writes a day.
 */
export function clearedDays(days) {
  return (days || []).map((day) => {
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
 * less its filled), one line each: "Bunk 3 · Monday · Period 2", and ": Already busy then" when
 * the group holds something at an overlapping time, the engine's own reason. Worked out from the
 * week as it stands, so a saved week reads the same as one just built.
 */
export function openCells(days, isAway, terms) {
  const busy = reasonFor(BUSY, { terms });
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
      cells.forEach((c) => {
        const block = day.blocks[c.blockIndex];
        if (c.item || !block || isAway(grp.id, block.id)) {
          return;
        }
        const taken = day.blocks.some(
          (other, b) => filled.has(b) && overlaps(block, other)
        );
        const where = [
          grp.name,
          dayLabel(day.dateValue).label,
          block.name
        ].join(" · ");
        out.push({
          dateValue: day.dateValue,
          groupId: grp.id,
          blockId: block.id,
          text: taken ? `${where}: ${busy}` : where
        });
      });
    });
  });
  return out;
}

function cellKey(dateValue, groupId, blockId) {
  return `${dateValue}|${groupId}|${blockId}`;
}

/**
 * The cells a counter lights up (desktop findingHighlight.js), as "date|groupId|blockId" keys: for
 * an Open or overlapping line its own cell; for a still needed or spread line every placement of
 * that activity for that group this week (there may be none). checked: checkWeek's answer for
 * these days.
 */
export function litCells(lines, checked, days) {
  const lit = new Set();
  const placements = (checked && checked.placements) || [];
  (lines || []).forEach((line) => {
    if (line.blockId) {
      lit.add(cellKey(line.dateValue, line.groupId, line.blockId));
      return;
    }
    placements
      .filter(
        (p) =>
          p.kind === "A" &&
          p.groupId === line.groupId &&
          p.id === line.activityId
      )
      .forEach((p) => {
        const day = days[p.d];
        for (let b = p.first; b < p.first + p.length; b++) {
          lit.add(cellKey(day.dateValue, p.groupId, day.blocks[b].id));
        }
      });
  });
  return lit;
}

/** Whether a grid cell (starting at slot) covers any lit cell. */
export function isLit(lit, days, slot) {
  if (!lit || !lit.size) {
    return false;
  }
  const day = days[slot.day];
  const groupId = day.groups[slot.group].id;
  return coveredBlocks(day, slot.group, slot.block).some((block) =>
    lit.has(cellKey(day.dateValue, groupId, block.id))
  );
}
