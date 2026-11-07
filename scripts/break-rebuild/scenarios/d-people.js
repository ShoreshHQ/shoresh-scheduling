/**
 * D: different people. One made-up Standard User (the org has one free licence), given each
 * permission set and season share in turn, and deactivated at the end: Salesforce can't delete a
 * user. Every call goes through the connector signed in as that person (API-1.7).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { call, makeCamp, soql, apex, sfJson, esc, ORG } = require("../lib");
const { importMaple, draft, checksOf, names, count, seenOf, confirmed } = require("../kit");

const ALIAS = "br-person";

function makePerson() {
  const stamp = Date.now();
  const username = `br.person.${stamp}@example.com.shoresh`;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "br-user-")), "user.json");
  fs.writeFileSync(file, JSON.stringify({ Username: username, LastName: "Person (made up)", Email: "br.person@example.com", Alias: "brperson", TimeZoneSidKey: "America/New_York", LocaleSidKey: "en_US", EmailEncodingKey: "UTF-8", LanguageLocaleKey: "en_US", profileName: "Standard User" }));
  const said = sfJson(["org", "create", "user", "--definition-file", file, "--set-alias", ALIAS, "--target-org", ORG]);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  if (said.status !== 0) throw new Error(`Couldn't make the person: ${said.message}`);
  return { username, id: soql(`SELECT Id FROM User WHERE Username = '${username}'`)[0].Id };
}

function removePerson(person) {
  apex(`delete [SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '${person.id}' AND PermissionSet.IsOwnedByProfile = false];
User u = new User(Id = '${person.id}', IsActive = false);
update u;`);
  sfJson(["org", "logout", "--target-org", ALIAS, "--no-prompt"]);
  sfJson(["alias", "unset", ALIAS]);
}

/** Gives the person exactly these permission sets and this share of the season. */
function setAccess(person, seasonNames, sets, access) {
  const setList = sets.map((s) => `'${s}'`).join(",") || "''";
  const seasons = seasonNames.map((s) => `'${esc(s)}'`).join(",");
  apex(`Id uid = '${person.id}';
delete [SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = :uid AND PermissionSet.IsOwnedByProfile = false];
List<PermissionSetAssignment> ps = new List<PermissionSetAssignment>();
for (PermissionSet p : [SELECT Id FROM PermissionSet WHERE Name IN (${setList})]) { ps.add(new PermissionSetAssignment(AssigneeId = uid, PermissionSetId = p.Id)); }
insert ps;`);
  apex(`Id uid = '${person.id}';
delete [SELECT Id FROM Season__Share WHERE UserOrGroupId = :uid AND RowCause = 'Manual'];
${access ? `List<Season__Share> shares = new List<Season__Share>();
for (Season__c s : [SELECT Id FROM Season__c WHERE Name IN (${seasons})]) { shares.add(new Season__Share(ParentId = s.Id, UserOrGroupId = uid, AccessLevel = '${access}', RowCause = 'Manual')); }
insert shares;` : ""}`);
}

const NOT_ACCESS = /do not have access|don't have access|can't see|no season called|insufficient|not allowed|FORBIDDEN|isn't shared/i;

const CAPS = {
  Read_Group_Schedules: "read_group_schedule",
  Read_Activity_Schedules: "read_activity_schedule",
  Read_Elective_Offerings: "read_elective_offerings",
  Read_Elective_Seats: "read_elective_seats",
  Send_Divisions: "bring_in_divisions",
  Send_Groups: "bring_in_groups",
  Send_Activities: "bring_in_activities",
  Send_Campers: "bring_in_campers",
  Send_Camper_Groups: "bring_in_camper_groups",
  Send_Elective_Choices: "bring_in_camper_elective_choices"
};

