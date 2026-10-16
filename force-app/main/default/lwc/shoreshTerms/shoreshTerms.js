/**
 * The camp's own words for model terms (decision 0006), for every Shoresh screen.
 * Built from the TermLabel list the server sends (CampLabels.all()).
 *
 * s('Group')   -> "Group" or the camp's "Bunk"     (headings, buttons, start of a sentence)
 * p('Group')   -> "Groups" or "Bunks"
 * sIn / pIn    -> inside a sentence: model terms in lower case, camp labels exactly as typed
 */
export function buildTerms(labels) {
  const byTerm = new Map((labels || []).map((row) => [row.term, row]));
  const word = (term, plural) => {
    const row = byTerm.get(term);
    if (!row) {
      // Unknown until labels load: show the term itself rather than nothing.
      return plural ? `${term}s` : term;
    }
    return plural ? row.plural : row.singular;
  };
  const inSentence = (term, plural) => {
    const row = byTerm.get(term);
    const text = word(term, plural);
    return row && row.isCustom ? text : text.toLowerCase();
  };
  return {
    s: (term) => word(term, false),
    p: (term) => word(term, true),
    sIn: (term) => inSentence(term, false),
    pIn: (term) => inSentence(term, true)
  };
}
