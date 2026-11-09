/**
 * The Electives list's rows, for an AI (API-1.135, API-1.136). The read asks what the list reads
 * (/v1/offerings) and works out here, with the list's own module, what each row holds and marks; a
 * change saves through the row's own save, and ends with what the row would then mark, since blank
 * or 0 seats are saved and said, never refused.
 */
const SET = ["season", "elective_set"];
const fieldsOf = (input) =>
  Object.fromEntries(
    SET.filter((n) => input[n] !== undefined).map((n) => [n, input[n]])
  );

async function readOfferings(capability, input, { read, answer, load }) {
  const got = await read("offerings", fieldsOf(input));
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const said = (await load()).offeringsForAgent(body, {
    activity: input.activity
  });
  if (said.error) return { ok: false, status: 400, text: said.error };
  return {
    ok: true,
    status: 200,
    about: capability.about,
    ...(body.season ? { season: body.season } : {}),
    text: JSON.stringify(said, null, 2)
  };
}

/** What the row now marks; none if it can't be read just now: what was saved is saved. */
async function lookAfter(input, { read, load }) {
  try {
    const got = await read("offerings", fieldsOf(input));
    if (got.status !== 200) return null;
    const { offerings } = (await load()).offeringsForAgent(
      JSON.parse(got.body),
      { activity: input.activity }
    );
    return offerings && offerings[0] ? offerings[0].look : null;
  } catch {
    return null;
  }
}

async function changeOffering(capability, input, at) {
  const fields = Object.fromEntries(
    Object.keys(capability.inputSchema.properties)
      .filter((n) => input[n] !== undefined)
      .map((n) => [n, input[n]])
  );
  const saved = at.answer(await at.send(capability.api, fields));
  if (!saved.ok) return saved;
  const look = await lookAfter(input, at);
  return look ? { ...saved, text: `${saved.text} ${look}.` } : saved;
}

module.exports = { readOfferings, changeOffering };
