/** S15: a real elective period inside a special day (repo ADR 0026), through an AI as a camp gets it. */
const { call, makeCamp, seenIn } = require("../lib");
const { importMaple, confirmed, electiveOnWeek } = require("../kit");

/** The cells of one time block as read_special_schedule says them: { "Bunk 1": "Open", ... }. */
function cellsAt(text, block) {
  const times = text.slice(text.indexOf("Times:") + 6).split(" | ");
  const segment = times.find((t) => t.trim().startsWith(`${block} (`));
  if (!segment) return null;
  const cells = {};
  for (const part of segment.slice(segment.indexOf("):") + 2).split(";")) {
    const m = /^\s*(Bunk \d+) ([^.;]+)/.exec(part);
    if (m) cells[m[1]] = m[2].trim();
  }
  return cells;
}

module.exports = [
  {
    id: "S15",
    title:
      "an elective period inside a special day: typed in, seats assigned and finalized, the day taken off",
    camps: "BR S15 %",
    async run(rec) {
      const { season } = makeCamp("S15 Special electives");
      await importMaple(season);
      // Chugim on Monday's Period 2 of Week 2, with Swim (2 seats) and Art (no limit).
      await electiveOnWeek(season, "Week 2", "Chugim", ["Bunk 1", "Bunk 2"]);
      const add = await call("add_setup_record", {
        season,
        kind: "special day",
        name: "Color war"
      });
      rec.check("SPECIAL", "a special day adds", add.kind === "done", add.text);
      let plan = await call("read_special_schedule", {
        season,
        special: "Color war"
      });
      rec.note("Color war's schedule", plan.text.slice(0, 600));
      const before = cellsAt(plan.text, "Period 2") ?? {};
      for (const bunk of ["Bunk 1", "Bunk 2"]) {
        const typed = await call("change_special_schedule_cell", {
          season,
          special: "Color war",
          column: bunk,
          time: "Period 2",
          was: before[bunk] ?? "Open",
          activity: "Chugim"
        });
        rec.check(
          "SPECIAL-1.3",
          `${bunk}: Chugim goes into Color war's Period 2 as the set`,
          typed.kind === "done",
          typed.text
        );
      }
      plan = await call("read_special_schedule", {
        season,
        special: "Color war"
      });
      const after = cellsAt(plan.text, "Period 2") ?? {};
      rec.check(
        "SPECIAL-1.3",
        "read back: Period 2 holds Chugim for both bunks",
        /Chugim/.test(after["Bunk 1"] ?? "") &&
          /Chugim/.test(after["Bunk 2"] ?? ""),
        JSON.stringify(after)
      );
      const put = await call("put_special_day_on_day", {
        season,
        special_day: "Color war",
        week: "Week 2",
        day: "Tuesday",
        seen: "none"
      });
      rec.check(
        "SPECIAL",
        "Color war goes on Tuesday",
        put.kind === "done",
        put.text
      );

      const at = { season, week: "Week 2", elective_set: "Chugim" };
      const sheet = {
        ...at,
        file_name: "chugim.csv",
        csv_text:
          "Camper,Camper number,Bunk,Choice 1,Choice 2\nAvery Madeup,1,Bunk 1,Swim,Art\nBlake Madeup,2,Bunk 1,Swim,Art\nCasey Madeup,3,Bunk 2,Swim,Art\n"
      };
      const review = await call("bring_in_choices", sheet);
      const saved = await call("bring_in_choices", {
        ...sheet,
        save: true,
        seen: seenIn(review.text)
      });
      rec.check(
        "API-1.117",
        "choices come in",
        saved.kind === "done",
        saved.text
      );
      let seats = await call("read_elective_seats_now", at);
      rec.note("seats screen before Assign", seats.text.slice(0, 900));
      rec.check(
        "ELECT-4.8",
        "Elective seats has Tuesday's special-day period as one of the week's times",
        /Tuesday, Period 2/.test(seats.text) &&
          /Monday, Period 2/.test(seats.text),
        seats.text.slice(0, 900)
      );
      const assigned = await confirmed("assign_elective_seats", {
        ...at,
        seen: seenIn(seats.text)
      });
      rec.check(
        "ELECT-4.8",
        "Assign seats places campers in the special day too",
        assigned.done.kind === "done",
        assigned.done.text
      );
      seats = await call("read_elective_seats_now", at);
      rec.note("seats after Assign", seats.text.slice(0, 900));
      rec.check(
        "ELECT-4.8",
        "read back: seats on Tuesday's Period 2",
        /Tuesday, Period 2: (Swim|Art)/.test(seats.text),
        seats.text.slice(0, 900)
      );
      const finalized = await confirmed("finalize_electives", at);
      rec.check(
        "ELECT-5.6",
        "Finalize, with a special-day period in the week",
        finalized.done.kind === "done",
        finalized.done.text
      );
      const out = await call("read_elective_seats", {
        season,
        week: "Week 2"
      });
      rec.note("seats going out", out.text.slice(0, 900));
      rec.check(
        "ELECT-5.6",
        "what goes out names the special day's own time",
        /Period 2/.test(out.text) && /2027-07-06/.test(out.text),
        out.text.slice(0, 900)
      );
      const off = await call("take_special_day_off_day", {
        season,
        special_day: "Color war",
        week: "Week 2",
        day: "Tuesday",
        seen: "Color war"
      });
      rec.check(
        "SPECIAL-4.2",
        "Color war comes off Tuesday",
        off.kind === "done",
        off.text
      );
      seats = await call("read_elective_seats_now", at);
      rec.note(
        "seats after the special day came off",
        seats.text.slice(0, 900)
      );
      rec.check(
        "ELECT-6.4",
        "the final run says the schedule changed, with nothing removed",
        /out of date|changed/i.test(seats.text) &&
          /Tuesday, Period 2/.test(seats.text),
        seats.text.slice(0, 900)
      );
    }
  }
];
