/**
 * import_list and import_worksheet (API-1.80, API-1.81): Import a list on a setup screen, and
 * Roots' Import worksheet, worked out here exactly as the screen works them out. What the screen
 * reads before a file (GET /v1/<api>: the season's setup, the camp's words and remembered answers,
 * and the setup's stamp as seen) is read; the file the agent gives as data is read, set against
 * the setup and reviewed with the screen's own modules (c/shoreshLists: listProposal or
 * workbookProposal, their questions, what is still waiting and the save request, and
 * c/shoreshListImport table.js: the review as the screen's table lays it out), shipped beside this
 * file. Nothing is saved without save: true, every question answered and every difference kept
 * or changed; then the screen's own save (POST /v1/<api>) with the seen, compared while the season
 * is locked.
 *
 * undo_import (API-1.83): the screen's own Undo, said in its words (undoMessage).
 */

/** The setup changed since the review: nothing was saved (409). */
function changedSince() {
  return {
    ok: false,
    status: 409,
    text: "Someone changed the setup since the file was reviewed, so nothing was saved. Review the file again (without save) and use the new seen."
  };
}

function refused(text) {
  return { ok: false, status: 400, text };
}

// A time as the web address gives it ("09:00:00.000Z"), and the fields that hold one (a time
// block's start and end; namespaced or not).
const WEB_TIME = /^(\d\d):(\d\d):(\d\d)\.(\d{3})Z$/;
const TIME_FIELD = /(^|__)(Start|End)Time__c$/;

/**
 * What the screen reads before a file, as the screen gets it (API-1.99): Salesforce gives a
 * screen a time as milliseconds after midnight, and the web address as "09:00:00.000Z", so each
 * time field's is made the screen's number. The setup's time blocks are then matched by their
 * times, as on the screen, not added again, and a file made from them shows their times.
 */
function asTheScreenReads(value, key = "") {
  if (Array.isArray(value)) return value.map((v) => asTheScreenReads(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, asTheScreenReads(v, k)])
    );
  }
  const time =
    TIME_FIELD.test(key) && typeof value === "string" && WEB_TIME.exec(value);
  if (!time) return value;
  const [hours, minutes, seconds, ms] = time.slice(1).map(Number);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

/** "9:00 AM", as the screen says a time. */
function timeText(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** The agent's file as the screen reads a file: CSV text, or sheets of rows. */
function fileOf(input, m) {
  const name = String(input.file_name || "").trim();
  if (!name) return { problem: "Send the file's name as file_name." };
  if (typeof input.csv_text === "string" && input.csv_text.trim()) {
    return { file: m.csvFile(name, input.csv_text) };
  }
  if (Array.isArray(input.sheets) && input.sheets.length) {
    const sheets = input.sheets.map((s, i) => ({
      name: String((s && s.name) || `Sheet${i + 1}`),
      rows: ((s && s.rows) || []).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) =>
          cell === null || cell === undefined ? "" : String(cell)
        )
      ),
      merges: Array.isArray(s && s.merges) ? s.merges : []
    }));
    return { file: { name, sheets } };
  }
  return {
    problem:
      "Send the file's contents: csv_text (the text of a CSV file) or sheets (each sheet's name and rows, each row a list of cells)."
  };
}

/** What is added with the list because rows name it (the screen's ticked lines). */
function alsoAddLines(p, t, setup, m) {
  const add = p.alsoAdd || {};
  const programName = (id) => {
    const entry = (setup.programs || []).find((e) => e.program.Id === id);
    return entry ? entry.program.Name : String(id).replace(/^Program:/, "");
  };
  const lines = [];
  (add.locationType || []).forEach((name) =>
    lines.push(`${name} · ${t.sIn("LocationType")}`)
  );
  (add.location || []).forEach((name) =>
    lines.push(`${name} · ${t.sIn("Location")}`)
  );
  (add.program || []).forEach((item) =>
    lines.push(`${item.name} · ${t.sIn("Program")} · ${item.days.join(", ")}`)
  );
  (add.programDays || []).forEach((item) =>
    lines.push(`${item.days.join(", ")} → ${programName(item.programId)}`)
  );
  (add.division || []).forEach((item) =>
    lines.push(
      `${item.name} · ${t.sIn("Division")} · ${programName(item.programId)}`
    )
  );
  (add.timeBlock || []).forEach((item) =>
    lines.push(
      `${item.name} · ${t.sIn("TimeBlock")} · ${timeText(item.start)}–${timeText(item.end)}`
    )
  );
  (add.who || []).forEach((item) =>
    lines.push(`${item.name} · ${t.sIn(item.kind)}`)
  );
  (add.electiveSet || []).forEach((item) =>
    lines.push(`${item.name} · ${t.sIn("ElectiveSet")}`)
  );
  (add.offeredActivity || []).forEach((name) =>
    lines.push(`${name} · ${t.sIn("Activity")}`)
  );
  // A rain plan added with the list can be left off (Greg, 2026-10-17).
  (add.activity || []).forEach((item) =>
    lines.push(
      `${item.name} · ${t.sIn("Activity")} (rain plan; ${
        item.skipped
          ? "not added: the rows naming it are saved without it"
          : `to add without it, answer ${JSON.stringify(m.rainAddKey(item.name))}: "skip"`
      })`
    )
  );
  return lines;
}

