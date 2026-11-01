/**
 * import_last_year (API-1.84): Import last year, worked out here exactly as the screen works it
 * out. What the screen reads before the files (GET /v1/import_last_year: the setup and the
 * camp's words, remembered answers, what earlier imports brought in, and the stamp as seen) is
 * read; the files the agent gives as data are reviewed with the screen's own steps
 * (c/shoreshImport flow.js: the proposal, answers filled in on their own from steady patterns, the
 * questions that can wait, the plan Add saves) and words (c/shoreshImportEngine questionCards,
 * readAsGroups, foundLists, importNotes; c/shoreshImport summary.js). With save: true, the
 * screen's own save (POST /v1/import_last_year) with the seen, compared while the season is
 * locked. Questions that can wait are left for later, as Add does ("Add 58, 3 for later").
 */
const {
  fileOf,
  fromCommandLine,
  asTheScreenReads,
  changedSince,
  refused
} = require("./imports");

/** The person's answers over the review's: an empty answer takes one back (an unticked place). */
function answered(answers, given) {
  const out = { ...answers };
  Object.entries(given || {}).forEach(([id, value]) => {
    if (value === "" || value === null || value === undefined) delete out[id];
    else out[id] = String(value);
  });
  return out;
}

/** The review as the screen has it after the files are read and the person's answers given. */
function reviewOf(m, body, input, files) {
  const setup = body.setup;
  const t = m.buildTerms(setup.labels || []);
  const before = body.imported || {};
  const flow = {
    files,
    setup,
    terms: t,
    layouts: {},
    imported: before.untouched || [],
    inUse: before.inUse || {},
    versionUses: before.versionUses || {}
  };
  const remembered = m.rememberedByKey(body.answers || []);
  const askAgain = [].concat(input.ask_again || []).map(String);
  // Read: what the camp answered before, then what steady patterns fill in (MEMO-5.1).
  let state = m.recomputed(flow, remembered.answers, {});
  state = m.appliedOnItsOwn(flow, state, {
    savedRows: body.answers || [],
    remembered: remembered.answers,
    autoUndone: []
  });
  // A file's layout, chosen by its name, for every page of it.
  const layouts = {};
  Object.entries(input.layouts || {}).forEach(([file, layout]) => {
    state.proposal.reading.pages
      .filter((p) => p.file === file)
      .forEach((p) => {
        layouts[p.key] = layout;
      });
  });
  flow.layouts = layouts;
  // Undo of an auto-applied answer: asked again (and never filled in again in this import).
  const autoApplied = { ...state.autoApplied };
  const answers = { ...state.answers };
  askAgain.forEach((id) => {
    if (autoApplied[id]) {
      delete answers[id];
      delete autoApplied[id];
    }
  });
  // The person's own answers are theirs, not filled in on their own.
  Object.keys(input.answers || {}).forEach((id) => delete autoApplied[id]);
  state = m.recomputed(flow, answered(answers, input.answers), autoApplied);
  return { flow, t, remembered, state };
}

/** A question, its id and choices, as the screen asks it. */
function questionLine(m, card, suggestion, remembered, auto) {
  const chosen = card.options.find((o) => o.value === card.answer);
  const how = card.options.map((o) => `"${o.value}" = ${o.label}`).join(", ");
  let state = "";
  if (chosen) {
    state = ` Answered: ${chosen.label}${
      auto && auto.value === card.answer
        ? ` (auto-applied: ${auto.text}; to ask it again, send its id in ask_again)`
        : remembered[card.id] === card.answer
          ? " (remembered from before)"
          : ""
    }.`;
  } else if (suggestion) {
    state = ` Suggested: "${suggestion.value}" (${suggestion.text}); still the person's choice.`;
  }
  const wait = !chosen && m.leaveable(card) ? " It can wait for later." : "";
  return `[id ${JSON.stringify(card.id)}] ${card.title} Answer with ${how}.${state}${wait}`;
}

