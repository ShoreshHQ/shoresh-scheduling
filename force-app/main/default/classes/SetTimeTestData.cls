/**
 * Synthetic camp for fixed and recurring activity tests. A season made by
 * ShoreshTestData.fullSeason, with: time blocks Period 1 (9:00), Period 2 (10:00), and Lunch
 * (12:00, afternoon); Juniors (Group A, Group B) and Seniors (Group C), all at camp all day;
 * Main runs Monday to Thursday; the Pool fits 1, Field A 2, and the Gym 3.
 */
@IsTest
public class SetTimeTestData {
  public static Map<String, Id> camp() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    Map<String, Id> ids = new Map<String, Id>{
      'Camp' => camp.Id,
      'Season' => season.Id
    };
    ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
    Program__c program = [
      SELECT Id
      FROM Program__c
      WHERE Season__c = :season.Id
      WITH SYSTEM_MODE
    ];
    ids.put('Main', program.Id);
    ShoreshTestData.timeBlock(program.Id, 'Period 2', 10);
    Division__c seniors = ShoreshTestData.division(program.Id, 'Seniors');
    Database.update(
      new Division__c(Id = seniors.Id, SortOrder__c = 2),
      AccessLevel.SYSTEM_MODE
    );
    ShoreshTestData.groupIn(seniors.Id, 'Group C');
    List<Group__c> groups = new List<Group__c>();
    for (Group__c grp : [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__c = :program.Id
      WITH SYSTEM_MODE
    ]) {
      groups.add(new Group__c(Id = grp.Id, Availability__c = 'AllDay'));
      ids.put(grp.Name, grp.Id);
    }
    Database.update(groups, AccessLevel.SYSTEM_MODE);
    for (Division__c division : [
      SELECT Id, Name
      FROM Division__c
      WHERE Program__c = :program.Id
      WITH SYSTEM_MODE
    ]) {
      ids.put(division.Name, division.Id);
    }
    for (TimeBlock__c block : [
      SELECT Id, Name
      FROM TimeBlock__c
      WHERE Program__c = :program.Id
      WITH SYSTEM_MODE
    ]) {
      ids.put(block.Name, block.Id);
    }
    for (Week__c week : [
      SELECT Id, Name
      FROM Week__c
      WHERE Season__c = :season.Id
      WITH SYSTEM_MODE
    ]) {
      ids.put(week.Name, week.Id);
    }
    return ids;
  }

  public static FixedActivity__c fixed(
    Map<String, Id> ids,
    String name,
    String block
  ) {
    return new FixedActivity__c(
      Program__c = ids.get('Main'),
      Name = name,
      TimeBlock__c = ids.get(block),
      Length__c = 1
    );
  }

  /** On Mondays only; tick other days on the record. */
  public static RecurringActivity__c recurring(
    Map<String, Id> ids,
    String name,
    String block
  ) {
    return new RecurringActivity__c(
      Program__c = ids.get('Main'),
      Name = name,
      TimeBlock__c = ids.get(block),
      Length__c = 1,
      Monday__c = true
    );
  }

  public static SetTimeWho.Who who(Integer row, Id target, List<Id> targets) {
    SetTimeWho.Who entry = new SetTimeWho.Who();
    entry.row = row;
    entry.target = target;
    entry.targets = targets;
    return entry;
  }

  public static RunsIn.WeekOff weekOff(Integer row, Id target, Id week) {
    RunsIn.WeekOff off = new RunsIn.WeekOff();
    off.row = row;
    off.target = target;
    off.week = week;
    return off;
  }

  public static ScreenSaves.Extras extras(
    List<RunsIn.WeekOff> weeksOff,
    List<Id> weeksBackOn,
    List<SetTimeWho.Who> who
  ) {
    ScreenSaves.Extras result = new ScreenSaves.Extras();
    result.weeksOff = weeksOff;
    result.weeksBackOn = weeksBackOn;
    result.who = who;
    return result;
  }

  /** Saves as the screens do; returns the Ids. */
  public static List<Id> save(List<SObject> rows, ScreenSaves.Extras extras) {
    return ScreenSaves.save(rows, extras);
  }

  public static List<Id> save(List<SObject> rows) {
    return save(rows, null);
  }

  /** The message a screen save is refused with; fails the test if it is saved. */
  public static String refusal(List<SObject> rows, ScreenSaves.Extras extras) {
    try {
      save(rows, extras);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Expected the save to be refused');
    return null;
  }

  public static String refusal(List<SObject> rows) {
    return refusal(rows, null);
  }

  /** The message a delete from the screens is refused with. */
  public static String deleteRefusal(Id recordId) {
    try {
      SeasonSetupController.deleteRecord(recordId);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Expected the delete to be refused');
    return null;
  }

  /** The message a direct save (not from the screens) is refused with. */
  public static String dmlRefusal(Database.SaveResult result) {
    Assert.isFalse(result.isSuccess(), 'Expected the save to be refused');
    return result.getErrors()[0].getMessage();
  }
}
