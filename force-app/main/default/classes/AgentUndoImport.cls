/**
 * undo_import: Undo last import, as Roots (the person's own imports) and Settings (an outside
 * system's last batch) offer it, through an agent or the command line (docs/protocol/api.md
 * API-1.83). Web address /v1/undo_import, POST {season, from, seen}. With the season locked as
 * imports and Undos lock it, the last import that stands from that source (from: an outside
 * system's name; blank for the person's own) must still be the one read (seen, from
 * read_last_imports), or nothing is undone (409). Then the screen's own Undo
 * (ImportController.undoImport); the answer is its result as JSON, which the connector says in
 * the screen's words.
 */
@RestResource(urlMapping='/v1/undo_import')
global with sharing class AgentUndoImport implements AgentWeeks.Action, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'from',
    'seen'
  };

  // What the preview found, held: the request's change undoes that, without reading it again.
  private Season__c season;
  private Id last;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUndoImport());
  }

  /** Which import it undoes, and what undoing does, as Roots' Undo last import says (API-1.106). */
  public String preview() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    season = AgentChangeCampWords.seasonOf(AgentFields.text(body, 'season'));
    ImportUndo.lockSeason(season.Id);
    Import__c made = asRead(
      season,
      AgentFields.text(body, 'from'),
      seenOf(body)
    );
    last = made.Id;
    return 'This undoes the last import into "' +
      season.Name +
      '": ' +
      (String.isBlank(made.Files__c) ? 'a file' : made.Files__c) +
      ', ' +
      CampClock.say(
        made.CreatedDate,
        'MMM d, yyyy h:mm a',
        CampClock.zoneOfSeason(season.Id)
      ) +
      '. What it added is removed and what it changed goes back to how it was; anything edited since, or still used by something else, stays.';
  }

  public String run() {
    ImportUndo.Result result;
    try {
      result = ImportController.undoImport(last ?? lastAsRead());
    } catch (Exception e) {
      throw new ShoreshException(
        'That import could not be undone. Nothing was changed. ' +
        ScreenErrors.words(e)
      );
    }
    return JSON.serialize(result, true);
  }

  /** The import to undo, found and held as the preview finds it. */
  private Id lastAsRead() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    season = AgentChangeCampWords.seasonOf(AgentFields.text(body, 'season'));
    String seen = seenOf(body);
    String source = AgentFields.text(body, 'from');
    // An import saving, or another Undo, in this season waits here; read again after.
    ImportUndo.lockSeason(season.Id);
    return asRead(season, source, seen).Id;
  }

  private static String seenOf(Map<String, Object> body) {
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen read_last_imports gave, so an import made since isn\'t undone unseen.'
      );
    }
    return seen;
  }

  /**
   * The source's last import that stands, refused when there is none, or (409) when it is not
   * the one read.
   */
  private static Import__c asRead(
    Season__c season,
    String source,
    String seen
  ) {
    Import__c last = standing(season.Id, source);
    if (last == null) {
      throw new ShoreshException(
        'There is no import to undo in "' +
          season.Name +
          '"' +
          (String.isBlank(source) ? '' : ' from ' + source) +
          ': the last one was undone, or there is none.'
      );
    }
    // Ids are case-sensitive; Apex != on text is not.
    if (
      !SeenSaves.stamp(String.valueOf(last.Id), seen) &&
      !SeenSaves.stamp(String.valueOf(last.Id).left(15), seen)
    ) {
      throw new AgentWeeks.ConflictException(
        'The last import is not the one you read: another import was made, or it was undone, since. Nothing was undone. Read them again with read_last_imports.'
      );
    }
    return last;
  }

  /** The source's last import, unless it is undone (as Roots and Settings offer Undo). */
  private static Import__c standing(Id seasonId, String source) {
    Id last = ImportUndo.latestFrom(seasonId, source);
    if (last == null) {
      return null;
    }
    Import__c made = [
      SELECT Id, UndoneAt__c, Files__c, CreatedDate
      FROM Import__c
      WHERE Id = :last
      WITH USER_MODE
    ];
    return made.UndoneAt__c == null ? made : null;
  }
}
