/**
 * Who may change a camp's words, and saving them, for CampLabels (moved out to keep it within
 * Code Analyzer's limits; word walk W1).
 */
public with sharing class CampLabelSaves {
  /**
   * Why this person cannot change a camp's labels, or null when they can. Anyone with the
   * Shoresh Scheduler permission set can (Greg, 2026-10-15), unless an admin has narrowed
   * access to camp records. Short, in the desktop's words ("Only an admin can ...", e.g.
   * TiersScreen.jsx); no Salesforce machinery named.
   */
  public static String whyCannotEdit(Id campId) {
    Schema.DescribeSObjectResult labels = Schema.sObjectType.CampLabel__c;
    if (
      !labels.isCreateable() ||
      !labels.isUpdateable() ||
      !labels.isDeletable()
    ) {
      return 'Only an admin can change camp words.';
    }
    List<UserRecordAccess> access = [
      SELECT RecordId, HasEditAccess
      FROM UserRecordAccess
      WHERE UserId = :UserInfo.getUserId() AND RecordId = :campId
      WITH SYSTEM_MODE
    ];
    if (access.isEmpty() || !access[0].HasEditAccess) {
      return 'You can\'t edit this camp, so its words are view only.';
    }
    return null;
  }

  /**
   * Saves a camp's words from the label editor, all or none. A term with both words blank,
   * or with exactly the model term's words, goes back to the model term.
   */
  public static void save(Id campId, List<CampLabels.TermLabel> rows) {
    CampLabelIds.refuseOthers(campId, rows);
    List<CampLabel__c> toSave = new List<CampLabel__c>();
    List<Id> toDelete = new List<Id>();
    CampLabels now = CampLabels.forCamp(campId);
    for (CampLabels.TermLabel row : rows) {
      CampLabel__c label = recordOf(row, campId, now);
      if (label != null) {
        toSave.add(label);
      } else if (row.labelId != null) {
        toDelete.add(row.labelId);
      }
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.delete(toDelete, true, AccessLevel.USER_MODE);
      UserModeWrites.save(toSave);
      CampLabels.forget();
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /**
   * CORE-1.34: a word that follows a camp word (Elective set once Elective is "Chug") stays
   * following while it is left as shown or blank; its standard word typed in is the camp's
   * choice and is kept as its own. Every other word: TermLabel.toRecord.
   */
  private static CampLabel__c recordOf(
    CampLabels.TermLabel row,
    Id campId,
    CampLabels now
  ) {
    if (row.labelId != null || !now.follows(row.term)) {
      return row.toRecord(campId);
    }
    String typed = String.isBlank(row.singular) ? '' : row.singular.trim();
    if (typed != row.modelSingular) {
      return typed == '' ||
        typed == now.singular(row.term)
        ? null
        : row.toRecord(campId);
    }
    return new CampLabel__c(
      Camp__c = campId,
      ModelTerm__c = row.term,
      Singular__c = row.modelSingular,
      Plural__c = row.modelPlural
    );
  }
}
