/*
 * From a proposal to (1) the save the server makes, all or none, and (2) the lists the screens
 * show: what was found, what is new, what changes, what is left out and why, and what is noted
 * but not set up.
 */
import { FIELD } from "c/shoreshSchema";
import { broughtBack } from "./deleted";
import { clock, shortClock } from "./text";
import { dayList, nameList } from "./questions";

/** The highest place in order among records, by the records' own sort-order field. */
function maxSort(records, sortOrder) {
  return Math.max(0, ...(records || []).map((r) => r[sortOrder] || 0));
}

function article(word) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function partOfDay(minutes) {
  return minutes < 12 * 60 ? "Morning" : "Afternoon";
}

function usedTimetables(proposal) {
  return proposal.timetables.filter((t) => !t.leftOut);
}

function programRecords(proposal, existing) {
  const base = ((existing && existing.programs) || []).length;
  let n = 0;
  return usedTimetables(proposal)
    .filter((t) => !t.program || t.addDays.length > 0)
    .map((t) => ({
      key: t.key,
      id: t.program ? t.program.id : null,
      name: t.name,
      days: t.days,
      sortOrder: t.program ? null : base + ++n
    }));
}

function blockRecords(proposal) {
  const result = [];
  for (const t of usedTimetables(proposal)) {
    const existingMax = t.program
      ? Math.max(0, ...t.program.blocks.map((b) => b.sortOrder))
      : 0;
    let n = 0;
    t.blocks.forEach((b) => {
      if (b.isNew) {
        result.push({
          key: `B|${t.key}|${b.fileKey}`,
          id: null,
          programKey: t.key,
          name: b.name,
          start: clock(b.start),
          end: clock(b.end),
          partOfDay: partOfDay(b.start),
          sortOrder: existingMax + ++n
        });
      } else if (b.change) {
        // Only the times change: the block's name and part of day stay as the camp set them.
        result.push({
          key: b.id,
          id: b.id,
          start: clock(b.change.start),
          end: clock(b.change.end)
        });
      }
    });
  }
  return result;
}

function groupRecords(proposal, existing) {
  const programs = (existing && existing.programs) || [];
  const allGroups = programs.flatMap((p) =>
    (p.divisions || []).flatMap((d) => d.groups || [])
  );
  const base = maxSort(allGroups, FIELD.Group.SortOrder);
  const kept = proposal.groups.filter((g) => !g.leftOut);
  const added = kept
    .filter((g) => g.isNew)
    .sort((a, b) => a.order - b.order)
    .map((g, i) => ({
      key: g.key,
      id: null,
      divisionKey: g.divisionKey,
      name: g.recordName || g.name,
      sortOrder: base + i + 1
    }));
  // A group the director chose to move to another division.
  const moved = kept
    .filter((g) => g.moveTo)
    .map((g) => ({ key: g.id, id: g.id, divisionKey: g.moveTo }));
  return [...added, ...moved];
}

function divisionRecords(proposal, existing) {
  const programs = (existing && existing.programs) || [];
  const used = new Set(
    proposal.groups.filter((g) => !g.leftOut).map((g) => g.divisionKey)
  );
  const count = new Map();
  return proposal.divisions
    .filter((d) => d.isNew && used.has(d.key))
    .map((d) => {
      const entry = programs.find((p) => p.program.Id === d.programKey);
      const base = entry
        ? maxSort(
            (entry.divisions || []).map((x) => x.division),
            FIELD.Division.SortOrder
          )
        : 0;
      count.set(d.programKey, (count.get(d.programKey) || 0) + 1);
      return {
        key: d.key,
        id: null,
        programKey: d.programKey,
        name: d.name,
        sortOrder: base + count.get(d.programKey)
      };
    });
}

function activityRecords(proposal, existing) {
  const base = maxSort(
    existing && existing.activities,
    FIELD.Activity.SortOrder
  );
  const added = proposal.activities.map((a, i) => ({
    key: `A|${a.name}`,
    id: null,
    name: a.name,
    length: a.length,
    min: a.min,
    max: a.max,
    groupsAtOnce: a.groupsAtOnce,
    locationKey: a.locationKey,
    who: a.who.keys,
    sortOrder: base + i + 1
  }));
  const changed = proposal.updates.activities.map((u) => ({
    key: u.id,
    id: u.id,
    length: u.length
  }));
  return [...added, ...changed];
}

