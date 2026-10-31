/*
 * The question cards, in the camp's words. Every card must be answered before saving (Greg,
 * 2026-10-16), and every card can be answered "Leave it out for now": that item is not added,
 * the summary lists it, and the next import asks again.
 *
 * Cards follow the desktop's review cards (src/components/reconciliation/reconciliationCards.jsx):
 * a bold question, a grey line saying what the file shows, and the answers. "hold" cards (which
 * kind something is, which program, files that disagree) come first, as the desktop's hold lane.
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import {
  ELECTIVES,
  NOT_ELECTIVES,
  ONE_ACTIVITY,
  SEVERAL,
  electiveWord
} from "./engine.shoreshImportEngine.electives.mjs";
import { LEAVE_OUT } from "./engine.shoreshImportEngine.reading.mjs";
import { COLOUR_ADD, NO_DIVISION, blocksOf } from "./engine.shoreshImportEngine.reading-constants.mjs";
import { WEEKDAYS, shortClock, weekOrder } from "./engine.shoreshImportEngine.text.mjs";

function article(word) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function quoted(name) {
  return `“${name}”`;
}

/**
 * "Monday", "Monday and Wednesday", "Monday, Tuesday, and Friday", "Monday to Friday", "Sunday to
 * Thursday", "every day": in the order the week runs, five or six days in a row as a range.
 */
export function dayList(days) {
  const ordered = weekOrder(days);
  if (ordered.length === 7) {
    return "every day";
  }
  const first = WEEKDAYS.indexOf(ordered[0]);
  const inARow = ordered.every((d, i) => WEEKDAYS[(first + i) % 7] === d);
  if (ordered.length >= 5 && inARow) {
    return `${ordered[0]} to ${ordered[ordered.length - 1]}`;
  }
  if (ordered.length <= 2) {
    return ordered.join(" and ");
  }
  return `${ordered.slice(0, -1).join(", ")}, and ${ordered[ordered.length - 1]}`;
}

