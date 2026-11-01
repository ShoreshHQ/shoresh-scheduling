/**
 * assign_elective_seats (API-1.67): Assign seats on the Elective seats screen, worked out here
 * exactly as the screen works it out. The run is read as the screen reads it (GET
 * /v1/assign_elective_seats: ElectiveSeatsController.openRun and the camp's words), the seats placed
 * with the screen's own modules (c/shoreshElectiveSeats seats.js and c/shoreshElectiveEngine,
 * shipped beside this file: readRun, engineInput, the engine's assignSeats, assignRequest), and
 * saved through the screen's own save (POST /v1/assign_elective_seats) with the run as the agent
 * read it (seen). The answer is the screen's own line, counted with its own board.
 */

/** Someone changed the seats since the agent read them: nothing was changed (409). */
function changedSince() {
  return {
    ok: false,
    status: 409,
    text: `Someone changed the seats since you read them, so nothing was changed. Read them again with read_elective_seats_now.`
  };
}

async function assignElectiveSeats(
  capability,
  input,
  { ask, answer, load, namespaceOf }
) {
  const fields = {};
  for (const field of ["season", "week", "elective_set"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const path = `/services/apexrest/v1/${capability.api}`;
  const readRun = () =>
    ask({ path: `${path}?${new URLSearchParams(fields)}`, method: "GET" });
  const read = await readRun();
  if (read.status !== 200) return answer(read);
  const body = JSON.parse(read.body);
  if (String(body.view.revision) !== String(input.seen).trim()) {
    return changedSince();
  }
  const m = await load(namespaceOf(body));
  const t = m.buildTerms(body.labels);
  const run = m.readRun(body.view);
  const { input: engineIn } = m.engineInput(run, t);
  const request = m.assignRequest(run, m.assignSeats(engineIn));
  const saved = await ask({
    path,
    method: "POST",
    body: JSON.stringify({
      ...fields,
      seen: input.seen,
      seats: request.seats,
      dropped: request.dropped
    })
  });
  if (saved.status !== 200) return answer(saved);
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
