/**
 * confirm_setup_guess: "Looks right" on something the setup screens mark as guessed from a file
 * (ADR 0006 §21), through an agent or the command line (docs/protocol/api.md API-1.60). Web
 * address /v1/confirm_setup_guess, POST {season, kind, name, program, elective_set, field, seen}.
 * It is the mark's own Looks right (SetupGuessesController.confirmGuess), done only while the guess
 * is still marked with the value the AI read in read_setup_guesses (seen, capitals and all), with
 * the record locked; otherwise refused (409), nothing changed.
 */
@RestResource(urlMapping='/v1/confirm_setup_guess')
global with sharing class AgentConfirmGuess implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program',
    'elective_set',
    'field',
    'seen'
  };
  private static final List<String> TERMS = new List<String>{
    'Activity',
    'Location',
    'Group'
  };
  private static final List<String> FIELD_NAMES = new List<String>{
    'how_often',
    'who',
    'groups_that_fit',
    'division',
    'periods'
  };
  private static final String NOTHING = ' Nothing was changed.';

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentConfirmGuess());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    String term = termOf(AgentFields.text(body, 'kind'), labels);
    String field = fieldOf(AgentFields.text(body, 'field'));
    if (!body.containsKey('seen') || body.get('seen') == null) {
      throw new ShoreshException(
        'Say its value as read_setup_guesses gave it (seen), so a change someone made since isn\'t marked as looked at.'
      );
    }
    String seen = String.valueOf(body.get('seen'));
    // Locked first: no one else's save of a record by that name can come between the read and
    // Looks right, so one read of the guesses is what is compared and confirmed.
    lockNamed(term, season.Id, AgentFields.text(body, 'name'));
    AgentGuesses.Entry asked = new AgentGuesses.Entry(
      null,
      term,
      AgentFields.text(body, term == 'Group' ? 'program' : 'elective_set')
    );
    asked.name = AgentFields.text(body, 'name');
    asked.field = field;
    AgentGuesses.Entry now = onlyOne(
      AgentGuesses.standing(season.Id, labels),
      asked
    );
    // "2 to 3 a week" is what was read; capitals count in names (Apex's == ignores case).
    if (!now.value.equals(seen)) {
      throw new AgentWeeks.ConflictException(
        'Someone changed the ' +
          now.kind +
          ' "' +
          now.name +
          '" or said it looks right since, so nothing was marked. Read it again with read_setup_guesses.'
      );
    }
    try {
      // The mark's own Looks right.
      SetupGuessesController.confirmGuess(now.recordId, now.guessField);
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e) + NOTHING);
    }
    return 'Marked the ' +
      now.kind +
      ' "' +
      now.name +
      '": ' +
      now.field +
      ' ' +
      now.value +
      ' as looked at. Camp Setup no longer marks it as guessed.';
  }

  /**
   * The guess named (asked: its term, field, name and, when given, program or elective set),
   * the program or elective set asked about when a name is in two.
   */
  @TestVisible
  private static AgentGuesses.Entry onlyOne(
    List<AgentGuesses.Entry> standing,
    AgentGuesses.Entry asked
  ) {
    List<AgentGuesses.Entry> matched = new List<AgentGuesses.Entry>();
    List<String> places = new List<String>();
    for (AgentGuesses.Entry entry : standing) {
      if (matches(entry, asked)) {
        matched.add(entry);
        places.add(entry.place);
      }
    }
    if (matched.isEmpty()) {
      throw new AgentWeeks.ConflictException(
        'The ' +
          asked.field +
          ' of "' +
          asked.name.left(80) +
          '" isn\'t marked as guessed now: someone may have changed it or said it looks right since.' +
          NOTHING +
          ' read_setup_guesses says what is marked.'
      );
    }
    if (matched.size() > 1) {
      places.sort();
      Boolean bunk = asked.term == 'Group';
      throw new ShoreshException(
        'More than one "' +
          asked.name.left(80) +
          '" is marked. Say which ' +
          (bunk ? 'program (program)' : 'elective set (elective_set)') +
          ': ' +
          String.join(places, ', ') +
          '.' +
          NOTHING
      );
    }
    return matched[0];
  }

  /** The same kind, field and name (capitals and spacing aside), in the place asked, if any. */
  private static Boolean matches(
    AgentGuesses.Entry entry,
    AgentGuesses.Entry asked
  ) {
    Boolean anyPlace = String.isBlank(asked.place);
    return entry.term == asked.term &&
      entry.field == asked.field &&
      IncomingBatch.fold(entry.name) == IncomingBatch.fold(asked.name) &&
      (anyPlace ||
      (entry.place != null &&
      IncomingBatch.fold(entry.place) == IncomingBatch.fold(asked.place)));
  }

  /** The kind asked about, by the model's word or the camp's; only kinds an import guesses. */
  private static String termOf(String kind, CampLabels labels) {
    String asked = IncomingBatch.fold(kind.replace('_', ' '));
    List<String> said = new List<String>();
    for (String term : TERMS) {
      if (
        asked == IncomingBatch.fold(term) ||
        asked ==
        IncomingBatch.fold(CampLabels.modelTermsOnly().singular(term)) ||
        asked == IncomingBatch.fold(labels.singular(term))
      ) {
        return term;
      }
      said.add(labels.singularInSentence(term));
    }
    if (asked == 'linked choice' || asked == 'linkedchoice') {
      return 'LinkedChoice';
    }
    said.add('linked choice');
    throw new ShoreshException(
      (String.isBlank(kind)
          ? 'Say what kind of thing it is (kind). '
          : 'Shoresh doesn\'t guess a "' + kind.left(40) + '". ') +
        'The kinds it guesses: ' +
        String.join(said, ', ') +
        '.'
    );
  }

  private static String fieldOf(String field) {
    String asked = field.trim().toLowerCase().replace(' ', '_');
    if (FIELD_NAMES.contains(asked)) {
      return asked;
    }
    throw new ShoreshException(
      (String.isBlank(field)
          ? 'Say which field (field). '
          : 'Shoresh doesn\'t guess "' + field.left(40) + '". ') +
        'The fields it guesses: ' +
        String.join(FIELD_NAMES, ', ') +
        '.'
    );
  }

  /** The season's records of that kind and name (SOQL compares names without capitals). */
  private static Integer lockNamed(String term, Id seasonId, String name) {
    String given = name.normalizeSpace();
    if (term == 'Activity') {
      return [
          SELECT Id
          FROM Activity__c
          WHERE Season__c = :seasonId AND Name = :given
          WITH USER_MODE
          FOR UPDATE
        ]
        .size();
    }
    if (term == 'Location') {
      return [
          SELECT Id
          FROM Location__c
          WHERE Season__c = :seasonId AND Name = :given
          WITH USER_MODE
          FOR UPDATE
        ]
        .size();
    }
    if (term == 'Group') {
      return [
          SELECT Id
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :seasonId AND Name = :given
          WITH USER_MODE
          FOR UPDATE
        ]
        .size();
    }
    return [
        SELECT Id
        FROM LinkedChoice__c
        WHERE ElectiveSet__r.Season__c = :seasonId AND Name = :given
        WITH USER_MODE
        FOR UPDATE
      ]
      .size();
  }
}
