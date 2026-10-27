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
 * is about (name), what is wrong (why), and which screen fixes it (screen, see shoreshScreens);
 * kind names the check, and of (where there is one) the record it is about, so Roots' hand can
 * gather each kind onto one card (repo ADR 0020 choice 10). Dates are ISO strings (YYYY-MM-DD),
 * which compare correctly as text.
 */
export function setupProblems(setup, terms) {
  if (!setup || !setup.season) {
    return [];
  }
  const problems = [
    ...weekProblems(setup, terms),
    ...structureProblems(setup, terms),
    ...activityProblems(setup, terms),
    ...setTimeProblems(setup, terms),
    ...specialDayProblems(setup, terms),
    ...electiveProblems(setup, terms)
  ];
  return problems.map((problem, i) => ({ key: `p${i}`, ...problem }));
}

function weekProblems(setup, terms) {
  const problems = [];
  const season = setup.season;
  const weeks = [...(setup.weeks || [])].sort((a, b) => {
    return a[WEEK.StartDate] < b[WEEK.StartDate] ? -1 : 1;
  });
  const add = (kind, name, why, of) =>
    problems.push({ screen: "weeks", kind, name, why, of });
  weeks.forEach((week) => {
    if (
      week[WEEK.StartDate] < season[SEASON.StartDate] ||
      week[WEEK.EndDate] > season[SEASON.EndDate]
    ) {
      add(
        "weekOutside",
        week.Name,
        `Falls outside the dates of this ${terms.sIn("Season")}.`,
        week.Id
      );
    }
  });
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i][WEEK.StartDate] <= weeks[i - 1][WEEK.EndDate]) {
      add(
        "weeksShare",
        `${weeks[i - 1].Name} and ${weeks[i].Name}`,
        "Share dates.",
        `${weeks[i - 1].Id}|${weeks[i].Id}`
      );
    }
  }
  if (weeks.length === 0) {
    add("noWeeks", season.Name, `No ${terms.pIn("Week")} yet.`);
  }
  return problems;
}

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
const MS_PER_MINUTE = 60000;

/** The days a week's dates include. */
function weekdaysIn(week) {
  const start = week[WEEK.StartDate];
  const end = week[WEEK.EndDate];
  const has = new Set();
  if (!start || !end) {
    return has;
  }
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    if (date.toISOString().slice(0, 10) > end) {
      break;
    }
    has.add(WEEKDAYS[(date.getUTCDay() + 6) % 7]);
  }
  return has;
}