export function nameList(names, max = 4) {
  if (names.length <= max) {
    return names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")}, and ${names.length - max} more`;
}

function times(block) {
  return block.start === null
    ? ""
    : `${shortClock(block.start)}–${shortClock(block.end)}`;
}

function blockSpan(timetable, index, length) {
  const first = timetable.blocks[index];
  const last = timetable.blocks[index + length - 1] || first;
  return length > 1 ? `${first.name} to ${last.name}` : first.name;
}

function leaveOut(label) {
  return {
    value: LEAVE_OUT,
    label: "Leave it out for now",
    description: label
  };
}

// ---------- preview: similar names ----------

const SIMILAR_WHY = {
  spelling: "They differ only in capitals, spacing, or punctuation.",
  ending: "Only the ending is different.",
  letter: "One letter is different."
};

function times1(n) {
  return n === 1 ? "once" : `${n} times`;
}

/**
 * What the pattern layer reads from a question (c/shoreshPatterns, MEMO-3.3): its shape, and
 * for similar names which option "same" is: the camp's name, else the spelling the file uses
 * more (the first on a tie).
 */
function similarLearn(pair) {
  return {
    shape: pair.existing ? "camp" : "file",
    same: pair.existing || pair.bCount > pair.aCount ? "b" : "a"
  };
}

/** A kind question's shape: why it is asked, whether everyone has it, one block or more. */
function kindShape(f) {
  const length = f.patterns.length ? f.patterns[0].length : 1;
  return `${f.reason || "once"}|${f.fixedShaped ? "everyone" : "some"}|${length > 1 ? "long" : "one"}`;
}

const twoOrMore = (n) => (n === 2 ? "two" : "more");

export function similarCard(pair, t) {
  const term = t.sIn(
    { group: "Group", division: "Division" }[pair.kind] || "Activity"
  );
  const card = {
    id: pair.id,
    stage: "preview",
    lane: "standard",
    title: `Are ${quoted(pair.a)} and ${quoted(pair.b)} the same ${term}?`,
    subject: pair.existing ? pair.a : `${pair.a} and ${pair.b}`,
    detail: SIMILAR_WHY[pair.reason],
    learn: similarLearn(pair)
  };
  if (pair.existing) {
    return {
      ...card,
      subtitle: `${quoted(pair.b)} is already set up. ${quoted(pair.a)} is in the file ${times1(pair.aCount)}.`,
      options: [
        { value: "b", label: `Same: use ${quoted(pair.b)}` },
        { value: "different", label: `Different: add ${quoted(pair.a)}` },
        leaveOut(`${quoted(pair.a)} is not added this time.`)
      ]
    };
  }
  return {
    ...card,
    subtitle: `In the file: ${quoted(pair.a)} ${times1(pair.aCount)}, ${quoted(pair.b)} ${times1(pair.bCount)}.`,
    options: [
      { value: "a", label: `Same: call it ${quoted(pair.a)}` },
      { value: "b", label: `Same: call it ${quoted(pair.b)}` },
      { value: "different", label: "Different: keep both" },
      leaveOut("Neither is added this time.")
    ]
  };
}

// ---------- review ----------

function crossCard(d) {
  const week = d.week ? ` (${d.week})` : "";
  return {
    id: d.id,
    stage: "review",
    lane: "hold",
    title: `The files disagree about ${d.group}, ${d.day}, ${d.block}${week}. Which is right?`,
    subject: `${d.group}, ${d.day}, ${d.block}${week}`,
    subtitle: d.versions
      .map((v) => `${quoted(v.text)} in ${v.files.join(", ")}`)
      .join("; "),
    options: [
      ...d.versions.map((v) => ({
        value: v.text,
        label: v.text,
        description: `As in ${v.files.join(", ")}`
      })),
      leaveOut("That cell is left out.")
    ]
  };
}

function patternWho(pattern, facts, t) {
  if (pattern.groups.length === facts.groups.length) {
    return `every ${t.sIn("Group")}`;
  }
  const divisions = [
    ...new Set(pattern.groups.map((g) => facts.divisionOf.get(g)))
  ];
  const whole = divisions.every((d) =>
    facts.groups
      .filter((g) => facts.divisionOf.get(g) === d)
      .every((g) => pattern.groups.includes(g))
  );
  return whole ? nameList(divisions) : nameList(pattern.groups);
}

export function patternText(pattern, facts, timetable, t) {
  return `${patternWho(pattern, facts, t)} at ${blockSpan(timetable, pattern.block, pattern.length)} on ${dayList(pattern.days)}`;
}

function kindWhy(ask, t) {
  const f = ask.facts;
  const set = f.patterns.map((p) =>
    patternText(p, ask.timetableFacts, ask.timetable, t)
  );
  const strays = f.strays.reduce(
    (n, p) => n + p.groups.length * p.days.length,
    0
  );
  if (f.reason === "scattered") {
    return `At a set time (${set.join("; ")}), and ${times1(strays)} at other times.`;
  }
  if (f.reason === "nearFixed") {
    return `${set.join("; ")}, but not every day: some days it is empty or something else is there.`;
  }
  if (f.reason === "weeks") {
    return `At a set time in some weeks of the files but not in others.`;
  }
  return `${set.join("; ")}. Only one week shows it, so it may or may not be a set time.`;
}

function kindCard(ask, t) {
  const f = ask.facts;
  const options = [];
  if (f.fixedShaped) {
    options.push({
      value: "fixed",
      label: capital(article(t.sIn("FixedActivity"))),
      description: `Every ${t.sIn("Group")}, the same ${t.sIn("TimeBlock")}, every day. The other times are not set up.`
    });
  }
  options.push({
    value: "recurring",
    label: capital(article(t.sIn("RecurringActivity"))),
    description: `At the set time${f.patterns.length > 1 ? "s" : ""} above, every week. The other times are not set up.`
  });
  options.push({
    value: "activity",
    label: capital(article(t.sIn("Activity"))),
    description: `Placed in the schedule like the other ${t.pIn("Activity")}.`
  });
  options.push(leaveOut(`${quoted(ask.name)} is not added this time.`));
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Is ${quoted(ask.name)} at a set time, or ${article(t.sIn("Activity"))}?`,
    subject: ask.name,
    subtitle: `${ask.several ? `${ask.program}: ` : ""}${kindWhy(ask, t)}`,
    options,
    learn: { shape: kindShape(f) }
  };
}

/** Shown on the preview as a choice beside the groups: which program they go to. */
function programCard(ask, t) {
  return {
    id: ask.id,
    stage: "preview",
    select: "program",
    lane: "standard",
    title: `${t.s("Program")} for ${nameList(ask.groups)}`,
    subject: nameList(ask.groups),
    preselected: ask.preselected,
    options: [
      ...ask.options.map((name, i) => {
        const start = monthDay((ask.starts || [])[i]);
        return {
          value: name,
          label: start ? `${name} (starts ${start})` : name
        };
      }),
      { value: "new", label: `A new ${t.sIn("Program")}` },
      { value: LEAVE_OUT, label: `Leave these ${t.pIn("Group")} out for now` }
    ]
  };
}

function blockCard(ask, t) {
  const current = `${ask.current.name}, ${times(ask.current)}`;
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: `${ask.program}: ${ask.current.name} is set up as ${times(ask.current)}. The file has ${times(ask.file)}.`,
    subject: `What the file has in ${ask.file.name}`,
    subtitle: ask.noChange
      ? `The file has more than one ${t.sIn("TimeBlock")} in ${ask.current.name}'s time, so its times cannot simply change.`
      : `Matched by time: the file calls it ${quoted(ask.file.name)}.`,
    options: [
      {
        value: "keep",
        label: `Keep ${current}`,
        description: `What the file has at ${times(ask.file)} goes into ${ask.current.name}.`
      },
      ...(ask.noChange
        ? []
        : [{ value: "change", label: `Change it to ${times(ask.file)}` }]),
      leaveOut(`What the file has in this ${t.sIn("TimeBlock")} is not added.`)
    ]
  };
}

