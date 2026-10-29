/**
 * "Read as" (docs/import/review.md, INGEST-5): what Shoresh read without asking, in one
 * reviewable list, grouped, each line with a one-click change. The change is an answer like any
 * other (it goes through buildProposal again and is remembered by the save).
 */
import { availabilityKey } from "./availability";
import { kindsThatFit } from "./items";
import { dayList } from "./questions";

const KIND_TERM = {
  activity: "Activity",
  fixed: "FixedActivity",
  recurring: "RecurringActivity"
};

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function counted(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** INGEST-5.1: each new name read as an activity, fixed or recurring, without asking. */
function kindLines(proposal, t) {
  const lines = { activity: [], fixed: [], recurring: [] };
  for (const d of proposal.decisions || []) {
    if (!d.readAs || d.existing || d.leftOut || !lines[d.kind]) {
      continue;
    }
    lines[d.kind].push({
      key: `${d.readAs}`,
      id: d.readAs,
      name: d.name,
      detail: d.several ? d.timetable.name : "",
      answer: d.kind,
      options: kindsThatFit(d).map((kind) => ({
        value: kind,
        label: capital(t.sIn(KIND_TERM[kind]))
      }))
    });
  }
  return lines;
}

/** INGEST-5.2: two spellings read as one name; "Keep apart" keeps both. */
function joinedLines(proposal) {
  return proposal.notes
    .filter((n) => n.type === "readAs" && n.id)
    .map((n) => ({
      key: n.id,
      id: n.id,
      name: `${n.from} → ${n.to}`,
      detail: "",
      answer: n.answer === "different" ? "different" : n.same,
      options: [
        { value: n.same, label: "Same" },
        { value: "different", label: "Keep apart" }
      ]
    }));
}

/** INGEST-5.3: a group with no division in the file, its own division; changed by its dropdown. */
function ownDivisionLines(proposal, cards) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return proposal.notes
    .filter((n) => n.type === "ownDivision" && byId.has(n.id))
    .map((n) => {
      const card = byId.get(n.id);
      return {
        key: n.id,
        id: n.id,
        name: n.group,
        detail: "",
        answer: card.answer,
        select: true,
        options: card.options
      };
    });
}

/** INGEST-5.4: one week's day with its own times, read as a special day. */
function specialDayLines(proposal, t) {
  return proposal.notes
    .filter((n) => n.type === "weekDay" && n.id)
    .map((n) => ({
      key: n.id,
      id: n.id,
      name: `${n.week ? `${n.week}'s ` : ""}${n.day}`,
      detail: "",
      answer: n.answer === "program" ? "program" : "special",
      options: [
        { value: "special", label: capital(t.sIn("SpecialDay")) },
        { value: "program", label: `A second ${t.sIn("Program")}` }
      ]
    }));
}

/** INGEST-5.7: an item an earlier import brought in, updated from the new file. */
function updatedLines(proposal, t) {
  const length = (n) =>
    `${n} ${n === 1 ? t.sIn("TimeBlock") : t.pIn("TimeBlock")}`;
  const detail = (n) => {
    if (n.kind === "activity") {
      return length(n.length);
    }
    const days = n.kind === "recurring" ? `, ${dayList(n.days)}` : "";
    return `${n.block.name}, ${length(n.length)}${days}`;
  };
  return proposal.notes
    .filter((n) => n.type === "updated")
    .map((n) => ({
      key: n.id,
      id: n.id,
      name: n.name,
      detail: detail(n),
      answer: n.answer,
      options: [
        { value: "change", label: "Update" },
        { value: "keep", label: "Keep as it is" }
      ]
    }));
}

const AVAILABILITY_LABEL = {
  AllDay: "All day",
  MorningOnly: "Morning only",
  AfternoonOnly: "Afternoon only"
};

/** INGEST-5.9: a group here for part of the day; All day makes it all day. */
function partOfDayLines(proposal) {
  return [...(proposal.availability || new Map())].map(([group, a]) => {
    const id = availabilityKey(group);
    return {
      key: id,
      id,
      name: group,
      detail: "",
      answer: a.availability,
      options: [a.read, "AllDay"].map((value) => ({
        value,
        label: AVAILABILITY_LABEL[value]
      }))
    };
  });
}

/**
 * The "Read as" groups, in order, each { key, label, lines }; a group with no line is left out.
 * cards: questionCards(proposal, t, answers) (a division of one is changed by its card).
 */
export function readAsGroups(proposal, t, cards = []) {
  const kinds = kindLines(proposal, t);
  const joined = joinedLines(proposal);
  const divisions = ownDivisionLines(proposal, cards);
  const days = specialDayLines(proposal, t);
  const groups = [
    {
      key: "activity",
      label: (n) => counted(n, t.sIn("Activity"), t.pIn("Activity")),
      lines: kinds.activity
    },
    {
      key: "fixed",
      label: (n) => counted(n, t.sIn("FixedActivity"), t.pIn("FixedActivity")),
      lines: kinds.fixed
    },
    {
      key: "recurring",
      label: (n) =>
        counted(n, t.sIn("RecurringActivity"), t.pIn("RecurringActivity")),
      lines: kinds.recurring
    },
    {
      key: "joined",
      label: (n) => counted(n, "name joined", "names joined"),
      lines: joined
    },
    {
      key: "division",
      label: (n) =>
        counted(
          n,
          `${t.sIn("Division")} of one`,
          `${t.pIn("Division")} of one`
        ),
      lines: divisions
    },
    {
      key: "updated",
      label: (n) =>
        counted(n, "updated from the file", "updated from the file"),
      lines: updatedLines(proposal, t)
    },
    {
      key: "specialDay",
      label: (n) => counted(n, `day of its own`, `days of their own`),
      lines: days
    },
    {
      key: "partOfDay",
      label: (n) =>
        counted(
          n,
          `${t.sIn("Group")} here part of the day`,
          `${t.pIn("Group")} here part of the day`
        ),
      lines: partOfDayLines(proposal)
    }
  ];
  return groups
    .filter((g) => g.lines.length > 0)
    .map((g) => ({
      key: g.key,
      count: g.lines.length,
      label: g.label(g.lines.length),
      lines: g.lines
    }));
}
