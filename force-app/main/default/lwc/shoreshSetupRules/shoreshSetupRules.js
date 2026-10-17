import { CHILDREN, FIELD, OBJECT } from "c/shoreshSchema";

// Names as the package has them (c/shoreshSchema). A fixed or recurring activity's fields come
// in as `fields` (FIELD.FixedActivity or FIELD.RecurringActivity), whichever it is.
const WEEK = FIELD.Week;
const SEASON = FIELD.Season;
const ACTIVITY = FIELD.Activity;
const LOCATION = FIELD.Location;
const GROUP = FIELD.Group;
const BLOCK = FIELD.TimeBlock;
const OFF = FIELD.WeekException;
const WHO = FIELD.ActivityEligibility;
const COVERS = FIELD.Coverage;

/**
 * Problems in a season's setup, shown to the scheduler and never fixed silently. Each says what it
 * is about (name), what is wrong (why), and which screen fixes it (screen, see shoreshScreens).
 * Dates are ISO strings (YYYY-MM-DD), which compare correctly as text.
 */
export function setupProblems(setup, terms) {
  if (!setup || !setup.season) {
    return [];
  }
  const problems = [
    ...weekProblems(setup, terms),
    ...structureProblems(setup, terms),
    ...activityProblems(setup, terms),
    ...setTimeProblems(setup, terms)
  ];
  return problems.map((problem, i) => ({ key: `p${i}`, ...problem }));
}

function weekProblems(setup, terms) {
  const problems = [];
  const season = setup.season;
  const weeks = [...(setup.weeks || [])].sort((a, b) => {
    return a[WEEK.StartDate] < b[WEEK.StartDate] ? -1 : 1;
  });
  const add = (name, why) => problems.push({ screen: "weeks", name, why });
  weeks.forEach((week) => {
    if (
      week[WEEK.StartDate] < season[SEASON.StartDate] ||
      week[WEEK.EndDate] > season[SEASON.EndDate]
    ) {
      add(week.Name, `Falls outside the dates of this ${terms.sIn("Season")}.`);
    }
  });
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i][WEEK.StartDate] <= weeks[i - 1][WEEK.EndDate]) {
      add(`${weeks[i - 1].Name} and ${weeks[i].Name}`, "Share dates.");
    }
  }
  if (weeks.length === 0) {
    add(season.Name, `No ${terms.pIn("Week")} yet.`);
  }
  return problems;
}

function structureProblems(setup, terms) {
  const problems = [];
  const add = (screen, name, why) => problems.push({ screen, name, why });
  const programs = setup.programs || [];
  if (programs.length === 0) {
    add(
      "programs",
      setup.season.Name,
      `No ${terms.pIn("Program")} yet. Every ${terms.sIn("Season")} needs at least one.`
    );
  }
  programs.forEach((entry) => {
    const name = entry.program.Name;
    if ((entry.timeBlocks || []).length === 0) {
      add("timeBlocks", name, `No ${terms.pIn("TimeBlock")} yet.`);
    }
    if ((entry.divisions || []).length === 0) {
      add("divisions", name, `No ${terms.pIn("Division")} yet.`);
    }
    (entry.divisions || []).forEach((d) => {
      if ((d.groups || []).length === 0) {
        add("groups", d.division.Name, `No ${terms.pIn("Group")} yet.`);
      }
    });
  });
  return problems;
}

/**
 * Activity nudges. None blocks anything. From Shoresh desktop's Roots: no activities yet, and a
 * group no activity is open to. From Greg (2026-10-16): an outdoor activity with no rain plan, and
 * an activity allowing more groups at once than its location fits (the smaller number is what
 * scheduling uses).
 */
function activityProblems(setup, terms) {
  const activities = setup.activities || [];
  if (activities.length === 0) {
    return [
      {
        screen: "activities",
        name: setup.season.Name,
        why: `No ${terms.pIn("Activity")} yet.`
      }
    ];
  }
  const problems = groupsWithNothingToDo(setup, terms);
  const add = (name, why) => problems.push({ screen: "activities", name, why });
  const locations = new Map((setup.locations || []).map((l) => [l.Id, l]));
  activities.forEach((activity) => {
    if (activity[ACTIVITY.Outdoor] && !activity[ACTIVITY.RainPlan]) {
      add(activity.Name, `Outdoors and has no ${terms.sIn("RainPlan")}.`);
    }
    const location = locations.get(activity[ACTIVITY.Location]);
    const atOnce = activity[ACTIVITY.GroupsAtOnce];
    const fits = location && location[LOCATION.GroupsThatFit];
    if (location && !activity[ACTIVITY.NoGroupLimit] && atOnce > fits) {
      add(
        activity.Name,
        `Allows ${atOnce} ${terms.pIn("Group")} at once, ` +
          `but "${location.Name}" fits ${fits}. Scheduling uses ` +
          `${fits}; change whichever number is wrong.`
      );
    }
  });
  return problems;
}

