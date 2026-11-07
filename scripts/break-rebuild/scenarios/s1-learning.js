/** S1: Shoresh learns an answer, uses it, and lets it be changed, undone and forgotten (MEMO). */
const fs = require("fs");
const path = require("path");
const { ROOT, call, makeCamp, soql } = require("../lib");

const DIR = path.join(ROOT, "docs/samples/import");
const FILES = fs
  .readdirSync(DIR)
  .filter((f) => /Bunk \d\.csv$/.test(f))
  .map((f) => ({
    file_name: f,
    csv_text: fs.readFileSync(path.join(DIR, f), "utf8")
  }));
const MUSIC = "similar|activity|music|musik|Music|Musik";
const seenOf = (t) => /seen: "([^"]+)"/.exec(t)?.[1];
/** What the review says of one question, by its id. */
const question = (text, id) => {
  const at = text.indexOf(`[id ${JSON.stringify(id)}]`);
  if (at < 0) return null;
  const next = text.indexOf("[id ", at + 5);
  return text.slice(at, next < 0 ? text.indexOf("\n", at) : next);
};

module.exports = [
  {
    id: "S1",
    camps: "BR S1 %",
    title: "learning: answer, reuse, change, undo, forget, ask again",
    async run(rec) {
      const { season, camp } = makeCamp("S1 Learning");
      const activities = () =>
        soql(`SELECT Name FROM Activity__c WHERE Season__r.Name = '${season}'`)
          .map((a) => a.Name)
          .sort();
      const review = (answers) =>
        call("import_last_year", { season, files: FILES, answers });
      const learned = () => call("read_learned_answers", { season });
      const lineOf = (text, words) =>
        text.split("\n").find((l) => l.includes(words));

      // First import: asked, answered, saved.
      const first = await review();
      rec.check(
        "MEMO-6.5",
        "the first import asks about Music and Musik, not answered",
        question(first.text, MUSIC) &&
          !/Answered:/.test(question(first.text, MUSIC)),
        first.text
      );
      const again = await review();
      rec.check(
        "CORE same inputs",
        "the same files give the same review",
        first.text === again.text
      );
      rec.check(
        "INGEST-5.5",
        "a review saves nothing",
        activities().length === 0,
        activities()
      );
      const answers = { [MUSIC]: "a", "week|the file's week": "Week 1" };
      const answered = await review(answers);
      const saved = await call("import_last_year", {
        season,
        files: FILES,
        answers,
        save: true,
        seen: seenOf(answered.text)
      });
      rec.check("API-1.84", "the import saves", saved.kind === "done", saved.text);
      rec.check(
        "API-1.84",
        "what came in is what the review said: 8 activities, Music once, no Musik",
        activities().join() ===
          "Archery,Art,Boating,Gym games,Library time,Music,Soccer,Swim",
        activities()
      );

      // Learned, and shown as learned.
      let list = await learned();
      const line = lineOf(list.text, "Musik");
      rec.check(
        "MEMO-7.2",
        "What Shoresh has learned lists the answer in camp words",
        line && /Same: keep .Music/.test(line),
        list.text
      );
      const row = soql(
        `SELECT Id, Answer__c, QuestionKey__c FROM ImportAnswer__c WHERE Camp__r.Name = '${camp}' AND Answer__c = 'a'`
      );
      rec.check(
        "MEMO-2.1",
        "the answer is stored once",
        row.length === 1,
        JSON.stringify(row)
      );

      // Second import: the answer is used, shown, and nothing doubles.
      const second = await review();
      const q2 = question(second.text, MUSIC);
      rec.check(
        "MEMO-6.1",
        "the next import shows the answer as remembered, still changeable",
        q2 && /Answered: Same: call it .Music.* \(remembered from before\)/.test(q2),
        second.text
      );
      rec.check(
        "MEMO-6.1",
        "the file's week is remembered too",
        /remembered from before/.test(
          question(second.text, "week|the file's week") ?? ""
        ),
        second.text
      );
      rec.check(
        "INGEST same file twice",
        "the same files again bring nothing new in",
        !/Comes in:/.test(second.text),
        second.text
      );
      const savedTwice = await call("import_last_year", {
        season,
        files: FILES,
        save: true,
        seen: seenOf(second.text)
      });
      rec.check(
        "INGEST same file twice",
        "saving them again changes no setup",
        savedTwice.kind === "done" && activities().length === 8,
        savedTwice.text
      );
      const versions = await call("list_versions", { season, week: "Week 1" });
      rec.note("Versions after importing the same files twice", versions.text);

      // Change: only the question's own answers, and it has Undo.
      list = await learned();
      const id = /answer_id (\S+), seen "a"/.exec(list.text)?.[1];
      const bad = await call("change_learned_answer", {
        season,
        answer_id: id,
        answer: "not an answer",
        seen: "a"
      });
      rec.check(
        "MEMO-4.4",
        "Change refuses an answer the question doesn't offer",
        bad.kind === "refused",
        bad.text
      );
      const stale = await call("change_learned_answer", {
        season,
        answer_id: id,
        answer: "different",
        seen: "b"
      });
      rec.check(
        "API seen",
        "Change refuses when the answer isn't what was read",
        stale.kind === "refused",
        stale.text
      );
      const changed = await call("change_learned_answer", {
        season,
        answer_id: id,
        answer: "different",
        seen: "a"
      });
      rec.check("MEMO-4.4", "Change takes the question's own answer", changed.kind === "done", changed.text);
      rec.check(
        "MEMO-6.4",
        "Change offers Undo",
        /undo/i.test(changed.text),
        changed.text
      );
      const third = await review();
      rec.check(
        "MEMO-2.1",
        "the next import uses the changed answer: Musik comes in",
        /Answered: Different/.test(question(third.text, MUSIC) ?? "") &&
          /Musik/.test(third.text.split("Comes in:")[1] ?? ""),
        third.text
      );
      list = await learned();
      rec.check(
        "MEMO-7.3",
        "the old line stays, marked Replaced or Updated",
        /Same: keep .Music.*(Replaced|Updated)/i.test(list.text),
        list.text
      );

      // Undo of the change: back to the first answer.
      const undoChange = await call("undo_learned_answer", {
        season,
        undo: /undo[^"]*"([^"]+)"/i.exec(changed.text)?.[1] ?? "none"
      });
      rec.check("MEMO-6.4", "Undo of the change works", undoChange.kind === "done", `${changed.text}\n${undoChange.text}`);
      const fourth = await review();
      rec.check(
        "MEMO-6.4",
        "after the Undo the import uses the first answer again",
        /Answered: Same: call it .Music/.test(question(fourth.text, MUSIC) ?? ""),
        fourth.text
      );

      // Forget asks first, then the import asks again; Undo brings it back; Forget again.
      const forgetOnce = async () => {
        list = await learned();
        const now = /answer_id (\S+), seen "a"/.exec(list.text)?.[1];
        const preview = await call("forget_learned_answer", {
          season,
          answer_id: now,
          seen: "a"
        });
        const confirm = /confirm: "([^"]+)"/.exec(preview.text)?.[1];
        return {
          preview,
          done: confirm
            ? await call("forget_learned_answer", {
                season,
                answer_id: now,
                seen: "a",
                confirm
              })
            : preview
        };
      };
      const { preview, done } = await forgetOnce();
      rec.check("API-1.106", "Forget asks first", preview.kind === "asks first", preview.text);
      rec.check("MEMO-6.4", "Forget works and offers Undo", done.kind === "done" && /undo/i.test(done.text), done.text);
      const fifth = await review();
      rec.check(
        "MEMO forget",
        "after Forget the import asks again, unanswered",
        question(fifth.text, MUSIC) &&
          !/Answered:/.test(question(fifth.text, MUSIC)),
        fifth.text
      );
      const undoForget = await call("undo_learned_answer", {
        season,
        undo: /undo[^"]*"([^"]+)"/i.exec(done.text)?.[1] ?? "none"
      });
      rec.check("MEMO-6.4", "Undo of the Forget works", undoForget.kind === "done", undoForget.text);
      const sixth = await review();
      rec.check(
        "MEMO-6.4",
        "after that Undo the import uses the answer again",
        /remembered from before/.test(question(sixth.text, MUSIC) ?? ""),
        sixth.text
      );
      const second2 = await forgetOnce();
      const seventh = await review();
      rec.check(
        "MEMO forget",
        "forgotten again: the import asks again",
        second2.done.kind === "done" &&
          question(seventh.text, MUSIC) &&
          !/Answered:/.test(question(seventh.text, MUSIC)),
        seventh.text
      );
      list = await learned();
      rec.check(
        "MEMO-7.3",
        "the running list keeps the whole story",
        (list.text.match(/Musik/g) || []).length >= 3,
        list.text
      );
    }
  }
];