function setTimeRecords(records, updates, withDays) {
  const added = records.map((r) => ({
    key: r.key,
    id: null,
    programKey: r.programKey,
    name: r.name,
    blockKey: r.blockKey,
    length: r.length,
    locationKey: r.locationKey,
    ...(withDays ? { days: r.days, who: r.who.keys } : {})
  }));
  const changed = updates.map((u) => ({
    id: u.id,
    blockKey: u.blockKey,
    length: u.length,
    ...(withDays ? { days: u.days } : {})
  }));
  return [...added, ...changed];
}

/**
 * The answers to remember for this camp (Greg: exact answers, so a similar file does not ask
 * again), and those to forget: "Leave it out for now" means the next import asks again.
 */
export function answersToKeep(proposal, answers) {
  const ids = new Set([
    ...proposal.reading.pairs.map((x) => x.id),
    ...proposal.reading.disagreements.map((x) => x.id),
    ...proposal.reading.groupAsks.map((x) => x.id),
    ...proposal.reading.timeAsks.map((x) => x.id),
    ...proposal.asks.map((x) => x.id),
    ...proposal.offeredPlaces.map((x) => x.id)
  ]);
  const remember = [];
  const forget = [];
  for (const id of [...ids].sort()) {
    if (answers[id] === "leaveOut") {
      forget.push(id);
    } else if (answers[id]) {
      remember.push({ key: id, answer: String(answers[id]) });
    }
  }
  // Brought back: the camp no longer remembers it as deleted.
  forget.push(...broughtBack(answers));
  return { remember, forget };
}

/**
 * What this import guessed rather than read outright, marked for a look on the setup screens
 * until the director says it looks right or changes it (Greg, decision 45; ADR 0006 §21). As on
 * the desktop (ruleProvenance.js, LocationsScreen.jsx, GroupsScreen.jsx): a new activity's times
 * a week and who can do it, a new place's groups that fit, and a new group's division when only
 * its file's name gave it. The server stores each with the value it saved (SetupGuesses).
 */
function guessedRecords(proposal) {
  return [
    ...proposal.activities.map((a) => ({
      kind: "Activity",
      key: `A|${a.name}`,
      fields: ["often", "who"]
    })),
    ...proposal.locations
      .filter((l) => l.isNew)
      .map((l) => ({ kind: "Location", key: l.key, fields: ["fits"] })),
    ...proposal.groups
      .filter((g) => !g.leftOut && g.isNew && g.divisionGuessed)
      .map((g) => ({ kind: "Group", key: g.key, fields: ["division"] }))
  ];
}

/**
 * The save, for ImportController.saveSetup: every record to add or change, in the order they
 * depend on each other. New records point at each other by key; existing ones by Id.
 */
export function planFor(proposal, existing, seasonId, extra = {}) {
  return {
    seasonId,
    files: (extra.fileNames || []).join(", ").slice(0, 255),
    ...answersToKeep(proposal, extra.answers || {}),
    // The season's weeks filled from its dates first (it had none), as "Fill in weeks" makes them.
    fillWeeks: (proposal.fillWeeks || []).map((w) => ({
      start: w[FIELD.Week.StartDate],
      name: w.Name
    })),
    versions: proposal.versions.map((v) => ({
      programKey: v.programKey,
      weekId: v.weekId,
      weekKey: v.weekKey,
      name: v.name,
      days: v.days
    })),
    programs: programRecords(proposal, existing),
    timeBlocks: blockRecords(proposal),
    divisions: divisionRecords(proposal, existing),
    groups: groupRecords(proposal, existing),
    locations: proposal.locations
      .filter((l) => l.isNew)
      .map((l) => ({
        key: l.key,
        id: null,
        name: l.name,
        groupsThatFit: l.groupsThatFit
      })),
    activities: activityRecords(proposal, existing),
    fixedActivities: setTimeRecords(
      proposal.fixed,
      proposal.updates.fixed,
      false
    ),
    recurringActivities: setTimeRecords(
      proposal.recurring,
      proposal.updates.recurring,
      true
    ),
    guessed: guessedRecords(proposal)
  };
}