/** Groups that no activity is open to (who can do it: everyone, or chosen divisions and groups). */
function groupsWithNothingToDo(setup, terms) {
  const openTo = (setup.activities || []).map(
    (a) =>
      new Set(
        (a[CHILDREN.Activity.Eligibilities] || []).map(
          (e) => e[WHO.Division] || e[WHO.Group]
        )
      )
  );
  const problems = [];
  (setup.programs || []).forEach((entry) => {
    (entry.divisions || []).forEach((d) => {
      (d.groups || []).forEach((grp) => {
        const canDoOne = openTo.some(
          (who) => who.size === 0 || who.has(grp.Id) || who.has(d.division.Id)
        );
        if (!canDoOne) {
          problems.push({
            screen: "activities",
            name: grp.Name,
            why: `No ${terms.pIn("Activity")} are open to this ${terms.sIn("Group")}.`
          });
        }
      });
    });
  });
  return problems;
}

const AVAILABILITY = {
  MorningOnly: { words: "morning only", away: "Afternoon" },
  AfternoonOnly: { words: "afternoon only", away: "Morning" }
};

/**
 * Which groups a fixed or recurring activity takes, block by block. A fixed activity takes every
 * group in its program; a recurring one the divisions and groups it covers (every group when it
 * names none). A group not at camp in a time block (morning or afternoon only) is left out of it.
 * Returns [{ group, blocks: how many of its blocks the group is there for }] and the block count.
 */
function whoIsThere(entry, item, fields) {
  const blocks = entry.timeBlocks || [];
  const start = item[fields.TimeBlock]
    ? blocks.findIndex((block) => block.Id === item[fields.TimeBlock])
    : -1;
  const span =
    start < 0 ? [] : blocks.slice(start, start + (item[fields.Length] || 1));
  // Only a recurring activity has a who list: a fixed one has none, so it takes everyone.
  const named = new Set(
    (item[CHILDREN.RecurringActivity.Coverages] || []).map(
      (row) => row[COVERS.Division] || row[COVERS.Group]
    )
  );
  const groups = [];
  (entry.divisions || []).forEach((d) => {
    (d.groups || []).forEach((grp) => {
      if (named.size === 0 || named.has(grp.Id) || named.has(d.division.Id)) {
        const away = (AVAILABILITY[grp[GROUP.Availability]] || {}).away;
        groups.push({
          group: grp,
          blocks: span.filter(
            (block) => !away || block[BLOCK.PartOfDay] !== away
          ).length
        });
      }
    });
  });
  return { groups, span: span.length };
}

/**
 * The note on a fixed or recurring activity's row: which groups are left out because they are not
 * at camp then (Greg, 2026-10-16: left out and shown, not refused). Empty when nobody is.
 */
export function setTimeNote(entry, item, fields) {
  const { groups, span } = whoIsThere(entry, item, fields);
  return groups
    .filter((g) => g.blocks < span)
    .map((g) => {
      const availability = AVAILABILITY[g.group[GROUP.Availability]];
      const words = availability.words;
      const part =
        g.blocks === 0 ? "" : ` of its ${availability.away.toLowerCase()} part`;
      return `${g.group.Name} is ${words} and is left out${part}.`;
    })
    .join(" ");
}

/** "Period 1 – Lunch", or just "Period 1" for one block. */
function range(first, last) {
  return first.Id === last.Id ? first.Name : `${first.Name} – ${last.Name}`;
}

/**
 * When time blocks were added, moved, or deleted after a fixed or recurring activity was saved, so
 * it now covers different blocks (Greg, 2026-10-16: show it, with real fixes, each saying exactly
 * what it will cover). Returns null when it covers what it did, or
 * { why, actions: [{ key, label, changes }] } where changes are the fields a fix saves: the last
 * block it covers now (keep the new coverage), or a new length (back to where it used to end).
 * Only fixes that make sense are offered; when only keeping it does, the note says why.
 */
