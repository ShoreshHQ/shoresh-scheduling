/**
 * The Special events screen's read (ADR 0014 choice 11): special days and events in order, each
 * plan in brief and the days each one is on, in four queries; and the screen's delete. As a
 * scheduler, with records made inside the same System.runAs.
 */
@IsTest
private class SpecialItemsTest {
  /**
   * Main's camp with Lunch break every day; special days Rainy Day (first) and Color War (on
   * Thursday of Week 5), added as the screen adds them; Carnival on Tuesday of Week 2 and
   * Wednesday of Week 1. Returns the ids, the items' among them.
   */
  private static Map<String, Id> seasonWithItems() {
    Map<String, Id> ids = SetTimeTestData.camp();
    Id seasonId = ids.get('Season');
    SetTimeTestData.save(
      new List<SObject>{ SetTimeTestData.fixed(ids, 'Lunch break', 'Lunch') }
    );
    ids.put('Color War', addDay(seasonId, 'Color War', 2));
    ids.put('Rainy Day', addDay(seasonId, 'Rainy Day', 1));
    SpecialEvent__c carnival = new SpecialEvent__c(
      Season__c = seasonId,
      Name = 'Carnival',
      Location__c = ids.get('Field A'),
      Notes__c = 'Seniors run the booths'
    );
    Database.insert(carnival, AccessLevel.USER_MODE);
    ids.put('Carnival', carnival.Id);
    SpecialDates.place(ids.get('Color War'), ids.get('Week 5'), 'Thursday');
    SpecialDates.place(carnival.Id, ids.get('Week 2'), 'Tuesday');
    SpecialDates.place(carnival.Id, ids.get('Week 1'), 'Wednesday');
    return ids;
  }

  private static Id addDay(Id seasonId, String name, Integer order) {
    return SetupTablesController.saveRow(
        new SpecialDay__c(
          Season__c = seasonId,
          Name = name,
          SortOrder__c = order
        ),
        null,
        null
      )
      .id;
  }

  @IsTest
  static void theSeasonReadBringsItemsInOrderInFourQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = seasonWithItems();
      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialItems.Setup setup = SpecialItems.forSeason(ids.get('Season'));
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 4, 'Queries for the special items: ' + used);
      Assert.areEqual(2, setup.specialDays.size());
      Assert.areEqual('Rainy Day', setup.specialDays[0].Name, 'By sort order');
      Assert.areEqual('Color War', setup.specialDays[1].Name);
      Assert.areEqual(1, setup.specialEvents.size());
      Assert.areEqual(ids.get('Field A'), setup.specialEvents[0].Location__c);
      Assert.areEqual(3, setup.briefs.size());
      // The screen gets it with the rest of the season.
      SeasonSetupReader.SeasonSetup season = SeasonSetupReader.read(
        ids.get('Season')
      );
      Assert.areEqual(3, season.special.briefs.size());
      Assert.areEqual(ids.get('Rainy Day'), season.special.specialDays[0].Id);
    }
  }

  @IsTest
  static void eachItemComesWithItsPlanInBriefAndItsDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = seasonWithItems();
      SpecialItems.Setup setup = SpecialItems.forSeason(ids.get('Season'));

      SpecialItems.Brief war = setup.briefs[1];
      Assert.areEqual(ids.get('Color War'), war.itemId);
      Assert.isTrue(war.planned);
      Assert.areEqual(3, war.rows, 'Group A, Group B and Group C');
      Assert.areEqual(3, war.periods.size());
      Assert.areEqual('Period 1', war.periods[0].name);
      Assert.areEqual('09:00', war.periods[0].startTime);
      Assert.areEqual('09:45', war.periods[0].endTime);
      Assert.areEqual(new List<String>(), war.periods[0].items);
      Assert.areEqual(new List<String>{ 'Lunch break' }, war.periods[2].items);
      Assert.areEqual(1, war.days.size());
      Assert.areEqual(ids.get('Week 5'), war.days[0].weekId);
      Assert.areEqual('Thursday', war.days[0].day);

      SpecialItems.Brief fair = setup.briefs[2];
      Assert.areEqual(ids.get('Carnival'), fair.itemId);
      Assert.isFalse(fair.planned, 'No plan until its schedule is made');
      Assert.areEqual(0, fair.periods.size());
      Assert.areEqual(2, fair.days.size());
      Assert.areEqual(ids.get('Week 1'), fair.days[0].weekId, 'In week order');
      Assert.areEqual('Wednesday', fair.days[0].day);
    }
  }

  @IsTest
  static void aCarriedOnItemIsNamedOnceInEachOfItsTimeBlocks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      FixedActivity__c morning = SetTimeTestData.fixed(
        ids,
        'Morning swim',
        'Period 1'
      );
      morning.Length__c = 2;
      SetTimeTestData.save(new List<SObject>{ morning });
      Id day = SetupTablesController.saveRow(
          new SpecialDay__c(Season__c = ids.get('Season'), Name = 'Field Day'),
          null,
          null
        )
        .id;
      SpecialItems.Brief brief = SpecialItems.forSeason(ids.get('Season'))
        .briefs[0];
      Assert.areEqual(day, brief.itemId);
      Assert.areEqual(
        new List<String>{ 'Morning swim' },
        brief.periods[0].items
      );
      Assert.areEqual(
        new List<String>{ 'Morning swim' },
        brief.periods[1].items
      );
    }
  }

  @IsTest
  static void aSeasonWithNoneReadsInTwoQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Integer before = Limits.getQueries();
      SpecialItems.Setup setup = SpecialItems.forSeason(season.Id);
      Assert.isTrue(Limits.getQueries() - before <= 2);
      Assert.areEqual(0, setup.specialDays.size());
      Assert.areEqual(0, setup.briefs.size());
    }
  }

  @IsTest
  static void theScreensDeleteRefusesOneOnADayAndDeletesOneThatIsNot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id fieldDay = SetupTablesController.saveRow(
          new SpecialDay__c(Season__c = ids.get('Season'), Name = 'Field Day'),
          null,
          null
        )
        .id;
      SpecialDates.place(fieldDay, ids.get('Week 2'), 'Tuesday');
      String refusal = SetTimeTestData.deleteRefusal(fieldDay);
      Assert.isTrue(
        refusal.contains(
          'This special day can\'t be deleted yet: it is on Tuesday of "Week 2". First take it off that day, then delete it.'
        ),
        refusal
      );

      Id colorWar = SetupTablesController.saveRow(
          new SpecialDay__c(Season__c = ids.get('Season'), Name = 'Color War'),
          null,
          null
        )
        .id;
      SeasonSetupController.deleteRecord(colorWar);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM SpecialDay__c WHERE Id = :colorWar WITH USER_MODE]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM PlanPart__c
          WHERE SpecialDay__c = :colorWar
          WITH USER_MODE
        ],
        'Its plan goes with it'
      );
    }
  }

  @IsTest
  static void theScreensSaveOnlyTheFieldsTheyShow() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      try {
        SetupTablesController.saveRow(
          new SpecialDay__c(
            Season__c = ids.get('Season'),
            Name = 'Field Day',
            Key__c = 'x'
          ),
          null,
          null
        );
        Assert.fail('Expected the hidden key to be refused');
      } catch (AuraHandledException e) {
        Assert.areEqual('These screens can\'t change that.', e.getMessage());
      }
    }
  }
}
