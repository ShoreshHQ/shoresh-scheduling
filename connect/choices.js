/**
 * bring_in_choices (API-1.117): the Elective seats screen's own Bring in choices, so an AI can
 * start a week's electives as a person does. What the screen reads is read as it reads it (GET
 * /v1/bring_in_choices: the season's setup, the camp's remembered answers, the screen's own sets
 * and runs); the file is read and the request worked out with the screen's own modules
 * (c/shoreshChoicesReader readChoices, c/shoreshChoicesImport review.js), shipped beside this
 * file; the count is the server's own check, said in the screen's own lines (countLines). With
 * save: true it is the screen's own Bring in, while the run is as the review saw it (seen).
 */
const crypto = require("crypto");
const { fileOf } = require("./imports");

const refused = (text) => ({ ok: false, status: 400, text });

/** One of the names by fold, or a refusal naming them all. */
function oneNamed(items, asked, nameOf, what, m) {
  const found = items.filter(
    (item) => m.foldName(nameOf(item)) === m.foldName(String(asked ?? ""))
  );
  if (found.length === 1) return { item: found[0] };
  const names = items.map(nameOf).join(", ") || "none";
  return {
    problem: asked
      ? `There is no ${what} called ${JSON.stringify(String(asked).slice(0, 80))}. The ${what}s: ${names}.`
      : `Say which ${what} (${what.replace(/ /g, "_")}). The ${what}s: ${names}.`
  };
}

/** The week's working schedules (not saved versions), named as the screen's list names them. */
function schedulesOf(setup, weekId, m) {
  const S = m.FIELD.Schedule;
  const programs = new Map(
    (setup.programs || []).map((p) => [p.program.Id, p.program.Name])
  );
  const many = programs.size > 1;
  return (setup.schedules || [])
    .filter((s) => s[S.Week] === weekId && s[S.Status] !== "Version")
    .map((s) => ({
      id: s.Id,
      programId: s[S.Program],
      // "· Published" as the screen's list says it, so a draft and the week's published
      // schedule never share one name (c/shoreshElectiveEngine scheduleOptions).
      name: `${many ? `${programs.get(s[S.Program])} · ` : ""}${
        s[S.Origin] === "Generated" ? "Generated Schedule" : "Manual Build"
      }${s[S.Status] === "Published" ? " · Published" : ""}`
    }));
}

/** An answer for a name the sheet has and Shoresh doesn't: add, leave, or same as an activity. */
function answerOf(said, activities, m) {
  const text = String(said ?? "").trim();
  if (text === "add") return { kind: "add" };
  if (text === "leave") return { kind: "leave" };
  if (text.startsWith("same:")) {
    const named = m.foldName(text.slice(5));
    const activity = activities.find((a) => m.foldName(a.Name) === named);
    if (activity) return { kind: "same", activityId: activity.Id };
  }
  return null;
}

/** Whether an answer the AI gave is the one a name already has (its start, or remembered). */
function sameAnswer(a, b) {
  return (
    !!b &&
    a.kind === b.kind &&
    (a.activityId || null) === (b.activityId || null)
  );
}

/**
 * The file's fingerprint, as the screen saves it (shoreshChoicesImport.js fingerprintOf: the
 * SHA-256 of the file's bytes). Text sent as csv_text is the file, so it is its UTF-8 bytes;
 * sheets sent as rows have no bytes to hash, so none, as the screen saves none when it can't
 * hash the file.
 */
function fingerprintOf(input) {
  if (typeof input.csv_text !== "string" || !input.csv_text.trim()) return null;
  return crypto
    .createHash("sha256")
    .update(input.csv_text, "utf8")
    .digest("hex");
}

/** What each name on the sheet Shoresh doesn't have will be, said for the review. */
function newNameLines(reading, answers, activities, m) {
  const byId = new Map(activities.map((a) => [a.Id, a.Name]));
  return (reading.newNames || []).map((n) => {
    const a = answers[m.foldName(n.name)] || {};
    const what =
      a.kind === "leave"
        ? "left out"
        : a.kind === "same"
          ? `same as ${byId.get(a.activityId)}`
          : "added as an activity (How often 0)";
    const why = a.started
      ? "the screen's start"
      : a.remembered
        ? "answered as before"
        : "as answered";
    return `- ${JSON.stringify(n.name)}: ${what} (${why})`;
  });
}