/** The file's columns and the column each fills, and how to choose another. */
function headingLines(p) {
  if (!p.mapping) return [];
  const choices = p.screen.columns.map((c) => `"${c.key}" (${c.heading})`);
  const lines = p.mapping.headings.map((h) => {
    const column = p.screen.columns.find((c) => c.key === h.column);
    // As the screen marks a heading that needs a look.
    const note = h.how === "clash" ? " (not sure)" : "";
    return `"${h.text}" → ${column ? column.heading : "not used"}${note} [id ${JSON.stringify(h.key)}]`;
  });
  return [
    `Columns: ${lines.join("; ")}. To choose a column, answer its id with one of ${choices.join(", ")}, or "unused".`
  ];
}

/** One list's table as the screen lays it out, in lines. */
function tableLines(p, setup, m, leaveOut) {
  const table = m.importTable(p, { setup, showSame: false, leaveOut });
  const lines = [];
  table.sections.forEach((section) => {
    const rows = section.rows.map((row) => {
      const cells = row.cells
        .filter((c) => c.text || c.old)
        .map((c) => {
          const heading = (table.columns.find((col) => col.key === c.key) || {})
            .heading;
          return c.changed
            ? `${heading}: was ${c.old}, now ${c.text}`
            : `${heading}: ${c.text}${c.after || ""}`;
        });
      const choices = row.choices.map((choice) => {
        const said = choice.keepLabel.replace(/^Keep, /, "");
        const chosen =
          choice.keepPressed === "true"
            ? " (Keep chosen)"
            : choice.changePressed === "true"
              ? " (Change chosen)"
              : "";
        return `Keep or Change [id ${JSON.stringify(choice.id)}]: ${said}${choice.clears ? " (Change clears a value)" : ""}${chosen}`;
      });
      const out = row.leaveOut
        ? row.leaveOut.pressed === "true"
          ? ` [left out; to bring it in, leave ${JSON.stringify(row.leaveOut.key)} out of answers]`
          : ` [to leave it out, answer ${JSON.stringify(row.leaveOut.key)}: "${m.LEAVE_OUT}"]`
        : "";
      return `${row.said}${row.name}${cells.length ? ` (${cells.join(", ")})` : ""}${row.note ? ` · ${row.note}` : ""}${choices.length ? ` · ${choices.join(" · ")}` : ""}${out}`;
    });
    lines.push(
      `${section.label ? `${section.label} (${section.count})` : `In the table (${section.count})`}: ${rows.join("; ")}`
    );
  });
  if (table.same) lines.push(`${table.same} the same as here.`);
  return lines;
}

/** What the camp deleted before and this file leaves out, each with Bring back. */
function deletedLines(p, t, m) {
  return (p.deleted || []).map(
    (item) =>
      `Deleted before, left out: ${item.name} · ${t.sIn(item.kind)}${item.program ? ` · ${item.program}` : ""} [to bring it back, answer ${JSON.stringify(item.key)}: "${m.BRING_BACK}"]`
  );
}

/** The questions, each with its id and choices (and a pattern's suggestion, marked). */
function questionLines(cards, suggestions, remembered) {
  return cards.map((card) => {
    const chosen = card.options.find((o) => o.value === card.answer);
    let how = card.options.map((o) => `"${o.value}" = ${o.label}`).join(", ");
    if (card.daysQuestion) {
      how = 'days, like "Monday,Wednesday"';
    } else if (card.timesQuestion) {
      how = 'times, like "09:00-10:00"';
    }
    const answered = card.answer
      ? ` Answered: "${card.answer}"${chosen ? ` (${chosen.label})` : ""}${remembered[card.id] === card.answer ? ", remembered from before" : ""}.`
      : "";
    const suggested =
      !card.answer && suggestions[card.id]
        ? ` Suggested: "${suggestions[card.id].value}" (${suggestions[card.id].text}); still the person's choice.`
        : "";
    return `[id ${JSON.stringify(card.id)}] ${card.title} Answer with ${how}.${answered}${suggested}`;
  });
}

