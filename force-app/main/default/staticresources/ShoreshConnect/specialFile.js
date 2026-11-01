/**
 * import_special_schedule (API-1.85): a special day's or event's own schedule from a file, as
 * Import on its page does. The file the agent gives as data is read with the page's own module
 * (c/shoreshSpecialSchedule fromFile.js: pagesOf, planFromPage), refused in the page's words when
 * its times can't be told, and sent to the page's own save (POST /v1/import_special_schedule) with
 * the revision read (seen).
 */
const { fileOf, refused } = require("./imports");

async function importSpecialSchedule(capability, input, { ask, answer, load }) {
  if (!String(input.seen ?? "").trim()) {
    return refused(
      "Send the seen read_special_schedule gave, so a change someone made since isn't replaced unseen."
    );
  }
  const m = await load("");
  const { file, problem } = fileOf(input, m);
  if (problem) return refused(problem);
  const noSide = `Couldn't tell which side of ${file.name} is the schedule's times. Check that the file has a clear time column or time row, and try again.`;
  const { pages, unclear } = m.pagesOf(file);
  if (unclear) return refused(noSide);
  if (!pages.length) {
    return refused(
      `No schedule could be read out of ${file.name}. Check it has times down the side or across the top.`
    );
  }
  const { imported, noTimes, places } = m.planFromPage(pages[0]);
  if (!imported.blocks.length) return refused(noSide);
  const fields = {};
  for (const field of ["season", "special", "kind", "seen"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  return answer(
    await ask({
      path: `/services/apexrest/v1/${capability.api}`,
      method: "POST",
      body: JSON.stringify({
        ...fields,
        file_name: file.name,
        blocks: imported.blocks,
        columns: imported.columns,
        no_times: noTimes,
        places,
        page_count: pages.length,
        replace_edited:
          input.replace_edited === true || input.replace_edited === "true"
      })
    })
  );
}

module.exports = { importSpecialSchedule };
