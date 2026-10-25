/**
 * The linked choices editor's server side (electives slice E8; repo ADR 0018 choices 38 to 44):
 * where the set sits in the week, each gesture saved, what is refused, and deleting one. Every
 * test acts as a scheduler with only the Shoresh Scheduler permission set and makes its records
 * inside the same runAs; each request is bounded in queries. Names are made up.
 */
@IsTest
private class LinkedChoicesTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  /**
   * "Chugim" with Archery and Drama, on Week 1's Manual Build: Monday's Period 1 for Group A and
   * B, Tuesday's Period 1 and Lunch for Group A. A saved version also has it on Wednesday.
   */
  private class Menu {
    Map<String, Id> ids;
    Id setId;
    Id dramaId;

    Menu() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      List<Activity__c> activities = new List<Activity__c>{
        ShoreshTestData.activity(ids.get('Season'), 'Archery', null),
        ShoreshTestData.activity(ids.get('Season'), 'Drama', null)
      };
      Database.insert(activities, AccessLevel.USER_MODE);
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      setId = chugim.Id;
      Offering__c drama = new Offering__c(
        ElectiveSet__c = setId,
        Activity__c = activities[1].Id,
        NoSeatLimit__c = true
      );
      Database.insert(drama, AccessLevel.USER_MODE);
      dramaId = drama.Id;
      Schedule__c manual = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 1'),
        Name = 'Week 1',
        Status__c = 'Draft',
        Origin__c = 'Manual'
      );
      Database.insert(manual, AccessLevel.USER_MODE);
      Schedule__c kept = ShoreshTestData.savedVersion(
        ids.get('Main'),
        ids.get('Week 1'),
        'Week 1, kept'
      );
      ScheduleDaySaves.write(
        manual.Id,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(
            MONDAY,
            grid(new List<String>{ '1,', '1,' }),
            null
          ),
          new ScheduleDaySaves.DaySave(
            MONDAY.addDays(1),
            grid(new List<String>{ '1,1', ',' }),
            null
          )
        }
      );
      ScheduleDaySaves.write(
        kept.Id,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(
            MONDAY.addDays(2),
            grid(new List<String>{ '1,', '1,' }),
            null
          )
        }
      );
    }

    /** A day with Chugim where a row says '1' (Period 1, Lunch). */
    ScheduleGrid grid(List<String> rows) {
      ScheduleGrid result = new ScheduleGrid();
      result.blocks.add(
        new ScheduleGrid.Block(ids.get('Period 1'), 'Period 1')
          .at('09:00', '09:45')
      );
      result.blocks.add(
        new ScheduleGrid.Block(ids.get('Lunch'), 'Lunch').at('12:00', '12:45')
      );
      result.groups.add(
        new ScheduleGrid.GroupRef(ids.get('Group A'), 'Group A')
      );
      result.groups.add(
        new ScheduleGrid.GroupRef(ids.get('Group B'), 'Group B')
      );
      result.items.add(new ScheduleGrid.Item('E', setId, 'Chugim'));
      for (String row : rows) {
        result.rows.add(row.split(',', -1));
      }
      return result;
    }

    LinkedChoiceSaves.Period period(String weekday, String block) {
      LinkedChoiceSaves.Period result = new LinkedChoiceSaves.Period();
      result.weekday = weekday;
      result.blockId = ids.get(block);
      return result;
    }
  }

  private static Id save(LinkedChoiceSaves.Edit edit) {
    return LinkedChoicesController.saveLinkedChoice(JSON.serialize(edit));
  }

  private static String refusalOf(LinkedChoiceSaves.Edit edit) {
    try {
      save(edit);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Refused');
    return null;
  }

  private static LinkedChoice__c saved(Id choiceId) {
    return [
      SELECT
        Name,
        AppliesTo__c,
        SortOrder__c,
        Offering__c,
        ElectiveSet__c,
        (SELECT Weekday__c, TimeBlock__c FROM Times__r ORDER BY Weekday__c),
        (SELECT Division__c, Season__c FROM Coverages__r)
      FROM LinkedChoice__c
      WHERE Id = :choiceId
    ];
  }

  // ---------------------------------------------------------------- where the set sits

  @IsTest
  static void theWeekShowsWhereTheSetSitsOnWorkingSchedules() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();

      Test.startTest();
      Integer before = Limits.getQueries();
      LinkedChoicePlaces.Places places = LinkedChoicesController.linkedChoicePlaces(
        menu.setId
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 6, 'The read is bounded: ' + used);
      Assert.isTrue(places.complete);
      List<String> cells = new List<String>();
      for (LinkedChoicePlaces.Cell cell : places.cells) {
        cells.add(
          cell.weekday +
            ' ' +
            (cell.blockId == menu.ids.get('Lunch') ? 'Lunch' : 'Period 1') +
            ' ' +
            cell.divisionIds.size()
        );
        Assert.areEqual(menu.ids.get('Juniors'), cell.divisionIds[0]);
      }
      cells.sort();
      // Not Wednesday: a saved version is not where the set sits now.
      Assert.areEqual(
        new List<String>{
          'Monday Period 1 1',
          'Tuesday Lunch 1',
          'Tuesday Period 1 1'
        },
        cells
      );
    }
  }

  @IsTest
  static void aSeasonTooBigToReadSaysTheWeekIsNotComplete() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      LinkedChoicePlaces.partsAtOnce = 1;
      LinkedChoicePlaces.queryBudget = 1;

      LinkedChoicePlaces.Places places = LinkedChoicesController.linkedChoicePlaces(
        menu.setId
      );

      Assert.isFalse(places.complete);
      Assert.areEqual(1, places.cells.size(), 'Monday only was read');
      Assert.areEqual(
        'Tuesday',
        LinkedChoicePlaces.weekdayOf(MONDAY.addDays(1))
      );
    }
  }

  // ---------------------------------------------------------------- each gesture

  @IsTest
  static void aLinkedChoiceIsMadeByItsFirstPeriodThenChangedGestureByGesture() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      LinkedChoiceSaves.Edit first = new LinkedChoiceSaves.Edit();
      first.offeringId = menu.dramaId;
      first.name = ' Drama double ';
      first.periodsOn.add(menu.period('Monday', 'Period 1'));

      Test.startTest();
      Integer before = Limits.getQueries();
      Id choiceId = save(first);
      Integer madeQueries = Limits.getQueries() - before;

      LinkedChoiceSaves.Edit more = new LinkedChoiceSaves.Edit();
      more.id = choiceId;
      more.periodsOn.add(menu.period('Tuesday', 'Period 1'));
      // Ticked twice is the same as once.
      more.periodsOn.add(menu.period('Monday', 'Period 1'));
      before = Limits.getQueries();
      save(more);
      Integer tickQueries = Limits.getQueries() - before;

      LinkedChoiceSaves.Edit scope = new LinkedChoiceSaves.Edit();
      scope.id = choiceId;
      scope.name = 'Drama twice';
      scope.appliesTo = 'OnlyThese';
      scope.divisionsOn.add(menu.ids.get('Juniors'));
      scope.divisionsOn.add(menu.ids.get('Juniors'));
      save(scope);
      Test.stopTest();

      Assert.isTrue(madeQueries <= 15, 'Made, bounded: ' + madeQueries);
      Assert.isTrue(tickQueries <= 12, 'A tick, bounded: ' + tickQueries);
      LinkedChoice__c choice = saved(choiceId);
      Assert.areEqual('Drama twice', choice.Name);
      Assert.areEqual('OnlyThese', choice.AppliesTo__c);
      Assert.areEqual(1, choice.SortOrder__c);
      Assert.areEqual(menu.setId, choice.ElectiveSet__c);
      Assert.areEqual(menu.dramaId, choice.Offering__c);
      Assert.areEqual(2, choice.Times__r.size());
      Assert.areEqual('Monday', choice.Times__r[0].Weekday__c);
      Assert.areEqual('Tuesday', choice.Times__r[1].Weekday__c);
      Assert.areEqual(1, choice.Coverages__r.size());
      Assert.areEqual(menu.ids.get('Season'), choice.Coverages__r[0].Season__c);
    }
  }

  @IsTest
  static void unTickingRemovesAPeriodOrADivisionAndANewOneGoesAfterTheOthers() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      LinkedChoiceSaves.Edit first = new LinkedChoiceSaves.Edit();
      first.offeringId = menu.dramaId;
      first.name = 'Drama';
      first.appliesTo = 'AllExcept';
      first.periodsOn.add(menu.period('Monday', 'Period 1'));
      first.periodsOn.add(menu.period('Tuesday', 'Lunch'));
      first.divisionsOn.add(menu.ids.get('Juniors'));
      Id choiceId = save(first);

      Test.startTest();
      LinkedChoiceSaves.Edit off = new LinkedChoiceSaves.Edit();
      off.id = choiceId;
      off.periodsOff.add(menu.period('Tuesday', 'Lunch'));
      off.divisionsOff.add(menu.ids.get('Juniors'));
      save(off);
      LinkedChoiceSaves.Edit second = new LinkedChoiceSaves.Edit();
      second.offeringId = menu.dramaId;
      second.name = 'Drama · Tue 9:00';
      second.periodsOn.add(menu.period('Tuesday', 'Period 1'));
      Id secondId = save(second);
      Test.stopTest();

      LinkedChoice__c choice = saved(choiceId);
      Assert.areEqual('AllExcept', choice.AppliesTo__c);
      Assert.areEqual(1, choice.Times__r.size());
      Assert.areEqual(0, choice.Coverages__r.size());
      Assert.areEqual(2, saved(secondId).SortOrder__c);
      Assert.areEqual('All', saved(secondId).AppliesTo__c);
    }
  }

  @IsTest
  static void whatCantBeSavedIsRefusedAndNothingIsWritten() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      LinkedChoiceSaves.Edit blank = new LinkedChoiceSaves.Edit();
      blank.offeringId = menu.dramaId;
      blank.name = '  ';
      blank.periodsOn.add(menu.period('Monday', 'Period 1'));
      Assert.areEqual(
        'Give the linked choice a name: it is what a sheet says to choose it.',
        refusalOf(blank)
      );

      LinkedChoiceSaves.Edit weekend = new LinkedChoiceSaves.Edit();
      weekend.offeringId = menu.dramaId;
      weekend.name = 'Drama';
      weekend.periodsOn.add(menu.period('Saturday', 'Period 1'));
      Assert.areEqual(
        'That period could not be sent. Try again.',
        refusalOf(weekend)
      );

      LinkedChoiceSaves.Edit nothing = new LinkedChoiceSaves.Edit();
      Assert.areEqual(
        'That change could not be sent. Try again.',
        refusalOf(nothing)
      );
      LinkedChoiceSaves.Edit odd = new LinkedChoiceSaves.Edit();
      odd.offeringId = menu.dramaId;
      odd.name = 'Drama';
      odd.appliesTo = 'Sometimes';
      Assert.areEqual(
        'That change could not be sent. Try again.',
        refusalOf(odd)
      );

      // Another season's time block: refused by the trigger, and the linked choice is not made.
      Camp__c other = ShoreshTestData.camp('Camp Birch');
      ShoreshTestData.fullSeason(other.Id);
      LinkedChoiceSaves.Edit elsewhere = new LinkedChoiceSaves.Edit();
      elsewhere.offeringId = menu.dramaId;
      elsewhere.name = 'Drama';
      LinkedChoiceSaves.Period away = new LinkedChoiceSaves.Period();
      away.weekday = 'Monday';
      away.blockId = ShoreshTestData.lastSeasonIds.get('Period 1');
      elsewhere.periodsOn.add(away);
      Assert.isNotNull(refusalOf(elsewhere));

      String garbled;
      try {
        LinkedChoicesController.saveLinkedChoice('{not json');
      } catch (AuraHandledException e) {
        garbled = e.getMessage();
      }
      Test.stopTest();

      Assert.areEqual('That change could not be sent. Try again.', garbled);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM LinkedChoice__c WHERE ElectiveSet__c = :menu.setId]
      );
    }
  }

  @IsTest
  static void aLinkedChoiceIsDeletedWithItsPeriodsAndDivisions() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      LinkedChoiceSaves.Edit first = new LinkedChoiceSaves.Edit();
      first.offeringId = menu.dramaId;
      first.name = 'Drama';
      first.appliesTo = 'OnlyThese';
      first.periodsOn.add(menu.period('Monday', 'Period 1'));
      first.divisionsOn.add(menu.ids.get('Juniors'));
      Id choiceId = save(first);

      Test.startTest();
      SeasonSetupController.deleteRecord(choiceId);
      Test.stopTest();

      Assert.areEqual(
        0,
        [SELECT COUNT() FROM LinkedChoice__c WHERE Id = :choiceId]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM LinkedChoiceTime__c
          WHERE LinkedChoice__c = :choiceId
        ]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Coverage__c WHERE LinkedChoice__c = :choiceId]
      );
    }
  }
}
