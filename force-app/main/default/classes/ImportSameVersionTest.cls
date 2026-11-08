/**
 * The same files imported again keep last year's week as a version once, not twice
 * (break-and-rebuild N1); any difference in a cell keeps a new one. Synthetic data only.
 */
@IsTest
private class ImportSameVersionTest {
  /** A second import's version of the week: the first one's grid, said by its records' Ids. */
  private static Map<String, Object> againFrom(
    Schedule__c first,
    Week__c week,
    String changedRow
  ) {
    ScheduleGrid grid = ScheduleDays.read(first.Id)[0].grid;
    List<Object> blocks = new List<Object>();
    for (ScheduleGrid.Block b : grid.blocks) {
      blocks.add(new List<Object>{ b.id, b.name, b.startTime, b.endTime });
    }
    List<Object> groups = new List<Object>();
    for (ScheduleGrid.GroupRef g : grid.groups) {
      groups.add(new List<Object>{ g.id, g.name });
    }
    List<Object> items = new List<Object>();
    for (ScheduleGrid.Item i : grid.items) {
      items.add(new List<Object>{ i.kind, i.id, i.name });
    }
    List<Object> rows = new List<Object>();
    for (List<String> r : grid.rows) {
      rows.add(String.join(r, ','));
    }
    if (changedRow != null) {
      rows[0] = changedRow;
    }
    Map<String, Object> plan = ImportTestPlans.emptyPlan(week.Season__c);
    ImportTestPlans.add(
      plan,
      'versions',
      ImportTestPlans.entry(
        new List<Object>{
          'programKey',
          first.Program__c,
          'weekId',
          week.Id,
          'name',
          first.Name,
          'days',
          new List<Object>{
            new Map<String, Object>{
              'date' => String.valueOf(week.StartDate__c),
              'grid' => new Map<String, Object>{
                'b' => blocks,
                'g' => groups,
                'i' => items,
                'r' => rows
              }
            }
          }
        }
      )
    );
    return plan;
  }

  private static List<Schedule__c> imported(Id weekId) {
    return [
      SELECT Id, Program__c, Name
      FROM Schedule__c
      WHERE Week__c = :weekId AND Origin__c = 'Imported'
      WITH SYSTEM_MODE
    ];
  }

  @IsTest
  static void theSameFilesAgainKeepTheirVersionOnceAndADifferenceKeepsANewOne() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = ShoreshTestData.season(
        ShoreshTestData.camp('Maple Grove (made up)').Id,
        'Summer 2027'
      );
      Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
      Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
      ImportTestPlans.addVersion(plan, week);
      ImportController.saveSetup(JSON.serialize(plan));
      Schedule__c first = imported(week.Id)[0];
      week = [
        SELECT Id, Season__c, StartDate__c
        FROM Week__c
        WHERE Id = :week.Id
        WITH SYSTEM_MODE
      ];
      Test.startTest();
      ImportSetupSaves.Result same = ImportController.saveSetup(
        JSON.serialize(againFrom(first, week, null))
      );
      ImportSetupSaves.Result changed = ImportController.saveSetup(
        JSON.serialize(againFrom(first, week, '2,2,'))
      );
      Test.stopTest();
      Assert.isNull(same.added.get('Version'), String.valueOf(same.added));
      Assert.areEqual(1, changed.added.get('Version'));
      Assert.areEqual(2, imported(week.Id).size());
    }
  }
}
