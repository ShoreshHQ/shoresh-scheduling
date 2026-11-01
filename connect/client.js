/**
 * The one small client the MCP server and the command line share. Each action is made by the
 * Salesforce command line itself (`sf api request rest`), signed in as the person through its own
 * sign-in store (`sf org login web` once), so it has exactly that person's access (API-1.7). This
 * code never sees, keeps or shows the sign-in (API-1.8).
 */
const { execFile } = require("child_process");
const path = require("path");
const { byName } = require("./capabilities");
const { editCells } = require("./cells");
const { assignElectiveSeats } = require("./electives");
const { importFile, undoImport } = require("./imports");
const { importLastYear } = require("./lastYear");
const { importSpecialSchedule } = require("./specialFile");
const { makeFile } = require("./exports");
const { readLearned } = require("./learned");

/** The web address and request for one action. */
function requestFor(capability, input = {}) {
  const path = `/services/apexrest/v1/${capability.api}`;
  if (capability.method === "GET") {
    const query = new URLSearchParams();
    for (const field of capability.queryFields ?? ["season", "week"]) {
      if (input[field]) query.set(field, input[field]);
    }
    if (input.as_csv) query.set("format", "csv");
    const said = query.toString();
    return { path: said ? `${path}?${said}` : path, method: "GET" };
  }
  if (capability.sendsFields) {
    const fields = {};
    for (const field of Object.keys(capability.inputSchema.properties)) {
      if (input[field] !== undefined) fields[field] = input[field];
    }
    return { path, method: "POST", body: JSON.stringify(fields) };
  }
  return {
    path,
    method: "POST",
    body: JSON.stringify({ records: input.records ?? [] })
  };
}

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

/** Runs sf; answers its standard output. */
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
      (error, stdout) => resolve(stdout ?? "")
    );
    child.stdin.on("error", () => {}); // sf missing: answered by the callback
    child.stdin.end(stdin ?? "");
  });
}

/**
 * sf's `--include` output: "HTTP/1.1 <status>", its headers ("name: value", one a line), maybe a
 * blank line, then Shoresh's answer. Only the status and the answer are kept.
 */
function readResponse(stdout) {
  const status = /^HTTP\/[\d.]+ (\d{3})/.exec(stdout);
  if (!status) return null;
  const lines = stdout.split(/\r?\n/).slice(1);
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
async function call(
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
    folder
  } = {}
) {
  const capability = byName(name);
  if (!capability) throw new Error(`Shoresh has no action called "${name}".`);
  const request = requestFor(capability, input);
  if (capability.buildsWithEngine) {
    return build(request, org, run, engine);
  }
  if (capability.checksWithEngine) {
    return weekChecks(capability, input, org, run, checks);
  }
  if (capability.editsWithEngine) {
    return editCells(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: edits,
      namespaceOf
    });
  }
  if (capability.assignsWithEngine) {
    return assignElectiveSeats(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: electives,
      namespaceOf
    });
  }
  if (capability.importsWithEngine) {
    return importFile(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: imports,
      namespaceOf
    });
  }
  if (capability.importsLastYear) {
    return importLastYear(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: imports,
      namespaceOf
    });
  }
  if (capability.importsSpecialSchedule) {
    return importSpecialSchedule(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: imports
    });
  }
  if (capability.makesFile) {
    return makeFile(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: files,
      namespaceOf,
      ...(folder ? { folder } : {})
    });
  }
  if (capability.readsLearned) {
    return readLearned(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: learned,
      namespaceOf
    });
  }
  if (capability.undoesImport) {
    return undoImport(capability, input, {
      ask: (r) => ask(r, org, run),
      answer,
      load: imports
    });
  }
  if (capability.listsVersions) {
    return listVersions(capability, request, org, run, versionWords);
  }
  const done = answer(await ask(request, org, run));
  if (!done.ok || !capability.about || input.as_csv) return done;
  done.about = capability.about;
  if (capability.showsWeek) {
    // The view is extra: the read stands without it.
    try {
      const view = await ask(
        { ...requestFor(WEEK_VIEW, input), method: "GET" },
        org,
        run
      );
      if (view.status === 200) done.weekView = JSON.parse(view.body);
    } catch {
      // no view this time
    }
  }
  return done;
}

/** What Shoresh's own view of a week draws: the Schedules screen's published week (API-1.26). */
const WEEK_VIEW = { api: "week_view", method: "GET" };

