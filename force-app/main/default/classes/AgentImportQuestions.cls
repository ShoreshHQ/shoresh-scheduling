/**
 * Roots' import questions left, through an agent (docs/protocol/api.md API-1.144): whether a read
 * of Import last year asks for them (open_questions=true), and the last import's own files.
 */
public with sharing class AgentImportQuestions {
  private static final String OPEN = 'open_questions';

  /**
   * Whether the read asks for the questions left open (only Import last year's may), refusing a
   * field the read doesn't know.
   */
  public static Boolean asked(String door) {
    Map<String, String> params = RestContext.request.params;
    Boolean open = door == AgentImports.LAST_YEAR && params.get(OPEN) == 'true';
    for (String key : params.keySet()) {
      if (key != 'season' && !(open && key == OPEN)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: season.'
        );
      }
    }
    return open;
  }

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
