/**
 * The one small client the MCP server and the command line share. Each action is made by the
 * Salesforce command line itself (`sf api request rest`), signed in as the person through its own
 * sign-in store (`sf org login web` once), so it has exactly that person's access (API-1.7). This
 * code never sees, keeps or shows the sign-in (API-1.8).
 */
const { execFile } = require("child_process");
const path = require("path");
const { byName } = require("./capabilities");
const { Refused, editCells, lockedCells, draftOf } = require("./cells");
const { assignElectiveSeats } = require("./electives");
const { importFile, undoImport } = require("./imports");
const { importLastYear } = require("./lastYear");
const { importSpecialSchedule } = require("./specialFile");
const { makeFile } = require("./exports");
const { readLearned, forgetPattern } = require("./learned");
const { bringInChoices } = require("./choices");
const {
  campOf,
  tooOld,
  downloadAgain,
  read,
  send,
  requestFor
} = require("./camp");

/** The sf command line's words for one request; the body goes in on standard input. */
function sfArgs(request, org) {
  if (org && (!/^[\w.@-]+$/.test(org) || org.startsWith("-"))) {
    throw new Error("That isn't a Salesforce sign-in name.");
  }
  const args = [
    "api",
    "request",
    "rest",
    request.path,
    "--method",
    request.method,
    "--include"
  ];
  if (request.body !== undefined) args.push("--body", "-");
  if (org) args.push("--target-org", org);
  return args;
}

/**
 * Where sf is looked for: the PATH it was given, then the folders the Salesforce installer,
 * Homebrew and npm use, since a desktop app starts the connector with a short PATH. Node's own
 * folder too, for an sf installed with npm.
 */
function sfPath(env = process.env, node = process.execPath) {
  const home = env.HOME || env.USERPROFILE || "";
  return [
    env.PATH,
    path.dirname(node),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    home && path.join(home, ".npm-global", "bin"),
    "/usr/bin",
    "/bin"
  ]
    .filter(Boolean)
    .join(path.delimiter);
}

/**
 * Runs sf; answers its standard output, or, when that has no answer in it, what sf said went wrong
 * (so a sign-in that is gone can be told from Salesforce not answering, API-1.126).
 */
function runSf(args, stdin, timeout = 0) {
  return new Promise((resolve) => {
    const child = execFile(
      "sf",
      args,
      {
        maxBuffer: 16 * 1024 * 1024,
        timeout,
        env: {
          ...process.env,
          PATH: sfPath(),
          SF_DISABLE_AUTOUPDATE: "true"
        }
      },
      (error, stdout, stderr) =>
        resolve(
          /^HTTP\//m.test(stdout ?? "")
            ? stdout
            : [stdout, stderr, error?.code ?? error?.message]
                .filter(Boolean)
                .join("\n")
        )
    );
    child.stdin.on("error", () => {}); // sf missing: answered by the callback
    child.stdin.end(stdin ?? "");
  });
}

/**
 * sf's `--include` output: "HTTP/1.1 <status>", its headers ("name: value", one a line), maybe a
 * blank line, then Shoresh's answer. Only the status and the answer are kept; a line sf prints
 * before the status (a warning) is passed over.
 */
function readResponse(stdout) {
  const at = stdout.search(/^HTTP\/[\d.]+ \d{3}/m);
  if (at < 0) return null;
  const from = stdout.slice(at);
  const status = /^HTTP\/[\d.]+ (\d{3})/.exec(from);
  const lines = from.split(/\r?\n/).slice(1);
  let start = 0;
  while (start < lines.length && /^[A-Za-z0-9-]+:( |$)/.test(lines[start]))
    start++;
  if (lines[start] === "") start++;
  return { status: Number(status[1]), body: lines.slice(start).join("\n") };
}