async function bringInChoices(capability, input, { read, send, answer, load }) {
  const fields = input.season !== undefined ? { season: input.season } : {};
  const got = await read(capability.api, fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = await load();
  m.nameDaysFor(body.setup);
  const setup = body.setup || {};
  const situation = body.situation || {};
  const t = m.buildTerms(setup.labels || []);
  const activities = setup.activities || [];

  const set = oneNamed(
    situation.sets || [],
    input.elective_set,
    (s) => s.name,
    "elective set",
    m
  );
  if (set.problem) return refused(set.problem);
  const week = oneNamed(
    setup.weeks || [],
    input.week,
    (w) => w.Name,
    "week",
    m
  );
  if (week.problem) return refused(week.problem);
  const schedules = schedulesOf(setup, week.item.Id, m);
  if (schedules.length === 0) {
    // As the screen's empty state says it: the one thing to do (ELECT-2.5). A saved version,
    // last year's imported one included, never takes choices.
    return refused(
      `${m.noScheduleLine(setup, week.item.Id, t)} Nothing was imported.`
    );
  }
  const schedule =
    schedules.length === 1 && input.schedule === undefined
      ? { item: schedules[0] }
      : oneNamed(schedules, input.schedule, (s) => s.name, "schedule", m);
  if (schedule.problem) return refused(schedule.problem);

  const { file, problem } = fileOf(input, m);
  if (problem) return refused(problem);
  const linked = m.linkedByFold(setup, set.item.id);
  const reading = m.readChoices(file, {
    activities: [
      ...activities.map((a) => a.Name),
      ...[...linked.values()].map((l) => l.name)
    ]
  });
  if (reading.campers.length === 0 && reading.cantTellApart.length === 0) {
    return refused(
      `${file.name}: no campers with choices found. Nothing was imported.`
    );
  }
  if (reading.cantTellApart.length) {
    // The screen brings nothing in while two rows can't be told apart (its refusal card).
    const rows = m.cantTellApartRows(reading);
    return refused(
      `Nothing was imported: ${rows.map((r) => `${r.name}: ${r.where}. ${r.why}`).join(" ")}`
    );
  }

  // Every name starts where the screen starts it (review.js startingAnswers): remembered, else
  // the near name, else add, marked started so it is never remembered. An answer the AI gives
  // is the person's click, so only one that differs from the start replaces it, and only that is
  // remembered, as on the screen (review.js buildRequest).
  const answers = m.startingAnswers(
    reading.newNames,
    situation.answers,
    activities
  );
  const given =
    input.answers && typeof input.answers === "object" ? input.answers : {};
  for (const [name, said] of Object.entries(given)) {
    const key = m.foldName(name);
    const a = answerOf(said, activities, m);
    if (a && !sameAnswer(a, answers[key])) answers[key] = a;
  }

  const place = {
    seasonId: setup.season.Id,
    setId: set.item.id,
    weekId: week.item.Id,
    scheduleId: schedule.item.id
  };
  const request = (runRevision) =>
    m.buildRequest({
      reading,
      activities,
      linked,
      answers,
      groups: m.groupsOfProgram(setup, schedule.item.programId),
      place,
      fileName: file.name,
      fingerprint: fingerprintOf(input),
      runRevision
    });
  const checked = await send(capability.api, {
    season: input.season,
    request: request(null)
  });
  if (checked.status !== 200) return answer(checked);
  const check = JSON.parse(answer(checked).text);
  const seen = check.runRevision == null ? "none" : String(check.runRevision);
  if (check.isFinal) {
    return refused(
      `${check.runName || set.item.name} is final, so it can't take new choices.`
    );
  }
  if (!input.save) {
    const lines = m
      .countLines({
        request: request(check.runRevision),
        check,
        set: set.item,
        t,
        activities
      })
      .map((l) => `- ${l.text}`);
    return {
      ok: true,
      status: 200,
      text: [
        `Review of ${file.name} for ${set.item.name} in ${week.item.Name} (${schedule.item.name}), as the Elective seats screen's Import choices shows it. Nothing is imported yet.`,
        ...lines,
        ...(reading.newNames && reading.newNames.length
          ? [
              "Names on the sheet Shoresh doesn't have yet, each as it will be brought in:",
              ...newNameLines(reading, answers, activities, m),
              'To change one, send answers by its name: "add" (a new activity, at How often 0), "leave" (leave it out) or "same:<activity>". Ask the person about any the sheet doesn\'t make plain.'
            ]
          : []),
        `Ready to import. To import it, send the same file and answers with save: true and seen: ${JSON.stringify(seen)}.`
      ].join("\n")
    };
  }
  if (String(input.seen ?? "").trim() !== seen) {
    return {
      ok: false,
      status: 409,
      text: "Someone imported choices since the file was reviewed, so nothing was imported. Review the file again (without save) and use the new seen."
    };
  }
  const saved = await send(capability.api, {
    season: input.season,
    request: request(check.runRevision),
    save: true
  });
  if (saved.status !== 200) return answer(saved);
  const done = JSON.parse(answer(saved).text);
  const n = done.campers;
  return {
    ok: true,
    status: 200,
    text: `Imported ${n} ${n === 1 ? t.sIn("Camper") : t.pIn("Camper")} to "${done.runName}": ${done.added} new.`
  };
}

module.exports = { bringInChoices };
