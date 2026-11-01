/**
 * download_schedule, download_special_schedule, download_elective_files and download_setup
 * (API-1.86 to API-1.89): every file a screen's Download, Excel or Print makes, made here on the
 * person's own computer exactly as the screen makes it. What the screen reads before its file is
 * read (GET /v1/<api>); the file is worked out with the screen's own modules (shipped beside this
 * file: c/shoreshScheduleExport, c/shoreshElectiveSeats downloads.js, c/shoreshLists export.js),
 * turned into an Excel file by the same code and SheetJS copy the screen uses
 * (c/shoreshDownload workbook.js), and saved in the person's Downloads folder (API-1.90). Nothing
 * is sent anywhere else.
 *
 * Print: the screen hands its printout component the pages and asks the browser to print. Here
 * the same component, compiled unchanged, and the same pages are saved as one HTML page
 * (print-view.html) that opens the browser's print when opened; Save as PDF there makes a PDF.
 * A PDF made here would need a second way of laying pages out, so it would not be the screen's.
 */
const fs = require("fs");
const path = require("path");
const { refused } = require("./imports");

/** The views Print prints, as the Schedules screen names them. */
const VIEWS = { daily: "day", group: "group", activity: "activity" };

/** The Downloads folder, as a browser saves into it. */
function downloadsFolder(env = process.env) {
  return path.join(env.HOME || env.USERPROFILE || ".", "Downloads");
}

/**
 * Saves the bytes under the name in the folder; a name already there gets " (1)", " (2)"... as a
 * browser's download does, so nothing the person has is replaced. Answers the full path.
 */