/**
 * Do one action as the person. Answers { ok, status, text }: text is Shoresh's own answer, so a
 * conflict or a refusal reaches the agent as the same plain sentence a person sees (API-1.9).
 * A read's answer also has about (what the answer is and is not, API-1.27), and a schedule
 * read's has weekView: what Shoresh's own view of the week draws (API-1.26), when it could be read.
 */
async function call(name, input, options = {}) {
  // Which season Shoresh used (API-1.108): the last one any of the call's requests said.
  let season;
  const run = options.run ?? runSf;
  const done = await callOnce(name, input, {
    ...options,
    run: async (...args) => {
      const out = await run(...args);
      const said = seasonIn(readResponse(out)?.body);
      if (said) season = said;
      return out;
    }
  });
  const said = season && done && !done.season ? { ...done, season } : done;
  // Shoresh asked first and did nothing yet (API-1.106): never mistaken for done (API-1.115).
  return said?.ok && String(said.text).startsWith(NOT_YET)
    ? { ...said, asksFirst: true }
    : said;
}

// How Shoresh's ask-first answer opens (AgentAskFirst.NOT_YET; cli.test.js keeps the two the same).
const NOT_YET = "Nothing has been done yet.";

/**
 * A season named and found: Shoresh refuses one it doesn't have (API-1.25), so a done answer that
 * doesn't name its season (one the connector made itself: checks, versions, files, CSV) used the
 * one named (API-1.108, API-1.110).
 */
function withSeasonNamed(answer, input) {
  return answer?.ok && !answer.season && typeof input?.season === "string"
    ? { ...answer, season: input.season }
    : answer;
}

/** The season an answer says it used, if it says one. */
function seasonIn(body) {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.season === "string" ? parsed.season : undefined;
  } catch {
    return undefined;
  }
}

async function callOnce(
  name,
  input,
  {
    org,
    run = runSf,
    engine = loadEngine,
    checks = loadChecks,
    versionWords = loadVersionWords,
    edits = loadEdits,
    electives = loadElectives,
    imports = loadImports,
    files = loadExports,
    learned = loadLearned,
    choices = choiceModules,
    camp = campFor,
    folder
  } = {}
) {
  const capability = byName(name);
  if (!capability) throw new Error(`Shoresh has no action called "${name}".`);
  const asked = (request) => ask(request, org, run);
  const said = await camp(org, asked);
  const old = tooOld(said);
  if (old) return { ok: false, status: 400, text: old };
  const { namespace } = said;
  const at = {
    read: (api, fields) => asked(read(namespace, api, fields)),
    send: (api, body) => asked(send(namespace, api, body)),
    answer
  };
  const request = requestFor(capability, input, namespace);
  if (capability.buildsWithEngine) {
    return build(capability, input, at, () => engine(namespace));
  }
  if (capability.readsDraft) {
    return readDraft(
      capability,
      input,
      at,
      () => checks(namespace),
      () => edits(namespace)
    );
  }
  if (capability.checksWithEngine) {
    return weekChecks(
      capability,
      input,
      at,
      () => checks(namespace),
      () => edits(namespace)
    );
  }
  if (capability.editsWithEngine) {
    return editCells(capability, input, {
      ...at,
      load: () => edits(namespace)
    });
  }
  if (capability.assignsWithEngine) {
    return assignElectiveSeats(capability, input, {
      ...at,
      load: () => electives(namespace)
    });
  }
  if (capability.importsWithEngine) {
    return importFile(capability, input, {
      ...at,
      load: () => imports(namespace)
    });
  }
  if (capability.bringsInChoices) {
    return bringInChoices(capability, input, {
      ...at,
      load: () => choices(namespace)
    });
  }
  if (capability.importsLastYear) {
    return importLastYear(capability, input, {
      ...at,
      load: () => imports(namespace)
    });
  }
  if (capability.importsSpecialSchedule) {
    return importSpecialSchedule(capability, input, {
      ...at,
      load: () => imports(namespace)
    });
  }
  if (capability.makesFile) {
    return makeFile(capability, input, {
      ...at,
      load: () => files(namespace),
      ...(folder ? { folder } : {})
    });
  }
  if (capability.readsLearned) {
    return readLearned(capability, input, {
      ...at,
      load: () => learned(namespace)
    });
  }
  if (capability.forgetsPattern) {
    return forgetPattern(capability, input, {
      ...at,
      load: () => learned(namespace)
    });
  }
  if (capability.undoesImport) {
    return undoImport(capability, input, {
      ...at,
      load: () => imports(namespace)
    });
  }
  if (capability.listsVersions) {
    return listVersions(capability, await asked(request), () =>
      versionWords(namespace)
    );
  }
  const done = answer(await asked(request));
  if (!done.ok || !capability.about || input.as_csv) return done;
  done.about = capability.about;
  if (capability.showsWeek) {
    // The view is extra: the read stands without it.
    try {
      const view = await asked(requestFor(WEEK_VIEW, input, namespace));
      if (view.status === 200) done.weekView = JSON.parse(view.body);
    } catch {
      // no view this time
    }
  }
  return done;
}

