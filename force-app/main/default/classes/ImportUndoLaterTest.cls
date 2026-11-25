/**
 * ImportUndoLater: what later imports still standing changed, for Undo (API-2.6). Made-up camp.
 */
@IsTest
private class ImportUndoLaterTest {
  // INGEST-5.10: every later import standing is read, however many there are: the oldest ones,
  // closest to the import undone, too.
  @IsTest
  static void everyLaterImportIsRead() {
    Season__c season = ShoreshTestData.season(
      ShoreshTestData.camp('Maple Grove (made up)').Id,
      'Summer 2027'
    );
    Import__c done = new Import__c(Season__c = season.Id, Changed__c = '[]');
    Database.insert(done, AccessLevel.SYSTEM_MODE);
    Datetime start = Datetime.now().addDays(-1);
    Test.setCreatedDate(done.Id, start);
    done = [
      SELECT Id, Season__c, CreatedDate
      FROM Import__c
      WHERE Id = :done.Id
      WITH SYSTEM_MODE
    ];
    String changedSeason = JSON.serialize(
      new List<Object>{
        new Map<String, Object>{
          'id' => season.Id,
          'name' => 'Summer 2027',
          'before' => new Map<String, Object>(),
          'after' => new Map<String, Object>()
        }
      }
    );
    List<Import__c> later = new List<Import__c>();
    for (Integer i = 0; i < 60; i++) {
      later.add(
        new Import__c(
          Season__c = season.Id,
          Changed__c = i == 0 ? changedSeason : '[]'
        )
      );
    }
    Database.insert(later, AccessLevel.SYSTEM_MODE);
    for (Integer i = 0; i < later.size(); i++) {
      Test.setCreatedDate(later[i].Id, start.addMinutes(i + 1));
    }
    List<String> written = new List<String>{ 'Name' };
    Test.startTest();
    Boolean edited = new ImportUndoLater(done)
      .edited(season, written, ImportUndoValues.digest(season, written));
    Test.stopTest();
    Assert.isTrue(edited, 'the first later import changed it');
  }
}