/** The review in words, part by part as the screen shows it. */
function reviewText(m, body, review, input) {
  const { flow, t, remembered, state } = review;
  const { proposal, answers, autoApplied } = state;
  const cards = m.yearCards(proposal, t, answers);
  const suggestions = m.suggestionsFor(
    cards,
    body.answers || [],
    remembered.answers
  );
  const parts = [
    `Review of ${flow.files.map((f) => f.name).join(", ")} for Import last year in "${body.season}", as the screen shows it. Nothing is saved yet.`
  ];
  const words = m.layoutWords(t);
  const byFile = new Map();
  proposal.reading.pages.forEach((p) => {
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push(p);
  });
  byFile.forEach((pages, file) => {
    const kinds = [...new Set(pages.map((p) => p.layout))];
    const unsure =
      pages.some((p) => !p.confident) && !(input.layouts || {})[file];
    parts.push(
      `File ${file}: ${pages.length} ${pages.length === 1 ? "page" : "pages"}, read as ${kinds.map((k) => words[k] || k).join("; ")}${
        unsure
          ? `. Not sure of its layout: send layouts {${JSON.stringify(file)}: one of ${m.LAYOUTS.map((k) => `"${k}" (${words[k]})`).join(", ")}}`
          : ""
      }.`
    );
  });
  const asked = cards.map((card) =>
    questionLine(
      m,
      card,
      suggestions[card.id],
      remembered.answers,
      autoApplied[card.id]
    )
  );
  if (asked.length) parts.push(`Questions: ${asked.join(" ")}`);
  m.readAsGroups(proposal, t, cards).forEach((g) => {
    parts.push(
      `Read as, ${g.label}: ${g.lines
        .map(
          (line) =>
            `${line.name} [id ${JSON.stringify(line.id)}: ${line.options.map((o) => `"${o.value}" = ${o.label}${o.value === line.answer ? " (now)" : ""}`).join(", ")}]`
        )
        .join("; ")}`
    );
  });
  if (proposal.offeredPlaces.length) {
    parts.push(
      `${t.p("Location")} named in the files and not set up: ${proposal.offeredPlaces
        .map(
          (p) =>
            `${p.name}, used by ${p.usedBy.join(", ")} (${p.ticked ? "added" : "not added"}; to ${p.ticked ? `leave it out, answer ${JSON.stringify(p.id)}: ""` : `add it, answer ${JSON.stringify(p.id)}: "add"`})`
        )
        .join("; ")}`
    );
  }
  (proposal.deleted || []).forEach((item) => {
    const place =
      item.kind === "Location"
        ? ` and ${JSON.stringify(`place|${item.name}`)}: "add"`
        : "";
    parts.push(
      `Deleted before, left out: ${item.name} · ${t.sIn(item.kind)}${item.program ? ` · ${item.program}` : ""} [to bring it back, answer ${JSON.stringify(item.key)}: "${m.BRING_BACK}"${place}]`
    );
  });
  (proposal.missing || []).forEach((item) => {
    parts.push(
      item.inUse
        ? `Not in these files, kept: ${item.name} (${item.inUse}, so it stays)`
        : `Not in these files: ${item.name} · ${t.sIn(item.kind)}${item.program ? ` · ${item.program}` : ""}${item.alsoOut.length ? ` · also taken out of ${item.alsoOut.join(", ")}` : ""} (${item.answer === "remove" ? "Remove" : "Keep"} chosen; answer ${JSON.stringify(item.key)}: "keep" or "remove")`
    );
  });
  const plan = m.planNow(flow, proposal, answers);
  const tiles = m.comingIn(plan, t);
  if (tiles.length) {
    parts.push(
      `Comes in: ${tiles.map((x) => `${x.spoken} (${x.names.join(", ")})`).join("; ")}`
    );
  }
  (proposal.versions || []).forEach((v) =>
    parts.push(
      `Last year's schedule: ${v.weekName}${v.programName ? ` (${v.programName})` : ""}, kept as a version, ${v.name}`
    )
  );
  const noted = m.foundLists(proposal, t).find((l) => l.key === "noted");
  if (noted && noted.items.length) {
    parts.push(
      `Not set up yet: ${noted.items.map((i) => `${i.name}${i.detail ? ` (${i.detail})` : ""}`).join("; ")}`
    );
  }
  const notes = m.importNotes(proposal, t);
  if (notes.length) parts.push(`Notes: ${notes.map((n) => n.text).join(" ")}`);
  const open = cards.filter(
    (c) => !c.options.some((o) => o.value === c.answer)
  );
  const must = open.filter((c) => !m.leaveable(c)).length;
  const added = tiles.reduce((sum, x) => sum + x.count, 0);
  const base = added > 0 ? `Add ${added}` : "Use this setup";
  parts.push(
    must > 0
      ? `Before it can be saved: ${open.length} ${open.length === 1 ? "question" : "questions"} left, ${must} of them can't wait.`
      : `Ready to save: ${open.length > 0 ? `${base}, ${open.length} for later` : base}.`
  );
  parts.push(
    `Give every answer in answers (id to answer) and send the review again with the same files; to save, send them with save: true and seen: "${body.seen}". Ask the person about anything not plain from the files.`
  );
  return parts.join("\n");
}

