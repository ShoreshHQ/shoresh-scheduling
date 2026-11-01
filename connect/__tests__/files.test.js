/**
 * The screens' files made through an AI tool or the command line (docs/protocol/api.md API-1.86
 * to API-1.90): each is the screen's own file, made by the screen's own modules from what the
 * screen reads, and saved only in the Downloads folder on this computer. No Salesforce here: the
 * sf command line is a stand-in, and the data is made up.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { byName } = require("../capabilities");
const { call, exportModules } = require("../client");
const { downloadsFolder } = require("../exports");

const LWC = path.resolve(__dirname, "../../force-app/main/default/lwc");
const XLSX = require("../../force-app/main/default/staticresources/SheetJS.js");
const scheduleExport = require(
  `${LWC}/shoreshScheduleExport/shoreshScheduleExport.js`
);
const views = require(`${LWC}/shoreshScheduleViews/shoreshScheduleViews.js`);
const offerings = require(`${LWC}/shoreshElectiveDetails/offerings.js`);
const electives = require(`${LWC}/shoreshElectiveSeats/downloads.js`);
const workbook = require(`${LWC}/shoreshDownload/workbook.js`);
const lists = require(`${LWC}/shoreshLists/shoreshLists.js`);
const screens = require(`${LWC}/shoreshScreens/shoreshScreens.js`);
const terms = require(`${LWC}/shoreshTerms/shoreshTerms.js`);
const { LABELS, opened } = require(
  `${LWC}/shoreshScheduleViews/__tests__/data/scheduleFixture.js`
);
const { finalDownload } = require(
  `${LWC}/shoreshElectiveSeats/__tests__/data/download.js`
);
const { camp: listsCamp } = require(
  `${LWC}/shoreshLists/__tests__/data/camp.js`
);
// The lists' made-up camp, its season named as the screens read it.
const camp = () => {
  const setup = listsCamp();
  return { ...setup, season: { ...setup.season, Name: "Summer 2026" } };
};

const PAGE = "<p>window.SHORESH_PRINTOUT = /* SHORESH_PRINTOUT */ null;</p>";
const files = async () =>
  exportModules({
    scheduleExport,
    views,
    offerings,
    electives,
    workbook,
    lists,
    screens,
    terms,
    XLSX,
    printPage: () => PAGE
  });

/** One action against a stand-in sf answering the read; what was asked and what was saved. */
async function make(name, input, read, status = 200) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-files-"));
  const sent = [];
  const done = await call(name, input, {
    run: async (args, stdin) => {
      sent.push({ args, stdin });
      return `HTTP/1.1 ${status}\ncontent-type: application/json\n\n${JSON.stringify(read)}`;
    },
    files,
    folder
  });
  const saved = fs.readdirSync(folder);
  return { done, sent, folder, saved };
}

/** An .xlsx file's sheets as names and rows of text. */
function sheetsIn(file) {
  const wb = XLSX.read(new Uint8Array(fs.readFileSync(file)), {
    type: "array"
  });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: "",
      raw: false
    })
  }));
}

/** The screen's sheets as they come back out of an .xlsx (the same SheetJS reading). */
function asWritten(sheets) {
  const wb = XLSX.read(workbook.workbookBytes(XLSX, sheets), { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: "",
      raw: false
    })
  }));
}

