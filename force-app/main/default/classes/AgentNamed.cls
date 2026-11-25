/**
 * A program, elective set, special day or setup record an AI or the command line names, found as
 * camps type names (docs/protocol/api.md API-1.25, API-1.47): the one spelled exactly so, else the
 * one that reads the same (capitals, spaces and punctuation aside: IncomingBatch.fold). Two or
 * more that read the same are refused naming them, and none is refused naming the ones there are.
 */
public with sharing class AgentNamed {
  /**
   * The one row of that name, or refused; in the camp words for term of the season this request
   * found (CORE-1.0), read only when refusing.
   */
  public static SObject one(List<SObject> rows, String name, String term) {
    List<SObject> found = called(rows, name);
    if (found.size() == 1) {
      return found[0];
    }
    CampLabels words = wordsOfSeasonFound();
    if (!found.isEmpty()) {
      throw new ShoreshException(
        sameNameSaid(found, words.pluralInSentence(term))
      );
    }
    throw new ShoreshException(
      noneSaid(
        new List<String>{
          words.singularInSentence(term),
          words.pluralInSentence(term)
        },
        name,
        rows
      )
    );
  }

  /** The rows spelled exactly as name; with none, the ones that read the same; or none. */
  public static List<SObject> called(List<SObject> rows, String name) {
    List<String> names = new List<String>();
    for (SObject row : rows) {
      names.add((String) row.get('Name'));
    }
    List<SObject> result = new List<SObject>();
    for (Integer i : called(names, name)) {
      result.add(rows[i]);
    }
    return result;
  }

  /** Where in names name is spelled exactly; with none, where it reads the same; or none. */
  public static List<Integer> called(List<String> names, String name) {
    List<Integer> exact = new List<Integer>();
    List<Integer> alike = new List<Integer>();
    String folded = IncomingBatch.fold(name);
    for (Integer i = 0; i < names.size(); i++) {
      if (names[i] != null && names[i].equals(name)) {
        exact.add(i);
      }
      if (IncomingBatch.fold(names[i]) == folded) {
        alike.add(i);
      }
    }
    return exact.isEmpty() ? alike : exact;
  }

  /** The camp words of the season this request found (CORE-1.0), or the model's terms. */
  private static CampLabels wordsOfSeasonFound() {
    return OutgoingRows.used == null
      ? CampLabels.modelTermsOnly()
      : IncomingSeason.labelsOf(OutgoingRows.used.Id);
  }

  /**
   * 'There is no program called "X" that you can see. The programs are …' (kinds: the kind,
   * singular then plural).
   */
  public static String noneSaid(
    List<String> kinds,
    String name,
    List<SObject> rows
  ) {
    List<String> names = new List<String>();
    for (SObject row : rows) {
      names.add((String) row.get('Name'));
    }
    return 'There is no ' +
      kinds[0] +
      ' called "' +
      name.left(80) +
      '" that you can see. ' +
      AgentWeeks.namesSaid(kinds[1], names);
  }

  /**
   * Two or more setup rows found for a name (programs: each one's program, blank for none): in
   * different programs, asked which program; otherwise each row named. words: the kind, singular
   * then plural, then the camp's Program word, then the name asked.
   */
  public static String manySaid(
    List<SObject> found,
    List<String> programs,
    List<String> words
  ) {
    Set<String> apart = new Set<String>(programs);
    if (apart.contains('') || apart.size() < found.size()) {
      return sameNameSaid(found, words[1]);
    }
    return 'More than one ' +
      words[0] +
      ' is called "' +
      words[3].left(80) +
      '". Say which ' +
      words[2] +
      ' (program): ' +
      String.join(programs, ', ') +
      '.';
  }

  /** '"Teens" and "teens" are both programs with that name, …' (each row's name, quoted). */
  public static String sameNameSaid(List<SObject> rows, String things) {
    List<String> quoted = new List<String>();
    for (SObject row : rows) {
      quoted.add('"' + (String) row.get('Name') + '"');
    }
    String last = quoted.remove(quoted.size() - 1);
    return String.join(quoted, ', ') +
      ' and ' +
      last +
      (quoted.size() == 1 ? ' are both ' : ' are all ') +
      things +
      ' with that name, so Shoresh can\'t tell which you mean. Nothing was changed.';
  }
}