/** Minutes past midnight from a time block's time (milliseconds) or a plan's ("HH:mm"). */
function minutesOf(value) {
  if (typeof value === "number") {
    return Math.round(value / MS_PER_MINUTE);
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "12:30" from minutes, as a special day's details write its times. */
function clockOf(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** A name compared as setup compares names: spaces and capitals aside. */
function nameKey(name) {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Elective offerings (repo ADR 0018, slice E4; plan section 4.6), for Roots' Needs attention: one
 * an import proposed and no one has confirmed (it gets no campers until then), and a limited one
 * whose seats are blank or 0 (seats are still assigned, with no limit; the flag says to choose
 * them, Greg 2026-10-26). On the Electives screen they are marked in their rows (a dashed edge, the
 * needs-a-look corner), so the screen's own list leaves them out (markedInPlace).
 */
function electiveProblems(setup, terms) {
  const electives = setup.electives || {};
  const OFFER = FIELD.Offering;
  const sets = new Map((electives.sets || []).map((s) => [s.Id, s.Name]));
  const activities = new Map(
    (setup.activities || []).map((a) => [a.Id, a.Name])
  );
  const problems = [];
  (electives.offerings || []).forEach((offering) => {
    const name = activities.get(offering[OFFER.Activity]) || "";
    const set = sets.get(offering[OFFER.ElectiveSet]) || "";
    const add = (kind, why) =>
      problems.push({
        screen: "electives",
        kind,
        name,
        why: `In "${set}": ${why}`,
        of: offering.Id,
        markedInPlace: true
      });
    if (offering[OFFER.Proposed]) {
      add("offeringProposed", "proposed, not confirmed yet.");
    }
    const seats = offering[OFFER.Seats];
    const blank = seats === null || seats === undefined || seats === "";
    // Blank or 0: the seat run uses no limit; the flag says what to do (Greg, 2026-10-26).
    if (!offering[OFFER.NoSeatLimit] && (blank || Number(seats) === 0)) {
      add(
        "offeringNoSeats",
        `choose how many ${terms.sIn("Seats")} "${name}" has.`
      );
    }
  });
  return problems;
}

/**
 * Special days (ADR 0014 slice 6), on the Special events screen. Shown, never fixed: a special
 * day's plan is the director's own.
 * - On a weekday its week no longer has (the week's dates moved: ADR 0014 choice 4); that day
 *   shows nothing special. Taking it off that day is the fix.
 * - Its time blocks no longer match the regular day's: a time block with the same name as one of
 *   the program's it started from (the first program with time blocks, ADR 0014 choice 12) but
 *   other times, as when Lunch moved in setup after the special day was made. Time blocks of its
 *   own (another name) are the point of a special day and are not flagged.
 */
function specialDayProblems(setup, terms) {
  const special = setup.special || {};
  const briefs = new Map((special.briefs || []).map((b) => [b.itemId, b]));
  const weeks = new Map((setup.weeks || []).map((w) => [w.Id, w]));
  const program = (setup.programs || []).find(
    (entry) => (entry.timeBlocks || []).length > 0
  );
  const regular = new Map();
  ((program && program.timeBlocks) || []).forEach((block) => {
    const key = nameKey(block.Name);
    if (key && !regular.has(key)) {
      regular.set(key, {
        start: minutesOf(block[BLOCK.StartTime]),
        end: minutesOf(block[BLOCK.EndTime])
      });
    }
  });
  const problems = [];
  (special.specialDays || []).forEach((specialDay) => {
    const brief = briefs.get(specialDay.Id);
    if (!brief) {
      return;
    }
    const add = (kind, why, day) =>
      problems.push({
        screen: "specialEvents",
        kind,
        name: specialDay.Name,
        why,
        of: specialDay.Id,
        day
      });
    (brief.days || []).forEach((onDay) => {
      const week = weeks.get(onDay.weekId);
      if (week && !weekdaysIn(week).has(onDay.day)) {
        add(
          "specialOffDay",
          `On ${onDay.day} of "${week.Name}", which that ${terms.sIn("Week")} no longer has. Take it off that day.`,
          onDay.day
        );
      }
    });
    if (brief.problem) {
      return;
    }
    const differ = [];
    (brief.periods || []).forEach((period) => {
      const was = regular.get(nameKey(period.name));
      const start = minutesOf(period.startTime);
      const end = minutesOf(period.endTime);
      if (
        was &&
        was.start !== null &&
        start !== null &&
        (was.start !== start || was.end !== end)
      ) {
        differ.push(
          `${period.name} is ${clockOf(start)}–${clockOf(end)} here and ${clockOf(was.start)}–${clockOf(was.end)} there`
        );
      }
    });
    if (differ.length) {
      add(
        "specialTimes",
        `Its ${terms.pIn("TimeBlock")} no longer match ${program.program.Name}'s: ${differ.join("; ")}.`
      );
    }
  });
  return problems;
}

function structureProblems(setup, terms) {
  const problems = [];
  const add = (screen, kind, name, why, of) =>
    problems.push({ screen, kind, name, why, of });
  const programs = setup.programs || [];
  if (programs.length === 0) {
    add(
      "programs",
      "noPrograms",
      setup.season.Name,
      `No ${terms.pIn("Program")} yet. Every ${terms.sIn("Season")} needs at least one.`
    );
  }
  programs.forEach((entry) => {
    const name = entry.program.Name;
    if ((entry.timeBlocks || []).length === 0) {
      add(
        "timeBlocks",
        "noTimeBlocks",
        name,
        `No ${terms.pIn("TimeBlock")} yet.`,
        entry.program.Id || name
      );
    }
    if ((entry.divisions || []).length === 0) {
      add(
        "divisions",
        "noDivisions",
        name,
        `No ${terms.pIn("Division")} yet.`,
        entry.program.Id || name
      );
    }
    (entry.divisions || []).forEach((d) => {
      if ((d.groups || []).length === 0) {
        add(
          "groups",
          "noGroups",
          d.division.Name,
          `No ${terms.pIn("Group")} yet.`,
          d.division.Id
        );
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
        kind: "noActivities",
        name: setup.season.Name,
        why: `No ${terms.pIn("Activity")} yet.`
      }
    ];
  }
  const problems = groupsWithNothingToDo(setup, terms);
  const add = (kind, activity, why, more) =>
    problems.push({
      screen: "activities",
      kind,
      name: activity.Name,
      why,
      of: activity.Id,
      ...more
    });
  const locations = new Map((setup.locations || []).map((l) => [l.Id, l]));
  activities.forEach((activity) => {
    if (activity[ACTIVITY.Outdoor] && !activity[ACTIVITY.RainPlan]) {
      add(
        "noRainPlan",
        activity,
        `Outdoors and has no ${terms.sIn("RainPlan")}.`
      );
    }
    const location = locations.get(activity[ACTIVITY.Location]);
    const atOnce = activity[ACTIVITY.GroupsAtOnce];
    const fits = location && location[LOCATION.GroupsThatFit];
    if (location && !activity[ACTIVITY.NoGroupLimit] && atOnce > fits) {
      add(
        "tooManyAtOnce",
        activity,
        `Allows ${atOnce} ${terms.pIn("Group")} at once, ` +
          `but "${location.Name}" fits ${fits}. Scheduling uses ` +
          `${fits}; change whichever number is wrong.`,
        { atOnce, fits }
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
            kind: "nothingOpen",
            of: grp.Id,
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
        const add = (kind, why) =>
          problems.push({ screen, kind, name: item.Name, why, of: item.Id });
        const moved = spanChange(entry, item, terms, itemFields);
        if (moved) {
          // Each fix is offered right on the attention item, as a save of this row.
          problems.push({
            screen,
            kind: "spanChanged",
            of: item.Id,
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
          add("runsNoWeek", `Runs in no ${terms.pIn("Week")}.`);
        }
        const { groups, span } = whoIsThere(entry, item, itemFields);
        if (
          span > 0 &&
          groups.length > 0 &&
          groups.every((g) => g.blocks === 0)
        ) {
          add(
            "allLeftOut",
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
            "placeClosed",
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

function rainPlanOption(activity) {
  return {
    label: activity[ACTIVITY.Outdoor]
      ? `${activity.Name} (outdoor, choose another)`
      : activity.Name,
    value: activity.Id
  };
}

/** Every activity as a rain plan is named, outdoor ones "(outdoor, choose another)". */
export function rainPlanOptions(activities) {
  return activities.map(rainPlanOption);
}

/**
 * What one activity's rain plan can be (Shoresh desktop ActivitiesScreen.jsx:336-341): indoor
 * activities only, plus, for the activity that already holds an outdoor one, that one, so its
 * row shows what it has. Saving it again is refused (ActivityTriggerHandler).
 */
export function rainPlanChoices(activities, held) {
  return activities
    .filter((a) => !a[ACTIVITY.Outdoor] || a.Id === held)
    .map(rainPlanOption);
}

function runsOnADay(program) {
  return WEEKDAYS.some((day) => program[FIELD.Program[day]]);
}

/**
 * What building a week still needs (Shoresh desktop readiness.js REQUIRED_AREAS: age divisions,
 * groups, days, time blocks, activities; here also weeks and programs, which Salesforce needs to
 * choose a week): [{ screen, label }] in that order, empty when building can start. Divisions,
 * groups, days and time blocks are the chosen program's (the first one when none is chosen).
 * Building waits for all of them (coordinator, 2026-10-17, like the desktop).
 */
export function stillNeeded(setup, terms, programId) {
  if (!setup || !setup.season) {
    return [];
  }
  const t = terms;
  const needed = [];
  const add = (screen, label) => needed.push({ screen, label });
  if ((setup.weeks || []).length === 0) {
    add("weeks", t.p("Week"));
  }
  const programs = setup.programs || [];
  const entry = programs.find((p) => p.program.Id === programId) || programs[0];
  if (!entry) {
    add("programs", t.p("Program"));
  } else {
    const divisions = entry.divisions || [];
    if (divisions.length === 0) {
      add("divisions", t.p("Division"));
    }
    // As on the desktop, groups are needed until there are some, units or not.
    if (divisions.every((d) => (d.groups || []).length === 0)) {
      add("groups", t.p("Group"));
    }
    if (!runsOnADay(entry.program)) {
      add("programs", "Days");
    }
    if ((entry.timeBlocks || []).length === 0) {
      add("timeBlocks", t.p("TimeBlock"));
    }
  }
  if ((setup.activities || []).length === 0) {
    add("activities", t.p("Activity"));
  }
  return needed;
}

/**
 * The desktop's sentence (readiness.js describeSetupGaps) as parts, each name a link to its
 * screen: "One thing still needed before you can build the schedule: Bunks." or "3 things still
 * needed before you can build the schedule: Units, Bunks and Periods." No article is built from a
 * camp word, so "a week" reads "the schedule". [] when nothing is needed.
 */
export function stillNeededSentence(needed) {
  if (!needed.length) {
    return [];
  }
  const count = needed.length === 1 ? "One thing" : `${needed.length} things`;
  const parts = [
    {
      key: "lead",
      text: `${count} still needed before you can build the schedule: `
    }
  ];
  needed.forEach((item, i) => {
    if (i > 0) {
      parts.push({
        key: `sep${i}`,
        text: i === needed.length - 1 ? " and " : ", "
      });
    }
    parts.push({
      key: `link${i}`,
      link: true,
      text: item.label,
      screen: item.screen
    });
  });
  parts.push({ key: "end", text: "." });
  return parts;
}

/**
 * Each setup menu item's mark (Shoresh desktop Sidebar.jsx renderItem): "needed" ("!") when an
 * area building needs is empty, "done" ("✓") when an area has rows, none otherwise. Screen -> mark.
 * The desktop has one program; here an area a program owns is done only when every program has
 * it, so the menu never shows ✓ on what Manual Build still lists as needed (stillNeeded).
 */
export function menuMarks(setup) {
  if (!setup || !setup.season) {
    return {};
  }
  const programs = setup.programs || [];
  const every = (test) => programs.length > 0 && programs.every(test);
  const groupsOf = (p) => (p.divisions || []).flatMap((d) => d.groups || []);
  const has = {
    weeks: (setup.weeks || []).length > 0,
    programs: every((p) => runsOnADay(p.program)),
    divisions: every((p) => (p.divisions || []).length > 0),
    groups: every((p) => groupsOf(p).length > 0),
    timeBlocks: every((p) => (p.timeBlocks || []).length > 0),
    activities: (setup.activities || []).length > 0,
    locations: (setup.locations || []).length > 0,
    fixedActivities: programs.some((p) => (p.fixedActivities || []).length > 0),
    recurringActivities: programs.some(
      (p) => (p.recurringActivities || []).length > 0
    )
  };
  const required = new Set([
    "weeks",
    "programs",
    "divisions",
    "groups",
    "timeBlocks",
    "activities"
  ]);
  const marks = {};
  Object.entries(has).forEach(([screen, filled]) => {
    if (filled) {
      marks[screen] = "done";
    } else if (required.has(screen)) {
      marks[screen] = "needed";
    }
  });
  return marks;
}

/** Every week, bunk, activity, and location of the season: Id -> name. */
function recordNames(setup) {
  const names = new Map();
  const add = (records) =>
    (records || []).forEach((r) => names.set(r.Id, r.Name));
  add(setup.weeks);
  add(setup.activities);
  add(setup.locations);
  (setup.programs || []).forEach((entry) =>
    (entry.divisions || []).forEach((d) => add(d.groups))
  );
  return names;
}

/**
 * The question before turning something off for a week it is already placed in (Shoresh desktop
 * ExclusionConfirmDialog.jsx, its words in the camp's, "cells" for the desktop's "slots"):
 * { heading, lines, confirmLabel } for c-shoresh-ask. placed: RunsInController.placedInWeeks's
 * answer ([{ target, week, cells }]), one item or several at once.
 */
export function turnOffQuestion(placed, setup, terms) {
  const names = recordNames(setup || {});
  const cells = (n) => `${n} ${n === 1 ? "cell" : "cells"}`;
  const stay = "They stay until you change them.";
  if (placed.length === 1) {
    const [only] = placed;
    const week = names.get(only.week) || `this ${terms.sIn("Week")}`;
    return {
      heading: `Turn off "${names.get(only.target) || "this one"}" for ${week}?`,
      lines: [`Placed in ${cells(only.cells)} in ${week}.`, stay],
      confirmLabel: "Turn off anyway"
    };
  }
  return {
    heading: "Turn these off?",
    lines: [
      ...placed.map(
        (p) =>
          `"${names.get(p.target) || "One of them"}": placed in ${cells(p.cells)} in ${names.get(p.week)}.`
      ),
      stay
    ],
    confirmLabel: "Turn off anyway"
  };
}