function saveFile(folder, name, bytes) {
  fs.mkdirSync(folder, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 0; ; n++) {
    const file = path.join(folder, n ? `${stem} (${n})${ext}` : name);
    try {
      fs.writeFileSync(file, bytes, { flag: "wx" });
      return file;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  }
}

/** The screen's printout page with its pages in it. */
function printoutPage(page, printout) {
  // Inside a script: no "</script>" can end it early.
  const data = JSON.stringify(printout).replace(/</g, "\\u003c");
  return page.replace(
    "window.SHORESH_PRINTOUT = /* SHORESH_PRINTOUT */ null;",
    () => `window.SHORESH_PRINTOUT = ${data};`
  );
}

/** An Excel file name as the screen gives it, for the printout page: .html instead. */
function htmlName(m, title) {
  return m.fileNameOf(title).replace(/\.xlsx$/, ".html");
}

/** The schedule's file, as the Schedules screen's Excel or Print makes it. */
function scheduleFile(m, body, input, t) {
  const { opened, setup, week } = body;
  // As the screen names the version on screen: the opened schedule's own name.
  const version = opened.schedule ? opened.schedule.name : body.version;
  if (!opened.days || !opened.days.length) {
    return { problem: `This ${t.sIn("Version")} has no days saved.` };
  }
  const shown = m.withRaindrops(m.withSpecials(opened));
  const catalogue = setup.activities || [];
  const title = `${week} - ${version}`;
  if (input.as === "print") {
    const view = VIEWS[input.view || "daily"];
    if (!view) {
      return { problem: "view is daily, group or activity." };
    }
    return {
      print: {
        kind: "schedule",
        title,
        props: {
          pages: m.printPages(shown, view, catalogue, t),
          week,
          version,
          corner: t.s("TimeBlock")
        }
      },
      name: htmlName(m, title)
    };
  }
  return {
    sheets: m.scheduleSheets(shown, catalogue, t, m.offeringNames(setup)),
    name: m.fileNameOf(title)
  };
}

/** A special day's or event's schedule, as its page's Download makes it. */
function specialFile(m, body, input, t) {
  const view = body.view;
  const schedule = view.schedule;
  const day = schedule && schedule.days.length ? schedule.days[0] : null;
  if (!day || day.problem) {
    return {
      problem:
        (day && day.problem) ||
        view.problem ||
        `${view.name} has no schedule yet, so there is nothing to download.`
    };
  }
  const [sheet] = m.scheduleSheets(
    { days: [day] },
    [],
    t,
    m.offeringNames(body.setup)
  );
  return {
    sheets: [{ ...sheet, name: view.name }],
    name: m.fileNameOf(view.name)
  };
}

/** A final run's file, as the Elective seats screen's Download menu makes it. */
function electiveFile(m, body, input, t) {
  const d = m.readDownload(body.download, t);
  if (input.file === "print_rosters") {
    const file = m.downloadTitle(d, "rosters");
    return {
      print: {
        kind: "rosters",
        title: file,
        props: { pages: m.rosterPages(d), header: d.header, file }
      },
      name: htmlName(m, file)
    };
  }
  const activityNames = new Map(
    (body.setup.activities || []).map((a) => [a.Id, a.Name])
  );
  const made = {
    rosters: () => [m.rosterSheets(d), "rosters"],
    camper_schedules: () => [m.camperScheduleSheets(d), "camper schedules"],
    full_report: () => [m.fullReportSheets(d), "full report"],
    campers: () => [m.campersSheets(d, activityNames), t.pIn("Camper")]
  }[input.file || "rosters"];
  if (!made) {
    return {
      problem:
        "file is rosters, print_rosters, camper_schedules, full_report or campers."
    };
  }
  const [sheets, what] = made();
  return { sheets, name: m.fileNameOf(m.downloadTitle(d, what)) };
}

/** A setup list or the whole-camp worksheet, as Download this list and Download worksheet make them. */
function setupFile(m, body, input, t) {
  const setup = body.setup;
  if (!input.list || input.list === "worksheet") {
    return {
      sheets: m.campWorkbookSheets(setup, t),
      name: m.fileNameOf(`${setup.season.Name} - worksheet`)
    };
  }
  const screenName = m.screenLabels(t)[input.list];
  if (!m.LIST_SCREENS.includes(input.list) || !screenName) {
    return {
      problem: `list is worksheet or one of: ${m.LIST_SCREENS.join(", ")}.`
    };
  }
  return {
    sheets: [{ name: screenName, rows: m.listRows(input.list, setup, t) }],
    name: m.fileNameOf(`${screenName} - ${setup.season.Name}`)
  };
}

const MAKERS = {
  schedule: scheduleFile,
  special: specialFile,
  electives: electiveFile,
  setup: setupFile
};

async function makeFile(
  capability,
  input,
  { ask, answer, load, namespaceOf, folder = downloadsFolder() }
) {
  const query = new URLSearchParams();
  for (const field of capability.queryFields) {
    if (input[field] !== undefined && input[field] !== "") {
      query.set(field, input[field]);
    }
  }
  const said = query.toString();
  const read = await ask({
    path: `/services/apexrest/v1/${capability.api}${said ? `?${said}` : ""}`,
    method: "GET"
  });
  if (read.status !== 200) return answer(read);
  const body = JSON.parse(read.body);
  const m = await load(namespaceOf(body));
  const t = m.buildTerms((body.setup && body.setup.labels) || []);
  let made;
  try {
    made = MAKERS[capability.makesFile](m, body, input, t);
  } catch (e) {
    // The screen's own refusal (a cell longer than Excel holds), in its words.
    return refused(e.message);
  }
  if (made.problem) return refused(made.problem);
  const bytes = made.print
    ? printoutPage(m.printPage(), made.print)
    : Buffer.from(m.workbookBytes(m.XLSX, made.sheets));
  const file = saveFile(folder, made.name, bytes);
  return {
    ok: true,
    status: 200,
    about: capability.about,
    text: JSON.stringify(
      {
        saved: `Saved ${path.basename(file)} in the Downloads folder on this computer.`,
        file_name: path.basename(file),
        path: file,
        ...(made.print
          ? {
              print:
                "Opening it shows the printout and the browser's Print; choose Save as PDF there for a PDF."
            }
          : {})
      },
      null,
      2
    )
  };
}

module.exports = { makeFile, saveFile, downloadsFolder, printoutPage };