/** "Add 3, change 2": what saving does, as the screen's Save button says it. */
function saveLabel(proposals, t, setup, m) {
  const rows = (status) =>
    proposals.flatMap((x) => (x.rows || []).filter((r) => r.status === status));
  const added =
    rows("new").filter((r) => !r.withItem).length +
    proposals
      .flatMap((x) => alsoAddLines(x, t, setup, m))
      .filter((line) => !/not added:/.test(line)).length;
  const changed = rows("changed").filter((r) =>
    r.differences.some((d) => d.answer === m.CHANGE)
  ).length;
  const parts = [];
  if (added) parts.push(`Add ${added}`);
  if (changed) parts.push(`${parts.length ? "change" : "Change"} ${changed}`);
  return parts.join(", ") || "Save";
}

// What a camp workbook saves that has no camp word of its own, in the camp's words.
const OWN_WORDS = {
  CampLabel: () => ["camp word", "camp words"],
  WeekException: (t) => [`${t.sIn("Week")} off`, `${t.pIn("Week")} off`]
};

/** The screen's summary once saved: "Added 3 activities", "Changed 1 location". */
function savedWords(result, t) {
  const lines = [];
  const add = (counts, verb) => {
    Object.keys(counts || {})
      .sort()
      .forEach((term) => {
        const n = counts[term];
        const own = OWN_WORDS[term] && OWN_WORDS[term](t);
        const word = own
          ? own[n === 1 ? 0 : 1]
          : n === 1
            ? t.sIn(term)
            : t.pIn(term);
        lines.push(`${verb} ${n} ${word}`);
      });
  };
  add(result.added, "Added");
  add(result.changed, "Changed");
  return lines.length ? `${lines.join(", ")}.` : "Saved.";
}

/** The command line gives every field as text: save as "true", answers as JSON. */
function fromCommandLine(given) {
  const input = {
    ...given,
    save: given.save === true || given.save === "true"
  };
  if (typeof given.answers === "string") {
    try {
      input.answers = JSON.parse(given.answers);
    } catch {
      input.answers = null;
    }
  }
  return input;
}

