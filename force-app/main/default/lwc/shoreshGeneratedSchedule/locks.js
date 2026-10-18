/**
 * Generated Schedule's locks on screen (ADR 0010 decision 3, G4 §29): which cells are locked, and
 * what the Lock menu offers. The server decides what a change does (c/shoreshGeneratedWeek
 * setLocks); this only says what is worth offering, so the menu never offers a change that would
 * do nothing. Pure: no server, no screen.
 */
import { LOCK, UNLOCK } from "c/shoreshGeneratedWeek";
import { dayLabel, groupCells } from "c/shoreshScheduleViews";

const SET_TIME = new Set(["F", "R"]);

function cellKey(dateValue, groupId, blockId) {
  return `${dateValue}|${groupId}|${blockId}`;
}

/** The locked cells ("date|groupId|blockId"), from the data module's locks. */
export function lockedKeys(locks) {
  return new Set(
    (locks || []).map((l) => cellKey(l.date, l.groupId, l.blockId))
  );
}

/**
 * Each cell of the week as the Lock menu weighs it: { dateValue, groupId, blockIds (the
 * placement's, or the one Open block), filled (holds something a lock can keep: not a fixed or
 * recurring activity), setTime, locked (any of its blocks) }. A cell where the group isn't at camp
 * and nothing is placed isn't listed (there is nothing to keep), unless a lock was left on it.
 */
export function weekCells(days, locked, isAway) {
  const out = [];
  (days || []).forEach((day) => {
    if (day.problem) {
      return;
    }
    (day.groups || []).forEach((grp, g) => {
      groupCells(day, g).forEach((c) => {
        const blocks = day.blocks.slice(c.blockIndex, c.blockIndex + c.length);
        const isLocked = blocks.some((b) =>
          locked.has(cellKey(day.dateValue, grp.id, b.id))
        );
        // Nothing to keep where the group isn't at camp and nothing is placed; but a lock left
        // there (the group came to be away since) is listed, so it can be unlocked.
        if (!c.item && isAway(grp.id, blocks[0].id) && !isLocked) {
          return;
        }
        out.push({
          dateValue: day.dateValue,
          groupId: grp.id,
          blockIds: blocks.map((b) => b.id),
          filled: !!c.item && !SET_TIME.has(c.item.kind),
          setTime: !!c.item && SET_TIME.has(c.item.kind),
          locked: isLocked
        });
      });
    });
  });
  return out;
}

/**
 * The Lock menu: [{ value, label, change }], change as setLocks takes it. Offered:
 *   the cell keyboard focus last reached (cell: { dateValue, groupId, blockId, where }): Lock it
 *     (an Open cell too: kept empty) or Unlock it; never a fixed or recurring activity;
 *   the day shown in Daily View (day: { dateValue, name }), the group shown in Group View
 *     (group: { groupId, name }), and the focused cell's group's day: Lock when it has a filled
 *     cell not locked (the shortcuts lock only filled cells, as the server does), Unlock when it
 *     has a locked one.
 */
export function lockChoices(cells, { cell, day, group }) {
  const choices = [];
  const offer = (scope, cellsIn, change, name, lockable) => {
    if (cellsIn.some(lockable)) {
      choices.push({
        value: `${LOCK}|${scope}`,
        label: `Lock ${name}`,
        change: { action: LOCK, ...change }
      });
    }
    if (cellsIn.some((c) => c.locked)) {
      choices.push({
        value: `${UNLOCK}|${scope}`,
        label: `Unlock ${name}`,
        change: { action: UNLOCK, ...change }
      });
    }
  };
  const shortcut = (c) => c.filled && !c.locked;
  if (cell) {
    const here = cells.filter(
      (c) =>
        c.dateValue === cell.dateValue &&
        c.groupId === cell.groupId &&
        c.blockIds.includes(cell.blockId) &&
        !c.setTime
    );
    offer(
      "cell",
      here,
      {
        dateValue: cell.dateValue,
        groupId: cell.groupId,
        blockId: cell.blockId
      },
      cell.where,
      (c) => !c.locked
    );
  }
  if (day) {
    offer(
      "day",
      cells.filter((c) => c.dateValue === day.dateValue),
      { dateValue: day.dateValue },
      day.name,
      shortcut
    );
  }
  if (group) {
    offer(
      "group",
      cells.filter((c) => c.groupId === group.groupId),
      { groupId: group.groupId },
      group.name,
      shortcut
    );
  }
  if (cell) {
    offer(
      "groupDay",
      cells.filter(
        (c) => c.groupId === cell.groupId && c.dateValue === cell.dateValue
      ),
      { groupId: cell.groupId, dateValue: cell.dateValue },
      `${cell.groupName} · ${dayLabel(cell.dateValue).label}`,
      shortcut
    );
  }
  return choices;
}

/**
 * What a change did, said back for a screen reader: "Locked Bunk 1, Monday, Period 2." (commas,
 * not the screen's "·", which screen readers read unevenly).
 */
export function lockedText(choice) {
  const name = choice.label
    .replace(/^(Lock|Unlock) /, "")
    .split(" · ")
    .join(", ");
  return `${choice.change.action === LOCK ? "Locked" : "Unlocked"} ${name}.`;
}
