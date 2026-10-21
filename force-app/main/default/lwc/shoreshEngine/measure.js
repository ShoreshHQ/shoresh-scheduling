/**
 * The week's measure (wiki decisions 38 and 41, ADR 0008 part 7): what the rail's counter, its
 * dropdown and the drawer under the grid all show, worked out once from the week's check so they
 * can never disagree.
 *
 * - placed of total: cells filled, of the cells to fill (checkWeek's cells).
 * - still needed: the cells still to fill (total less placed).
 * - under: activities short of their weekly goal. A goal is the activity's times a week for each
 *   bunk it is set up for; a bunk counts only up to its own goal, so one bunk's extra never makes
 *   up for another's shortfall. "N under" is every bunk's shortfall added up: the same number
 *   wherever it is shown.
 * - over: activities past their weekly limit in some bunk. A row counts only those bunks: what
 *   they have, of what they may have. "N over" is the extra added up.
 * - look: what needs a look that is neither under nor over: the cells whose placement breaks a
 *   rule shared with other cells (checkWeek's overlapping), then each bunk still short of an
 *   early-week goal (checkWeek's spread), each as checkWeek words it.
 */

function groupIdsOf(days) {
  const ids = [];
  (days || []).forEach((day) =>
    (day.groups || []).forEach((grp) => {
      if (!ids.includes(grp.id)) {
        ids.push(grp.id);
      }
    })
  );
  return ids;
}

function hasNumber(value) {
  return value !== null && value !== undefined && value !== "";
}

/**
 * checked: checkWeek's answer for the week. activities: the activities that can be placed
 * ({ id, name, minPerWeek, maxPerWeek, notFor }), in the order they are listed. days: the week's
 * days (for its bunks).
 *
 * Returns { placed, total, stillNeeded, hasGoals, hasLimits, under: { count, rows }, over:
 * { count, rows }, look: [lines], byActivity: Map of activity Id -> { placed, goal, short,
 * extra } (placed: every placement of it this week, goal: its weekly goal for the camp, 0 for
 * none), offTarget }. Each row is { id, name, placed, goal }.
 */
export function measureWeek(checked, activities, days) {
  const cells = (checked && checked.cells) || { filled: 0, total: 0 };
  const groupIds = groupIdsOf(days);
  const counts = new Map();
  ((checked && checked.placements) || [])
    .filter((p) => p.kind === "A")
    .forEach((p) => {
      const key = `${p.groupId}|${p.id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  const count = (groupId, id) => counts.get(`${groupId}|${id}`) || 0;

  const under = { count: 0, rows: [] };
  const over = { count: 0, rows: [] };
  const byActivity = new Map();
  (activities || []).forEach((a) => {
    const notFor = a.notFor || [];
    const eligible = groupIds.filter((id) => !notFor.includes(id));
    const min = Math.max(0, Number(a.minPerWeek) || 0);
    const placed = groupIds.reduce((sum, id) => sum + count(id, a.id), 0);
    const goal = min * eligible.length;
    const got = eligible.reduce(
      (sum, id) => sum + Math.min(count(id, a.id), min),
      0
    );
    const short = goal - got;
    if (short > 0) {
      under.count += short;
      under.rows.push({ id: a.id, name: a.name, placed: got, goal });
    }
    let extra = 0;
    if (hasNumber(a.maxPerWeek)) {
      const max = Number(a.maxPerWeek);
      const past = groupIds.filter((id) => count(id, a.id) > max);
      if (past.length) {
        const has = past.reduce((sum, id) => sum + count(id, a.id), 0);
        const may = max * past.length;
        extra = has - may;
        over.count += extra;
        over.rows.push({ id: a.id, name: a.name, placed: has, goal: may });
      }
    }
    byActivity.set(a.id, { placed, goal, short, extra });
  });

  const look = [
    ...((checked && checked.overlapping) || []).map((cell) => ({
      key: `overlap|${cell.dateValue}|${cell.groupId}|${cell.blockId}`,
      kind: "overlapping",
      text: cell.text,
      groupId: cell.groupId,
      dateValue: cell.dateValue,
      blockId: cell.blockId
    })),
    ...(checked && checked.hasSpreadTargets ? checked.spread || [] : []).map(
      (text, i) => {
        const e = (checked.spreadBy || [])[i] || {};
        return {
          key: ["spread", e.groupId, e.activityId, e.missing, e.byDay].join(
            "|"
          ),
          kind: "spread",
          text,
          groupId: e.groupId,
          activityId: e.activityId
        };
      }
    )
  ];

  return {
    placed: cells.filled,
    total: cells.total,
    stillNeeded: Math.max(0, cells.total - cells.filled),
    hasGoals: (activities || []).some((a) => Number(a.minPerWeek) > 0),
    hasLimits: (activities || []).some((a) => hasNumber(a.maxPerWeek)),
    under,
    over,
    look,
    byActivity,
    offTarget: under.count > 0 || over.count > 0 || look.length > 0
  };
}