/** One request as the person; Salesforce's status and Shoresh's answer. */
async function ask(request, org, run) {
  const response = readResponse(await run(sfArgs(request, org), request.body));
  if (!response) {
    throw new Error(
      `Couldn't reach Salesforce${org ? ` as "${org}"` : ""}. Sign in once with: sf org login web${org ? ` --alias ${org}` : ""}`
    );
  }
  return response;
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
async function build(request, org, run, engine) {
  const fields = JSON.parse(request.body);
  const query = new URLSearchParams();
  for (const field of ["season", "week", "program"]) {
    if (fields[field] !== undefined) query.set(field, fields[field]);
  }
  const read = await ask(
    { path: `${request.path}?${query}`, method: "GET" },
    org,
    run
  );
  if (read.status !== 200) return answer(read);
  const inputs = JSON.parse(read.body);
  const built = (await engine(namespaceOf(inputs))).buildForAgent(inputs);
  if (!built.ok) return { ok: false, status: 400, text: built.error };
  return answer(
    await ask(
      { ...request, body: JSON.stringify({ ...fields, ...built.save }) },
      org,
      run
    )
  );
}

/**
 * read_week_checks and accept_finding (API-1.30, API-1.31, API-1.44): reads what Generated
 * Schedule or Manual Build reads to show its counter (GET /v1/week_checks), works the counter out here with the screen's own
 * modules (shipped beside this file), and answers it in the counter's words; to accept, finds
 * the line named among those shown and keeps it through the counter's own save
 * (POST /v1/accept_finding).
 */
async function weekChecks(capability, input, org, run, checks) {
  const fields = {};
  for (const field of ["season", "week", "program", "schedule"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const read = await ask(
    {
      path: `/services/apexrest/v1/week_checks?${new URLSearchParams(fields)}`,
      method: "GET"
    },
    org,
    run
  );
  if (read.status !== 200) return answer(read);
  const body = JSON.parse(read.body);
  const m = await checks(namespaceOf(body));
  const { measure, accepted } = counterOf(m, body);
  if (capability.name === "read_week_checks") {
    return {
      ok: true,
      status: 200,
      about: capability.about,
      text: JSON.stringify(m.counterWords(measure, accepted), null, 2)
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
    await ask(
      {
        path: `/services/apexrest/v1/${capability.api}`,
        method: "POST",
        body: JSON.stringify({ ...fields, line: JSON.parse(m.keptLine(line)) })
      },
      org,
      run
    )
  );
  return kept.ok ? { ...kept, text: `Accepted: ${m.saidOf(line)}.` } : kept;
}

/**
 * The counter's measure and the lines accepted with the week, as Generated Schedule hands them
 * on: the page checks the week (counter.js), the week editor measures it (measure.js) and the
 * counter reads the week's accepts (lines.js).
 */
function counterOf(m, body) {
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
async function listVersions(capability, request, org, run, versionWords) {
  const read = await ask(request, org, run);
  if (read.status !== 200) return answer(read);
  const body = JSON.parse(read.body);
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

/** The Versions panel's words module, as scripts/build-connect.js ships it. */
async function loadVersionWords() {
  try {
    return await import(
      require("url").pathToFileURL(
        path.join(__dirname, "engine.shoreshVersions.words.mjs")
      ).href
    );
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't list a week's versions. Download it again from Settings in Shoresh."
    );
  }
}

/** The package's prefix on the field names Salesforce sent ("shoresh" in shoresh__Week__c), or "". */
function namespaceOf(read) {
  const found = /"([A-Za-z0-9]+)__[A-Za-z0-9_]+__c"\s*:/.exec(
    JSON.stringify(read)
  );
  return found ? found[1] : "";
}

/** Generated Schedule's own build module, as scripts/build-connect.js ships it beside this file. */
async function loadEngine(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const file = path.join(__dirname, "engine.shoreshGeneratedWeek.build.mjs");
  try {
    return await import(require("url").pathToFileURL(file).href);
  } catch {
    throw new Error(
      "This copy of Shoresh's connector has no build engine. Download it again from Settings in Shoresh."
    );
  }
}

/** The screens' own modules the counter is worked out with, as scripts/build-connect.js ships them. */
async function loadChecks(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const load = (name) =>
    import(
      require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
        .href
    );
  try {
    const modules = await Promise.all(
      [
        "shoreshGeneratedWeek.build",
        "shoreshTerms.shoreshTerms",
        "shoreshGeneratedSchedule.counter",
        "shoreshWeekEditor.measure",
        "shoreshWeekEditor.manualChecks",
        "shoreshWeekChecks.lines"
      ].map(load)
    );
    return Object.assign({}, ...modules);
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't read a week's checks. Download it again from Settings in Shoresh."
    );
  }
}

/**
 * The screens' own modules an edit of several cells is worked out with (API-1.38): the week opened
 * as Generated Schedule opens it, and the week editor's edits, as scripts/build-connect.js ships them.
 */
async function loadEdits(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const load = (name) =>
    import(
      require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
        .href
    );
  try {
    const modules = await Promise.all(
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
      ].map(load)
    );
    return Object.assign({}, ...modules);
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't change several cells. Download it again from Settings in Shoresh."
    );
  }
}

/**
 * The Elective seats screen's own modules seats are assigned with (API-1.67), as
 * scripts/build-connect.js ships them.
 */
async function loadElectives(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const load = (name) =>
    import(
      require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
        .href
    );
  try {
    const modules = await Promise.all(
      [
        "shoreshTerms.shoreshTerms",
        "shoreshElectiveEngine.shoreshElectiveEngine",
        "shoreshElectiveSeats.seats"
      ].map(load)
    );
    return Object.assign({}, ...modules);
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't assign elective seats. Download it again from Settings in Shoresh."
    );
  }
}

/**
 * The import screens' own modules a file is reviewed and saved with (API-1.80, API-1.81), as
 * scripts/build-connect.js ships them. Each module's own names, so the list's questionCards is
 * the one Import a list asks with (Import last year's has the same name).
 */
async function loadImports(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const load = (name) =>
    import(
      require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
        .href
    );
  try {
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
    ] = await Promise.all(
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
      ].map(load)
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
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't import a file. Download it again from Settings in Shoresh."
    );
  }
}