function daysCard(ask) {
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: `${ask.program} runs ${dayList(ask.current)}. The file also has ${dayList(ask.missing)}.`,
    subject: `What the file has on ${dayList(ask.missing)}`,
    subtitle: `What the file has on those days is only added if ${ask.program} runs then.`,
    options: [
      { value: "keep", label: `Keep ${dayList(ask.current)}` },
      { value: "change", label: `Add ${dayList(ask.missing)}` },
      leaveOut(`What the file has on ${dayList(ask.missing)} is not added.`)
    ]
  };
}

function moveEffects(ask) {
  const parts = [];
  if (ask.loses.length) {
    parts.push(`is no longer in ${nameList(ask.loses)} (for ${ask.from})`);
  }
  if (ask.gains.length) {
    parts.push(`is now in ${nameList(ask.gains)} (for ${ask.to})`);
  }
  return parts.length
    ? `If it moves, ${ask.group} ${parts.join(" and ")}.`
    : `Nothing set up is for ${ask.from} or ${ask.to} by name, so moving changes nothing else.`;
}

/** A group the camp has in another division than the file shows. */
function moveCard(ask, t) {
  const sameProgram = ask.canMove;
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: sameProgram
      ? `${ask.group} is in ${ask.from}. The file puts it in ${ask.to}.`
      : `${ask.group} is in ${ask.from}, in ${ask.program}. The file puts it in ${ask.to}.`,
    subject: ask.group,
    subtitle: sameProgram
      ? moveEffects(ask)
      : `${ask.program} is another ${t.sIn("Program")}, so this ${t.sIn("Group")} cannot move here or take this schedule.`,
    options: [
      ...(sameProgram
        ? [
            {
              value: "move",
              label: `Move ${ask.group} from ${ask.from} to ${ask.to}`
            },
            {
              value: "keep",
              label: `Keep it in ${ask.from}`,
              description: "Its schedule from the file is added there."
            }
          ]
        : []),
      {
        value: "new",
        label: `Add a new ${ask.group} to ${ask.to}`,
        description: `Two ${t.pIn("Group")} called ${ask.group}, one in each.`
      },
      leaveOut(`${ask.group} and its schedule are not added.`)
    ]
  };
}