/** The printout page's pages, as saved. */
function printoutIn(file) {
  const text = fs.readFileSync(file, "utf8");
  const json = /window\.SHORESH_PRINTOUT = (.*);<\/p>/.exec(text)[1];
  return JSON.parse(json);
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const t = terms.buildTerms(LABELS);

describe("the screens' files, made on this computer", () => {
  // API-1.86
  it("aScheduleFileIsTheScreensExcelAndPrintout: the Schedules screen's Excel and Print of the version read, saved as the screen names them", async () => {
    const setup = {
      activities: [{ Id: "a1", Name: "Swim" }],
      labels: LABELS,
      electives: { sets: [], offerings: [], linkedChoices: [] }
    };
    const read = {
      week: "Week 1",
      program: "Main",
      version: "Published Oct 18, 2:40 PM",
      opened: opened(),
      setup
    };
    const shown = views.withRaindrops(views.withSpecials(opened()));
    const excel = await make(
      "download_schedule",
      {
        season: "Summer 2026",
        week: "Week 1",
        version: "Published Oct 18, 2:40 PM"
      },
      read
    );
    expect(excel.sent).toHaveLength(1);
    expect(excel.sent[0].args.slice(3, 6)).toEqual([
      "/services/apexrest/v1/schedule_file?season=Summer+2026&week=Week+1&version=Published+Oct+18%2C+2%3A40+PM",
      "--method",
      "GET"
    ]);
    expect(excel.done.ok).toBe(true);
    // As the screen names it: fileNameOf(`${week} - ${version}`).
    expect(excel.saved).toEqual(["Week 1 - Published Oct 18, 2 40 PM.xlsx"]);
    const answer = JSON.parse(excel.done.text);
    expect(answer.path).toBe(path.join(excel.folder, excel.saved[0]));
    expect(sheetsIn(answer.path)).toEqual(
      asWritten(
        scheduleExport.scheduleSheets(
          shown,
          setup.activities,
          t,
          offerings.offeringNames(setup)
        )
      )
    );

    const printed = await make(
      "download_schedule",
      { week: "Week 1", as: "print", view: "group" },
      read
    );
    expect(printed.saved).toEqual(["Week 1 - Published Oct 18, 2 40 PM.html"]);
    expect(JSON.parse(printed.done.text).print).toMatch(/Save as PDF/);
    expect(printoutIn(path.join(printed.folder, printed.saved[0]))).toEqual({
      kind: "schedule",
      title: "Week 1 - Published Oct 18, 2:40 PM",
      props: plain({
        pages: scheduleExport.printPages(shown, "group", setup.activities, t),
        week: "Week 1",
        version: "Published Oct 18, 2:40 PM",
        corner: t.s("TimeBlock")
      })
    });

    const empty = await make(
      "download_schedule",
      { week: "Week 1" },
      {
        ...read,
        opened: { ...opened(), days: [] }
      }
    );
    expect(empty.done).toEqual({
      ok: false,
      status: 400,
      text: `This ${t.sIn("Version")} has no days saved.`
    });
    expect(empty.saved).toEqual([]);

    const refused = await make(
      "download_schedule",
      { week: "Week 9" },
      { message: 'There is no week called "Week 9".' },
      400
    );
    expect(refused.done).toEqual({
      ok: false,
      status: 400,
      text: 'There is no week called "Week 9".'
    });
    expect(refused.saved).toEqual([]);
  });

  // API-1.87
  it("aSpecialScheduleFileIsItsPagesDownload: the page's one sheet, named for the item", async () => {
    const day = opened().days[0];
    const setup = { activities: [], labels: LABELS };
    const read = {
      view: {
        name: "Color War",
        kind: "SpecialEvent",
        schedule: { days: [day] }
      },
      setup
    };
    const made = await make(
      "download_special_schedule",
      { special: "color war" },
      read
    );
    expect(made.sent[0].args[3]).toBe(
      "/services/apexrest/v1/special_schedule_file?special=color+war"
    );
    expect(made.saved).toEqual(["Color War.xlsx"]);
    const [sheet] = scheduleExport.scheduleSheets(
      { days: [day] },
      [],
      t,
      offerings.offeringNames(setup)
    );
    expect(sheetsIn(path.join(made.folder, made.saved[0]))).toEqual(
      asWritten([{ ...sheet, name: "Color War" }])
    );
    const none = await make(
      "download_special_schedule",
      { special: "x" },
      {
        view: { name: "Color War", schedule: { days: [] } },
        setup
      }
    );
    expect(none.done.ok).toBe(false);
    expect(none.saved).toEqual([]);
  });

  // API-1.88
  it("anElectiveFileIsTheDownloadMenusFile: each of a final run's files and its rosters on paper, as the menu makes them", async () => {
    const setup = {
      activities: [{ Id: "act1", Name: "Archery" }],
      labels: []
    };
    const read = { download: finalDownload(), setup };
    const et = terms.buildTerms([]);
    const d = electives.readDownload(finalDownload(), et);
    const expected = {
      rosters: [electives.rosterSheets(d), "rosters"],
      camper_schedules: [electives.camperScheduleSheets(d), "camper schedules"],
      full_report: [electives.fullReportSheets(d), "full report"],
      campers: [
        electives.campersSheets(d, new Map([["act1", "Archery"]])),
        et.pIn("Camper")
      ]
    };
    for (const [file, [sheets, what]] of Object.entries(expected)) {
      const made = await make(
        "download_elective_files",
        { week: "Week 1", elective_set: "Chugim", file },
        read
      );
      const name = workbook.fileNameOf(electives.downloadTitle(d, what));
      expect([file, made.saved]).toEqual([file, [name]]);
      expect(sheetsIn(path.join(made.folder, name))).toEqual(asWritten(sheets));
    }
    const printed = await make(
      "download_elective_files",
      { week: "Week 1", file: "print_rosters" },
      read
    );
    const title = electives.downloadTitle(d, "rosters");
    expect(printed.saved).toEqual([`${title}.html`]);
    expect(printoutIn(path.join(printed.folder, printed.saved[0]))).toEqual({
      kind: "rosters",
      title,
      props: plain({
        pages: electives.rosterPages(d),
        header: d.header,
        file: title
      })
    });
    expect(printed.sent[0].args[3]).toBe(
      "/services/apexrest/v1/elective_file?week=Week+1"
    );
  });

  // API-1.89
  it("aSetupFileIsTheScreensListOrWorksheet: Download this list and Download worksheet, as the screens make them", async () => {
    const setup = camp();
    const st = terms.buildTerms(setup.labels);
    const worksheet = await make("download_setup", {}, { setup });
    expect(worksheet.sent[0].args[3]).toBe("/services/apexrest/v1/setup_file");
    expect(worksheet.saved).toEqual([
      workbook.fileNameOf(`${setup.season.Name} - worksheet`)
    ]);
    expect(sheetsIn(path.join(worksheet.folder, worksheet.saved[0]))).toEqual(
      asWritten(lists.campWorkbookSheets(setup, st))
    );
    const screenName = screens.screenLabels(st).groups;
    const groups = await make("download_setup", { list: "groups" }, { setup });
    expect(groups.saved).toEqual([
      workbook.fileNameOf(`${screenName} - ${setup.season.Name}`)
    ]);
    expect(sheetsIn(path.join(groups.folder, groups.saved[0]))).toEqual(
      asWritten([
        { name: screenName, rows: lists.listRows("groups", setup, st) }
      ])
    );
    const unknown = await make("download_setup", { list: "bunks" }, { setup });
    expect(unknown.done.ok).toBe(false);
    expect(unknown.saved).toEqual([]);
  });

  // API-1.90
  it("filesStayOnThisComputer: one read, the file saved only in the Downloads folder, nothing there replaced", async () => {
    expect(downloadsFolder({ HOME: "/Users/someone" })).toBe(
      "/Users/someone/Downloads"
    );
    const setup = camp();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-files-"));
    const name = workbook.fileNameOf(`${setup.season.Name} - worksheet`);
    fs.writeFileSync(path.join(folder, name), "the person's own file");
    const sent = [];
    const run = async (args, stdin) => {
      sent.push({ args, stdin });
      return `HTTP/1.1 200\n\n${JSON.stringify({ setup })}`;
    };
    const first = await call("download_setup", {}, { run, files, folder });
    const second = await call("download_setup", {}, { run, files, folder });
    // Only the read: no save, no upload, nothing sent but the GET of what the screen reads.
    expect(sent.map((s) => s.args[5])).toEqual(["GET", "GET"]);
    expect(sent.every((s) => !s.stdin)).toBe(true);
    expect(fs.readFileSync(path.join(folder, name), "utf8")).toBe(
      "the person's own file"
    );
    const stem = name.replace(/\.xlsx$/, "");
    expect(JSON.parse(first.text).file_name).toBe(`${stem} (1).xlsx`);
    expect(JSON.parse(second.text).file_name).toBe(`${stem} (2).xlsx`);
    for (const capability of [
      "download_schedule",
      "download_special_schedule",
      "download_elective_files",
      "download_setup"
    ]) {
      expect(byName(capability).description).toMatch(
        /save it in the Downloads folder on this computer \(nothing is sent anywhere else\)/
      );
    }
  });
  // API-1.86, API-1.88
  it("thePrintoutIsTheScreensOwnComponent: the shipped printout page is Schedules' and Elective seats' printout components compiled unchanged, and the shipped connector makes files with the shipped modules", async () => {
    const { PRINT_FILE, TO } = require("../../scripts/build-connect");
    // Built again here, in Node itself (the compiler doesn't run in Jest's page).
    const built = execFileSync(
      process.execPath,
      [
        "-e",
        'require("./scripts/build-connect").printViewFile().then((t) => process.stdout.write(t))'
      ],
      { cwd: path.resolve(__dirname, "../.."), maxBuffer: 64 * 1024 * 1024 }
    ).toString();
    expect(fs.readFileSync(path.join(TO, PRINT_FILE), "utf8") === built).toBe(
      true
    );
    expect(
      fs.readFileSync(path.join(__dirname, "../view/print-entry.js"), "utf8")
    ).toMatch(
      /from "c\/shoreshSchedulePrint";[\s\S]*from "c\/shoreshRosterPrint";/
    );
    expect(built).toContain(
      "window.SHORESH_PRINTOUT = /* SHORESH_PRINTOUT */ null;"
    );
    // The shipped connector, as Claude desktop runs it: its own modules, SheetJS and page.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-files-"));
    const read = JSON.stringify({ setup: camp() });
    const said = execFileSync(
      process.execPath,
      [
        "-e",
        `const { call } = require(${JSON.stringify(path.join(TO, "client.js"))});
const read = process.argv[1];
const run = async () => "HTTP/1.1 200\\n\\n" + read;
Promise.all([
  call("download_setup", { list: "groups" }, { run, folder: process.argv[2] }),
  call("download_schedule", { week: "Week 1", as: "print" }, {
    run: async () => "HTTP/1.1 200\\n\\n" + process.argv[3],
    folder: process.argv[2]
  })
]).then((a) => process.stdout.write(JSON.stringify(a)));`,
        read,
        folder,
        JSON.stringify({
          week: "Week 1",
          program: "Main",
          version: "Plain",
          opened: opened(),
          setup: { activities: [], labels: LABELS }
        })
      ],
      { maxBuffer: 64 * 1024 * 1024 }
    ).toString();
    const [list, printout] = JSON.parse(said);
    expect([list.ok, printout.ok]).toEqual([true, true]);
    expect(fs.readdirSync(folder).sort()).toEqual(
      [JSON.parse(list.text).file_name, "Week 1 - Plain.html"].sort()
    );
    const page = fs.readFileSync(
      path.join(folder, "Week 1 - Plain.html"),
      "utf8"
    );
    expect(page).toContain('window.SHORESH_PRINTOUT = {"kind":"schedule"');
  }, 120000);
});