/**
 * "What Shoresh has learned"'s own modules its list is worked out with (API-1.93), as
 * scripts/build-connect.js ships them.
 */
async function loadLearned(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const load = (name) =>
    import(
      require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
        .href
    );
  try {
    const modules = await Promise.all(
      [
        "shoreshLearned.history",
        "shoreshLearned.builtIn",
        "shoreshLearned.view",
        "shoreshPatterns.shoreshPatterns",
        "shoreshTerms.shoreshTerms"
      ].map(load)
    );
    return Object.assign({}, ...modules);
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't read what Shoresh has learned. Download it again from Settings in Shoresh."
    );
  }
}

/**
 * The screens' own modules their files are made with (API-1.86 to API-1.89), SheetJS as the
 * screens save Excel files with it, and the printout page, as scripts/build-connect.js ships them.
 */
async function loadExports(namespace) {
  globalThis.SHORESH_NAMESPACE = namespace;
  const load = (name) =>
    import(
      require("url").pathToFileURL(path.join(__dirname, `engine.${name}.mjs`))
        .href
    );
  try {
    const [
      scheduleExport,
      views,
      offerings,
      electives,
      workbook,
      lists,
      screens,
      terms
    ] = await Promise.all(
      [
        "shoreshScheduleExport.shoreshScheduleExport",
        "shoreshScheduleViews.shoreshScheduleViews",
        "shoreshElectiveDetails.offerings",
        "shoreshElectiveSeats.downloads",
        "shoreshDownload.workbook",
        "shoreshLists.shoreshLists",
        "shoreshScreens.shoreshScreens",
        "shoreshTerms.shoreshTerms"
      ].map(load)
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
      XLSX: require("./engine.SheetJS.cjs"),
      printPage: () =>
        require("fs").readFileSync(
          path.join(__dirname, "print-view.html"),
          "utf8"
        )
    });
  } catch {
    throw new Error(
      "This copy of Shoresh's connector can't make a file. Download it again from Settings in Shoresh."
    );
  }
}

/** The names the file actions use, each from its own module. */
function exportModules(m) {
  return {
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

/** Shoresh's answer as text; a refusal's sentence on its own. */
function answerText(text) {
  try {
    const parsed = JSON.parse(text);
    if (
      parsed &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).join() === "message"
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
  const request = requestFor(byName("read_group_schedule"), {});
  const response = readResponse(await run(sfArgs(request, org)));
  if (!response) {
    return {
      ok: false,
      text: "Not signed in to Salesforce yet, or the Salesforce command line isn't installed."
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
  importModules,
  exportModules,
  requestFor,
  namespaceOf,
  sfArgs,
  readResponse,
  call,
  check,
  sfPath,
  sfInstalled,
  signIn
};
