/*
 * Which program each row of a program's list is in (slice 4c part B). A camp with one program
 * can leave the Program column out; with several, a row must say. A program the season doesn't
 * have is asked about like any similar name, and otherwise added, asking which days it runs
 * (Greg, 2026-10-17: add it and ask for what it needs).
 */
import { FIELD } from "c/shoreshSchema";
import {
  LEAVE_OUT,
  WEEKDAYS,
  looseKey,
  mergesFrom,
  similarPairs
} from "c/shoreshImportEngine";

export function programAddKey(name) {
  return `programAdd|${looseKey(name)}`;
}

/** Days answered for a new program: "Monday,Wednesday" -> ["Monday", "Wednesday"], or null. */
export function answeredDays(answer) {
  if (!answer || answer === LEAVE_OUT) {
    return null;
  }
  const days = String(answer)
    .split(",")
    .filter((d) => WEEKDAYS.includes(d));
  return days.length ? WEEKDAYS.filter((d) => days.includes(d)) : null;
}

function programCard(name, answer, t) {
  return {
    id: programAddKey(name),
    title: `“${name}” is a new ${t.sIn("Program")}. Which days?`,
    daysQuestion: true,
    options: [{ value: LEAVE_OUT, label: "Leave it out for now" }],
    answer: answer || null
  };
}

/**
 * Gives each readable row its program: r.program = { id (an Id, or "Program:<name>" for one
 * added), name, days, isNew }. Returns { pairs, cards, adds: [{ name, days }] }.
 */
export function resolvePrograms(read, screen, setup, answers, t) {
  const result = { pairs: [], cards: [], adds: [] };
  const programs = (setup.programs || []).map((entry) => entry.program);
  const daysOf = (p) => WEEKDAYS.filter((d) => p[FIELD.Program[d]]);
  const rows = read.filter((r) => !r.problems.length);
  if (screen.scope !== "program") {
    return result;
  }
  rows.forEach((r) => {
    if (!r.values.program && programs.length === 1) {
      r.values.program = programs[0].Name;
    } else if (!r.values.program) {
      r.problems.push(`${t.s("Program")} is blank`);
    }
  });
  const named = rows.filter((r) => r.values.program);
  const counts = new Map();
  named.forEach((r) => {
    counts.set(r.values.program, (counts.get(r.values.program) || 0) + 1);
  });
  result.pairs = similarPairs(
    "program",
    [...counts.entries()].map(([name, count]) => ({ name, count })),
    programs.map((p) => p.Name)
  );
  const merged = mergesFrom(result.pairs, answers);
  const open = new Set();
  const leftOut = new Set();
  result.pairs.forEach((pair) => {
    const answer = answers[pair.id];
    const names = pair.existing ? [pair.a] : [pair.a, pair.b];
    if (answer === LEAVE_OUT) {
      names.forEach((n) => leftOut.add(n));
    } else if (!["a", "b", "different"].includes(answer)) {
      names.forEach((n) => open.add(n));
    }
  });
  const byName = new Map(programs.map((p) => [p.Name, p]));
  const asked = new Map();
  named.forEach((r) => {
    const written = r.values.program;
    const name = merged.get(written) || written;
    r.values.program = name;
    if (leftOut.has(written)) {
      r.leftOut = true;
      return;
    }
    if (open.has(written)) {
      r.open = true;
      return;
    }
    const existing = byName.get(name);
    if (existing) {
      r.program = {
        id: existing.Id,
        name,
        days: daysOf(existing),
        isNew: false
      };
      return;
    }
    if (!asked.has(name)) {
      asked.set(name, answers[programAddKey(name)]);
    }
    const answer = asked.get(name);
    const days = answeredDays(answer);
    if (answer === LEAVE_OUT) {
      r.leftOut = true;
    } else if (!days) {
      r.open = true;
    } else {
      r.program = { id: `Program:${name}`, name, days, isNew: true };
    }
  });
  [...asked.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([name, answer]) => {
      result.cards.push(programCard(name, answer, t));
      const days = answeredDays(answer);
      if (days) {
        result.adds.push({ name, days });
      }
    });
  return result;
}

export function programDayKey(program, day) {
  return `programDay|${looseKey(program)}|${day}`;
}

/**
 * Recurring days the program doesn't run: asked, per program and day, whether to add the day to
 * the program, drop it from those rows, or leave those rows out for now. Returns { cards,
 * added: Map(program id -> [days added]) }.
 */
export function resolveProgramDays(read, answers) {
  const result = { cards: [], added: new Map() };
  const asks = new Map();
  read
    .filter(
      (r) => !r.problems.length && !r.leftOut && r.program && r.values.days
    )
    .forEach((r) => {
      r.values.days
        .filter((d) => !r.program.days.includes(d))
        .forEach((day) => {
          const id = programDayKey(r.program.name, day);
          if (!asks.has(id)) {
            asks.set(id, { program: r.program, day, rows: [] });
          }
          asks.get(id).rows.push(r);
        });
    });
  [...asks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, ask]) => {
      const answer = answers[id];
      const { program, day } = ask;
      result.cards.push({
        id,
        title: `${program.name} doesn't run on ${day}: ${ask.rows.map((r) => r.name).join(", ")}`,
        options: [
          { value: "add", label: `Add ${day} to ${program.name}` },
          { value: "drop", label: `Without ${day}` },
          { value: LEAVE_OUT, label: "Leave it out for now" }
        ],
        answer: answer || null
      });
      ask.rows.forEach((r) => {
        if (answer === "add") {
          return;
        }
        if (answer === "drop") {
          r.values.days = r.values.days.filter((d) => d !== day);
          if (!r.values.days.length) {
            r.problems.push("Runs on: no days left");
          }
        } else if (answer === LEAVE_OUT) {
          r.leftOut = true;
        } else {
          r.open = true;
        }
      });
      if (answer === "add") {
        result.added.set(program.id, [
          ...(result.added.get(program.id) || []),
          day
        ]);
      }
    });
  return result;
}
