/**
 * Import last year (slice 4b): saving the setup the director reviewed. Every test acts as a
 * scheduler. Plans are built the way the import screen builds them (c/shoreshImportEngine
 * planFor): new records point at each other by key, existing ones by Id. Synthetic data only.
 */
@IsTest
private class ImportSetupSavesTest {
  private static final List<String> WEEK = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  };

  private static Map<String, Object> entry(List<Object> pairs) {
    Map<String, Object> result = new Map<String, Object>();
    for (Integer i = 0; i < pairs.size(); i += 2) {
      result.put((String) pairs[i], pairs[i + 1]);
    }
    return result;
  }

  private static Map<String, Object> emptyPlan(Id seasonId) {
    Map<String, Object> plan = new Map<String, Object>{
      'seasonId' => seasonId
    };
    for (
      String name : new List<String>{
        'programs',
        'timeBlocks',
        'divisions',
        'groups',
        'locations',
        'activities',
        'fixedActivities',
        'recurringActivities'
      }
    ) {
      plan.put(name, new List<Object>());
    }
    return plan;
  }

  private static void add(Map<String, Object> plan, String name, Object value) {
    ((List<Object>) plan.get(name)).add(value);
  }

  /** A new camp's week: Main, three blocks, Juniors and Seniors with two bunks each. */
  private static Map<String, Object> newCampPlan(Id seasonId) {
    Map<String, Object> plan = emptyPlan(seasonId);
    add(
      plan,
      'programs',
      entry(
        new List<Object>{
          'key',
          'P0',
          'name',
          'Main',
          'days',
          WEEK,
          'sortOrder',
          1
        }
      )
    );
    List<List<String>> blocks = new List<List<String>>{
      new List<String>{ 'Period 1', '09:00', '09:45', 'Morning' },
      new List<String>{ 'Lunch', '12:00', '12:45', 'Afternoon' },
      new List<String>{ 'Period 2', '13:00', '13:45', 'Afternoon' }
    };
    for (Integer i = 0; i < blocks.size(); i++) {
      add(
        plan,
        'timeBlocks',
        entry(
          new List<Object>{
            'key',
            'B|P0|' + i,
            'programKey',
            'P0',
            'name',
            blocks[i][0],
            'start',
            blocks[i][1],
            'end',
            blocks[i][2],
            'partOfDay',
            blocks[i][3],
            'sortOrder',
            i + 1
          }
        )
      );
    }
    add(
      plan,
      'divisions',
      entry(
        new List<Object>{
          'key',
          'D|P0|Juniors',
          'programKey',
          'P0',
          'name',
          'Juniors',
          'sortOrder',
          1
        }
      )
    );
    add(
      plan,
      'divisions',
      entry(
        new List<Object>{
          'key',
          'D|P0|Seniors',
          'programKey',
          'P0',
          'name',
          'Seniors',
          'sortOrder',
          2
        }
      )
    );
    for (Integer i = 1; i <= 4; i++) {
      String division = i <= 2 ? 'D|P0|Juniors' : 'D|P0|Seniors';
      add(
        plan,
        'groups',
        entry(
          new List<Object>{
            'key',
            'G|Bunk ' + i,
            'divisionKey',
            division,
            'name',
            'Bunk ' + i,
            'sortOrder',
            i
          }
        )
      );
    }
    add(
      plan,
      'locations',
      entry(
        new List<Object>{
          'key',
          'L|Dining hall',
          'name',
          'Dining hall',
          'groupsThatFit',
          4
        }
      )
    );
    add(
      plan,
      'activities',
      entry(
        new List<Object>{
          'key',
          'A|Swim',
          'name',
          'Swim',
          'length',
          1,
          'min',
          1,
          'max',
          2,
          'groupsAtOnce',
          2,
          'who',
          new List<Object>(),
          'sortOrder',
          1
        }
      )
    );
    add(
      plan,
      'activities',
      entry(
        new List<Object>{
          'key',
          'A|Boating',
          'name',
          'Boating',
          'length',
          2,
          'min',
          1,
          'max',
          1,
          'groupsAtOnce',
          1,
          'who',
          new List<Object>{ 'D|P0|Seniors' },
          'sortOrder',
          2
        }
      )
    );
    add(
      plan,
      'fixedActivities',
      entry(
        new List<Object>{
          'programKey',
          'P0',
          'name',
          'Lunch',
          'blockKey',
          'B|P0|1',
          'length',
          1,
          'locationKey',
          'L|Dining hall'
        }
      )
    );
    add(
      plan,
      'recurringActivities',
      entry(
        new List<Object>{
          'programKey',
          'P0',
          'name',
          'Library time',
          'blockKey',
          'B|P0|2',
          'length',
          1,
          'days',
          new List<Object>{ 'Wednesday' },
          'who',
          new List<Object>{ 'D|P0|Juniors' }
        }
      )
    );
    return plan;
  }

  @IsTest
  static void aNewCampsSetupIsAddedAllAtOnce() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(newCampPlan(season.Id))
      );
      Test.stopTest();

      Assert.areEqual(1, result.added.get('Program'));
      Assert.areEqual(3, result.added.get('TimeBlock'));
      Assert.areEqual(2, result.added.get('Division'));
      Assert.areEqual(4, result.added.get('Group'));
      Assert.areEqual(2, result.added.get('Activity'));
      Assert.areEqual(1, result.added.get('FixedActivity'));
      Assert.areEqual(1, result.added.get('RecurringActivity'));
      Assert.isTrue(result.changed.isEmpty());

      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        season.Id
      );
      SeasonSetupReader.ProgramSetup main = setup.programs[0];
      Assert.areEqual('Main', main.program.Name);
      Assert.isTrue(main.program.Monday__c && main.program.Friday__c);
      Assert.areEqual(3, main.timeBlocks.size());
      Assert.areEqual(
        Time.newInstance(12, 0, 0, 0),
        main.timeBlocks[1].StartTime__c
      );
      Assert.areEqual('Afternoon', main.timeBlocks[1].PartOfDay__c);
      Assert.areEqual(2, main.divisions.size());
      Assert.areEqual('AllDay', main.divisions[0].groups[0].Availability__c);
      Assert.areEqual('Lunch', main.fixedActivities[0].Name);
      Assert.areEqual(
        main.timeBlocks[1].Id,
        main.fixedActivities[0].TimeBlock__c
      );
      Assert.areEqual(
        setup.locations[0].Id,
        main.fixedActivities[0].Location__c
      );
      RecurringActivity__c library = main.recurringActivities[0];
      Assert.isTrue(library.Wednesday__c && !library.Monday__c);
      Assert.areEqual(1, library.Coverages__r.size());
      Assert.areEqual(
        main.divisions[0].division.Id,
        library.Coverages__r[0].Division__c
      );
      Activity__c boating = setup.activities[1];
      Assert.areEqual('Boating', boating.Name);
      Assert.areEqual(2, boating.Length__c);
      Assert.areEqual(
        'Low',
        boating.Priority__c,
        'priority is not in the file: the field keeps its default, Low'
      );
      Assert.areEqual(
        main.divisions[1].division.Id,
        boating.Eligibilities__r[0].Division__c
      );
      Assert.areEqual(
        0,
        setup.activities[0].Eligibilities__r.size(),
        'Swim is open to everyone'
      );
    }
  }

  @IsTest
  static void onlyWhatTheDirectorChoseChangesInAnExistingSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      SeasonSetupReader.SeasonSetup before = SeasonSetupController.getSeasonSetup(
        season.Id
      );
      SeasonSetupReader.ProgramSetup main = before.programs[0];
      Id juniors = main.divisions[0].division.Id;
      Id period1 = main.timeBlocks[0].Id;
      Map<String, Object> plan = emptyPlan(season.Id);
      add(
        plan,
        'programs',
        entry(
          new List<Object>{
            'key',
            main.program.Id,
            'id',
            main.program.Id,
            'days',
            WEEK
          }
        )
      );
      add(
        plan,
        'timeBlocks',
        entry(
          new List<Object>{
            'key',
            period1,
            'id',
            period1,
            'start',
            '09:00',
            'end',
            '09:50',
            'partOfDay',
            'Morning'
          }
        )
      );
      add(
        plan,
        'groups',
        entry(
          new List<Object>{
            'key',
            'G|Group C',
            'divisionKey',
            juniors,
            'name',
            'Group C',
            'sortOrder',
            3
          }
        )
      );
      add(
        plan,
        'activities',
        entry(
          new List<Object>{
            'key',
            'A|Archery',
            'name',
            'Archery',
            'length',
            1,
            'min',
            0,
            'max',
            1,
            'groupsAtOnce',
            1,
            'who',
            new List<Object>(),
            'sortOrder',
            1
          }
        )
      );
      add(
        plan,
        'fixedActivities',
        entry(
          new List<Object>{
            'programKey',
            main.program.Id,
            'name',
            'Flag',
            'blockKey',
            period1,
            'length',
            1
          }
        )
      );
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Test.stopTest();

      Assert.areEqual(1, result.changed.get('Program'));
      Assert.areEqual(1, result.changed.get('TimeBlock'));
      Assert.areEqual(1, result.added.get('Group'));
      SeasonSetupReader.SeasonSetup after = SeasonSetupController.getSeasonSetup(
        season.Id
      );
      SeasonSetupReader.ProgramSetup changed = after.programs[0];
      Assert.isTrue(changed.program.Friday__c, 'Friday added as chosen');
      Assert.areEqual('Main', changed.program.Name, 'the name is untouched');
      Assert.areEqual(
        Time.newInstance(9, 50, 0, 0),
        changed.timeBlocks[0].EndTime__c
      );
      Assert.areEqual(
        'Period 1',
        changed.timeBlocks[0].Name,
        'the name is untouched'
      );
      Assert.areEqual(3, changed.divisions[0].groups.size());
      Assert.areEqual(2, changed.timeBlocks.size(), 'no block added');
    }
  }

  @IsTest
  static void aRecordFromAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c other = ShoreshTestData.fullSeason(camp.Id);
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Id otherDivision = [
        SELECT Id
        FROM Division__c
        WHERE Program__r.Season__c = :other.Id
        LIMIT 1
      ]
      .Id;
      Map<String, Object> plan = emptyPlan(season.Id);
      add(
        plan,
        'groups',
        entry(
          new List<Object>{
            'key',
            'G|Bunk 9',
            'divisionKey',
            otherDivision,
            'name',
            'Bunk 9',
            'sortOrder',
            1
          }
        )
      );
      try {
        ImportController.saveSetup(JSON.serialize(plan));
        Assert.fail('a division in another season must be refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('not in this season'),
          e.getMessage()
        );
      }
      Assert.areEqual(0, [SELECT COUNT() FROM Group__c WHERE Name = 'Bunk 9']);
    }
  }

  @IsTest
  static void aClashUndoesTheWholeImport() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Map<String, Object> plan = newCampPlan(season.Id);
      // A second fixed activity in Lunch's block: every group would be in two places at once.
      add(
        plan,
        'fixedActivities',
        entry(
          new List<Object>{
            'programKey',
            'P0',
            'name',
            'Rest',
            'blockKey',
            'B|P0|1',
            'length',
            1
          }
        )
      );
      try {
        ImportController.saveSetup(JSON.serialize(plan));
        Assert.fail('a clash must be refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('Lunch') || e.getMessage().contains('Rest'),
          e.getMessage()
        );
      }
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Program__c WHERE Season__c = :season.Id],
        'nothing is kept'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Season__c = :season.Id]
      );
    }
  }

  @IsTest
  static void someoneWithoutShoreshAccessCannotImport() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
    System.runAs(ShoreshTestData.outsider()) {
      try {
        ImportController.saveSetup(JSON.serialize(newCampPlan(season.Id)));
        Assert.fail('an outsider must be refused');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Program__c WHERE Season__c = :season.Id]
    );
  }

  @IsTest
  static void aPlanThatCannotBeReadSaysSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      try {
        ImportController.saveSetup('not a plan');
        Assert.fail('must refuse');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'The import could not be read. Start it again.',
          e.getMessage()
        );
      }
    }
  }

  /** A large camp: 40 groups in 8 divisions, 14 time blocks, 60 activities, 10 recurring. */
  @IsTest
  static void aLargeCampFitsInOneSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Big Pines (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Map<String, Object> plan = emptyPlan(season.Id);
      add(
        plan,
        'programs',
        entry(
          new List<Object>{
            'key',
            'P0',
            'name',
            'Main',
            'days',
            WEEK,
            'sortOrder',
            1
          }
        )
      );
      for (Integer b = 0; b < 14; b++) {
        Integer start = 8 * 60 + b * 35;
        String startText =
          String.valueOf(start / 60).leftPad(2, '0') +
          ':' +
          String.valueOf(Math.mod(start, 60)).leftPad(2, '0');
        String endText =
          String.valueOf((start + 30) / 60).leftPad(2, '0') +
          ':' +
          String.valueOf(Math.mod(start + 30, 60)).leftPad(2, '0');
        add(
          plan,
          'timeBlocks',
          entry(
            new List<Object>{
              'key',
              'B|' + b,
              'programKey',
              'P0',
              'name',
              'Period ' + (b + 1),
              'start',
              startText,
              'end',
              endText,
              'partOfDay',
              start < 720 ? 'Morning' : 'Afternoon',
              'sortOrder',
              b + 1
            }
          )
        );
      }
      for (Integer d = 0; d < 8; d++) {
        add(
          plan,
          'divisions',
          entry(
            new List<Object>{
              'key',
              'D|' + d,
              'programKey',
              'P0',
              'name',
              'Division ' + d,
              'sortOrder',
              d + 1
            }
          )
        );
        for (Integer g = 0; g < 5; g++) {
          add(
            plan,
            'groups',
            entry(
              new List<Object>{
                'key',
                'G|' +
                d +
                '-' +
                g,
                'divisionKey',
                'D|' + d,
                'name',
                'Bunk ' +
                d +
                '-' +
                g,
                'sortOrder',
                d * 5 +
                g +
                1
              }
            )
          );
        }
      }
      for (Integer a = 0; a < 60; a++) {
        add(
          plan,
          'activities',
          entry(
            new List<Object>{
              'key',
              'A|' + a,
              'name',
              'Activity ' + a,
              'length',
              1,
              'min',
              0,
              'max',
              3,
              'groupsAtOnce',
              2,
              'who',
              new List<Object>{ 'D|' + Math.mod(a, 8) },
              'sortOrder',
              a + 1
            }
          )
        );
      }
      for (Integer r = 0; r < 8; r++) {
        add(
          plan,
          'recurringActivities',
          entry(
            new List<Object>{
              'programKey',
              'P0',
              'name',
              'Assembly ' + r,
              'blockKey',
              'B|0',
              'length',
              1,
              'days',
              new List<Object>{ 'Monday' },
              'who',
              new List<Object>{ 'D|' + r }
            }
          )
        );
      }
      add(
        plan,
        'fixedActivities',
        entry(
          new List<Object>{
            'programKey',
            'P0',
            'name',
            'Lunch',
            'blockKey',
            'B|7',
            'length',
            1
          }
        )
      );
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Integer queries = Limits.getQueries();
      Integer dml = Limits.getDmlStatements();
      Integer cpu = Limits.getCpuTime();
      Test.stopTest();

      Assert.areEqual(40, result.added.get('Group'));
      Assert.areEqual(60, result.added.get('Activity'));
      Assert.areEqual(8, result.added.get('RecurringActivity'));
      Assert.isTrue(queries < 60, 'queries: ' + queries);
      Assert.isTrue(dml < 60, 'DML statements: ' + dml);
      Assert.isTrue(cpu < 8000, 'CPU ms: ' + cpu);
    }
  }

  private static void assertRefused(Map<String, Object> plan) {
    try {
      ImportController.saveSetup(JSON.serialize(plan));
      Assert.fail('a record from another season must be refused');
    } catch (AuraHandledException e) {
      Assert.isTrue(
        e.getMessage().contains('not in this season'),
        e.getMessage()
      );
    }
  }

  @IsTest
  static void changingARecordInAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c other = ShoreshTestData.fullSeason(camp.Id);
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      TimeBlock__c block = [
        SELECT Id, EndTime__c
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :other.Id
        LIMIT 1
      ];
      Map<String, Object> plan = emptyPlan(season.Id);
      add(
        plan,
        'timeBlocks',
        entry(
          new List<Object>{
            'key',
            block.Id,
            'id',
            block.Id,
            'start',
            '08:00',
            'end',
            '08:30'
          }
        )
      );
      assertRefused(plan);
      Assert.areEqual(
        block.EndTime__c,
        [SELECT EndTime__c FROM TimeBlock__c WHERE Id = :block.Id].EndTime__c
      );
    }
  }

  @IsTest
  static void whoNamingAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c other = ShoreshTestData.fullSeason(camp.Id);
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Id otherDivision = [
        SELECT Id
        FROM Division__c
        WHERE Program__r.Season__c = :other.Id
        LIMIT 1
      ]
      .Id;
      Map<String, Object> plan = emptyPlan(season.Id);
      add(
        plan,
        'activities',
        entry(
          new List<Object>{
            'key',
            'A|Archery',
            'name',
            'Archery',
            'length',
            1,
            'min',
            0,
            'max',
            1,
            'groupsAtOnce',
            1,
            'who',
            new List<Object>{ otherDivision },
            'sortOrder',
            1
          }
        )
      );
      assertRefused(plan);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Season__c = :season.Id]
      );
    }
  }

  @IsTest
  static void aGroupMovesToAnotherDivisionOfItsProgram() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Program__c main = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
        LIMIT 1
      ];
      Division__c seniors = ShoreshTestData.division(main.Id, 'Seniors');
      Group__c groupA = [
        SELECT Id, Division__c
        FROM Group__c
        WHERE Name = 'Group A'
        LIMIT 1
      ];
      Map<String, Object> plan = emptyPlan(season.Id);
      add(
        plan,
        'groups',
        entry(
          new List<Object>{
            'key',
            groupA.Id,
            'id',
            groupA.Id,
            'divisionKey',
            seniors.Id
          }
        )
      );
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Test.stopTest();
      Assert.areEqual(1, result.changed.get('Group'));
      Assert.areEqual(
        seniors.Id,
        [SELECT Division__c FROM Group__c WHERE Id = :groupA.Id].Division__c
      );
    }
  }

  @IsTest
  static void aGroupCannotMoveToAnotherProgram() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Program__c other = ShoreshTestData.program(season.Id, 'Afternoons');
      Division__c elsewhere = ShoreshTestData.division(other.Id, 'Seniors');
      Group__c groupA = [
        SELECT Id
        FROM Group__c
        WHERE Name = 'Group A'
        LIMIT 1
      ];
      try {
        Database.update(
          new Group__c(Id = groupA.Id, Division__c = elsewhere.Id),
          AccessLevel.USER_MODE
        );
        Assert.fail('a move to another program must be refused');
      } catch (DmlException e) {
        Assert.isTrue(
          e.getMessage()
            .contains('can move only to another division of their own program'),
          e.getMessage()
        );
      }
    }
  }

  /**
   * Group A has Morning circle (for Group A) at Period 1 on Mondays; Seniors have Assembly then.
   * Moving Group A into Seniors would put it in both at once: refused.
   */
  @IsTest
  static void aMoveThatMakesAClashIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Program__c main = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
        LIMIT 1
      ];
      Division__c seniors = ShoreshTestData.division(main.Id, 'Seniors');
      ShoreshTestData.groupIn(seniors.Id, 'Group C');
      Group__c groupA = [
        SELECT Id, Division__c
        FROM Group__c
        WHERE Name = 'Group A'
        LIMIT 1
      ];
      TimeBlock__c period1 = [
        SELECT Id
        FROM TimeBlock__c
        WHERE Program__c = :main.Id AND Name = 'Period 1'
      ];
      RecurringActivity__c circle = new RecurringActivity__c(
        Program__c = main.Id,
        Name = 'Morning circle',
        TimeBlock__c = period1.Id,
        Length__c = 1,
        Monday__c = true
      );
      RecurringActivity__c assembly = new RecurringActivity__c(
        Program__c = main.Id,
        Name = 'Assembly',
        TimeBlock__c = period1.Id,
        Length__c = 1,
        Monday__c = true
      );
      SetTimeGuard.defer();
      Database.insert(
        new List<SObject>{ circle, assembly },
        AccessLevel.SYSTEM_MODE
      );
      Database.insert(
        new List<SObject>{
          new Coverage__c(
            Season__c = season.Id,
            RecurringActivity__c = circle.Id,
            Group__c = groupA.Id
          ),
          new Coverage__c(
            Season__c = season.Id,
            RecurringActivity__c = assembly.Id,
            Division__c = seniors.Id
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      SetTimeGuard.checkPending();
      SetTimeGuard.resume();
      try {
        Database.update(
          new Group__c(Id = groupA.Id, Division__c = seniors.Id),
          AccessLevel.USER_MODE
        );
        Assert.fail(
          'a move that puts a group in two places at once must be refused'
        );
      } catch (DmlException e) {
        Assert.isTrue(
          e.getMessage().contains('Morning circle') ||
          e.getMessage().contains('Assembly'),
          e.getMessage()
        );
      }
      Assert.areEqual(
        groupA.Division__c,
        [SELECT Division__c FROM Group__c WHERE Id = :groupA.Id].Division__c
      );
    }
  }

  /** A bulk update moving 150 groups into another program: each refused, within the limits. */
  @IsTest
  static void manyMovesToAnotherProgramAreRefusedWithinLimits() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Big Pines (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Program__c first = ShoreshTestData.program(season.Id, 'Mornings');
      Program__c second = ShoreshTestData.program(season.Id, 'Afternoons');
      Division__c origin = ShoreshTestData.division(first.Id, 'Juniors');
      Division__c elsewhere = ShoreshTestData.division(second.Id, 'Juniors');
      List<Group__c> groups = new List<Group__c>();
      for (Integer i = 0; i < 150; i++) {
        groups.add(
          new Group__c(
            Division__c = origin.Id,
            Name = 'Bunk ' + i,
            Availability__c = 'AllDay',
            SortOrder__c = i
          )
        );
      }
      Database.insert(groups, AccessLevel.SYSTEM_MODE);
      for (Group__c grp : groups) {
        grp.Division__c = elsewhere.Id;
      }
      Test.startTest();
      List<Database.SaveResult> results = Database.update(
        groups,
        false,
        AccessLevel.USER_MODE
      );
      Integer queries = Limits.getQueries();
      Test.stopTest();
      for (Database.SaveResult result : results) {
        Assert.isFalse(result.isSuccess());
      }
      Assert.isTrue(queries < 20, 'queries: ' + queries);
      Assert.areEqual(
        150,
        [SELECT COUNT() FROM Group__c WHERE Division__c = :origin.Id]
      );
    }
  }
}
