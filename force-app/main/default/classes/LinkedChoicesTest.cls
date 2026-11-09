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
  static void aLinkedChoiceCanSpanTheWeekend() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      LinkedChoiceSaves.Edit edit = new LinkedChoiceSaves.Edit();
      edit.offeringId = menu.dramaId;
      edit.name = 'Drama weekend';
      edit.periodsOn.add(menu.period('Saturday', 'Period 1'));
      edit.periodsOn.add(menu.period('Sunday', 'Period 1'));
      Test.startTest();
      Id choiceId = save(edit);
      Test.stopTest();
      List<String> days = new List<String>();
      for (LinkedChoiceTime__c at : saved(choiceId).Times__r) {
        days.add(at.Weekday__c);
      }
      Assert.areEqual(new List<String>{ 'Saturday', 'Sunday' }, days);
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

      // Saturday is a day like any other (ADR 0022); a day that isn't one is refused.
      LinkedChoiceSaves.Edit funday = new LinkedChoiceSaves.Edit();
      funday.offeringId = menu.dramaId;
      funday.name = 'Drama';
      funday.periodsOn.add(menu.period('Funday', 'Period 1'));
      Assert.areEqual(
        'That period could not be sent. Try again.',
        refusalOf(funday)
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

  // ---------------------------------------------------------------- through an AI

  /** Sends body to the action; answers [status, sentence], through its ask-first when it has one. */
  private static List<Object> sent(
    AgentWeeks.Action action,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentAskFirstTestCalls.answer(action);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static Map<String, Object> atMenu(
    Menu menu,
    Map<String, Object> more
  ) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :menu.ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name,
      'elective_set' => 'Chugim'
    };
    body.putAll(more);
    return body;
  }

  private static List<Object> periods(String day, String blockName) {
    return new List<Object>{
      new Map<String, Object>{ 'day' => day, 'time' => blockName }
    };
  }

  /** "Drama" through the AI's own make, on Monday's Period 1. */
  private static Id made(Menu menu) {
    List<Object> answer = sent(
      new AgentMakeLinkedChoice(),
      atMenu(
        menu,
        new Map<String, Object>{
          'activity' => 'Drama',
          'name' => 'Drama',
          'periods' => periods('monday', 'Period 1')
        }
      )
    );
    Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
    return [SELECT Id FROM LinkedChoice__c WHERE Name = 'Drama' LIMIT 1].Id;
  }

  // API-1.131
  @IsTest
  static void anAgentReadsWhatTheEditorReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.params.put('elective_set', 'chugim');
      RestContext.request.params.put(
        'season',
        (String) atMenu(menu, new Map<String, Object>()).get('season')
      );
      RestContext.response = new RestResponse();
      AgentLinkedChoices.get();
      Test.stopTest();
      String text = RestContext.response.responseBody.toString();
      Assert.areEqual(200, RestContext.response.statusCode, text);
      Map<String, Object> read = (Map<String, Object>) JSON.deserializeUntyped(
        text
      );
      Assert.areEqual(
        new Set<String>{
          'elective_set',
          'set_id',
          'setup',
          'labels',
          'places',
          'season'
        },
        read.keySet()
      );
      Assert.areEqual(menu.setId, read.get('set_id'));
      Assert.areEqual(
        3,
        ((List<Object>) ((Map<String, Object>) read.get('places')).get('cells'))
          .size()
      );
    }
  }

  // API-1.132
  @IsTest
  static void anAgentMakesOneThroughTheEditorsSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      List<Object> answer = sent(
        new AgentMakeLinkedChoice(),
        atMenu(
          menu,
          new Map<String, Object>{
            'activity' => 'drama',
            'name' => 'Drama double',
            'periods' => periods('Monday', 'Period 1'),
            'applies_to' => 'only these',
            'divisions' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Made the linked choice "Drama double".', answer[1]);
      LinkedChoice__c choice = saved(
        [SELECT Id FROM LinkedChoice__c WHERE Name = 'Drama double'].Id
      );
      Assert.areEqual('OnlyThese', choice.AppliesTo__c);
      Assert.areEqual(1, choice.Times__r.size());
      Assert.areEqual(
        menu.ids.get('Period 1'),
        choice.Times__r[0].TimeBlock__c
      );
      Assert.areEqual(
        menu.ids.get('Juniors'),
        choice.Coverages__r[0].Division__c
      );
    }
  }

  // API-1.132
  @IsTest
  static void anAgentIsRefusedWhatTheEditorDoesntOffer() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      Map<String, Object> notThere = new Map<String, Object>{
        'activity' => 'Drama',
        'name' => 'Drama',
        'periods' => periods('Friday', 'Period 1')
      };
      List<Object> answer = sent(
        new AgentMakeLinkedChoice(),
        atMenu(menu, notThere)
      );
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'Chugim isn\'t at Friday Period 1 on any schedule. Nothing was changed.',
        answer[1]
      );
      Map<String, Object> none = new Map<String, Object>{
        'activity' => 'Drama',
        'name' => 'Drama'
      };
      Assert.areEqual(
        400,
        sent(new AgentMakeLinkedChoice(), atMenu(menu, none))[0]
      );
      Map<String, Object> notOffered = new Map<String, Object>{
        'activity' => 'Archery',
        'name' => 'Archery',
        'periods' => periods('Monday', 'Period 1')
      };
      answer = sent(new AgentMakeLinkedChoice(), atMenu(menu, notOffered));
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('It offers: Drama'));
      // Divisions while it applies to All, one not there, nothing a name, and a name too long.
      for (
        Map<String, Object> more : new List<Map<String, Object>>{
          new Map<String, Object>{
            'divisions' => new List<Object>{ 'Juniors' }
          },
          new Map<String, Object>{
            'applies_to' => 'Only these',
            'divisions' => new List<Object>{ 'Nobody' }
          },
          new Map<String, Object>{
            'applies_to' => 'Only these',
            'divisions' => new List<Object>{ null }
          },
          new Map<String, Object>{ 'name' => 'x'.repeat(81) }
        }
      ) {
        Map<String, Object> refused = new Map<String, Object>{
          'activity' => 'Drama',
          'name' => 'Drama',
          'periods' => periods('Monday', 'Period 1')
        };
        refused.putAll(more);
        answer = sent(new AgentMakeLinkedChoice(), atMenu(menu, refused));
        Assert.areEqual(400, answer[0], String.valueOf(answer[1]));
      }
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoice__c]);
    }
  }

  // API-1.132
  @IsTest
  static void aSetOnNoScheduleHasNothingToMakeOneOn() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Database.delete(
        [SELECT Id FROM Schedule__c WHERE Origin__c = 'Manual'],
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      List<Object> answer = sent(
        new AgentMakeLinkedChoice(),
        atMenu(
          menu,
          new Map<String, Object>{
            'activity' => 'Drama',
            'name' => 'Drama',
            'periods' => periods('Monday', 'Period 1')
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'Chugim isn\'t on any schedule, so no linked choice can be made for it. Nothing was changed.',
        answer[1]
      );
    }
  }

  // API-1.133
  @IsTest
  static void anAgentChangesOneThroughTheEditorsSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Id choiceId = made(menu);
      Test.startTest();
      List<Object> answer = sent(
        new AgentChangeLinkedChoice(),
        atMenu(
          menu,
          new Map<String, Object>{
            'name' => 'drama',
            'new_name' => 'Drama double',
            'applies_to' => 'All except',
            'periods_on' => periods('Tuesday', 'Lunch'),
            'periods_off' => periods('Monday', 'Period 1'),
            'divisions_on' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Changed the linked choice "Drama double".', answer[1]);
      LinkedChoice__c choice = saved(choiceId);
      Assert.areEqual('Drama double', choice.Name);
      Assert.areEqual('AllExcept', choice.AppliesTo__c);
      Assert.areEqual(1, choice.Times__r.size());
      Assert.areEqual('Tuesday', choice.Times__r[0].Weekday__c);
      Assert.areEqual(1, choice.Coverages__r.size());
      // A later change of one that names a division the set also sits in.
      Assert.areEqual(
        200,
        sent(
          new AgentChangeLinkedChoice(),
          atMenu(
            menu,
            new Map<String, Object>{
              'name' => 'Drama double',
              'new_name' => 'Drama twice',
              'divisions_off' => new List<Object>{ 'Juniors' }
            }
          )
        )[0]
      );
      Test.stopTest();
      Assert.areEqual(0, saved(choiceId).Coverages__r.size());
    }
  }

  // API-1.132
  @IsTest
  static void whatTwoProgramsShareIsAskedAboutNeverPicked() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Program__c teen = new Program__c(
        Season__c = menu.ids.get('Season'),
        Name = 'Teen'
      );
      Database.insert(teen, AccessLevel.USER_MODE);
      Division__c juniors = new Division__c(
        Program__c = teen.Id,
        Name = 'Juniors'
      );
      TimeBlock__c period = [
        SELECT StartTime__c, EndTime__c
        FROM TimeBlock__c
        WHERE Id = :menu.ids.get('Period 1')
      ];
      TimeBlock__c block = new TimeBlock__c(
        Program__c = teen.Id,
        Name = 'Period 1',
        StartTime__c = period.StartTime__c,
        EndTime__c = period.EndTime__c
      );
      Database.insert(
        new List<SObject>{ juniors, block },
        AccessLevel.USER_MODE
      );
      Test.startTest();
      AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(
        atMenu(menu, new Map<String, Object>())
      );

      AgentLinkedDivisions divisions = new AgentLinkedDivisions(refs);
      List<Division__c> both = [
        SELECT Id, Name, Program__r.Name
        FROM Division__c
        WHERE Name = 'Juniors'
      ];
      Assert.areEqual(2, both.size());
      try {
        divisions.idsOf(new List<Object>{ 'Juniors' }, both);
        Assert.fail('A division two programs share was picked');
      } catch (ShoreshException e) {
        Assert.isTrue(e.getMessage().contains('both have'), e.getMessage());
      }
      Assert.areEqual(
        juniors.Id,
        divisions.idsOf(
          new List<Object>{
            new Map<String, Object>{ 'name' => 'Juniors', 'program' => 'Teen' }
          },
          both
        )[0]
      );

      Set<String> offered = new Set<String>{
        'Monday|' + block.Id,
        'Monday|' + menu.ids.get('Period 1')
      };
      AgentLinkedPeriods periods = new AgentLinkedPeriods(refs);
      List<Object> asked = periods('Monday', 'Period 1');
      try {
        periods.of(asked, offered);
        Assert.fail('A time block two programs share was picked');
      } catch (ShoreshException e) {
        Assert.isTrue(e.getMessage().contains('both have'), e.getMessage());
      }
      // Its own period settles it, when unticking.
      periods.held = new Set<String>{ 'Monday|' + block.Id };
      Assert.areEqual(block.Id, periods.of(asked, offered)[0].blockId);
      Test.stopTest();
    }
  }

  // API-1.133
  @IsTest
  static void anAgentsTickTwiceIsOneTick() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Id choiceId = made(menu);
      Test.startTest();
      for (Integer i = 0; i < 2; i++) {
        Assert.areEqual(
          200,
          sent(
            new AgentChangeLinkedChoice(),
            atMenu(
              menu,
              new Map<String, Object>{
                'name' => 'Drama',
                'periods_on' => periods('Tuesday', 'Period 1')
              }
            )
          )[0]
        );
      }
      // Unticking what is already off is the same as once.
      for (Integer i = 0; i < 2; i++) {
        Assert.areEqual(
          200,
          sent(
            new AgentChangeLinkedChoice(),
            atMenu(
              menu,
              new Map<String, Object>{
                'name' => 'Drama',
                'periods_off' => periods('Tuesday', 'Lunch')
              }
            )
          )[0]
        );
      }
      Test.stopTest();
      Assert.areEqual(2, saved(choiceId).Times__r.size());
    }
  }

  // API-1.133
  @IsTest
  static void aNameTwoShareIsAskedAboutAndDivisionsNeedOnlyThese() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      made(menu);
      Test.startTest();
      // The editor shows no divisions to tick while it applies to All; a blank name is its words.
      List<Object> answer = sent(
        new AgentChangeLinkedChoice(),
        atMenu(
          menu,
          new Map<String, Object>{
            'name' => 'Drama',
            'divisions_on' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('applies to All'));
      answer = sent(
        new AgentChangeLinkedChoice(),
        atMenu(
          menu,
          new Map<String, Object>{ 'name' => 'Drama', 'new_name' => ' ' }
        )
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(
        String.valueOf(answer[1]).startsWith('Give the linked choice a name')
      );
      // A second of one name is saved, as the editor saves it; then which one is asked.
      Assert.areEqual(
        200,
        sent(
          new AgentMakeLinkedChoice(),
          atMenu(
            menu,
            new Map<String, Object>{
              'activity' => 'Drama',
              'name' => 'Drama',
              'periods' => periods('Tuesday', 'Period 1')
            }
          )
        )[0]
      );
      answer = sent(
        new AgentDeleteLinkedChoice(),
        atMenu(menu, new Map<String, Object>{ 'name' => 'Drama' })
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('can\'t tell which'));
      Assert.areEqual(2, [SELECT COUNT() FROM LinkedChoice__c]);
    }
  }

  // API-1.134
  @IsTest
  static void anAgentsDeleteAsksTheScreensQuestionAndTakesItsRows() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Id choiceId = made(menu);
      Map<String, Object> asked = atMenu(
        menu,
        new Map<String, Object>{ 'name' => 'Drama' }
      );
      Test.startTest();
      // The helper refuses a delete that doesn't ask; what it asks is the screen's own.
      Assert.areEqual(
        'Delete "Drama"? A sheet that names it then counts as Drama.',
        SetupDelete.preview(choiceId).message
      );
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(asked));
      Assert.areEqual(
        'Delete "Drama"? A sheet that names it then counts as Drama.',
        new AgentDeleteLinkedChoice().preview()
      );
      List<Object> answer = sent(new AgentDeleteLinkedChoice(), asked);
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Deleted "Drama".', answer[1]);
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoice__c]);
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoiceTime__c]);
    }
  }
}