export function spanChange(entry, item, terms, fields) {
  const blocks = entry.timeBlocks || [];
  const start = item[fields.TimeBlock]
    ? blocks.findIndex((block) => block.Id === item[fields.TimeBlock])
    : -1;
  if (start < 0) {
    return null;
  }
  const length = item[fields.Length] || 1;
  const now = Math.min(start + length, blocks.length) - 1;
  const last = item[fields.LastTimeBlock];
  if (blocks[now].Id === last) {
    return null;
  }
  const was = blocks.findIndex((block) => block.Id === last);
  const first = blocks[start];
  const covers = (end) => range(first, blocks[end]);
  const changed = `${terms.p("TimeBlock")} changed since it was saved:`;
  const keep = {
    key: "keep",
    label: `Keep ${covers(now)}`,
    changes: { [fields.LastTimeBlock]: blocks[now].Id }
  };
  const keepOnly = (reason) => ({
    why: `${changed} it now covers ${covers(now)}. ${reason}`,
    actions: [keep]
  });
  if (was > now) {
    // A block added inside it (or its first block moved earlier): it now stops short of where it
    // used to end. Both fixes name what they cover in today's order, and both are clash-checked.
    return {
      why: `${changed} it covered ${covers(was)} and now covers ${covers(now)}.`,
      actions: [
        keep,
        {
          key: "stretch",
          label: `Stretch to ${covers(was)}`,
          changes: { [fields.Length]: was - start + 1 }
        }
      ]
    };
  }
  if (was >= start) {
    // A block inside it removed (or moved away): it now runs on past where it used to end.
    return {
      why: `${changed} it covered ${covers(was)} and now covers ${covers(now)}.`,
      actions: [shorter(covers, start, was, fields), extend(keep, blocks[now])]
    };
  }
  if (was < 0 && start + length <= blocks.length && length > 1) {
    // The block it ended in was deleted: it now runs one block further.
    return {
      why: `${changed} the ${terms.sIn("TimeBlock")} it ended in was deleted, and it now covers ${covers(now)}.`,
      actions: [
        shorter(covers, start, now - 1, fields),
        extend(keep, blocks[now])
      ]
    };
  }
  if (was < 0 && start + length > blocks.length) {
    return keepOnly(
      "It now runs to the end of the day, so it can only be kept as it is."
    );
  }
  if (was >= 0) {
    return keepOnly(
      "Where it used to end is now earlier than where it starts, so it can only be kept as it is."
    );
  }
  return keepOnly("It can only be kept as it is.");
}

function shorter(covers, start, end, fields) {
  return {
    key: "shorter",
    label: `Keep the shorter ${covers(end)}`,
    changes: { [fields.Length]: end - start + 1 }
  };
}

function extend(keep, last) {
  return {
    key: "extend",
    label: `Extend to ${last.Name}`,
    changes: keep.changes
  };
}

/**
 * Fixed and recurring activity nudges (clashes are refused, never shown here): one whose time
 * blocks changed under it, one that runs in no weeks, one that every group it covers is left out
 * of, and one whose location is not open in a week it runs.
 */
function setTimeProblems(setup, terms) {
  const problems = [];
  const weeks = setup.weeks || [];
  const marks = setup.weekExceptions || [];
  const locations = new Map((setup.locations || []).map((l) => [l.Id, l]));
  (setup.programs || []).forEach((entry) => {
    // Each kind: its screen, its object and fields, the week exception field naming it, and
    // its items.
    const kinds = [
      [
        "fixedActivities",
        OBJECT.FixedActivity,
        FIELD.FixedActivity,
        OFF.FixedActivity,
        entry.fixedActivities
      ],
      [
        "recurringActivities",
        OBJECT.RecurringActivity,
        FIELD.RecurringActivity,
        OFF.RecurringActivity,
        entry.recurringActivities
      ]
    ];
    kinds.forEach(([screen, object, itemFields, field, items]) => {
      (items || []).forEach((item) => {
        const add = (why) => problems.push({ screen, name: item.Name, why });
        const moved = spanChange(entry, item, terms, itemFields);
        if (moved) {
          // Each fix is offered right on the attention item, as a save of this row.
          problems.push({
            screen,
            name: item.Name,
            why: moved.why,
            actions: moved.actions.map((action) => ({
              key: action.key,
              label: action.label,
              record: { sobjectType: object, Id: item.Id, ...action.changes }
            }))
          });
        }
        const off = new Set(
          marks.filter((m) => m[field] === item.Id).map((m) => m[OFF.Week])
        );
        if (weeks.length > 0 && off.size >= weeks.length) {
          add(`Runs in no ${terms.pIn("Week")}.`);
        }
        const { groups, span } = whoIsThere(entry, item, itemFields);
        if (
          span > 0 &&
          groups.length > 0 &&
          groups.every((g) => g.blocks === 0)
        ) {
          add(
            `Every ${terms.sIn("Group")} it covers is left out: none is at camp then.`
          );
        }
        const location = locations.get(item[itemFields.Location]);
        const shut = new Set(
          marks
            .filter((m) => location && m[OFF.Location] === location.Id)
            .map((m) => m[OFF.Week])
        );
        const closed = weeks
          .filter((w) => shut.has(w.Id) && !off.has(w.Id))
          .map((w) => w.Name);
        if (closed.length > 0) {
          add(
            `"${location.Name}" is not open in ${closed.join(", ")}, but this runs then.`
          );
        }
      });
    });
  });
  return problems;
}

/** "Summer 2026" copied to a 2027 start becomes "Summer 2027"; otherwise "<name> (copy)". */
export function suggestedCopyName(name, oldStartDate, newStartDate) {
  const oldYear = (oldStartDate || "").slice(0, 4);
  const newYear = (newStartDate || "").slice(0, 4);
  if (oldYear && newYear && oldYear !== newYear && name.includes(oldYear)) {
    return name.split(oldYear).join(newYear);
  }
  return `${name} (copy)`;
}

/** The same weekday about a year later: 52 weeks on. */
export function suggestedCopyStart(oldStartDate) {
  const [y, m, d] = oldStartDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 364));
  return date.toISOString().slice(0, 10);
}
