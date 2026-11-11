/**
 * bring_in_choices (API-1.117): the Elective seats screen's own Bring in choices, so an AI can
 * start a week's electives as a person does. What the screen reads is read as it reads it (GET
 * /v1/bring_in_choices: the season's setup, the camp's remembered answers, the screen's own sets
 * and runs); the file is read and the request worked out with the screen's own modules
 * (c/shoreshChoicesReader readChoices, c/shoreshChoicesImport review.js), shipped beside this
 * file; the count is the server's own check, said in the screen's own lines (countLines). With
 * save: true it is the screen's own Bring in, while the run is as the review saw it (seen).
 */
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
    // As the screen's empty state says it ("No schedule for this week yet"), with the step first.
    return refused(
      `No schedule for ${week.item.Name} yet: build it on Generated Schedule or start it on Manual Build first. Nothing was brought in.`
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
      `${file.name}: no campers with choices found. Nothing was brought in.`
    );
  }
  if (reading.cantTellApart.length) {
    // The screen brings nothing in while two rows can't be told apart (its refusal card).
    const rows = m.cantTellApartRows(reading);
    return refused(
      `Nothing was brought in: ${rows.map((r) => `${r.name}: ${r.where}. ${r.why}`).join(" ")}`
    );
  }

  const answers = m.rememberedAnswers(
    reading.newNames,
    situation.answers,
    activities
  );
  const given =
    input.answers && typeof input.answers === "object" ? input.answers : {};
  for (const [name, said] of Object.entries(given)) {
    const a = answerOf(said, activities, m);
    if (a) answers[m.foldName(name)] = a;
  }
  const open = (reading.newNames || []).filter(
    (n) => !answers[m.foldName(n.name)]
  );
  if (open.length) {
    return {
      ok: true,
      status: 200,
      text: [
        `Review of ${file.name} for ${set.item.name} in ${week.item.Name}, as the Elective seats screen's Bring in choices shows it. Nothing is brought in yet.`,
        `Names on the sheet Shoresh doesn't have yet: ${open
          .map((n) => {
            const proposal = m.proposalFor(n.name, activities);
            return `${JSON.stringify(n.name)}${proposal ? ` (maybe the same as ${proposal.Name || proposal.name})` : ""}`;
          })
          .join(", ")}.`,
        'Answer each in answers, by its name: "add" (a new activity), "leave" (leave it out) or "same:<activity>". Ask the person about any that the sheet doesn\'t make plain.'
      ].join("\n")
    };
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
      fingerprint: null,
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
        `Review of ${file.name} for ${set.item.name} in ${week.item.Name} (${schedule.item.name}), as the Elective seats screen's Bring in choices shows it. Nothing is brought in yet.`,
        ...lines,
        `Ready to bring in. To bring it in, send the same file and answers with save: true and seen: ${JSON.stringify(seen)}.`
      ].join("\n")
    };
  }
  if (String(input.seen ?? "").trim() !== seen) {
    return {
      ok: false,
      status: 409,
      text: "Someone brought choices in since the file was reviewed, so nothing was brought in. Review the file again (without save) and use the new seen."
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
    text: `Brought in ${n} ${n === 1 ? t.sIn("Camper") : t.pIn("Camper")} to "${done.runName}": ${done.added} new.`
  };
}

module.exports = { bringInChoices };
