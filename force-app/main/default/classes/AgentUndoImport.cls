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
global with sharing class AgentUndoImport implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'from',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUndoImport());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(
        'Send the seen read_last_imports gave, so an import made since isn\'t undone unseen.'
      );
    }
    String source = AgentFields.text(body, 'from');
    // An import saving, or another Undo, in this season waits here; read again after.
    ImportUndo.lockSeason(season.Id);
    Id last = standing(season.Id, source);
    if (last == null) {
      throw new ShoreshException(
        'There is no import to undo in "' +
          season.Name +
          '"' +
          (String.isBlank(source) ? '' : ' from ' + source) +
          ': the last one was undone, or there is none.'
      );
    }
    if (String.valueOf(last) != seen && String.valueOf(last).left(15) != seen) {
      throw new AgentWeeks.ConflictException(
        'The last import is not the one you read: another import was made, or it was undone, since. Nothing was undone. Read them again with read_last_imports.'
      );
    }
    ImportUndo.Result result;
    try {
      result = ImportController.undoImport(last);
    } catch (Exception e) {
      throw new ShoreshException(
        'That import could not be undone. Nothing was changed. ' +
        ScreenErrors.words(e)
      );
    }
    return JSON.serialize(result, true);
  }

  /** The source's last import, unless it is undone (as Roots and Settings offer Undo). */
  private static Id standing(Id seasonId, String source) {
    Id last = ImportUndo.latestFrom(seasonId, source);
    if (last == null) {
      return null;
    }
    return [SELECT UndoneAt__c FROM Import__c WHERE Id = :last WITH USER_MODE]
      .UndoneAt__c == null
      ? last
      : null;
  }
}