/** The screen's words once saved: what was added, changed and removed, and what waits. */
function savedText(m, t, result, plan) {
  const said = (counts, verb) => {
    const tiles = m.countTiles(counts, t);
    return tiles.length
      ? `${verb} ${tiles.map((x) => x.spoken).join(", ")}.`
      : "";
  };
  const lines = [
    said(result.added, "Added"),
    said(result.changed, "Changed"),
    said(result.removed, "Removed")
  ].filter((x) => x);
  if (!lines.length) lines.push("Saved.");
  (result.leftAsIs || []).forEach((name) =>
    lines.push(
      `${name} was changed since you opened the files; it was left as it is.`
    )
  );
  if (plan.open.length) {
    lines.push(
      `${plan.open.length} import ${plan.open.length === 1 ? "question" : "questions"} left, waiting on Roots: ${plan.open.map((q) => q.title).join(" ")}`
    );
  }
  const notKept = result.openNotKept || 0;
  if (notKept) {
    lines.push(
      `${notKept} more ${notKept === 1 ? "question" : "questions"} will be asked next time you import these files.`
    );
  }
  lines.push(
    "To undo this import, use undo_import (read_last_imports gives its seen), after asking the person."
  );
  return lines.join(" ");
}

async function importLastYear(
  capability,
  given,
  { ask, answer, load, namespaceOf }
) {
  const input = fromCommandLine(given);
  if (typeof input.layouts === "string") {
    try {
      input.layouts = JSON.parse(input.layouts);
    } catch {
      input.layouts = null;
    }
  }
  if (input.save && !String(input.seen ?? "").trim()) {
    return refused(
      "Send the seen the review gave, so a change someone made since isn't replaced unseen."
    );
  }
  if (!Array.isArray(input.files) || input.files.length === 0) {
    return refused(
      "Send the files: each with file_name and its contents (csv_text, or sheets of rows)."
    );
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
  const files = [];
  for (const f of input.files) {
    const { file, problem } = fileOf(f || {}, m);
    if (problem) return refused(problem);
    files.push(file);
  }
  const review = reviewOf(m, body, input, files);
  const { flow, t, remembered, state } = review;
  if (m.foundNothing(state.proposal, state.answers)) {
    return refused(
      `${files.map((f) => f.name).join(", ")}: no schedule Shoresh could read was found. Nothing was imported.`
    );
  }
  if (!input.save) {
    return { ok: true, status: 200, text: reviewText(m, body, review, input) };
  }
  const cards = m.yearCards(state.proposal, t, state.answers);
  const must = cards.filter(
    (c) => !c.options.some((o) => o.value === c.answer) && !m.leaveable(c)
  );
  if (must.length) {
    return refused(
      `Nothing was saved. ${must.length} ${must.length === 1 ? "question" : "questions"} can't wait: ${must.map((c) => c.title).join(" ")}`
    );
  }
  const plan = m.savePlan(flow, state.proposal, state.answers, {
    autoApplied: state.autoApplied,
    savedRows: body.answers || [],
    remembered: remembered.answers
  });
  if (!plan) return refused("Nothing was saved: the plan could not be made.");
  const saved = answer(
    await ask({
      path,
      method: "POST",
      body: JSON.stringify({
        ...fields,
        seen: String(input.seen).trim(),
        plan: JSON.stringify(plan)
      })
    })
  );
  if (!saved.ok) return saved;
  let result;
  try {
    result = JSON.parse(saved.text);
  } catch {
    return saved;
  }
  return { ok: true, status: 200, text: savedText(m, t, result, plan) };
}

module.exports = { importLastYear };
