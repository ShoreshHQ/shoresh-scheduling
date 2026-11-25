/**
 * A program, elective set or special day an AI or the command line names, found as camps type
 * names (docs/protocol/api.md API-1.25): the one spelled exactly so, else the one that reads the
 * same (capitals, spaces and punctuation aside: IncomingBatch.fold). Two or more that read the
 * same are refused naming them, and none is refused naming the ones there are.
 */
public with sharing class AgentNamed {
  /**
   * The one row of that name, or refused; in the camp words for term of the season this request
   * found (CORE-1.0), read only when refusing.
   */
  public static SObject one(List<SObject> rows, String name, String term) {
    List<String> names = new List<String>();
    List<SObject> exact = new List<SObject>();
    List<SObject> alike = new List<SObject>();
    List<String> alikeNames = new List<String>();
    String folded = IncomingBatch.fold(name);
    for (SObject row : rows) {
      String called = (String) row.get('Name');
      names.add(called);
      if (called.equals(name)) {
        exact.add(row);
      }
      if (IncomingBatch.fold(called) == folded) {
        alike.add(row);
        alikeNames.add('"' + called + '"');
      }
    }
    if (exact.size() == 1) {
      return exact[0];
    }
    if (alike.size() == 1) {
      return alike[0];
    }
    CampLabels words = wordsOfSeasonFound();
    if (!alike.isEmpty()) {
      throw new ShoreshException(
        sameNameSaid(alikeNames, words.pluralInSentence(term))
      );
    }
    throw new ShoreshException(
      'There is no ' +
        words.singularInSentence(term) +
        ' called "' +
        name.left(80) +
        '" that you can see. ' +
        AgentWeeks.namesSaid(words.pluralInSentence(term), names)
    );
  }

  /** The camp words of the season this request found (CORE-1.0), or the model's terms. */
  private static CampLabels wordsOfSeasonFound() {
    return OutgoingRows.used == null
      ? CampLabels.modelTermsOnly()
      : IncomingSeason.labelsOf(OutgoingRows.used.Id);
  }

  /** '"Teens" and "teens" are both programs with that name, …' (quoted: each name, quoted). */
  private static String sameNameSaid(List<String> quoted, String things) {
    String last = quoted.remove(quoted.size() - 1);
    return String.join(quoted, ', ') +
      ' and ' +
      last +
      (quoted.size() == 1 ? ' are both ' : ' are all ') +
      things +
      ' with that name, so Shoresh can\'t tell which you mean. Nothing was changed.';
  }
}
