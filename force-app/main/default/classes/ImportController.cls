/** Server side of Import last year (slice 4b): saving the setup the director reviewed. */
public with sharing class ImportController {
  /**
   * Adds the reviewed setup, all or none. plan: the JSON the import screen builds
   * (c/shoreshImportEngine planFor). Returns how many of each thing were added and changed.
   */
  @AuraEnabled
  public static ImportSetupSaves.Result saveSetup(String plan) {
    try {
      return ImportSetupSaves.save(plan);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Adds and changes the setup list a director imported on one screen (slice 4c), all or none.
   * plan: the JSON the screen builds (c/shoreshLists listPlan).
   */
  @AuraEnabled
  public static ImportSetupSaves.Result saveList(String plan) {
    try {
      return ImportListSaves.save(plan);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /**
   * Imports a camp workbook on Roots (slice 4c part D): every list, the weeks, the weeks items
   * run, and the camp's words, all or none, undone together. plan: c/shoreshLists workbookPlan.
   */
  @AuraEnabled
  public static ImportSetupSaves.Result saveWorkbook(String plan) {
    try {
      return ImportListSaves.saveWorkbook(plan);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** The answers this camp gave before, so a similar file does not ask again. */
  @AuraEnabled
  public static List<ImportAnswers.Answer> getAnswers(Id campId) {
    try {
      return ImportAnswers.forCamp(campId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /**
   * The items an earlier import brought in that no one has changed since (INGEST-5.7, 5.8): a
   * second import updates them without asking and lists them when its file lacks them.
   */
  @AuraEnabled
  public static List<Id> getImported(Id seasonId) {
    try {
      return new List<Id>(ImportProvenance.untouched(seasonId));
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** The files of the last import, while it has questions open, to answer them now (INGEST-5.5). */
  @AuraEnabled
  public static String getOpenFiles(Id importId) {
    try {
      return ImportLog.openFiles(importId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Undo last import: removes what it created and puts back what it changed, keeping edits. */
  @AuraEnabled
  public static ImportUndo.Result undoImport(Id importId) {
    try {
      return ImportUndo.undo(importId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