// ---------- what the screens list ----------

function blockText(b) {
  return b.start === null
    ? b.name
    : `${b.name} (${shortClock(b.start)}–${shortClock(b.end)})`;
}

function timesAWeek(a, t) {
  const range = a.min === a.max ? `${a.max}` : `${a.min}–${a.max}`;
  const parts = [`${range} a ${t.sIn("Week")}`];
  if (a.length > 1) {
    parts.push(`${a.length} ${t.pIn("TimeBlock")} long`);
  }
  if (a.groupsAtOnce > 1) {
    parts.push(`${a.groupsAtOnce} ${t.pIn("Group")} at once`);
  }
  parts.push(a.who.names.length ? `${nameList(a.who.names)} only` : "everyone");
  if (a.place) {
    parts.push(a.place);
  }
  return parts.join(" · ");
}

function fixedText(r) {
  const block = r.timetable.blocks[r.block];
  const span =
    r.length > 1
      ? ` to ${r.timetable.blocks[r.block + r.length - 1].name}`
      : "";
  return `${block.name}${span}, every day`;
}

/** Names in the file the camp already has as this kind (each once): "already set up". */
function matched(proposal, kind) {
  const names = proposal.decisions
    .filter((d) => d.existing && d.kind === kind && !d.leftOut)
    .map((d) => d.name);
  return [...new Set(names)].map((name) => ({
    key: `matched|${name}`,
    name,
    detail: "",
    tag: "already set up"
  }));
}

const NOTED_KINDS = {
  E: "Elective",
  D: "SpecialDay",
  S: "SpecialEvent",
  T: "Trip"
};

/**
 * What the preview shows, kind by kind: [{ key, title, items: [{ key, name, detail, tag }] }],
 * each item tagged "new", "already set up", "changes", or "left out".
 */
export function foundLists(proposal, t) {
  const tag = (isNew) => (isNew ? "new" : "already set up");
  const timetables = usedTimetables(proposal);
  const lists = [
    {
      key: "programs",
      title: t.p("Program"),
      items: timetables.map((x) => ({
        key: x.key,
        name: x.name,
        detail: dayList(x.days),
        tag: tag(!x.program)
      }))
    },
    {
      key: "timeBlocks",
      title: t.p("TimeBlock"),
      items: timetables.flatMap((x) =>
        x.blocks.map((b) => ({
          key: `${x.key}|${b.fileKey}`,
          name: blockText(b),
          detail: timetables.length > 1 ? x.name : "",
          tag: b.deleted
            ? "deleted before"
            : b.leftOut || b.untimed
              ? "left out"
              : b.change
                ? "changes"
                : tag(b.isNew)
        }))
      )
    },
    {
      key: "groups",
      title: t.p("Group"),
      items: proposal.groups.map((g) => ({
        key: g.name,
        name: g.name,
        detail: g.division || "",
        tag: g.deleted
          ? "deleted before"
          : g.leftOut
            ? "left out"
            : tag(g.isNew)
      }))
    },
    {
      key: "fixedActivities",
      title: t.p("FixedActivity"),
      items: [
        ...proposal.fixed.map((r) => ({
          key: `${r.programKey}|${r.name}`,
          name: r.name,
          detail: fixedText(r),
          tag: "new"
        })),
        ...matched(proposal, "fixed")
      ]
    },
    {
      key: "recurringActivities",
      title: t.p("RecurringActivity"),
      items: [
        ...proposal.recurring.map((r, i) => ({
          key: `${r.programKey}|${r.name}|${i}`,
          name: r.name,
          detail: `${r.timetable.blocks[r.block].name} on ${dayList(r.days)}, ${r.who.names.length ? nameList(r.who.names) : "everyone"}`,
          tag: "new"
        })),
        ...matched(proposal, "recurring")
      ]
    },
    {
      key: "activities",
      title: t.p("Activity"),
      items: [
        ...proposal.activities.map((a) => ({
          key: a.name,
          name: a.name,
          detail: timesAWeek(a, t),
          tag: "new"
        })),
        ...matched(proposal, "activity")
      ]
    },
    {
      key: "noted",
      title: "Not set up yet",
      items: proposal.noted.map((n) => ({
        key: n.name,
        name: n.name,
        detail: `${t.s(NOTED_KINDS[n.kind])}, ${dayList(n.days)}, ${n.groups} ${n.groups === 1 ? t.sIn("Group") : t.pIn("Group")}`,
        tag: "noted"
      }))
    }
  ];
  return lists.filter((list) => list.items.length > 0);
}