module.exports = [
  {
    id: "D1",
    title: "people: Scheduler only, Read Only and Read/Write sharing, each Send and Read set",
    async run(rec) {
      const { season } = makeCamp("D1 People");
      const inSeason = `Season__r.Name = '${season}'`;
      const week = { season, week: "Week 1" };
      await importMaple(season);
      await call("build_week", week);
      await call("publish_week", week);
      await call("save_version", { ...week, name: "Admin's version" });
      const person = makePerson();
      const as = ALIAS;
      const src = { season, source_system: "BR made-up system" };
      const records = {
        bring_in_divisions: [{ ...src, division_name: "Teens", program: "Main" }],
        bring_in_groups: [{ ...src, group_name: "Bunk 7", division: "Bunk 1" }],
        bring_in_activities: [{ ...src, activity_name: "Kayak" }],
        bring_in_campers: [{ ...src, camper_id: "BR-1", camper_name: "Avery Madeup", camper_number: "1" }],
        bring_in_camper_groups: [{ ...src, camper_id: "BR-1", camper_name: "Avery Madeup", bunk: "Bunk 1", week: "Week 1" }],
        bring_in_camper_elective_choices: [{ ...src, camper_id: "BR-1", camper_name: "Avery Madeup", elective: "Chugim", week: "Week 1", first_choice: "Swim", second_choice: "Art" }]
      };
      const inputFor = (action) => (records[action] ? { records: records[action] } : week);
      try {
        // Nobody: no set at all.
        setAccess(person, [season], [], null);
        let said = await call("list_seasons", {}, as);
        rec.check("API-4.8", "no permission set: refused", said.kind === "refused", said.text);
        rec.check("API-1.105", "no permission set: said in words a person can use", !/Apex class|AgentSeasons/.test(said.text), said.text);

        // Scheduler, season not shared.
        setAccess(person, [season], ["Shoresh_Scheduler"], null);
        said = await call("list_seasons", {}, as);
        rec.check("API-1.7", "Scheduler, nothing shared: no season seen", said.kind === "done" ? !said.text.includes(season) && !said.text.includes("Cedar Ridge") : true, said.text);
        said = await call("read_week_checks", week, as);
        rec.check("API-1.7", "Scheduler, nothing shared: this season refused", said.kind === "refused", said.text);
        said = await call("read_group_schedule", week, as);
        rec.check("API-1.7", "Scheduler, nothing shared: its schedule refused", said.kind === "refused", said.text);

        // Read Only: reads work, every change refused, nothing changed.
        setAccess(person, [season], ["Shoresh_Scheduler"], "Read");
        const adminDraft = await draft(season);
        for (const [action, input] of [
          ["list_seasons", {}],
          ["read_group_schedule", week],
          ["read_activity_schedule", week],
          ["read_week_checks", week],
          ["read_week_draft", week],
          ["list_versions", week],
          ["read_camp_words", { season }],
          ["read_learned_answers", { season }],
          ["read_last_imports", { season }],
          ["read_setup_record", { season, kind: "activity", name: "Swim" }],
          ["read_special_days", { season }],
          ["read_failed_sends", { season }]
        ]) {
          said = await call(action, input, as);
          rec.check("API-4.7", `Read Only: ${action} reads`, said.kind === "done", said.text);
        }
        const personDraft = await draft(season, "Week 1", {}, as);
        rec.check("API-1.123", "Read Only: read_week_draft as a non-admin says the same week as the admin's", personDraft.words === adminDraft.words, personDraft.words.slice(0, 300));
        const cell = adminDraft.rows.find((r) => !r.notes && r.group === "Bunk 1" && r.activity !== "Open");
        const change = { ...week, group: "Bunk 1", day: cell.day, time: cell.time_block, was: cell.activity, activity: cell.activity === "Art" ? "Soccer" : "Art", seen: adminDraft.seen };
        const inputList = { season, list: "activities", file_name: "x.csv", csv_text: "Activity,Location\nKayak,Dock\n" };
        const writes = [
          ["change_schedule_cell", change],
          ["lock_cells", { ...week, day: cell.day, group: "Bunk 1", time: cell.time_block, seen: adminDraft.seen }],
          ["build_week", week],
          ["unpublish_week", week],
          ["save_version", { ...week, name: "Read only try" }],
          ["add_setup_record", { season, kind: "location", name: "Read only place" }],
          ["rename_setup_record", { season, kind: "activity", name: "Swim", new_name: "Swimming" }],
          ["change_camp_words", { season, words: { group: "Bunk / Bunks" }, seen: { group: "(blank)" } }],
          ["bring_in_activities", { records: records.bring_in_activities }]
        ];
        // Publish would do something now: the admin has changed the week since it was published.
        const adminEdit = await call("change_schedule_cell", { ...change, seen: adminDraft.seen });
        rec.check("API-1.11", "the admin changes a cell", adminEdit.kind === "done", adminEdit.text);
        const undoAdmin = await confirmed("undo_last_agent_change", week);
        rec.check("API-1.14", "the admin's change undone again", undoAdmin.done.kind === "done", undoAdmin.done.text);
        await call("build_week", week);
        const stateBefore = names("Activity__c", inSeason).join() + count("Schedule__c", `Program__r.${inSeason}`) + (await draft(season)).words;
        for (const [action, input] of writes) {
          said = await call(action, input, as);
          const asked = said.kind === "done" && /"saved": 0|"problem"/.test(said.text);
          rec.check("API-1.7", `Read Only: ${action} refused`, said.kind === "refused" || asked, `${said.kind}: ${said.text.slice(0, 500)}`);
          rec.check("API-1.105", `Read Only: ${action} refused in plain words`, !/INSUFFICIENT|FIELD_CUSTOM|Exception|\bSObject\b|__c/.test(said.text), said.text.slice(0, 500));
        }
        const listReview = await call("import_list", inputList, as);
        if (seenOf(listReview.text)) {
          const listSave = await call("import_list", { ...inputList, save: true, seen: seenOf(listReview.text) }, as);
          rec.check("API-1.7", "Read Only: import_list's save refused", listSave.kind === "refused", listSave.text);
        }
        const stateAfter = names("Activity__c", inSeason).join() + count("Schedule__c", `Program__r.${inSeason}`) + (await draft(season)).words;
        rec.check("API-1.7", "Read Only: read back, nothing changed", stateBefore === stateAfter);

        // Read/Write: the untried part. A non-admin changes the schedule through an AI.
        setAccess(person, [season], ["Shoresh_Scheduler"], "Edit");
        said = await call("change_schedule_cell", { ...change, seen: (await checksOf(season, "Week 1", as)).seen }, as);
        rec.check("API-1.11", "Read/Write: a non-admin's AI changes a cell", said.kind === "done", said.text);
        let d = await draft(season, "Week 1", {}, as);
        rec.check("API-1.11", "read back: the change is there", d.cell(cell.day, "Bunk 1", cell.time_block).activity === change.activity, JSON.stringify(d.cell(cell.day, "Bunk 1", cell.time_block)));
        rec.check("LOCK-1.1", "read back: the change locked it", /locked/.test(d.cell(cell.day, "Bunk 1", cell.time_block).notes ?? ""), JSON.stringify(d.cell(cell.day, "Bunk 1", cell.time_block)));
        const undo = await confirmed("undo_last_agent_change", week, as);
        rec.check("API-1.14", "Read/Write: the AI's undo", undo.done.kind === "done", undo.done.text);
        d = await draft(season, "Week 1", {}, as);
        rec.check("API-1.14", "read back: back as it was", d.cell(cell.day, "Bunk 1", cell.time_block).activity === cell.activity, JSON.stringify(d.cell(cell.day, "Bunk 1", cell.time_block)));
        const words = await call("read_camp_words", { season }, as);
        rec.note("the camp's words, as a Read/Write person reads them", words.text.slice(0, 400));
        const wordNow = /"group"\s*:\s*"([^"]*)"/.exec(words.text)?.[1] ?? "(blank)";
        for (const [action, input, ok] of [
          ["lock_cells", { ...week, day: cell.day, group: "Bunk 1", time: cell.time_block, seen: d.seen }],
          ["save_version", { ...week, name: "Person's version" }],
          ["build_week", week],
          ["add_setup_record", { season, kind: "location", name: "Person's place" }],
          ["change_camp_words", { season, words: { group: "Cabin / Cabins" }, seen: { group: wordNow } }],
          ["publish_week", week],
          ["unpublish_week", week]
        ]) {
          said = await call(action, input, as);
          rec.check("API-4.7", `Read/Write: ${action} works`, said.kind === "done" && !(ok && false), `${said.kind}: ${said.text.slice(0, 500)}`);
        }
        const review = await call("import_list", inputList, as);
        const save = await call("import_list", { ...inputList, save: true, seen: seenOf(review.text) }, as);
        rec.check("API-1.80", "Read/Write: import_list saves", save.kind === "done" && count("Activity__c", `${inSeason} AND Name = 'Kayak'`) === 1, save.text);
        const lastImports = await call("read_last_imports", { season }, as);
        rec.check("API-1.82", "Read/Write: the person sees their own last import", /Last import:/.test(lastImports.text), lastImports.text);
        const undoImport = await confirmed("undo_import", { season, seen: /Last import:[^;]*?seen: "([^"]+)"/.exec(lastImports.text)?.[1] }, as);
        rec.check("API-1.83", "Read/Write: the person undoes it", undoImport.done.kind === "done" && count("Activity__c", `${inSeason} AND Name = 'Kayak'`) === 0, undoImport.done.text);
        const copyRead = await call("read_season_copy", { season, start_date: "2028-06-26" }, as);
        const wouldRun = /would run (.*?)\. /.exec(copyRead.text)?.[1] ?? "";
        const copy = await confirmed("copy_season", { season, name: "BR D1 People 2028", start_date: "2028-06-26", seen: Object.fromEntries(wouldRun.split("; ").map((x) => x.split(": "))) }, as);
        rec.check("API-1.62", "Read/Write: the person copies the season", copy.done.kind === "done", copy.done.text);
        said = await call("read_camp_words", { season: "BR D1 People 2028" }, as);
        rec.check("API-1.62", "the person can use the season they copied", said.kind === "done", said.text);
        // Someone else's camp stays out of sight even with a share of this one.
        said = await call("read_camp_words", { season: "Cedar Ridge Summer 2027" }, as);
        rec.check("API-1.7", "Read/Write: another camp's season is refused", said.kind === "refused", said.text);

        // Each key opens its one address and no other (API-4.8).
        const everyAction = Object.values(CAPS);
        for (const [set, action] of Object.entries(CAPS)) {
          setAccess(person, [season], [set], set.startsWith("Send") ? "Edit" : "Read");
          said = await call(action, inputFor(action), as);
          rec.check("API-4.8", `${set} reaches ${action}`, said.status !== 403 && !/Apex class/.test(said.text), `${said.kind} ${said.status}: ${said.text.slice(0, 400)}`);
          rec.note(`${set} -> ${action}`, `${said.kind} ${said.status}: ${said.text.slice(0, 300)}`);
          for (const other of everyAction.filter((a) => a !== action)) {
            const blocked = await call(other, inputFor(other), as);
            rec.check("API-4.8", `${set} doesn't reach ${other}`, blocked.kind === "refused", `${blocked.kind}: ${blocked.text.slice(0, 300)}`);
          }
        }
        // Read: drafts never go out (API-4.5); a Read key sees only what's published.
        setAccess(person, [season], ["Read_Group_Schedules"], "Read");
        said = await call("read_week_draft", week, as);
        rec.check("API-4.5", "a Read key can't read a draft", said.kind === "refused", said.text.slice(0, 300));
      } finally {
        removePerson(person);
      }
    }
  }
];