/** Shown on the preview beside each new group: the division it goes into. */
function divisionCard(ask, t) {
  return {
    id: ask.id,
    stage: "preview",
    select: "division",
    lane: "standard",
    title: ask.group,
    subject: ask.group,
    preselected: ask.preselected,
    options: [
      ...ask.options.map((name, i) => {
        const start = monthDay((ask.starts || [])[i]);
        return {
          value: name,
          label: start ? `${name} (starts ${start})` : name
        };
      }),
      // DIV-1.1: a group may be in no division.
      { value: NO_DIVISION, label: `No ${t.sIn("Division")}` },
      { value: LEAVE_OUT, label: `Leave it out for now` }
    ],
    placeholder: `Choose a ${t.sIn("Division")}`
  };
}

/** A group name used in several divisions, in a file that does not say which. */
function whichGroupCard(ask, t) {
  return {
    id: ask.id,
    stage: "preview",
    lane: "hold",
    title: `Which ${ask.name} is in ${ask.file}?`,
    subject: `${ask.name} in ${ask.file}`,
    subtitle: `There is more than one ${t.sIn("Group")} called ${ask.name}, and the file does not say its ${t.sIn("Division")}.`,
    options: [
      ...ask.options.map((name, i) => {
        const start = monthDay((ask.starts || [])[i]);
        return {
          value: name,
          label: start ? `${name} (starts ${start})` : name
        };
      }),
      leaveOut(`What the file has for ${ask.name} is not added.`)
    ]
  };
}

/**
 * Rule 8: a group read last time as one (its bunks always moved together) whose bunks now do
 * different things. Kept as one group until answered.
 */
function splitCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Split ${ask.group} into its ${t.pIn("Group")}?`,
    subject: ask.group,
    subtitle: `${ask.group} moved together last time; this file has ${ask.bunks.join(" and ")} doing different things.`,
    learn: { shape: twoOrMore(ask.bunks.length) },
    options: [
      {
        value: "split",
        label: `Split into ${ask.bunks.join(", ")}`,
        description: `Each is its own ${t.sIn("Group")} from now on.`
      },
      {
        value: "keep",
        label: `Keep ${ask.group} as one ${t.sIn("Group")}`,
        description: `Its schedule from this file is ${ask.bunks[0]}'s.`
      }
    ]
  };
}

/** The fields of the item a set-time change card is about: fixed or recurring. */
function itemFields(ask) {
  return ask.type === "recurring"
    ? FIELD.RecurringActivity
    : FIELD.FixedActivity;
}

function itemBlockName(ask) {
  const program = ask.timetable.program;
  const timeBlock = itemFields(ask).TimeBlock;
  const block =
    program && program.blocks.find((b) => b.id === ask.record[timeBlock]);
  return block ? block.name : "its time block";
}

function lengthText(length, t) {
  return length > 1 ? `, ${length} ${t.pIn("TimeBlock")} long` : "";
}

/** INGEST-4.13: ", 1 time block earlier on Friday" for a fixed activity's early day. */
function earlyText(day, by, t) {
  return day && by > 0
    ? `, ${by} ${by === 1 ? t.sIn("TimeBlock") : t.pIn("TimeBlock")} earlier on ${day}`
    : "";
}

function setTimeChangeCard(ask, t) {
  const recurring = ask.type === "recurring";
  const fields = itemFields(ask);
  const currentDays = recurring
    ? ` on ${dayList(WEEKDAYS.filter((d) => ask.record[FIELD.RecurringActivity[d]]))}`
    : "";
  const fileDays = recurring ? ` on ${dayList(ask.days)}` : "";
  const fixed = FIELD.FixedActivity;
  const nowEarly = recurring
    ? ""
    : earlyText(ask.record[fixed.EarlyDay], ask.record[fixed.EarlyBlocks], t);
  // A file without an early day keeps the one set up (INGEST-4.13): said on both sides.
  const fileEarly = recurring
    ? ""
    : ask.earlyDay
      ? earlyText(ask.earlyDay, ask.earlyBlocks, t)
      : nowEarly;
  const now = `${itemBlockName(ask)}${lengthText(ask.record[fields.Length], t)}${currentDays}${nowEarly}`;
  const file = `${ask.block.name}${lengthText(ask.length, t)}${fileDays}${fileEarly}`;
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: `${quoted(ask.name)} is set up at ${now}. The file has it at ${file}.`,
    subject: `The change to ${ask.name}`,
    subtitle: `${ask.program}, ${recurring ? t.sIn("RecurringActivity") : t.sIn("FixedActivity")}`,
    options: [
      { value: "keep", label: "Keep it as it is" },
      { value: "change", label: `Change it to ${file}` },
      leaveOut("It stays as it is this time.")
    ]
  };
}