const UNPLACED_WHY = {
  leftOut: () => "left out for now",
  deleted: () => "deleted before; not brought back",
  groupDeleted: (t) =>
    `its ${t.sIn("Group")} was deleted before; not brought back`,
  blockDeleted: (t) =>
    `its ${t.sIn("TimeBlock")} was deleted before; not brought back`,
  programDeleted: (t) =>
    `its ${t.sIn("Program")} was deleted before; not brought back`,
  programLeftOut: (t) => `its ${t.sIn("Program")} is left out`,
  groupLeftOut: (t) => `its ${t.sIn("Group")} is left out`,
  blockLeftOut: (t) => `its ${t.sIn("TimeBlock")} is left out or has no times`,
  dayNotRun: (t) => `its ${t.sIn("Program")} does not run that day`,
  weekend: () => "Shoresh plans Monday to Friday",
  dayNotInWeek: (t) => `that ${t.sIn("Week")} has no such day`,
  weekLeftOut: (t) => `no ${t.sIn("Week")} was chosen for it`,
  noWeeks: (t) => `the ${t.sIn("Season")} has no ${t.pIn("Week")} yet`,
  twoAtOnce: () => "something else is already in that cell",
  sameWeek: (t) =>
    `another ${t.sIn("Week")} of the files went to the same ${t.sIn("Week")}`
};

/**
 * Placements not in last year's version, by name and reason: [{ key, name, count, where, why }],
 * "where" naming up to three of them ("Bunk 3, Tuesday, Period 2").
 */
