/**
 * The plan of a special day or event (ADR 0014): saved and read in the schedule-day grid format,
 * split into parts when large, refused when saved by someone else since. As a scheduler, with
 * records made inside the same System.runAs.
 */
@IsTest
public class SpecialPlansTest {
  /**
   * A special day's plan: its own two time blocks (not the program's), Group A and Group B as
   * rows, Swim noted for Group A carrying on into the second block, and a closed afternoon for
   * Group B when more than one block is asked for. blockCount: 1 or 2.
   */
  public static ScheduleGrid plan(Map<String, Id> ids, Integer blockCount) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block('p1', 'Morning').at('09:00', '11:00')
    );
    if (blockCount > 1) {
      grid.blocks.add(
        new ScheduleGrid.Block('p2', 'Afternoon').at('13:00', '15:00')
      );
    }
    grid.groups.add(new ScheduleGrid.GroupRef(ids.get('Group A'), 'Group A'));
    grid.groups.add(new ScheduleGrid.GroupRef(ids.get('Group B'), 'Group B'));
    grid.items.add(new ScheduleGrid.Item('T', '', 'Zoo trip'));
    grid.rows.add(
      blockCount > 1 ? new List<String>{ '1', '^' } : new List<String>{ '1' }
    );
    grid.rows.add(
      blockCount > 1 ? new List<String>{ '1', '' } : new List<String>{ '' }
    );
    return grid;
  }

  private static Id specialDay(Id seasonId, String name) {
    SpecialDay__c day = new SpecialDay__c(Season__c = seasonId, Name = name);
    Database.insert(day, AccessLevel.USER_MODE);
    return day.Id;
  }

  @IsTest
  static void aPlanIsSavedAndReadBackUnchanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      Id fieldDay = specialDay(season.Id, 'Field Day');
      Assert.isNull(SpecialPlans.read(fieldDay).grid, 'Nothing saved yet');

      ScheduleGrid saved = plan(ids, 2);
      Assert.areEqual(1, SpecialPlans.write(fieldDay, saved, null));

      SpecialPlans.Plan read = SpecialPlans.read(fieldDay);
      Assert.isNull(read.problem);
      Assert.areEqual(1, read.revision);
      Assert.areEqual(saved.toText(), read.grid.toText());
      PlanPart__c part = [
        SELECT Season__c, Part__c, GridFormatVersion__c, SpecialEvent__c
        FROM PlanPart__c
        WHERE SpecialDay__c = :fieldDay
        WITH USER_MODE
      ];
      Assert.areEqual(season.Id, part.Season__c);
      Assert.areEqual(1, part.Part__c);
      Assert.areEqual(1, part.GridFormatVersion__c);
      Assert.isNull(part.SpecialEvent__c);
    }
  }

  @IsTest
  static void aSaveFromAStaleCopyIsRefusedInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = season.Id,
        Name = 'Carnival'
      );
      Database.insert(carnival, AccessLevel.USER_MODE);
      SpecialPlans.write(carnival.Id, plan(ids, 1), null);
      Assert.areEqual(2, SpecialPlans.write(carnival.Id, plan(ids, 2), 1));

      try {
        SpecialPlans.write(carnival.Id, plan(ids, 1), 1);
        Assert.fail('Opened at revision 1, saved since');
      } catch (ShoreshException e) {
        Assert.areEqual(
          'Someone else changed this special event since you opened it. Open it again to see their changes, then make yours.',
          e.getMessage()
        );
      }
      Assert.areEqual(2, SpecialPlans.read(carnival.Id).grid.blocks.size());
    }
  }

  @IsTest
  static void aLargePlanIsSplitIntoPartsAndShrinksBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      Id fieldDay = specialDay(season.Id, 'Field Day');
      ScheduleGrid big = plan(ids, 2);
      // Small enough that each group's row needs its own part.
      ScheduleGridParts.partLimit = big.toText().length() - 20;

      SpecialPlans.write(fieldDay, big, null);
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM PlanPart__c
          WHERE SpecialDay__c = :fieldDay
          WITH USER_MODE
        ]
      );
      SpecialPlans.Plan read = SpecialPlans.read(fieldDay);
      Assert.isNull(read.problem);
      Assert.areEqual(
        big.toText(),
        read.grid.toText(),
        'Joined back unchanged'
      );

      ScheduleGridParts.partLimit = 100000;
      SpecialPlans.write(fieldDay, plan(ids, 1), 1);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM PlanPart__c
          WHERE SpecialDay__c = :fieldDay
          WITH USER_MODE
        ]
      );
      Assert.areEqual(2, SpecialPlans.read(fieldDay).revision);
    }
  }

  @IsTest
  static void aPlanThatCannotBeReadSaysWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Id fieldDay = specialDay(season.Id, 'Field Day');
      Database.insert(
        new PlanPart__c(
          Season__c = season.Id,
          SpecialDay__c = fieldDay,
          Plan__c = 'not a grid',
          Revision__c = 1
        ),
        AccessLevel.USER_MODE
      );

      SpecialPlans.Plan read = SpecialPlans.read(fieldDay);
      Assert.isNull(read.grid);
      Assert.areEqual('it is not in the grid format', read.problem);
    }
  }

  @IsTest
  static void aPlanHasOneOwnerInItsOwnSeasonAndEachPartOnce() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Season__c other = ShoreshTestData.season(camp.Id, 'Other');
      Id fieldDay = specialDay(season.Id, 'Field Day');

      Database.SaveResult noOwner = Database.insert(
        new PlanPart__c(Season__c = season.Id),
        false,
        AccessLevel.USER_MODE
      );
      Assert.areEqual(
        'Choose the special day or the special event this plan is for.',
        noOwner.getErrors()[0].getMessage()
      );
      Database.SaveResult otherSeason = Database.insert(
        new PlanPart__c(Season__c = other.Id, SpecialDay__c = fieldDay),
        false,
        AccessLevel.USER_MODE
      );
      Assert.areEqual(
        'This plan belongs to a different season than its special day.',
        otherSeason.getErrors()[0].getMessage()
      );
      Database.insert(
        new PlanPart__c(Season__c = season.Id, SpecialDay__c = fieldDay),
        AccessLevel.USER_MODE
      );
      Assert.isFalse(
        Database.insert(
            new PlanPart__c(Season__c = season.Id, SpecialDay__c = fieldDay),
            false,
            AccessLevel.USER_MODE
          )
          .isSuccess(),
        'A second part 1 is refused by the unique key'
      );
    }
  }

  /** count special days, then count special events, each with a one-part plan of this text. */
  private static List<Id> itemsWithPlans(
    Id seasonId,
    String text,
    Integer count
  ) {
    List<SpecialDay__c> days = new List<SpecialDay__c>();
    List<SpecialEvent__c> events = new List<SpecialEvent__c>();
    for (Integer i = 1; i <= count; i++) {
      days.add(new SpecialDay__c(Season__c = seasonId, Name = 'Day ' + i));
      events.add(
        new SpecialEvent__c(Season__c = seasonId, Name = 'Event ' + i)
      );
    }
    Database.insert(days, AccessLevel.USER_MODE);
    Database.insert(events, AccessLevel.USER_MODE);
    List<Id> itemIds = new List<Id>();
    List<PlanPart__c> parts = new List<PlanPart__c>();
    for (SpecialDay__c day : days) {
      itemIds.add(day.Id);
      parts.add(
        new PlanPart__c(
          Season__c = seasonId,
          SpecialDay__c = day.Id,
          Plan__c = text,
          Revision__c = 1
        )
      );
    }
    for (SpecialEvent__c event : events) {
      itemIds.add(event.Id);
      parts.add(
        new PlanPart__c(
          Season__c = seasonId,
          SpecialEvent__c = event.Id,
          Plan__c = text,
          Revision__c = 1
        )
      );
    }
    Database.insert(parts, AccessLevel.USER_MODE);
    return itemIds;
  }

  @IsTest
  static void readingAndSavingPlansStaysWithinAFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      // A season with plenty: 8 special days and 8 special events, each with a plan.
      List<Id> itemIds = itemsWithPlans(season.Id, plan(ids, 2).toText(), 8);
      Id firstDay = itemIds[0];

      Test.startTest();
      Integer start = Limits.getQueries();
      Map<Id, SpecialPlans.Plan> read = SpecialPlans.readAll(
        new Set<Id>(itemIds)
      );
      Integer readQueries = Limits.getQueries() - start;
      start = Limits.getQueries();
      SpecialPlans.write(firstDay, plan(ids, 1), 1);
      Integer saveQueries = Limits.getQueries() - start;
      Test.stopTest();

      Assert.areEqual(16, read.size());
      for (SpecialPlans.Plan one : read.values()) {
        Assert.isNull(one.problem);
      }
      Assert.areEqual(1, readQueries, 'One query for every plan');
      // Lock the item, read its parts, and the plan part check (special days, special events).
      Assert.isTrue(saveQueries <= 4, 'Save used ' + saveQueries + ' queries');
    }
  }
}
