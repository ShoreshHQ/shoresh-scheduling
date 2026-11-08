/**
 * The linked choices editor beside the Electives list, for an AI (API-1.131 to API-1.133). The
 * read asks what the editor reads (/v1/linked_choices) and works out here, with the editor's own
 * module, what it shows and marks; a change saves through the editor's own save, and ends with
 * what the editor would then mark on it, since it shows problems rather than refusing them.
 */
const fieldsOf = (input, names) =>
  Object.fromEntries(
    names.filter((n) => input[n] !== undefined).map((n) => [n, input[n]])
  );
const SET = ["season", "elective_set"];

async function readLinkedChoices(capability, input, { read, answer, load }) {
  const got = await read("linked_choices", fieldsOf(input, SET));
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const said = (await load()).linkedChoicesForAgent(body, {
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

/** make_linked_choice's name: what was given, or the editor's proposal for its first period. */
async function nameOf(input, { read, load }) {
  const got = await read("linked_choices", fieldsOf(input, SET));
  if (got.status !== 200) return { got };
  const [period] = Array.isArray(input.periods) ? input.periods : [];
  return {
    name: (await load()).proposedForAgent(JSON.parse(got.body), {
      activity: input.activity,
      period,
      program: period && period.program
    })
  };
}

/**
 * What the editor marks on the linked choice saved; [] if it can't be read just now: what was
 * saved is saved, and an answer that said otherwise could have it made again.
 */
async function notesAfter(input, name, { read, load }) {
  try {
    const got = await read("linked_choices", fieldsOf(input, SET));
    if (got.status !== 200) return [];
    return (await load()).notesForAgent(JSON.parse(got.body), {
      name,
      activity: input.activity
    });
  } catch {
    return [];
  }
}

async function saveLinkedChoice(capability, input, at) {
  const fields = fieldsOf(
    input,
    Object.keys(capability.inputSchema.properties)
  );
  if (
    capability.name === "make_linked_choice" &&
    !String(input.name || "").trim()
  ) {
    const proposed = await nameOf(input, at);
    if (proposed.got) return at.answer(proposed.got);
    fields.name = proposed.name;
  }
  const saved = at.answer(await at.send(capability.api, fields));
  if (!saved.ok) return saved;
  const notes = await notesAfter(input, fields.new_name ?? fields.name, at);
  return notes.length
    ? { ...saved, text: `${saved.text} ${notes.join(" ")}` }
    : saved;
}

module.exports = { readLinkedChoices, saveLinkedChoice };