/** What Shoresh's own view of a week draws: the Schedules screen's published week (API-1.26). */
const WEEK_VIEW = { api: "week_view", method: "GET" };

/**
 * What Salesforce says of the camp's Shoresh (camp.js), kept once read for each sign-in while the
 * connector runs: its namespace doesn't change under a running connector.
 */
const camps = new Map();
async function campFor(org, asked) {
  if (!camps.has(org)) {
    const camp = await campOf(asked);
    if (camp.read === false) return camp;
    camps.set(org, camp);
  }
  return camps.get(org);
}

/** One request as the person; Salesforce's status and Shoresh's answer. */
async function ask(request, org, run) {
  const out = await run(sfArgs(request, org), request.body);
  const response = readResponse(out);
  if (!response) {
    // Told to sign in only when sf says the sign-in isn't there (or sf itself isn't, ENOENT).
    if (SIGNED_OUT.test(out)) {
      throw new Error(
        `Couldn't reach Salesforce${org ? ` as "${org}"` : ""}. Sign in once with: sf org login web${org ? ` --alias ${org}` : ""}`
      );
    }
    throw new Error(NO_ANSWER);
  }
  if (stoppedByLimit(response)) {
    return {
      status: response.status,
      body: JSON.stringify({ message: TOO_BIG })
    };
  }
  return response;
}

// What sf says when its sign-in is missing, expired or refused (API-1.126): a refresh that failed
// for the network ("due to: connect ETIMEDOUT") is not one.
const SIGNED_OUT =
  /ENOENT|NamedOrgNotFound|NoOrgFound|NoDefaultEnv|No authorization information|No default (target|environment)|expired access\/refresh token|invalid_grant|inactive user|authentication failure|INVALID_SESSION_ID|Session expired/i;

// Signed in, but Salesforce didn't answer (API-1.126): never a sign-in, and never "nothing changed".
const NO_ANSWER =
  "Salesforce didn't answer just now, so Shoresh can't tell whether this was done. Try again in a moment; if it was a change, read first to see whether it went through.";

// The screens' own sentence for it (shoreshErrors TOO_BIG; connect.test.js keeps the two the same).
const TOO_BIG =
  "This camp is bigger than Salesforce lets Shoresh handle in one go, so trying again won't help. Open Help in Settings, or write to imshoresh@gmail.com.";

/**
 * A Salesforce limit stopped the request (a big import, undo or copy): Apex can't catch that, so
 * Salesforce answers it itself. Said as the screens say it (shoreshErrors).
 */
function stoppedByLimit(response) {
  return (
    response.status === 500 &&
    /^System\.LimitException:/.test(answerText(response.body))
  );
}

function answer(response) {
  const ok = response.status >= 200 && response.status < 300;
  return { ok, status: response.status, text: answerText(response.body) };
}