export function unplacedLines(proposal, t) {
  const groups = new Map();
  for (const p of proposal.unmatched) {
    const key = `${p.text}|${p.why}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: p.text,
        count: 0,
        where: [],
        why: UNPLACED_WHY[p.why](t)
      });
    }
    const entry = groups.get(key);
    entry.count++;
    if (entry.where.length < 3) {
      entry.where.push(`${p.group}, ${p.day}, ${p.block}`);
    }
  }
  return [...groups.values()]
    .map((entry) => ({ ...entry, whereText: entry.where.join("; ") }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.why.localeCompare(b.why));
}

/** Things the director should know that are not questions: [{ key, text }]. */
export function importNotes(proposal, t) {
  const notes = [];
  const r = proposal.reading;
  r.unread.forEach((u) =>
    notes.push({
      key: `unread|${u.file}|${u.sheet}`,
      text: `${u.file}, ${u.sheet}: no schedule found on this sheet, so nothing was read from it.`
    })
  );
  r.pages
    .filter((p) => p.noDay)
    .forEach((p) =>
      notes.push({
        key: `noday|${p.key}`,
        text: `${p.file}, ${p.sheet}: it does not say which day it is, so nothing was read from it. Put the day in the sheet's name or title.`
      })
    );
  if (r.weekend.length) {
    notes.push({
      key: "weekend",
      text: `${r.weekend.length} placements on Saturday or Sunday are left out: Shoresh plans Monday to Friday.`
    });
  }
  for (const x of usedTimetables(proposal)) {
    x.blocks
      .filter((b) => b.untimed)
      .forEach((b) =>
        notes.push({
          key: `untimed|${x.key}|${b.fileKey}`,
          text: `${b.name} has no times in the file, so it is left out with what is in it. Add it on the ${t.p("TimeBlock")} screen.`
        })
      );
    x.blocks
      .filter((b) => b.isNew && b.readAsMorning)
      .forEach((b) =>
        notes.push({
          key: `morning|${x.key}|${b.fileKey}`,
          text: `${b.name} has no AM or PM in the file and comes before the rest of the day, so it is read as ${shortClock(b.start)}\u2013${shortClock(b.end)} in the morning.`
        })
      );
    x.blocks
      .filter((b) => b.isNew && b.guessedEnd)
      .forEach((b) =>
        notes.push({
          key: `end|${x.key}|${b.fileKey}`,
          text: `${b.name}: the file gives no end time, so it ends at ${shortClock(b.end)}, as long as the other ${t.pIn("TimeBlock")}. Change it on the ${t.p("TimeBlock")} screen if that is wrong.`
        })
      );
  }
  proposal.activities
    .filter((a) => a.lengthsVary)
    .forEach((a) =>
      notes.push({
        key: `length|${a.name}`,
        text: `${a.name} runs for different lengths in the file; it is set up as ${a.length} ${a.length === 1 ? t.sIn("TimeBlock") : t.pIn("TimeBlock")}, the length it has most often.`
      })
    );
  proposal.notes
    .filter((n) => n.type === "kindDiffers")
    .forEach((n) =>
      notes.push({
        key: `kind|${n.name}`,
        text: `${n.name} is already set up as ${n.kind === "fixed" ? t.sIn("FixedActivity") : t.sIn("RecurringActivity")} in ${n.program}, but the file has it at other times. It stays as it is.`
      })
    );
  proposal.notes
    .filter((n) => n.type === "otherProgram")
    .forEach((n) =>
      notes.push({
        key: `program|${n.group}`,
        text: `${n.group} is in ${n.program}, not ${n.to}, so its schedule from these files is left out. Import its file on its own to add it to ${n.program}.`
      })
    );
  const kindWords = {
    activity: t.sIn("Activity"),
    fixed: t.sIn("FixedActivity"),
    recurring: t.sIn("RecurringActivity")
  };
  proposal.notes
    .filter((n) => n.type === "mixedKinds")
    .forEach((n) =>
      notes.push({
        key: `mixed|${n.name}`,
        text: `${n.name} is ${n.places.map((x) => `${article(kindWords[x.kind])} in ${x.program}`).join(" and ")}. Each is set up where it is.`
      })
    );
  const filled = proposal.fillWeeks || [];
  if (filled.length) {
    const count =
      filled.length === 1
        ? `its one ${t.sIn("Week")} is`
        : `its ${filled.length} ${t.pIn("Week")} are`;
    notes.push({
      key: "fillWeeks",
      text: `The ${t.sIn("Season")} has no ${t.pIn("Week")} yet, so ${count} added from its dates, keeping last year's schedule as a ${t.sIn("Version")}.`
    });
  } else if (proposal.noWeeks && proposal.usable.length) {
    notes.push({
      key: "noWeeks",
      text: `The ${t.sIn("Season")} has no ${t.pIn("Week")} yet, so last year's schedule is not kept as a version. Add ${t.pIn("Week")} on the ${t.p("Week")} screen first to keep it.`
    });
  }
  if (proposal.activities.length) {
    notes.push({
      key: "rules",
      text: `Outdoors, rain plans, and priority are not in a schedule file, so new ${t.pIn("Activity")} start without them. Set them on the ${t.p("Activity")} screen.`
    });
  }
  return notes;
}

/** What Undo last import did, in one message (desktop wording, LastImportUndo.jsx). */
export function undoMessage(result) {
  const parts = [
    `Import undone. Removed ${result.removed} ${result.removed === 1 ? "thing" : "things"} it added`
  ];
  if (result.restored) {
    parts[0] += ` and put back ${result.restored} it changed`;
  }
  parts[0] += ".";
  if (result.keptEdited && result.keptEdited.length) {
    parts.push(
      `Kept, because they were changed since: ${nameList(result.keptEdited, 6)}.`
    );
  }
  if (result.keptInUse && result.keptInUse.length) {
    parts.push(
      `Kept, because something else still uses them: ${nameList(result.keptInUse, 6)}.`
    );
  }
  if (result.gone && result.gone.length) {
    parts.push(
      `Not put back, because they were deleted since: ${nameList(result.gone, 6)}.`
    );
  }
  return parts.join(" ");
}
