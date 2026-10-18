@IsTest
public class KeptCamp {
  private static final String KEPT_IDS = 'Shoresh test camp ids';

  /**
   * For a class whose tests all start from the same camp: its @TestSetup builds the camp once
   * (inside System.runAs, as usual) and keeps what it made here, by name, with the scheduler it
   * built it as under 'Scheduler'. Each test reads them back with keptIds() and runs as
   * new User(Id = ids.get('Scheduler')). Statics don't survive from @TestSetup into a test, so
   * the ids go in a record. Call both outside System.runAs: the record is the test runner's.
   */
  public static void keepIds(Map<String, Id> ids) {
    Database.insert(
      new ContentVersion(
        Title = KEPT_IDS,
        PathOnClient = 'ids.json',
        VersionData = Blob.valueOf(JSON.serialize(ids))
      ),
      AccessLevel.SYSTEM_MODE
    );
  }

  /** What the class's @TestSetup kept with keepIds (one query). */
  public static Map<String, Id> keptIds() {
    ContentVersion kept = [
      SELECT VersionData
      FROM ContentVersion
      WHERE Title = :KEPT_IDS AND IsLatest = TRUE
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    return (Map<String, Id>) JSON.deserialize(
      kept.VersionData.toString(),
      Map<String, Id>.class
    );
  }

  /** The scheduler the class's @TestSetup kept under 'Scheduler', to run a test as. */
  public static User scheduler(Map<String, Id> ids) {
    return new User(Id = ids.get('Scheduler'));
  }
}