/**
 * build_week (API-1.19): reads what Generate reads (GET /v1/build_week), builds the week here with
 * Generated Schedule's own engine module (shipped beside this file, API-1.20), and saves it through
 * the screen's own save (POST /v1/build_week). The engine's refusal comes back in its own words.
 */
async function build(capability, input, at, engine) {
  const fields = JSON.parse(requestFor(capability, input).body);
  const query = {};
  for (const field of ["season", "week", "program"]) {
    if (fields[field] !== undefined) query[field] = fields[field];
  }
  const got = await at.read(capability.api, query);
  if (got.status !== 200) return answer(got);
  const inputs = JSON.parse(got.body);
  const built = (await engine()).buildForAgent(inputs);
  if (!built.ok) return { ok: false, status: 400, text: built.error };
  return answer(await at.send(capability.api, { ...fields, ...built.save }));
}

/**
 * read_week_checks and accept_finding (API-1.30, API-1.31, API-1.44): reads what Generated
 * Schedule or Manual Build reads to show its counter (GET /v1/week_checks), works the counter out here with the screen's own
 * modules (shipped beside this file), and answers it in the counter's words (on Generated
 * Schedule with its locked cells and the week as read, seen, which its cell edits, lock_cells and
 * unlock_cells hand back); to accept, finds
 * the line named among those shown and keeps it through the counter's own save
 * (POST /v1/accept_finding).
 */
