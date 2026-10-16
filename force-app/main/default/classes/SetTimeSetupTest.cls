/**
 * Fixed and recurring activities on the setup screens: saving with who and weeks, the rules on a
 * row, copy season, deletes, and the fields slice 3b removed. Every test acts as a scheduler.
 * Camp: see SetTimeTestData.
 */
@IsTest
private class SetTimeSetupTest {
  private static Integer count(String objectName) {
    return Database.countQuery(
      'SELECT COUNT() FROM ' + objectName,
      AccessLevel.SYSTEM_MODE
    );
  }

  /**
   * Flagpole: fixed, Period 1, at the Gym, not in Week 2. Swim: recurring, Group C only,
   * Period 2 on Mondays and Wednesdays, at the Pool, not in Week 3.
   */
  private static List<Id> saveBoth(Map<String, Id> ids) {
    FixedActivity__c flagpole = SetTimeTestData.fixed(
      ids,
      'Flagpole',
      'Period 1'
    );
    flagpole.Location__c = ids.get('Gym');
    RecurringActivity__c swim = SetTimeTestData.recurring(
      ids,
      'Swim',
      'Period 2'
    );
    swim.Wednesday__c = true;
    swim.Location__c = ids.get('Pool');
    List<Id> fixedIds = SetTimeTestData.save(
      new List<SObject>{ flagpole },
      SetTimeTestData.extras(
        new List<RunsIn.WeekOff>{
          SetTimeTestData.weekOff(0, null, ids.get('Week 2'))
        },
        null,
        null
      )
    );
    List<Id> recurringIds = SetTimeTestData.save(
      new List<SObject>{ swim },
      SetTimeTestData.extras(
        new List<RunsIn.WeekOff>{
          SetTimeTestData.weekOff(0, null, ids.get('Week 3'))
        },
        null,
        new List<SetTimeWho.Who>{
          SetTimeTestData.who(0, null, new List<Id>{ ids.get('Group C') })
        }
      )
    );
    return new List<Id>{ fixedIds[0], recurringIds[0] };
  }