async function importFile(
  capability,
  given,
  { ask, answer, load, namespaceOf }
) {
  const input = fromCommandLine(given);
  const workbook = capability.importsWorkbook;
  if (input.save && !String(input.seen ?? "").trim()) {
    return refused(
      "Send the seen the review gave, so a change someone made since isn't replaced unseen."
    );
  }
  if (
    input.answers !== undefined &&
    (typeof input.answers !== "object" ||
      Array.isArray(input.answers) ||
      input.answers === null)
  ) {
    return refused('answers is an object of id to answer, like {"q1": "b"}.');
  }
  const path = `/services/apexrest/v1/${capability.api}`;
  const fields = input.season !== undefined ? { season: input.season } : {};
  const read = await ask({
    path: `${path}?${new URLSearchParams(fields)}`,
    method: "GET"
  });
  if (read.status !== 200) return answer(read);
  const body = asTheScreenReads(JSON.parse(read.body));
  if (input.save && body.seen !== String(input.seen).trim()) {
    return changedSince();
  }
  const m = await load(namespaceOf(body));
  const setup = body.setup;
  const t = m.buildTerms(setup.labels || []);
  const screenKey = input.list;
  const screens = [...m.LIST_SCREENS, "electives"];
  if (!workbook && !screens.includes(screenKey)) {
    return refused(
      `Say which list: ${screens.map((k) => `"${k}" (${m.screenLabels(t)[k]})`).join(", ")}.`
    );
  }
  const { file, problem } = fileOf(input, m);
  if (problem) return refused(problem);
  if (!workbook && screenKey === "electives") {
    // The Electives list doesn't read camper choices (plan §6.2): they are brought in elsewhere.
    let choices = false;
    try {
      const reading = m.readChoices(file);
      choices = reading.campers.length > 0 || reading.cantTellApart.length > 0;
    } catch {
      choices = false;
    }
    if (choices) {
      return refused(
        `${file.name}: that file is camper choices, not offerings. Nothing was saved. Bring it in with bring_in_camper_elective_choices.`
      );
    }
  }
  const remembered = m.rememberedByKey(body.answers || []);
  const answers = { ...remembered.answers, ...(input.answers || {}) };
  const proposal = workbook
    ? m.workbookProposal({
        file,
        setup,
        terms: t,
        labels: setup.labels || [],
        answers
      })
    : m.listProposal({
        screenKey,
        file,
        sheet: input.sheet,
        setup,
        terms: t,
        answers
      });
  const cards = workbook
    ? m.workbookCards(proposal, answers)
    : m.questionCards(proposal, t, answers);
  // A workbook's sheets are not marked, as on Roots.
  const suggestions = workbook
    ? {}
    : m.suggestionsFor(cards, body.answers || [], remembered.answers);
  const waiting = workbook
    ? m.workbookWaiting(proposal, answers)
    : m.waitingFor(proposal, t, answers);
  const screenName = workbook
    ? "the camp worksheet"
    : m.screenLabels(t)[screenKey];

  if (!input.save) {
    const proposals = workbook
      ? proposal.sections.map((s) => (s.extra ? { rows: s.rows } : s.proposal))
      : [proposal];
    const parts = [
      `Review of ${file.name} for ${screenName} in "${body.season}", as the screen shows it. Nothing is saved yet.`
    ];
    if (!workbook && (proposal.sheets || []).length > 1) {
      parts.push(
        `Sheet read: "${proposal.sheet}" (the file has ${proposal.sheets.map((s) => `"${s}"`).join(", ")}; send sheet to read another).`
      );
    }
    if (workbook) {
      proposal.sections.forEach((s) => {
        const p = s.extra ? { rows: s.rows } : s.proposal;
        parts.push(`Sheet ${s.label}${s.sheet ? ` ("${s.sheet}")` : ""}:`);
        if (!s.extra) parts.push(...headingLines(p));
        (s.lists || [])
          .filter((list) => list.lines.length)
          .forEach((list) =>
            parts.push(
              `${list.heading}: ${list.lines.map((l) => l.pairing).join("; ")}`
            )
          );
        parts.push(...tableLines(p, setup, m, false));
        if (!s.extra) {
          const also = alsoAddLines(p, t, setup, m);
          if (also.length) parts.push(`Also added: ${also.join("; ")}`);
          parts.push(...deletedLines(p, t, m));
        }
      });
      if (proposal.unused.length) {
        parts.push(
          `Sheets not read: ${proposal.unused.map(({ name, why }) => (why ? `“${name}” · ${why}` : `“${name}”`)).join("; ")}`
        );
      }
    } else if (!proposal.empty) {
      parts.push(...headingLines(proposal));
      parts.push(...tableLines(proposal, setup, m, true));
      const also = alsoAddLines(proposal, t, setup, m);
      if (also.length)
        parts.push(`Also added with the list: ${also.join("; ")}`);
      parts.push(...deletedLines(proposal, t, m));
    }
    const asked = questionLines(cards, suggestions, remembered.answers);
    if (asked.length) parts.push(`Questions: ${asked.join(" ")}`);
    parts.push(
      waiting.length
        ? `Before it can be saved: ${waiting.join("; ")}.`
        : `Ready to save: ${saveLabel(proposals, t, setup, m)}.`
    );
    parts.push(
      `Give every answer in answers (id to answer) and send the review again; to save, send the same file and answers with save: true and seen: "${body.seen}". Ask the person about anything not plain from the file.`
    );
    return { ok: true, status: 200, text: parts.join("\n") };
  }

  if (waiting.length) {
    return refused(
      `Nothing was saved. Before it can be saved: ${waiting.join("; ")}.`
    );
  }
  let plan;
  if (workbook) {
    plan = m.workbookPlan(proposal, answers, setup.season.Id);
  } else {
    plan = m.listPlan(
      proposal,
      answers,
      setup.season.Id,
      `${file.name} (${screenName})`
    );
    plan.remember = m.withLearning(plan.remember, cards, suggestions);
  }
  const saved = await ask({
    path,
    method: "POST",
    body: JSON.stringify({
      ...fields,
      seen: String(input.seen).trim(),
      plan: JSON.stringify(plan)
    })
  });
  const done = answer(saved);
  if (!done.ok) return done;
  let result;
  try {
    result = JSON.parse(done.text);
  } catch {
    return done;
  }
  return {
    ok: true,
    status: 200,
    text: `${savedWords(result, t)} To undo this import, use undo_import (read_last_imports gives its seen), after asking the person.`
  };
}

/** The screen's own Undo, said as the screen says it. */
async function undoImport(capability, input, { ask, answer, load }) {
  const done = answer(
    await ask({
      path: `/services/apexrest/v1/${capability.api}`,
      method: "POST",
      body: JSON.stringify(input)
    })
  );
  if (!done.ok) return done;
  let result;
  try {
    result = JSON.parse(done.text);
  } catch {
    return done;
  }
  const m = await load("");
  return { ok: true, status: 200, text: m.undoMessage(result) };
}

module.exports = {
  importFile,
  undoImport,
  fileOf,
  fromCommandLine,
  asTheScreenReads,
  changedSince,
  refused
};
