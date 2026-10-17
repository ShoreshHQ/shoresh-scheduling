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

function programCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "hold",
    title: `Which ${t.sIn("Program")} are ${nameList(ask.groups)} in?`,
    subject: nameList(ask.groups),
    subtitle: `Their ${t.pIn("TimeBlock")} do not match another ${t.sIn("Program")} in the files.`,
    options: [
      ...ask.options.map((p) => ({ value: p.id, label: p.name })),
      { value: "new", label: `A new ${t.sIn("Program")}` },
      leaveOut(`These ${t.pIn("Group")} are not added this time.`)
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

function groupCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: `${ask.group} is in ${ask.current}. The file puts it in ${ask.file}.`,
    subject: ask.group,
    subtitle: `${capital(article(t.sIn("Group")))} cannot move to another ${t.sIn("Division")} once set up. Its schedule from the file is added where it is.`,
    options: [
      { value: "keep", label: `Keep it in ${ask.current}` },
      leaveOut(`${ask.group} and its schedule are not added.`)
    ]
  };
}

function divisionCard(ask, t) {
  return {
    id: ask.id,
    stage: "review",
    lane: "standard",
    title: `Which ${t.sIn("Division")} is ${ask.group} in?`,
    subject: ask.group,
    subtitle: `The file does not say.`,
    options: [
      ...ask.options.map((name) => ({ value: name, label: name })),
      leaveOut(`${ask.group} and its schedule are not added.`)
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

const CARDS = {
  kind: kindCard,
  program: programCard,
  block: blockCard,
  days: daysCard,
  group: groupCard,
  division: divisionCard,
  fixed: setTimeChangeCard,
  recurring: setTimeChangeCard,
  activity: activityChangeCard
};

/** Every card, preview cards first, then hold, then the rest, each with its answer. */
export function questionCards(proposal, t, answers) {
  const cards = [
    ...proposal.reading.pairs.map((pair) => similarCard(pair, t)),
    ...proposal.reading.disagreements.map(crossCard),
    ...proposal.asks.map((ask) => CARDS[ask.type](ask, t))
  ];
  const seen = new Set();
  const order = (c) => (c.stage === "preview" ? 0 : c.lane === "hold" ? 1 : 2);
  return cards
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .map((c, i) => ({ ...c, answer: answers[c.id] || null, position: i }))
    .sort((a, b) => order(a) - order(b) || a.position - b.position);
}