function activityChangeCard(ask, t) {
  const blocks = (n) =>
    `${n} ${n === 1 ? t.sIn("TimeBlock") : t.pIn("TimeBlock")}`;
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: `${quoted(ask.name)} is set up as ${blocks(ask.record[FIELD.Activity.Length])} long. In the file it runs ${blocks(ask.length)}.`,
    subject: `The change to ${ask.name}`,
    options: [
      {
        value: "keep",
        label: `Keep ${blocks(ask.record[FIELD.Activity.Length])}`
      },
      { value: "change", label: `Change it to ${blocks(ask.length)}` },
      leaveOut("It stays as it is this time.")
    ]
  };
}

/** A 5 or 6 o'clock block without AM or PM: morning or evening? */
function ampmCard(ask) {
  const range = (offset) =>
    `${shortClock(ask.start - offset)}\u2013${shortClock(ask.end - offset)}`;
  return {
    id: ask.id,
    stage: "preview",
    lane: "hold",
    title: `Is ${ask.name} ${range(0)} in the morning or the evening?`,
    subject: `${ask.name} ${range(0)}`,
    subtitle: "The file gives no AM or PM.",
    options: [
      { value: "morning", label: `In the morning (${range(12 * 60)} AM)` },
      { value: "evening", label: `In the evening (${range(0)} PM)` },
      leaveOut("This time block and what is in it are not added.")
    ]
  };
}

/** A question about the files' time blocks: morning or evening, or two days of their own. */
function timeCard(ask, t) {
  if (ask.type === "oneDay") {
    return oneDayCard(ask, t);
  }
  if (ask.type === "everyWeek") {
    return everyWeekCard(ask, t);
  }
  return ask.type === "ownDays" ? ownDaysCard(ask, t) : ampmCard(ask);
}

/** INGEST-4.14: a single-day file whose name and title name no day: which day is it? */
function oneDayCard(ask, t) {
  return {
    id: ask.id,
    stage: "preview",
    lane: "hold",
    title: `This looks like a single-day schedule. Which day is ${ask.file}?`,
    subject: ask.file,
    subtitle: `It comes in as ${article(t.sIn("SpecialDay"))} with its own times.`,
    options: [
      ...WEEKDAYS.map((day) => ({ value: day, label: day })),
      leaveOut(`${ask.file} is not added this time.`)
    ]
  };
}

/** INGEST-4.12: a mid-week day with its own times in a one-week file. */
function everyWeekCard(ask, t) {
  const one = t.sIn("SpecialDay");
  return {
    id: ask.id,
    stage: "preview",
    lane: "hold",
    title: `${ask.day} has its own times. Every week, or just this once?`,
    subject: ask.day,
    subtitle: `It comes in as ${article(one)} with its own times.`,
    options: [
      {
        value: "every",
        label: "Every week",
        description: `One ${one}, on every ${ask.day} of the season.`
      },
      {
        value: "once",
        label: "Just this once",
        description: `One ${one}, on this week's ${ask.day} only.`
      }
    ]
  };
}

/** INGEST-4.8: a week with two days of their own times. */
function ownDaysCard(ask, t) {
  const days = dayList(ask.days);
  return {
    id: ask.id,
    stage: "preview",
    lane: "hold",
    title: `Are ${days} of ${ask.week} ${t.pIn("SpecialDay")}, or a second ${t.sIn("Program")}?`,
    subject: `${ask.week}: ${days}`,
    subtitle: "Both days have their own times in the file.",
    options: [
      {
        value: "special",
        label: capital(t.pIn("SpecialDay")),
        description: `Each comes in as ${article(t.sIn("SpecialDay"))} with its own times.`
      },
      {
        value: "program",
        label: `A second ${t.sIn("Program")}`,
        description: `Those days' ${t.pIn("Group")} are set up in a ${t.sIn("Program")} of their own.`
      },
      leaveOut("Those days are not added this time.")
    ]
  };
}

