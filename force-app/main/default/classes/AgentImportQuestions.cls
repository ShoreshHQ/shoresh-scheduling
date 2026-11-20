/**
 * Roots' import questions left, through an agent (docs/protocol/api.md API-1.144): only a read of
 * Import last year asks for them (open_questions=true), with the last import's own files.
 */
public with sharing class AgentImportQuestions {
  public static final String FIELD = 'open_questions';

  /**
   * The person's last import's files, while it has questions open (ImportLog.openFiles). None
   * open (no import, answered, or undone) is said one way, as Roots then shows no questions.
   */
  public static String openFilesOf(Id seasonId) {
    Id last = ImportUndo.latestFrom(seasonId, null);
    List<Import__c> found = [
      SELECT Open__c
      FROM Import__c
      WHERE Id = :last AND UndoneAt__c = NULL
      WITH USER_MODE
    ];
    if (found.isEmpty() || String.isBlank(found[0].Open__c)) {
      throw new ShoreshException(
        'There is no import with questions left. Nothing was changed.'
      );
    }
    return ImportController.getOpenFiles(last);
  }
}