  @IsTest
  static void theScreensSaveAndReadFixedAndRecurringActivities() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      // The camp is set up; each screen action below is its own transaction on screen.
      Test.startTest();
      List<Id> saved = saveBoth(ids);
      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        ids.get('Season')
      );
      SeasonSetupReader.ProgramSetup main = setup.programs[0];
      Assert.areEqual(1, main.fixedActivities.size());
      Assert.areEqual('Flagpole', main.fixedActivities[0].Name);
      Assert.areEqual(ids.get('Gym'), main.fixedActivities[0].Location__c);
      Assert.areEqual(1, main.recurringActivities.size());
      RecurringActivity__c swim = main.recurringActivities[0];
      Assert.isTrue(swim.Monday__c && swim.Wednesday__c && !swim.Tuesday__c);
      Assert.areEqual(1, swim.Coverages__r.size());
      Assert.areEqual(ids.get('Group C'), swim.Coverages__r[0].Group__c);
      Set<String> marks = new Set<String>();
      for (WeekException__c mark : setup.weekExceptions) {
        marks.add(
          (mark.FixedActivity__c != null
              ? mark.FixedActivity__c
              : mark.RecurringActivity__c) +
            '|' +
            mark.Week__c
        );
      }
      Assert.isTrue(marks.contains(saved[0] + '|' + ids.get('Week 2')));
      Assert.isTrue(marks.contains(saved[1] + '|' + ids.get('Week 3')));

      // Who changed to Group A, and Week 3 ticked again, in one save.
      WeekException__c week3 = [
        SELECT Id
        FROM WeekException__c
        WHERE RecurringActivity__c = :saved[1]
        WITH SYSTEM_MODE
      ];
      SetTimeTestData.save(
        new List<SObject>(),
        SetTimeTestData.extras(
          null,
          new List<Id>{ week3.Id },
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(
              null,
              saved[1],
              new List<Id>{ ids.get('Group A') }
            )
          }
        )
      );
      Assert.areEqual(
        ids.get('Group A'),
        [SELECT Group__c FROM Coverage__c WITH SYSTEM_MODE].Group__c
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM WeekException__c
          WHERE RecurringActivity__c = :saved[1]
        ]
      );
    }
  }

  @IsTest
  static void aRowNeedsATimeBlockALengthAndADay() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      FixedActivity__c noBlock = SetTimeTestData.fixed(ids, 'Rest', 'Period 1');
      noBlock.TimeBlock__c = null;
      Assert.areEqual(
        '"Rest": Choose when it starts.',
        SetTimeTestData.refusal(new List<SObject>{ noBlock })
      );
      FixedActivity__c noLength = SetTimeTestData.fixed(
        ids,
        'Rest',
        'Period 1'
      );
      noLength.Length__c = 0;
      Assert.areEqual(
        '"Rest": Must be 1 or more.',
        SetTimeTestData.refusal(new List<SObject>{ noLength })
      );
      RecurringActivity__c noDay = SetTimeTestData.recurring(
        ids,
        'Swim',
        'Period 1'
      );
      noDay.Monday__c = false;
      Assert.areEqual(
        '"Swim": Tick at least one day.',
        SetTimeTestData.refusal(new List<SObject>{ noDay })
      );
    }
  }

  @IsTest
  static void everythingStaysInsideItsOwnProgram() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Program__c teens = ShoreshTestData.program(ids.get('Season'), 'Teens');
      TimeBlock__c early = ShoreshTestData.timeBlock(teens.Id, 'Early', 8);
      Division__c division = ShoreshTestData.division(teens.Id, 'Teens');
      FixedActivity__c wrongBlock = SetTimeTestData.fixed(
        ids,
        'Rest',
        'Period 1'
      );
      wrongBlock.TimeBlock__c = early.Id;
      Assert.areEqual(
        '"Rest": This time block belongs to a different program than the fixed activity.',
        SetTimeTestData.refusal(new List<SObject>{ wrongBlock })
      );
      Camp__c other = ShoreshTestData.camp('Camp Oak');
      Season__c otherSeason = ShoreshTestData.season(other.Id, 'Other');
      Location__c far = new Location__c(
        Season__c = otherSeason.Id,
        Name = 'Lake',
        GroupsThatFit__c = 9
      );
      Database.insert(far, AccessLevel.SYSTEM_MODE);
      RecurringActivity__c faraway = SetTimeTestData.recurring(
        ids,
        'Swim',
        'Period 1'
      );
      faraway.Location__c = far.Id;
      Assert.areEqual(
        '"Swim": This location belongs to a different season than the recurring activity.',
        SetTimeTestData.refusal(new List<SObject>{ faraway })
      );
      String message = SetTimeTestData.refusal(
        new List<SObject>{ SetTimeTestData.recurring(ids, 'Swim', 'Period 1') },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(0, null, new List<Id>{ division.Id })
          }
        )
      );
      Assert.areEqual(
        'This division belongs to a different program than the recurring activity.',
        message
      );
      Assert.areEqual(0, count('RecurringActivity__c'));
    }
  }

  @IsTest
  static void copyingASeasonBringsFixedAndRecurringActivitiesWithWhoAndWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      List<Id> saved = saveBoth(ids);
      // The copy runs in a transaction of its own on screen; give it its own limits here too.
      Test.startTest();
      Id copyId = SeasonSetupController.copySeason(
        ids.get('Season'),
        'Summer 2027',
        Date.newInstance(2027, 6, 28)
      );
      Test.stopTest();
      FixedActivity__c flagpole = [
        SELECT
          CopiedFrom__c,
          Program__r.Season__c,
          TimeBlock__r.Name,
          TimeBlock__r.Program__r.Season__c,
          Location__r.Name,
          Location__r.Season__c,
          (SELECT Week__r.Name, Week__r.Season__c FROM WeekExceptions__r)
        FROM FixedActivity__c
        WHERE Program__r.Season__c = :copyId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(saved[0], flagpole.CopiedFrom__c);
      Assert.areEqual('Period 1', flagpole.TimeBlock__r.Name);
      Assert.areEqual(copyId, flagpole.TimeBlock__r.Program__r.Season__c);
      Assert.areEqual('Gym', flagpole.Location__r.Name);
      Assert.areEqual(copyId, flagpole.Location__r.Season__c);
      Assert.areEqual(1, flagpole.WeekExceptions__r.size());
      Assert.areEqual('Week 2', flagpole.WeekExceptions__r[0].Week__r.Name);
      Assert.areEqual(copyId, flagpole.WeekExceptions__r[0].Week__r.Season__c);

      RecurringActivity__c swim = [
        SELECT
          CopiedFrom__c,
          Monday__c,
          Wednesday__c,
          Location__r.Season__c,
          (SELECT Week__r.Name, Week__r.Season__c FROM WeekExceptions__r),
          (
            SELECT
              Season__c,
              Group__r.Name,
              Group__r.Division__r.Program__r.Season__c
            FROM Coverages__r
          )
        FROM RecurringActivity__c
        WHERE Program__r.Season__c = :copyId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(saved[1], swim.CopiedFrom__c);
      Assert.isTrue(swim.Monday__c && swim.Wednesday__c);
      Assert.areEqual(copyId, swim.Location__r.Season__c);
      Assert.areEqual('Week 3', swim.WeekExceptions__r[0].Week__r.Name);
      Assert.areEqual(copyId, swim.WeekExceptions__r[0].Week__r.Season__c);
      Assert.areEqual(1, swim.Coverages__r.size());
      Assert.areEqual(copyId, swim.Coverages__r[0].Season__c);
      Assert.areEqual('Group C', swim.Coverages__r[0].Group__r.Name);
      Assert.areEqual(
        copyId,
        swim.Coverages__r[0].Group__r.Division__r.Program__r.Season__c
      );
      // The original is untouched.
      Assert.areEqual(
        4,
        count('FixedActivity__c') + count('RecurringActivity__c')
      );
      Assert.areEqual(2, count('Coverage__c'));
    }
  }

  @IsTest
  static void deletingAnItemTakesItsOwnWeeksAndWhoWithIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      // The camp is set up; each screen action below is its own transaction on screen.
      Test.startTest();
      List<Id> saved = saveBoth(ids);
      Integer before = count('WeekException__c');
      SeasonSetupController.deleteRecord(saved[0]);
      SeasonSetupController.deleteRecord(saved[1]);
      Assert.areEqual(0, count('FixedActivity__c'));
      Assert.areEqual(0, count('RecurringActivity__c'));
      Assert.areEqual(0, count('Coverage__c'));
      Assert.areEqual(before - 2, count('WeekException__c'));
    }
  }

  @IsTest
  static void deletingWhatAnItemUsesIsRefusedNamingIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      // The camp is set up; each screen action below is its own transaction on screen.
      Test.startTest();
      saveBoth(ids);
      Assert.areEqual(
        'This can\'t be deleted yet: "Flagpole" starts in it. First choose another time ' +
        'block for it, then delete it.',
        SetTimeTestData.deleteRefusal(ids.get('Period 1'))
      );
      Assert.areEqual(
        'This can\'t be deleted yet: "Gym games" happens here, and "Flagpole" happens here. ' +
          'First choose another location for that activity and choose another location for ' +
          'it on the Fixed activities or Recurring activities screen, then delete it.',
        SetTimeTestData.deleteRefusal(ids.get('Gym'))
      );
      Assert.areEqual(
        'This can\'t be deleted yet: it is in who "Swim" covers. Change who it covers on ' +
        'the Recurring activities screen first, then delete it.',
        SetTimeTestData.deleteRefusal(ids.get('Group C'))
      );
      Assert.areEqual(
        'This can\'t be deleted yet: it (or one of its groups) is in who "Swim" covers. ' +
        'Change who it covers on the Recurring activities screen first, then delete it.',
        SetTimeTestData.deleteRefusal(ids.get('Seniors'))
      );
      // Activities' who can do it and the fixed and recurring activities, in one refusal.
      String both = SetTimeTestData.deleteRefusal(ids.get('Main'));
      Assert.isTrue(both.contains('"Who can do it"'), both);
      Assert.isTrue(
        both.contains(' Also, "Flagpole", "Swim" are set in it.'),
        both
      );
      // Remove who can do activities so only the set-time items stand in the way.
      Database.delete(
        [SELECT Id FROM ActivityEligibility__c WITH SYSTEM_MODE],
        true,
        AccessLevel.SYSTEM_MODE
      );
      Assert.areEqual(
        'This can\'t be deleted yet: "Flagpole", "Swim" are set in it. Delete them on the ' +
        'Fixed activities or Recurring activities screen first, then delete this.',
        SetTimeTestData.deleteRefusal(ids.get('Main'))
      );
      Assert.areEqual(1, count('FixedActivity__c'));
      Assert.areEqual(1, count('Group__c WHERE Name = \'Group C\''));
    }
  }

  @IsTest
  static void deletingASeasonDeletesItsFixedAndRecurringActivities() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      // The camp is set up; each screen action below is its own transaction on screen.
      Test.startTest();
      saveBoth(ids);
      SeasonSetupController.deleteRecord(ids.get('Season'));
      Assert.areEqual(0, count('Season__c'));
      Assert.areEqual(0, count('FixedActivity__c'));
      Assert.areEqual(0, count('RecurringActivity__c'));
      Assert.areEqual(0, count('Coverage__c'));
      Assert.areEqual(0, count('WeekException__c'));
    }
  }

  @IsTest
  static void eventsOnlyIsGoneAndTheCampWordsSayActivity() {
    Assert.isFalse(
      Schema.SObjectType.Activity__c.fields.getMap()
        .containsKey('eventonly__c'),
      'Activity events only is removed'
    );
    Assert.isFalse(
      Schema.SObjectType.TimeBlock__c.fields.getMap()
        .containsKey('eventsonly__c'),
      'Time block events only is removed'
    );
    Set<String> terms = new Set<String>();
    for (
      Schema.PicklistEntry entry : CampLabel__c.ModelTerm__c.getDescribe()
        .getPicklistValues()
    ) {
      terms.add(entry.getValue() + '=' + entry.getLabel());
    }
    Assert.isTrue(terms.contains('FixedActivity=Fixed activity'));
    Assert.isTrue(terms.contains('RecurringActivity=Recurring activity'));
    Assert.isFalse(terms.contains('FixedEvent=Fixed event'));
    Assert.isFalse(terms.contains('RecurringEvent=Recurring event'));
    CampLabels labels = CampLabels.modelTermsOnly();
    Assert.areEqual('Fixed activities', labels.plural('FixedActivity'));
    Assert.areEqual('Recurring activities', labels.plural('RecurringActivity'));
  }

  @IsTest
  static void anItemRemembersItsLastTimeBlockUntilKeptAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      FixedActivity__c rest = SetTimeTestData.fixed(ids, 'Rest', 'Period 1');
      rest.Length__c = 2;
      Id restId = SetTimeTestData.save(new List<SObject>{ rest })[0];
      Assert.areEqual(ids.get('Period 2'), lastBlock(restId));
      // Period 2 deleted: Rest now covers Period 1 and Lunch; what was saved is cleared, so the
      // screens say what changed.
      SeasonSetupController.deleteRecord(ids.get('Period 2'));
      Assert.isNull(lastBlock(restId));
      // Keep as it is: the row saved unchanged.
      SetTimeTestData.save(
        new List<SObject>{ new FixedActivity__c(Id = restId) }
      );
      Assert.areEqual(ids.get('Lunch'), lastBlock(restId));
    }
  }

  private static Id lastBlock(Id itemId) {
    return [
      SELECT LastTimeBlock__c
      FROM FixedActivity__c
      WHERE Id = :itemId
      WITH SYSTEM_MODE
    ]
    .LastTimeBlock__c;
  }
}