/** INGEST-4.9: two programs' own days on one week's day: a day holds one special day. */
function specialDayClashCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Which ${t.sIn("Program")}'s ${ask.day} is ${ask.week}'s ${t.sIn("SpecialDay")}?`,
    subject: `${ask.week}'s ${ask.day}`,
    subtitle: `${nameList(ask.options)} each have their own times that day; a day holds one ${t.sIn("SpecialDay")}.`,
    options: [
      ...ask.options.map((name) => ({ value: name, label: name })),
      leaveOut(`${ask.week}'s ${ask.day} is not added this time.`)
    ]
  };
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** "2027-06-28" -> "Jun 28". */
function monthDay(iso) {
  const [, m, d] = String(iso || "")
    .split("-")
    .map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : "";
}

/** Each week by its name and start date ("Week 1 (starts Jun 28)"); its name is the answer. */
function weekCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: ask.label
      ? `Which ${t.sIn("Week")} is ${ask.label} of the files?`
      : `Which ${t.sIn("Week")} is last year's schedule?`,
    subject: `Last year's schedule${ask.label ? ` (${ask.label})` : ""} as a version`,
    subtitle: `It is saved as a version for that ${t.sIn("Week")}, to look at on Saved versions.`,
    options: [
      ...ask.options.map((name, i) => {
        const start = monthDay((ask.starts || [])[i]);
        return {
          value: name,
          label: start ? `${name} (starts ${start})` : name
        };
      }),
      leaveOut("Last year's schedule is not saved as a version this time.")
    ]
  };
}

// ---------- electives (slice E9) ----------

function orList(names) {
  return names.length <= 2
    ? names.join(" or ")
    : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

/** Where a set sits: its days, its time blocks, and who holds it, as the file printed them. */
function electiveWhere(set, proposal, t) {
  const timetables = proposal.timetables;
  const days = [...new Set(set.cells.map((p) => p.day))];
  const blocks = [];
  set.cells.forEach((p) => {
    // Every block it fills, the second of a double period too.
    for (const b of blocksOf(p)) {
      const block = timetables[p.timetable].blocks[b];
      if (block && !blocks.includes(block.name)) {
        blocks.push(block.name);
      }
    }
  });
  const groups = [...new Set(set.cells.map((p) => p.group))];
  const here = new Set(set.cells.map((p) => p.timetable));
  const all = proposal.groups.filter(
    (g) => !g.leftOut && here.has(g.timetable)
  );
  const who =
    groups.length === all.length ? `every ${t.sIn("Group")}` : nameList(groups);
  return `${dayList(days)}, ${nameList(blocks)}, ${who}`;
}

function electiveDetail(set) {
  const parts = [];
  const n = set.offerings.length;
  if (n > 0) {
    parts.push(
      `${n} ${n === 1 ? "choice" : "choices"} proposed: ${nameList(
        set.offerings.map((o) => o.activityName),
        6
      )}.`
    );
  } else if (set.isNew) {
    parts.push("No choices in the file: add them later.");
  }
  set.linked
    .filter((c, i, all) => all.findIndex((x) => x.day === c.day) === i)
    .forEach((c) =>
      parts.push(
        `Each choice taken as a set across ${nameList(c.blockNames)} on ${c.day}.`
      )
    );
  return parts.join(" ");
}

/**
 * An elective set read from the file, with the one escape (desktop D1-B): not a question, so it is
 * preselected and listed with the other choices Shoresh made itself, still changeable.
 */
function electiveCard(ask, t, proposal) {
  const word = electiveWord(t);
  const set = ask.set;
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    flag: true,
    title: set.name,
    subject: set.name,
    subtitle: `Read as ${word}: ${electiveWhere(set, proposal, t)}.`,
    detail: electiveDetail(set),
    preselected: ELECTIVES,
    options: [
      { value: ELECTIVES, label: capital(word) },
      {
        value: NOT_ELECTIVES,
        label: `Not ${word}`,
        description: `Set up as what its cells show: a fixed or recurring ${t.sIn("Activity")}, or ${article(t.sIn("Activity"))}.`
      }
    ]
  };
}

