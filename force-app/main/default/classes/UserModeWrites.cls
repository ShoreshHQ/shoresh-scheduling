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
    List<SObject> current = toInsert;
    try {
      Database.insert(toInsert, AccessLevel.USER_MODE);
      current = toUpdate;
      Database.update(toUpdate, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      Database.rollback(beforeSave);
      SObject refused = current[e.getDmlIndex(0)];
      throw new SaveException(e, nameOf(refused), refused);
    }
  }

  /**
   * The record's name: sent with it, or (for a change that left the name alone) as saved. None
   * for kinds whose name is a number Salesforce gives (CL-00001): that means nothing to a camp.
   */
  private static String nameOf(SObject record) {
    if (
      ShoreshSchema.field(record.getSObjectType(), 'Name')
        .getDescribe()
        .isAutoNumber()
    ) {
      return null;
    }
    Map<String, Object> given = record.getPopulatedFieldsAsMap();
    if (given.containsKey('Name')) {
      return (String) given.get('Name');
    }
    if (record.Id == null) {
      return null;
    }
    List<SObject> saved = Database.queryWithBinds(
      'SELECT Name FROM ' +
        ShoreshSchema.queryName(record.getSObjectType()) +
        ' WHERE Id = :recordId',
      new Map<String, Object>{ 'recordId' => record.Id },
      AccessLevel.USER_MODE
    );
    return saved.isEmpty() ? null : (String) saved[0].get('Name');
  }

  /** A failed save, with the name of the row that was refused, so the screen can say which. */
  public class SaveException extends Exception {
    public DmlException failure;
    public String recordName;
    public SObject record;

    public SaveException(
      DmlException failure,
      String recordName,
      SObject record
    ) {
      this(failure.getMessage());
      this.failure = failure;
      this.recordName = recordName;
      this.record = record;
    }
  }
}
