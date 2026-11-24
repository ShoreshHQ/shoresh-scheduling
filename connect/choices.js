/**
 * import_choices (API-1.117): the Elective seats screen's own Import choices, so an AI can
 * start a week's electives as a person does. What the screen reads is read as it reads it (GET
 * /v1/import_choices: the season's setup, the camp's remembered answers, the screen's own sets
 * and runs); the file is read and the request worked out with the screen's own modules
 * (c/shoreshChoicesReader readChoices, c/shoreshChoicesImport review.js), shipped beside this
 * file; the count is the server's own check, said in the screen's own lines (countLines). With
 * save: true it is the screen's own Import, while the run is as the review saw it (seen).
 */
const crypto = require("crypto");
const { fileOf } = require("./imports");
const { refused } = require("./common");

/**
 * One of the names by fold, or a refusal naming them all; what: their words in a sentence, one and
 * many, in the camp's own (CORE-1.0), and the input that names one.
 */
function oneNamed(items, asked, nameOf, what, m) {
  const found = items.filter(
    (item) => m.foldName(nameOf(item)) === m.foldName(String(asked ?? ""))
  );
  if (found.length === 1) return { item: found[0] };
  const names = items.map(nameOf).join(", ") || "none";
  return {
    problem: asked
      ? `There is no ${what.one} called ${JSON.stringify(String(asked).slice(0, 80))}. The ${what.many}: ${names}.`
      : `Say which ${what.one} (${what.input}). The ${what.many}: ${names}.`
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
    {
      one: t.sIn("ElectiveSet"),
      many: t.pIn("ElectiveSet"),
      input: "elective_set"
    },
    m
  );
  if (set.problem) return refused(set.problem);
  const week = oneNamed(
    setup.weeks || [],
    input.week,
    (w) => w.Name,
    { one: t.sIn("Week"), many: t.pIn("Week"), input: "week" },
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
      : oneNamed(
          schedules,
          input.schedule,
          (s) => s.name,
          { one: "schedule", many: "schedules", input: "schedule" },
          m
        );
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
  // "Different campers" (ELECT-2.7), as the screen's button: by the name the rows share.
  const different = new Set(
    (Array.isArray(input.different_campers) ? input.different_campers : []).map(
      (name) => m.foldName(String(name))
    )
  );
  const apart = {};
  m.cantTellApartRows(reading).forEach((row) => {
    if (row.canSplit && different.has(m.foldName(row.name)))
      apart[row.key] = true;
  });
  const sheet = m.withApart(reading, apart);
  const waiting = m.cantTellApartRows(sheet).filter((r) => !r.different);
  if (waiting.length) {
    // The screen brings nothing in while two rows can't be told apart (its refusal card).
    const canSay = waiting.filter((r) => r.canSplit).map((r) => r.name);
    return refused(
      [
        `Nothing was imported: ${waiting.map((r) => `${r.name}: ${r.where}. ${r.why}`).join(" ")}`,
        ...(canSay.length
          ? [
              `If they are different ${t.pIn("Camper")}, send different_campers: ${JSON.stringify(canSay)}. Ask the person; else the sheet needs fixing.`
            ]
          : [])
      ].join("\n")
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
  const groups = m.groupsOfProgram(setup, schedule.item.programId);
  const request = (runRevision, which = {}) =>
    m.buildRequest({
      which,
      reading: sheet,
      activities,
      linked,
      answers,
      groups,
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
  const first = JSON.parse(answer(checked).text);
  // "Which camper?" (ELECT-2.7), as the screen asks it on card 3: by row, a choice's words or
  // "new". With answers the check is asked again, as the screen does, so the count says them.
  const said =
    input.which_camper && typeof input.which_camper === "object"
      ? input.which_camper
      : {};
  const which = {};
  const questions = m.whichRows({
    check: first,
    request: request(null),
    which: {},
    t
  });
  const whichLeft = [];
  for (const q of questions) {
    const row = q.where.replace(/^Row /, "");
    const given = String(said[row] ?? "").trim();
    const picked = q.options.find(
      (o) =>
        (given === "new" && o.value === m.NEW_CAMPER) ||
        m.foldName(o.label) === m.foldName(given)
    );
    if (given && picked) which[q.key] = picked.value;
    else whichLeft.push(q);
  }
  const whichLines = whichLeft.length
    ? [
        `More than one ${t.sIn("Camper")} in this season has these names. Say which each row is (ask the person), by which_camper: {"<row>": "<one of these>"} or "new" for a new ${t.sIn("Camper")}:`,
        ...whichLeft.map(
          (q) =>
            `- ${q.where}, ${q.name}: ${q.options
              .filter((o) => o.value !== m.NEW_CAMPER)
              .map((o) => JSON.stringify(o.label))
              .join(", ")}, or "new"`
        )
      ]
    : [];
  let check = first;
  if (Object.keys(which).length) {
    const again = await send(capability.api, {
      season: input.season,
      request: request(null, which)
    });
    if (again.status !== 200) return answer(again);
    check = JSON.parse(answer(again).text);
  }
  const seen = check.runRevision == null ? "none" : String(check.runRevision);
  if (check.isFinal) {
    return refused(
      `${check.runName || set.item.name} is final, so it can't take new choices.`
    );
  }
  if (!input.save) {
    const lines = m
      .countLines({
        request: request(check.runRevision, which),
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
              "Names on the sheet Shoresh doesn't have yet, each as it will be imported:",
              ...newNameLines(reading, answers, activities, m),
              'To change one, send answers by its name: "add" (a new activity, at How often 0), "leave" (leave it out) or "same:<activity>". Ask the person about any the sheet doesn\'t make plain.'
            ]
          : []),
        ...whichLines,
        whichLeft.length
          ? "Not ready to import until each row above is answered."
          : `Ready to import. To import it, send the same file and answers with save: true and seen: ${JSON.stringify(seen)}.`
      ].join("\n")
    };
  }
  if (whichLeft.length) {
    return refused(["Nothing was imported.", ...whichLines].join("\n"));
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
    request: request(check.runRevision, which),
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