/** A cell that looks like a list but not surely one (desktop D3-C): asked once. */
function listCard(ask, t) {
  if (ask.twoActivities) {
    return twoActivitiesCard(ask, t);
  }
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Is ${quoted(ask.name)} one ${t.sIn("Activity")} or a choice of ${orList(ask.parts)}?`,
    subject: ask.name,
    subtitle: `${ask.parts.length} names in one cell.`,
    learn: { shape: twoOrMore(ask.parts.length) },
    options: [
      { value: ONE_ACTIVITY, label: `One ${t.sIn("Activity")}` },
      {
        value: SEVERAL,
        label: `A choice of ${ask.parts.length}`,
        description: `${capital(electiveWord(t))}, with ${nameList(ask.parts)} proposed as choices.`
      },
      leaveOut(`${quoted(ask.name)} is not added this time.`)
    ]
  };
}

/**
 * INGEST-2.18: two activities in one cell ("Swim/Art"), Greg's wording (2026-10-28). Half the
 * period each comes in as one activity named as the cell (a period is not split in two); the
 * group splitting is a choice of the two, as "A choice of" is.
 */
function twoActivitiesCard(ask, t) {
  const [a, b] = ask.parts;
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Half the period each, or does the ${t.sIn("Group")} split?`,
    subject: ask.name,
    subtitle: `${quoted(ask.name)}: ${ask.group}, ${ask.day}.`,
    learn: { shape: "two" },
    options: [
      {
        value: ONE_ACTIVITY,
        label: "Half the period each",
        description: `${a}, then ${b}: comes in as one ${t.sIn("Activity")}, ${quoted(ask.name)}.`
      },
      {
        value: SEVERAL,
        label: `The ${t.sIn("Group")} splits`,
        description: `${capital(electiveWord(t))}, with ${a} and ${b} proposed as choices.`
      },
      leaveOut(`${quoted(ask.name)} is not added this time.`)
    ]
  };
}

/** INGEST-2.19: an activity shown only by colour, whose cells came in blank. */
function colourCard(ask) {
  const name = quoted(ask.name);
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Where was ${name}? The file showed it only in ${ask.colour.toLowerCase()}.`,
    subject: ask.name,
    subtitle: `The colour did not come through, so its cells are blank. To bring its times in, type ${ask.name} into those cells and upload the file again.`,
    options: [
      {
        value: COLOUR_ADD,
        label: `Add ${name} with no times yet`,
        description: `Its cells stay empty; place it on the schedule after.`
      },
      leaveOut(`${name} is not added; its cells stay empty.`)
    ]
  };
}

const CARDS = {
  colour: colourCard,
  week: weekCard,
  specialDayClash: specialDayClashCard,
  kind: kindCard,
  program: programCard,
  move: moveCard,
  whichGroup: whichGroupCard,
  block: blockCard,
  days: daysCard,
  division: divisionCard,
  fixed: setTimeChangeCard,
  recurring: setTimeChangeCard,
  activity: activityChangeCard,
  elective: electiveCard,
  list: listCard
};

/** Every card, preview cards first, then hold, then the rest, each with its answer. */
export function questionCards(proposal, t, answers) {
  const cards = [
    ...proposal.reading.pairs.map((pair) => similarCard(pair, t)),
    ...proposal.reading.timeAsks.map((ask) => timeCard(ask, t)),
    ...proposal.reading.groupAsks.map((ask) => whichGroupCard(ask, t)),
    ...(proposal.reading.splitAsks || []).map((ask) => splitCard(ask, t)),
    ...proposal.reading.disagreements.map(crossCard),
    ...proposal.asks.map((ask) => CARDS[ask.type](ask, t, proposal))
  ];
  const seen = new Set();
  const order = (c) => (c.stage === "preview" ? 0 : c.lane === "hold" ? 1 : 2);
  return cards
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .map((c, i) => ({
      ...c,
      answer: answers[c.id] || c.preselected || null,
      position: i
    }))
    .sort((a, b) => order(a) - order(b) || a.position - b.position);
}
