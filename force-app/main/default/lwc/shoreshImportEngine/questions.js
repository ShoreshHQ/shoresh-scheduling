/*
 * The question cards, in the camp's words. Every card must be answered before saving (Greg,
 * 2026-10-16), and every card can be answered "Leave it out for now": that item is not added,
 * the summary lists it, and the next import asks again.
 *
 * Cards follow the desktop's review cards (src/components/reconciliation/reconciliationCards.jsx):
 * a bold question, a grey line saying what the file shows, and the answers. "hold" cards (which
 * kind something is, which program, files that disagree) come first, as the desktop's hold lane.
 */
import { LEAVE_OUT } from "./reading";
import { WEEKDAYS, shortClock } from "./text";

function article(word) {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function quoted(name) {
  return `“${name}”`;
}

/** "Monday", "Monday and Wednesday", "Monday, Tuesday, and Friday", "Monday to Friday". */
export function dayList(days) {
  const ordered = WEEKDAYS.filter((d) => days.includes(d));
  if (ordered.length === 5) {
    return "Monday to Friday";
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

export function similarCard(pair, t) {
  const term = pair.kind === "group" ? t.sIn("Group") : t.sIn("Activity");
  const card = {
    id: pair.id,
    stage: "preview",
    lane: "standard",
    title: `Are ${quoted(pair.a)} and ${quoted(pair.b)} the same ${term}?`,
    subject: pair.existing ? pair.a : `${pair.a} and ${pair.b}`,
    detail: SIMILAR_WHY[pair.reason]
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
    options
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
      ...ask.options.map((name) => ({ value: name, label: name })),
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
      ...ask.options.map((name) => ({ value: name, label: name })),
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
      ...ask.options.map((name) => ({ value: name, label: name })),
      leaveOut(`What the file has for ${ask.name} is not added.`)
    ]
  };
}

function itemBlockName(ask) {
  const program = ask.timetable.program;
  const block =
    program && program.blocks.find((b) => b.id === ask.record.TimeBlock__c);
  return block ? block.name : "its time block";
}

function lengthText(length, t) {
  return length > 1 ? `, ${length} ${t.pIn("TimeBlock")} long` : "";
}

function setTimeChangeCard(ask, t) {
  const recurring = ask.type === "recurring";
  const currentDays = recurring
    ? ` on ${dayList(WEEKDAYS.filter((d) => ask.record[`${d}__c`]))}`
    : "";
  const fileDays = recurring ? ` on ${dayList(ask.days)}` : "";
  const now = `${itemBlockName(ask)}${lengthText(ask.record.Length__c, t)}${currentDays}`;
  const file = `${ask.block.name}${lengthText(ask.length, t)}${fileDays}`;
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
    title: `${quoted(ask.name)} is set up as ${blocks(ask.record.Length__c)} long. In the file it runs ${blocks(ask.length)}.`,
    subject: `The change to ${ask.name}`,
    options: [
      { value: "keep", label: `Keep ${blocks(ask.record.Length__c)}` },
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

function weekCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: ask.label
      ? `Which ${t.sIn("Week")} is ${ask.label} of the files?`
      : `Which ${t.sIn("Week")} is last year's schedule?`,
    subject: `Last year's schedule${ask.label ? ` (${ask.label})` : ""} as a version`,
    subtitle: `It is saved as a version for that ${t.sIn("Week")}, to look at on Schedules.`,
    options: [
      ...ask.options.map((name) => ({ value: name, label: name })),
      leaveOut("Last year's schedule is not saved as a version this time.")
    ]
  };
}

const CARDS = {
  week: weekCard,
  kind: kindCard,
  program: programCard,
  move: moveCard,
  whichGroup: whichGroupCard,
  block: blockCard,
  days: daysCard,
  division: divisionCard,
  fixed: setTimeChangeCard,
  recurring: setTimeChangeCard,
  activity: activityChangeCard
};

/** Every card, preview cards first, then hold, then the rest, each with its answer. */
export function questionCards(proposal, t, answers) {
  const cards = [
    ...proposal.reading.pairs.map((pair) => similarCard(pair, t)),
    ...proposal.reading.timeAsks.map(ampmCard),
    ...proposal.reading.groupAsks.map((ask) => whichGroupCard(ask, t)),
    ...proposal.reading.disagreements.map(crossCard),
    ...proposal.asks.map((ask) => CARDS[ask.type](ask, t))
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
