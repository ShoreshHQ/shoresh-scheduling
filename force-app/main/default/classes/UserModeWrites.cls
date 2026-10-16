/** Saves a mix of new and existing records in user mode, all or none. */
public with sharing class UserModeWrites {
  public static void save(List<SObject> records) {
    List<SObject> toInsert = new List<SObject>();
    List<SObject> toUpdate = new List<SObject>();
    for (SObject record : records) {
      if (record.Id == null) {
        toInsert.add(record);
      } else {
        toUpdate.add(record);
      }
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.insert(toInsert, AccessLevel.USER_MODE);
      Database.update(toUpdate, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }
}
