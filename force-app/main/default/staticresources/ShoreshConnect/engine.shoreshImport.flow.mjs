/*
 * Import last year's review, step by step, as pure functions (slice 4b; API-1.84): the files read
 * set against the setup, the answers Shoresh fills in on its own from steady patterns (MEMO-5.1),
 * the questions that can wait (INGEST-5.5), and the plan Add saves. The screen (shoreshImport.js)
 * and the AI connector (connect/lastYear.js) both run these, so the same files and answers give
 * the same review and the same save.
 *
 * input: { files, setup, terms, layouts, imported, inUse, versionUses }.
 */
import {
  LEAVE_OUT,
  buildProposal,
  planFor,
  questionCards
} from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";
import {
  autoAnswersFor,
  autoAppliedIn,
  staleAuto,
  suggestionsFor,
  withLearning
} from "./engine.shoreshPatterns.shoreshPatterns.mjs";

/** Each layout in the camp's words. */
export function layoutWords(t) {
  return {
    allCamp: `All camp: a page per day, ${t.pIn("Group")} across`,
    byGroup: `By ${t.sIn("Group")}: a page per ${t.sIn("Group")}, days across`,
    byActivity: `By ${t.sIn("Activity")}: the ${t.pIn("Group")} doing each ${t.sIn("Activity")} listed in its cell`
  };
}

/** A question that can wait: one with "Leave it out for now" (INGEST-5.5). */
export function leaveable(card) {
  return card.options.some((o) => o.value === LEAVE_OUT);
}

export function proposalWith(input, answers) {
  return buildProposal({
    files: input.files,
    existing: input.setup,
    terms: input.terms,
    answers,
    layouts: input.layouts,
    imported: input.imported,
    inUse: input.inUse,
    versionUses: input.versionUses
  });
}

/**
 * The proposal for these answers. An auto-applied answer whose question went away with another
 * goes too: none stays hidden. Answers { proposal, answers, autoApplied }.
 */
export function recomputed(input, answers, autoApplied) {
  let proposal = proposalWith(input, answers);
  for (let depth = 0; depth < 5; depth++) {
    const stale = staleAuto(
      autoApplied,
      questionCards(proposal, input.terms, answers)
    );
    if (stale.length === 0) {
      break;
    }
    const fewer = { ...answers };
    const rest = { ...autoApplied };
    stale.forEach((id) => {
      delete fewer[id];
      delete rest[id];
    });
    answers = fewer;
    autoApplied = rest;
    proposal = proposalWith(input, answers);
  }
  return { proposal, answers, autoApplied };
}

/**
 * MEMO-5.1: a steady pattern fills in a question on its own. An answer can open another question,
 * so this follows a few deep. state: { proposal, answers, autoApplied }; memory: { savedRows,
 * remembered, autoUndone }. Answers the new state.
 */
export function appliedOnItsOwn(input, state, memory) {
  let next = state;
  for (let depth = 0; depth < 5 && next.proposal; depth++) {
    const cards = questionCards(next.proposal, input.terms, next.answers);
    const auto = autoAnswersFor(
      cards,
      memory.savedRows,
      memory.remembered,
      memory.autoUndone
    );
    const ids = Object.keys(auto);
    if (ids.length === 0) {
      break;
    }
    const answers = { ...next.answers };
    ids.forEach((id) => {
      answers[id] = auto[id].value;
    });
    next = recomputed(input, answers, { ...next.autoApplied, ...auto });
  }
  return next;
}

/**
 * INGEST-5.5: what Add saves while questions are open. Each open question that can be left out
 * is left out, so nothing that depends on it is guessed (a question that opens another is
 * followed, a few deep); { proposal, open: [card] }.
 */
export function settled(input, proposal, answers) {
  const left = { ...answers };
  const open = new Map();
  let now = proposal;
  for (let depth = 0; depth < 5; depth++) {
    const more = questionCards(now, input.terms, left).filter(
      (c) => !c.answer && !open.has(c.id) && leaveable(c)
    );
    if (more.length === 0) {
      break;
    }
    more.forEach((c) => {
      open.set(c.id, c);
      left[c.id] = LEAVE_OUT;
    });
    now = proposalWith(input, left);
  }
  return { proposal: now, open: [...open.values()] };
}

/** Whether nothing was found to import (a single-day file waiting for its day is something). */
export function foundNothing(proposal, answers) {
  return (
    !proposal ||
    (proposal.reading.placements.length === 0 &&
      !proposal.reading.timeAsks.some(
        (a) => a.type === "oneDay" && answers[a.id] !== LEAVE_OUT
      ))
  );
}

/** The plan Add would save; null if it cannot be made yet. */
export function planNow(input, proposal, answers, fileData) {
  if (!proposal || foundNothing(proposal, answers)) {
    return null;
  }
  try {
    const { proposal: kept, open } = settled(input, proposal, answers);
    const seasonId =
      input.setup && input.setup.season ? input.setup.season.Id : null;
    return planFor(kept, input.setup, seasonId, {
      answers,
      fileNames: input.files.map((f) => f.name),
      open: open.map((c) => ({ key: c.id, title: c.title })),
      fileData
    });
  } catch {
    return null;
  }
}

/**
 * The plan Add sends to ImportController.saveSetup: the files as read go with open questions, so
 * they can be answered later; what was filled in on its own and the answers to learn from go
 * with it. memory: { autoApplied, savedRows, remembered }. null if it cannot be made.
 */
export function savePlan(input, proposal, answers, memory) {
  const plan = planNow(input, proposal, answers, JSON.stringify(input.files));
  if (!plan) {
    return null;
  }
  if (plan.open.length === 0) {
    delete plan.fileData;
  }
  const cards = questionCards(proposal, input.terms, answers);
  plan.autoApplied = autoAppliedIn(plan.remember, memory.autoApplied);
  plan.remember = withLearning(
    plan.remember,
    cards,
    suggestionsFor(cards, memory.savedRows, memory.remembered),
    memory.autoApplied
  );
  return plan;
}
