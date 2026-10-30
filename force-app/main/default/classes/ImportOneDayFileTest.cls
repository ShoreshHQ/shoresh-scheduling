/**
 * Import last year: what the screen sends for a single-day file (docs/import/weeks.md INGEST-4.14:
 * field-day.csv answered as Thursday, into a season with dates and no weeks yet) saves as a
 * special day, and Undo takes it away. Made-up camp only.
 */
@IsTest
private class ImportOneDayFileTest {
  // shoreshImportEngine planFor's plan for field-day.csv as the screen sends it (SEASON for the
  // season's Id). Its Lunch, at the day's own time, is an activity of the day: nothing in it
  // refers to a time block the save does not add.
  private static final String SENT =
    '{"seasonId":"SEASON","files":"field-day.csv","open":[],"remember":[{"key":"oneDa' +
    'y|field-day.csv","answer":"Thursday"},{"key":"week|the file\'s week","answer":"We' +
    'ek 1"}],"forget":[],"fillWeeks":[{"start":"2026-07-02","name":"Week 1","days":"T' +
    'hursday"},{"start":"2026-07-09","name":"Week 2","days":"Thursday"}],"versions":[' +
    '],"specialDays":[{"key":"SpecialDay:P0||Thursday","name":"Week 1 Thursday","week' +
    'Id":null,"weekKey":"Week:2026-07-02","day":"Thursday","also":[],"grid":{"b":[["b' +
    '1","9:00-9:45","09:00","09:45"],["b2","10:00-10:45","10:00","10:45"],["b3","12:0' +
    '0-12:45","12:00","12:45"],["b4","1:00-1:45","13:00","13:45"]],"g":[["G|Bunk Alef' +
    '","Bunk Alef"],["G|Bunk Bet","Bunk Bet"]],"i":[["A","A|Relay races","Relay races' +
    '"],["A","A|Tug of war","Tug of war"],["A","A|Lunch","Lunch"],["A","A|Water ballo' +
    'ons","Water balloons"],["A","A|Sack race","Sack race"]],"r":["1,2,3,4","2,1,3,5"' +
    ']}}],"removals":[],"programs":[{"key":"P0","id":null,"name":"Main","days":["Thur' +
    'sday"],"sortOrder":1}],"timeBlocks":[],"divisions":[{"key":"N|P0|Bunk Alef","id"' +
    ':null,"programKey":"P0","name":"Bunk Alef","sortOrder":1,"noDivision":true},{"ke' +
    'y":"N|P0|Bunk Bet","id":null,"programKey":"P0","name":"Bunk Bet","sortOrder":2,"' +
    'noDivision":true}],"groups":[{"key":"G|Bunk Alef","id":null,"divisionKey":"N|P0|' +
    'Bunk Alef","name":"Bunk Alef","sortOrder":1},{"key":"G|Bunk Bet","id":null,"divi' +
    'sionKey":"N|P0|Bunk Bet","name":"Bunk Bet","sortOrder":2}],"locations":[],"activ' +
    'ities":[{"key":"A|Lunch","id":null,"name":"Lunch","length":1,"min":1,"max":1,"gr' +
    'oupsAtOnce":2,"locationKey":null,"who":[],"sortOrder":1},{"key":"A|Relay races",' +
    '"id":null,"name":"Relay races","length":1,"min":1,"max":1,"groupsAtOnce":1,"loca' +
    'tionKey":null,"who":[],"sortOrder":2},{"key":"A|Sack race","id":null,"name":"Sac' +
    'k race","length":1,"min":0,"max":1,"groupsAtOnce":1,"locationKey":null,"who":[],' +
    '"sortOrder":3},{"key":"A|Tug of war","id":null,"name":"Tug of war","length":1,"m' +
    'in":1,"max":1,"groupsAtOnce":1,"locationKey":null,"who":[],"sortOrder":4},{"key"' +
    ':"A|Water balloons","id":null,"name":"Water balloons","length":1,"min":0,"max":1' +
    ',"groupsAtOnce":1,"locationKey":null,"who":[],"sortOrder":5}],"fixedActivities":' +
    '[],"recurringActivities":[],"electiveSets":[],"offerings":[],"linkedChoices":[],' +
    '"guessed":[{"kind":"Activity","key":"A|Lunch","fields":["often","who"]},{"kind":' +
    '"Activity","key":"A|Relay races","fields":["often","who"]},{"kind":"Activity","k' +
    'ey":"A|Sack race","fields":["often","who"]},{"kind":"Activity","key":"A|Tug of w' +
    'ar","fields":["often","who"]},{"kind":"Activity","key":"A|Water balloons","field' +
    's":["often","who"]}]}';

  // INGEST-4.14
  @IsTest
  static void aSingleDayFileSavesAsASpecialDayAndUndoTakesItAway() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      season.EndDate__c = Date.newInstance(2026, 7, 10);
      Database.update(season, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        SENT.replace('SEASON', season.Id)
      );
      Assert.areEqual(1, result.added.get('SpecialDay'), 'one special day');
      Assert.areEqual(
        'Thursday',
        [SELECT Day__c FROM SpecialDate__c WHERE Season__c = :season.Id].Day__c,
        'on the day answered'
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM TimeBlock__c
          WHERE Program__r.Season__c = :season.Id
        ],
        'its blocks are the special day\'s own'
      );
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      // Undo's count is the import's: its holding records and the special day's day included
      // as they were when added.
      Integer added = 0;
      for (String term : result.added.keySet()) {
        // As the screen's Added total: a version is shown on its own (summary.js countTiles).
        added += term == 'Version' ? 0 : result.added.get(term);
      }
      Assert.areEqual(13, added, 'what the import added');
      Assert.areEqual(added, undone.removed, 'Undo removed as many');
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM SpecialDay__c WHERE Season__c = :season.Id],
        'Undo takes the special day away'
      );
    }
  }
}
