/**
 * INGEST-5.8: a special day's or event's plan is a use (PlanUses): an item an earlier import
 * brought in stays while a plan names it, with why, and its removal is refused.
 */
@IsTest
private class ImportPlanUsesTest {
  private static Season__c newSeason() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    return ShoreshTestData.season(camp.Id, 'Summer 2027');
  }

  private static void firstImport(Id seasonId) {
    ImportController.saveSetup(
      JSON.serialize(ImportTestPlans.newCamp(seasonId))
    );
  }

  private static Activity__c activityNamed(Id seasonId, String name) {
    return [
      SELECT Id, Name
      FROM Activity__c
      WHERE Season__c = :seasonId AND Name = :name
      WITH USER_MODE
      LIMIT 1
    ];
  }

  /** The import's refusal to remove this item, or null when it was removed. */
  private static String refusalToRemove(Id seasonId, Activity__c item) {
    Map<String, Object> plan = ImportTestPlans.emptyPlan(seasonId);
    plan.put(
      'removals',
      new List<Object>{
        new Map<String, Object>{ 'id' => item.Id, 'name' => item.Name }
      }
    );
    try {
      ImportController.saveSetup(JSON.serialize(plan));
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  /** A special day, Field Day, whose plan has this activity in one group's morning. */
  private static void inFieldDaysPlan(Id seasonId, Activity__c activity) {
    SpecialDay__c fieldDay = new SpecialDay__c(
      Season__c = seasonId,
      Name = 'Field Day'
    );
    Database.insert(fieldDay, AccessLevel.USER_MODE);
    Group__c bunk = [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      LIMIT 1
    ];
    ScheduleGrid plan = new ScheduleGrid();
    plan.blocks.add(
      new ScheduleGrid.Block('p1', 'Morning').at('09:00', '11:00')
    );
    plan.groups.add(new ScheduleGrid.GroupRef(bunk.Id, bunk.Name));
    plan.items.add(new ScheduleGrid.Item('A', activity.Id, activity.Name));
    plan.rows.add(new List<String>{ '1' });
    SpecialPlans.write(fieldDay.Id, plan, null);
  }

  @IsTest
  static void ingest58AnItemInASpecialDaysPlanIsInUseAndItsRemovalRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c boating = activityNamed(season.Id, 'Boating');
      // Made by hand: Field Day's plan has Boating in it.
      inFieldDaysPlan(season.Id, boating);
      Test.startTest();
      ImportProvenance.Standing standing = ImportController.getImported(
        season.Id
      );
      String refusal = refusalToRemove(season.Id, boating);
      Test.stopTest();
      Assert.areEqual(
        'Boating is in Field Day\'s plan',
        standing.inUse.get(boating.Id)
      );
      Assert.isTrue(
        refusal != null && refusal.contains('Boating is in Field Day\'s plan'),
        'Boating was removed from under Field Day: ' + refusal
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Id = :boating.Id],
        'Boating stays'
      );
    }
  }

  @IsTest
  static void ingest58AnItemPastThePlansReadIsInUseAndNeverRemoved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      inFieldDaysPlan(season.Id, activityNamed(season.Id, 'Boating'));
      PlanUses.maxRows = 0;
      Test.startTest();
      ImportProvenance.Standing standing = ImportController.getImported(
        season.Id
      );
      Test.stopTest();
      Assert.areEqual(
        'Swim may be on one of the season\'s many schedules',
        standing.inUse.get(swim.Id)
      );
    }
  }
}
