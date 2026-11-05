/**
 * assign_elective_seats (API-1.67): Assign seats on the Elective seats screen, worked out here
 * exactly as the screen works it out. The run is read as the screen reads it (GET
 * /v1/assign_elective_seats: ElectiveSeatsController.openRun and the camp's words), the seats placed
 * with the screen's own modules (c/shoreshElectiveSeats seats.js and c/shoreshElectiveEngine,
 * shipped beside this file: planSeats), and
 * saved through the screen's own save (POST /v1/assign_elective_seats) with the run as the agent
 * read it (seen). Shoresh asks first (API-1.106): sent without confirm, nothing is saved and its
 * preview comes back as it is; the person's yes sends the same seats again with that confirm. The
 * answer is then the screen's own line, counted with its own board.
 */

const { changedSince } = require("./imports");

async function assignElectiveSeats(
  capability,
  input,
  { read, send, answer, load }
) {
  const fields = {};
  for (const field of ["season", "week", "elective_set"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  if (!String(input.seen ?? "").trim()) {
    return {
      ok: false,
      status: 400,
      text: "Send the seen read_elective_seats_now gave, so a change someone made since isn't replaced unseen."
    };
  }
  const readRun = () => read(capability.api, fields);
  const got = await readRun();
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  if (
    `${body.view.run.id}:${body.view.revision}` !== String(input.seen).trim()
  ) {
    // Someone changed the seats since the agent read them: nothing was changed (409).
    return changedSince(
      "Someone changed the seats since you read them, so nothing was changed. Read them again with read_elective_seats_now."
    );
  }
  const m = await load();
  const t = m.buildTerms(body.labels);
  const request = m.planSeats(body.view, t);
  const saved = await send(capability.api, {
    ...fields,
    seen: input.seen,
    seats: request.seats,
    dropped: request.dropped,
    ...(input.confirm === undefined ? {} : { confirm: input.confirm })
  });
  // Without confirm Shoresh saved nothing: its preview, to show the person.
  if (saved.status !== 200 || input.confirm === undefined) return answer(saved);
  // The screen's own line once saved: "Seats assigned: 18 of 20 placed."
  const again = await readRun();
  if (again.status !== 200) return answer(saved);
  const after = JSON.parse(again.body);
  const board = m.buildBoard(m.readRun(after.view), t);
  return {
    ok: true,
    status: 200,
    text: `Seats assigned: ${board.counter.placed} of ${board.counter.total} placed.`
  };
}

module.exports = { assignElectiveSeats };