async function weekChecks(capability, input, at, checks, edits) {
  const fields = {};
  for (const field of ["season", "week", "program", "schedule"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const got = await at.read("week_checks", fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = await checks();
  const { measure, accepted } = counterOf(m, body);
  if (capability.name === "read_week_checks") {
    const words = m.counterWords(measure, accepted);
    // A Generated Schedule week as read (its revision): its edits, locks and unlocks hand it
    // back. Its locked cells, as the screen shows each with its lock.
    const seen = body.inputs && body.inputs.revision;
    const read = seen
      ? { ...words, locked: lockedCells(await edits(), body), seen }
      : words;
    return {
      ok: true,
      status: 200,
      about: capability.about,
      text: JSON.stringify(read, null, 2)
    };
  }
  const lines = m.checkLines(measure, accepted);
  const shown = [
    ...lines.open,
    ...lines.under,
    ...lines.over,
    ...lines.look,
    ...lines.notes
  ].filter(m.acceptable);
  const fold = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const line = shown.find((l) => fold(m.wordsOf(l)) === fold(input.finding));
  if (!line) {
    return {
      ok: false,
      status: 400,
      text: `There is no line "${String(input.finding || "").slice(0, 120)}" to accept in this week's checks. The lines that can be accepted: ${shown.map(m.wordsOf).join("; ") || "none"}.`
    };
  }
  const kept = answer(
    await at.send(capability.api, {
      ...fields,
      line: JSON.parse(m.keptLine(line))
    })
  );
  return kept.ok ? { ...kept, text: `Accepted: ${m.saidOf(line)}.` } : kept;
}

/**
 * read_week_draft (API-1.123): reads the week as its screen opens it (GET /v1/read_week_draft,
 * what the counter reads), lays out its cells as the published read's rows with the cell edits'
 * own reading of it (cells.js draftOf), and adds the counter in its words and, on Generated
 * Schedule, the week as read (seen) that its cell edits, lock_cells and unlock_cells hand back.
 */
async function readDraft(capability, input, at, checks, edits) {
  const fields = {};
  for (const field of ["season", "week", "program", "schedule"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const got = await at.read(capability.api, fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = { ...(await checks()), ...(await edits()) };
  const { measure, accepted } = counterOf(m, body);
  const seen = body.inputs && body.inputs.revision;
  let draft;
  try {
    draft = draftOf(m, body, input);
  } catch (e) {
    if (e instanceof Refused) {
      return { ok: false, status: e.status, text: e.message };
    }
    throw e;
  }
  // What matters most comes first and the rows are compact: a client that cuts a long answer
  // loses cells, never the problems or seen.
  const read = {
    ...(body.season ? { season: body.season } : {}),
    week: input.week,
    schedule: body.draft ? "Manual Build" : "Generated Schedule",
    checks: m.counterWords(measure, accepted),
    ...(seen ? { seen } : {}),
    ...draft
  };
  return {
    ok: true,
    status: 200,
    about: capability.about,
    text: JSON.stringify(read)
  };
}

/**
 * The counter's measure and the lines accepted with the week, as Generated Schedule hands them
 * on: the page checks the week (counter.js), the week editor measures it (measure.js) and the
 * counter reads the week's accepts (lines.js).
 */
function counterOf(m, body) {
  m.nameDaysFor(body.setup);
  const terms = m.buildTerms(body.labels);
  const dots = (body.setup_changes && body.setup_changes.dots) || [];
  const setupDots = new Map(dots.map((dot) => [dot.key, dot.words]));
  if (body.draft) {
    // Manual Build (API-1.44): its draft checked as its week editor checks it (manualChecks.js).
    return {
      measure: m.manualMeasure(body.draft, {
        t: terms,
        setup: body.setup,
        setupDots
      }),
      accepted: m.readKept(body.accepted)
    };
  }
  const loaded = m.loadedOf(body.inputs || {});
  const { draft, checked } = m.counterWeek(loaded, {
    terms,
    setup: body.setup
  });
  const measure = m.weekMeasure({
    checked,
    draft,
    weekDays: draft.schedule.days,
    setupDots,
    planName: null
  });
  return { measure, accepted: m.readKept(body.accepted) };
}

/**
 * list_versions (API-1.32): the Versions panel's own list (GET /v1/versions), each version said
 * in the panel's words (its own module, shipped beside this file) and when it was saved as the
 * panel shows it ("Oct 31, 3:40 PM", on this computer's clock), with saved as Shoresh keeps it, to
 * name one of two that share a name.
 */
async function listVersions(capability, got, versionWords) {
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const { metaOf, canDelete } = await versionWords();
  const when = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
  const versions = body.versions.map((version) => {
    const { meta, showSaved } = metaOf(version);
    return {
      name: version.name,
      says: showSaved
        ? `${meta} · ${when.format(new Date(version.savedAt))}`
        : meta,
      saved: version.savedAt,
      can_delete: body.built && canDelete(version)
    };
  });
  return {
    ok: true,
    status: 200,
    about: capability.about,
    text: JSON.stringify(
      {
        week: body.week,
        program: body.program,
        versions: versions.length ? versions : "None yet"
      },
      null,
      2
    )
  };
}

/** One of the screens' own modules ("shoreshTerms.shoreshTerms"), as scripts/build-connect.js ships it beside this file. */
function loadModule(name) {
  return import(
    require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
      .href
  );
}

/**
 * The screens' own modules, with the camp's namespace on the field names they use (the shipped
 * schema module reads it); missing ones say what this copy can't do.
 */
async function loadModules(namespace, names, cant) {
  globalThis.SHORESH_NAMESPACE = namespace;
  try {
    return await Promise.all(names.map(loadModule));
  } catch {
    throw new Error(downloadAgain(cant));
  }
}

/** The Versions panel's words module, as scripts/build-connect.js ships it. */
async function loadVersionWords(namespace) {
  const [words] = await loadModules(
    namespace,
    ["shoreshVersions.words"],
    "can't list a week's versions"
  );
  return words;
}

/** Generated Schedule's own build module, as scripts/build-connect.js ships it beside this file. */
async function loadEngine(namespace) {
  const [engine] = await loadModules(
    namespace,
    ["shoreshGeneratedWeek.build"],
    "has no build engine"
  );
  return engine;
}

/** The screens' own modules the counter is worked out with, as scripts/build-connect.js ships them. */
async function loadChecks(namespace) {
  const modules = await loadModules(
    namespace,
    [
      "shoreshGeneratedWeek.build",
      "shoreshTerms.shoreshTerms",
      "shoreshGeneratedSchedule.counter",
      "shoreshWeekEditor.measure",
      "shoreshWeekEditor.manualChecks",
      "shoreshWeekChecks.lines"
    ],
    "can't read a week's checks"
  );
  return Object.assign({}, ...modules);
}

/**
 * The screens' own modules an edit of several cells is worked out with (API-1.38): the week opened
 * as Generated Schedule opens it, and the week editor's edits, as scripts/build-connect.js ships them.
 */
async function loadEdits(namespace) {
  const modules = await loadModules(
    namespace,
    [
      "shoreshGeneratedWeek.build",
      "shoreshTerms.shoreshTerms",
      "shoreshGeneratedSchedule.counter",
      "shoreshGeneratedSchedule.locks",
      "shoreshWeekEditor.measure",
      "shoreshWeekEditor.specials",
      "shoreshWeekEditor.slotEdits",
      "shoreshWeekEditor.locks",
      "shoreshWeekEditor.handEdits",
      "shoreshWeekEditor.rain"
    ],
    "can't change several cells"
  );
  return Object.assign({}, ...modules);
}

/**
 * The Elective seats screen's own modules seats are assigned with (API-1.67), as
 * scripts/build-connect.js ships them.
 */
async function loadElectives(namespace) {
  const modules = await loadModules(
    namespace,
    [
      "shoreshTerms.shoreshTerms",
      "shoreshElectiveEngine.shoreshElectiveEngine",
      "shoreshElectiveSeats.seats"
    ],
    "can't assign elective seats"
  );
  return Object.assign({}, ...modules);
}

/**
 * Bring in choices' own modules (API-1.117), as scripts/build-connect.js ships them: the reader,
 * the review's working, the import engine's files and names, the camp's words and field names.
 */
async function choiceModules(namespace) {
  const modules = await loadModules(
    namespace,
    [
      "shoreshImportEngine.shoreshImportEngine",
      "shoreshChoicesReader.shoreshChoicesReader",
      "shoreshChoicesImport.review",
      "shoreshTerms.shoreshTerms",
      "shoreshSchema.shoreshSchema"
    ],
    "can't bring in elective choices"
  );
  return Object.assign({}, ...modules);
}

/**
 * The import screens' own modules a file is reviewed and saved with (API-1.80, API-1.81), as
 * scripts/build-connect.js ships them. Each module's own names, so the list's questionCards is
 * the one Import a list asks with (Import last year's has the same name).
 */
async function loadImports(namespace) {
  const [
    engine,
    lists,
    table,
    terms,
    screens,
    remembered,
    patterns,
    choices,
    flow,
    summary,
    fromFile
  ] = await loadModules(
    namespace,
    [
      "shoreshImportEngine.shoreshImportEngine",
      "shoreshLists.shoreshLists",
      "shoreshListImport.table",
      "shoreshTerms.shoreshTerms",
      "shoreshScreens.shoreshScreens",
      "shoreshRemembered.shoreshRemembered",
      "shoreshPatterns.shoreshPatterns",
      "shoreshChoicesReader.shoreshChoicesReader",
      "shoreshImport.flow",
      "shoreshImport.summary",
      "shoreshSpecialSchedule.fromFile"
    ],
    "can't import a file"
  );
  return importModules({
    engine,
    lists,
    table,
    terms,
    screens,
    remembered,
    patterns,
    choices,
    flow,
    summary,
    fromFile
  });
}

/**
 * "What Shoresh has learned"'s own modules its list is worked out with (API-1.93), as
 * scripts/build-connect.js ships them.
 */
async function loadLearned(namespace) {
  const modules = await loadModules(
    namespace,
    [
      "shoreshLearned.history",
      "shoreshLearned.builtIn",
      "shoreshLearned.view",
      "shoreshPatterns.shoreshPatterns",
      "shoreshTerms.shoreshTerms"
    ],
    "can't read what Shoresh has learned"
  );
  return Object.assign({}, ...modules);
}

/**
 * The screens' own modules their files are made with (API-1.86 to API-1.89), SheetJS as the
 * screens save Excel files with it, and the printout page, as scripts/build-connect.js ships them.
 */
async function loadExports(namespace) {
  const [
    scheduleExport,
    views,
    offerings,
    electives,
    workbook,
    lists,
    screens,
    terms,
    weeks
  ] = await loadModules(
    namespace,
    [
      "shoreshScheduleExport.shoreshScheduleExport",
      "shoreshScheduleViews.shoreshScheduleViews",
      "shoreshElectiveDetails.offerings",
      "shoreshElectiveSeats.downloads",
      "shoreshDownload.workbook",
      "shoreshLists.shoreshLists",
      "shoreshScreens.shoreshScreens",
      "shoreshTerms.shoreshTerms",
      "shoreshImportEngine.weeks"
    ],
    "can't make a file"
  );
  return exportModules({
    scheduleExport,
    views,
    offerings,
    electives,
    workbook,
    lists,
    screens,
    terms,
    weeks,
    XLSX: require("./engine.SheetJS.cjs"),
    printPage: () =>
      require("fs").readFileSync(
        path.join(__dirname, "print-view.html"),
        "utf8"
      )
  });
}

/** The names the file actions use, each from its own module. */
function exportModules(m) {
  return {
    nameDaysFor: m.weeks.nameDaysFor,
    scheduleSheets: m.scheduleExport.scheduleSheets,
    printPages: m.scheduleExport.printPages,
    withRaindrops: m.views.withRaindrops,
    withSpecials: m.views.withSpecials,
    offeringNames: m.offerings.offeringNames,
    readDownload: m.electives.readDownload,
    downloadTitle: m.electives.downloadTitle,
    rosterPages: m.electives.rosterPages,
    rosterSheets: m.electives.rosterSheets,
    camperScheduleSheets: m.electives.camperScheduleSheets,
    fullReportSheets: m.electives.fullReportSheets,
    campersSheets: m.electives.campersSheets,
    workbookBytes: m.workbook.workbookBytes,
    fileNameOf: m.workbook.fileNameOf,
    listRows: m.lists.listRows,
    campWorkbookSheets: m.lists.campWorkbookSheets,
    LIST_SCREENS: m.lists.LIST_SCREENS,
    screenLabels: m.screens.screenLabels,
    buildTerms: m.terms.buildTerms,
    XLSX: m.XLSX,
    printPage: m.printPage
  };
}

/** The names the import actions use, each from its own module. */
function importModules(m) {
  return {
    ...m.engine,
    ...m.lists,
    importTable: m.table.importTable,
    buildTerms: m.terms.buildTerms,
    screenLabels: m.screens.screenLabels,
    rememberedByKey: m.remembered.rememberedByKey,
    suggestionsFor: m.patterns.suggestionsFor,
    withLearning: m.patterns.withLearning,
    readChoices: m.choices.readChoices,
    // Import last year's questions: the engine's, as its screen asks them (the list's
    // questionCards above has the same name).
    yearCards: m.engine.questionCards,
    // Import last year's own steps and counts (API-1.84).
    ...m.flow,
    comingIn: m.summary.comingIn,
    countTiles: m.summary.countTiles,
    // A special schedule's own file reading (API-1.85).
    pagesOf: m.fromFile.pagesOf,
    planFromPage: m.fromFile.planFromPage
  };
}

/**
 * Said to an AI after every refusal and conflict (API-1.105): what is wrong is the person's to
 * decide, so the AI tells them instead of changing something else to get around it.
 */
const PERSON_DECIDES =
  "Nothing else was changed. This is for the person to decide: tell them, and don't change anything to work around it.";

/** An answer as an AI hears it: a refusal or conflict ends with PERSON_DECIDES. */
function toAgent(answer) {
  return answer.ok
    ? answer
    : { ...answer, text: `${answer.text} ${PERSON_DECIDES}` };
}

const NO_PERMISSION_SET =
  "Your Salesforce account doesn't have the Shoresh permission set for this, so nothing was done. A Salesforce admin can give it to you: Shoresh Scheduler for a person, or the one Send or Read permission set for a connection.";

/** Shoresh's answer as text; a refusal's sentence on its own. */
function answerText(text) {
  try {
    const parsed = JSON.parse(text);
    // Salesforce's own refusal names Shoresh's insides: said in words a person can act on (API-1.105).
    if (
      Array.isArray(parsed) &&
      /access to the Apex class/.test(String(parsed[0]?.message))
    ) {
      return NO_PERMISSION_SET;
    }
    if (
      parsed &&
      !Array.isArray(parsed) &&
      Object.keys(parsed)
        .filter((key) => key !== "season")
        .join() === "message"
    ) {
      return parsed.message;
    }
    if (Array.isArray(parsed) && parsed[0] && parsed[0].errorCode) {
      return parsed.map((p) => p.message).join("\n");
    }
  } catch {
    // not JSON (a CSV file): as it came
  }
  return text.trim();
}

/** Whether sf answers at all (installed and found). */
async function sfInstalled(run = runSf) {
  return /@salesforce\/cli/.test(await run(["--version"]));
}

/**
 * Opens the person's browser at Salesforce's own sign-in page and waits (up to five minutes)
 * while they sign in; sf keeps the sign-in under `org`. Nothing it prints is kept (API-1.8).
 * host: the camp's My Domain host; without one, Salesforce's usual sign-in page.
 */
async function signIn(org, host, run = runSf) {
  const args = ["org", "login", "web", "--alias", org];
  if (host) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.salesforce\.com$/i.test(host)) {
      throw new Error(
        "That isn't a Salesforce address, like camp.my.salesforce.com."
      );
    }
    args.push("--instance-url", `https://${host}`);
  }
  await run(args, "", 5 * 60 * 1000);
}

/**
 * The test read the setup ends with (API-1.15): one read as the person, answered as one plain
 * sentence. Reading with no season reaches Shoresh's own checks (signed in, Shoresh there, the
 * person's permission) without needing a season's name.
 */
async function check({ org, run = runSf } = {}) {
  const asked = async (request) =>
    readResponse(await run(sfArgs(request, org), request.body)) ?? {
      status: 0,
      body: ""
    };
  const said = await campOf(asked);
  const old = tooOld(said);
  if (old) return { ok: false, text: old };
  const request = requestFor(byName("read_group_schedule"), {}, said.namespace);
  const out = await run(sfArgs(request, org));
  const response = readResponse(out);
  if (!response) {
    return {
      ok: false,
      text: SIGNED_OUT.test(out)
        ? "Not signed in to Salesforce yet, or the Salesforce command line isn't installed."
        : "Salesforce didn't answer just now. Try the test again in a moment."
    };
  }
  if (response.status === 403) {
    return { ok: false, text: `Not ready yet: ${answerText(response.body)}` };
  }
  if (response.status === 404) {
    return {
      ok: false,
      text: "Shoresh isn't in this Salesforce, or your account can't see it. Ask your Salesforce admin."
    };
  }
  if (response.status === 400 || response.status === 200) {
    return {
      ok: true,
      text: "Connected: your AI can now see and change your camp's schedules, with the same access you have in Salesforce."
    };
  }
  return { ok: false, text: answerText(response.body) };
}

module.exports = {
  TOO_BIG,
  withSeasonNamed,
  NOT_YET,
  PERSON_DECIDES,
  toAgent,
  importModules,
  exportModules,
  requestFor,
  sfArgs,
  readResponse,
  call,
  check,
  sfPath,
  sfInstalled,
  signIn
};
