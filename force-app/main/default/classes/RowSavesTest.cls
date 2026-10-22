@IsTest
private class RowSavesTest {
  private static Map<String, Id> ids;

  // The camp is built once for the class (setup) and read back in each test (camp()).
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> built;
    System.runAs(scheduler) {
      built = SetTimeTestData.camp();
    }
    built.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(built);
  }

  /** The camp setup built. */
  private static Map<String, Id> camp() {
    ids = KeptCamp.keptIds();
    return ids;
  }

  /** The scheduler setup built the camp as. */
  private static User scheduler(Map<String, Id> kept) {
    return new User(Id = kept.get('Scheduler'));
  }

  /** A camp of its own, made by whoever runs the test. */
  private static Map<String, Id> build() {
    ids = SetTimeTestData.camp();
    return ids;
  }

  private static Location__c pool() {
    return [
      SELECT Name, GroupsThatFit__c, Notes__c
      FROM Location__c
      WHERE Id = :ids.get('Pool')
      WITH SYSTEM_MODE
    ];
  }

  /** Someone else's save, straight to the record. */
  private static void theyChange(SObject record) {
    Database.update(record, AccessLevel.SYSTEM_MODE);
  }

  private static RowSaves.Result save(SObject record, SObject seen) {
    return SetupTablesController.saveRow(record, seen, null);
  }

  private static Activity__c swim() {
    return [
      SELECT Name, Length__c, Priority__c
      FROM Activity__c
      WHERE Id = :ids.get('Swim')
      WITH SYSTEM_MODE
    ];
  }

  /**
   * An activity's details beside the Activities table (ADR 0015 choice 12) send one field at a
   * time, with its name in `seen` (for "was deleted by someone else"): someone else's change to
   * that field is not overwritten, and a rename they made is no question, since the name is not
   * being saved.
   */
  @IsTest
  static void anActivityDetailsFieldIsComparedAndSet() {
    camp();
    System.runAs(scheduler(ids)) {
      Id swimId = ids.get('Swim');
      theyChange(
        new Activity__c(Id = swimId, Length__c = 2, Name = 'Swimming')
      );
      RowSaves.Result result = save(
        new Activity__c(Id = swimId, Length__c = 3),
        new Activity__c(Name = 'Swim', Length__c = 1)
      );
      Assert.isNull(result.id);
      Assert.areEqual(
        new List<String>{ ShoreshTestData.packagedName(Activity__c.Length__c) },
        result.changed
      );
      Assert.areEqual(2, result.theirs.get(Activity__c.Length__c));
      Assert.areEqual(2, swim().Length__c);

      // Another field, seen as it is now: saved, and their rename stays.
      result = save(
        new Activity__c(Id = swimId, Priority__c = 'High'),
        new Activity__c(Name = 'Swim', Priority__c = 'Low')
      );
      Assert.areEqual(swimId, result.id);
      Assert.areEqual('High', swim().Priority__c);
      Assert.areEqual('Swimming', swim().Name);
    }
  }

  @IsTest
  static void aNewRowIsSavedWithNothingToCompare() {
    camp();
    System.runAs(scheduler(ids)) {
      RowSaves.Result result = save(
        new Location__c(
          Season__c = ids.get('Season'),
          Name = 'Lake',
          GroupsThatFit__c = 2
        ),
        null
      );
      Assert.isNotNull(result.id);
      Assert.isTrue(result.changed.isEmpty());
      Assert.areEqual(
        'Lake',
        [SELECT Name FROM Location__c WHERE Id = :result.id WITH SYSTEM_MODE]
        .Name
      );
    }
  }

  @IsTest
  static void aChangeIsSavedWhenTheRowIsAsTheDirectorSawIt() {
    camp();
    System.runAs(scheduler(ids)) {
      RowSaves.Result result = save(
        new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 2),
        new Location__c(GroupsThatFit__c = 1)
      );
      Assert.areEqual(ids.get('Pool'), result.id);
      Assert.areEqual(2, pool().GroupsThatFit__c);
    }
  }

  @IsTest
  static void aFieldSomeoneElseChangedIsNotOverwritten() {
    camp();
    System.runAs(scheduler(ids)) {
      theyChange(new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 4));
      RowSaves.Result result = save(
        new Location__c(
          Id = ids.get('Pool'),
          GroupsThatFit__c = 2,
          Notes__c = 'Lifeguard'
        ),
        new Location__c(GroupsThatFit__c = 1, Notes__c = null)
      );
      Assert.isNull(result.id);
      Assert.areEqual(
        new List<String>{
          ShoreshTestData.packagedName(Location__c.GroupsThatFit__c)
        },
        result.changed
      );
      Assert.areEqual(4, result.theirs.get(Location__c.GroupsThatFit__c));
      // Nothing of the row is saved, the change nobody else touched included.
      Assert.areEqual(4, pool().GroupsThatFit__c);
      Assert.isNull(pool().Notes__c);

      // Use yours: the same change, naming what is there now.
      result = save(
        new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 2),
        new Location__c(GroupsThatFit__c = 4)
      );
      Assert.areEqual(ids.get('Pool'), result.id);
      Assert.areEqual(2, pool().GroupsThatFit__c);
    }
  }

  @IsTest
  static void someoneElsesChangeToAnotherFieldStays() {
    camp();
    System.runAs(scheduler(ids)) {
      theyChange(new Location__c(Id = ids.get('Pool'), Notes__c = 'Theirs'));
      RowSaves.Result result = save(
        new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 2),
        new Location__c(GroupsThatFit__c = 1)
      );
      Assert.areEqual(ids.get('Pool'), result.id);
      Assert.areEqual(2, pool().GroupsThatFit__c);
      Assert.areEqual('Theirs', pool().Notes__c);
    }
  }

  @IsTest
  static void theSameChangeMadeByBothIsNoConflict() {
    camp();
    System.runAs(scheduler(ids)) {
      theyChange(new Location__c(Id = ids.get('Pool'), Name = 'Big pool'));
      RowSaves.Result result = save(
        new Location__c(Id = ids.get('Pool'), Name = 'Big pool'),
        new Location__c(Name = 'Pool')
      );
      Assert.areEqual(ids.get('Pool'), result.id);
    }
  }

  @IsTest
  static void textIsComparedExactly() {
    camp();
    System.runAs(scheduler(ids)) {
      theyChange(new Location__c(Id = ids.get('Pool'), Name = 'pool'));
      RowSaves.Result result = save(
        new Location__c(Id = ids.get('Pool'), Name = 'Pool 1'),
        new Location__c(Name = 'Pool')
      );
      Assert.isNull(result.id);
      Assert.areEqual('pool', result.theirs.get('Name'));
      Assert.areEqual('pool', pool().Name);
      Assert.isTrue(RowSeen.same(null, ''));
      Assert.isTrue(RowSeen.same(1, 1.0));
      Assert.isFalse(RowSeen.same('A', 'a'));
      Assert.isFalse(RowSeen.same(null, 0));
    }
  }

  @IsTest
  static void aRowSomeoneElseDeletedSaysSo() {
    camp();
    System.runAs(scheduler(ids)) {
      Id lake = save(
          new Location__c(
            Season__c = ids.get('Season'),
            Name = 'Lake',
            GroupsThatFit__c = 2
          ),
          null
        )
        .id;
      Database.delete(lake, AccessLevel.SYSTEM_MODE);
      try {
        save(
          new Location__c(Id = lake, GroupsThatFit__c = 3),
          new Location__c(GroupsThatFit__c = 2, Name = 'Lake')
        );
        Assert.fail('A deleted row is not saved');
      } catch (AuraHandledException e) {
        Assert.areEqual('"Lake" was deleted by someone else.', e.getMessage());
      }
    }
  }

  @IsTest
  static void whoARecurringActivityCoversIsCheckedToo() {
    camp();
    System.runAs(scheduler(ids)) {
      Id swim = SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.recurring(ids, 'Bunk swim', 'Period 1')
        }
      )[0];
      // Someone else chose Group B.
      SetTimeTestData.save(
        new List<SObject>{ new RecurringActivity__c(Id = swim) },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(null, swim, new List<Id>{ ids.get('Group B') })
          }
        )
      );
      ScreenSaves.Extras mine = SetTimeTestData.extras(
        null,
        null,
        new List<SetTimeWho.Who>{
          SetTimeTestData.who(null, swim, new List<Id>{ ids.get('Group A') })
        }
      );
      mine.seenWho = new List<Id>();
      RowSaves.Result result = SetupTablesController.saveRow(
        new RecurringActivity__c(Id = swim),
        null,
        mine
      );
      Assert.isNull(result.id);
      Assert.areEqual(new List<Id>{ ids.get('Group B') }, result.theirWho);

      // Use yours.
      mine.seenWho = result.theirWho;
      result = SetupTablesController.saveRow(
        new RecurringActivity__c(Id = swim),
        null,
        mine
      );
      Assert.areEqual(swim, result.id);
      Assert.areEqual(
        ids.get('Group A'),
        [
          SELECT Group__c
          FROM Coverage__c
          WHERE RecurringActivity__c = :swim
          WITH SYSTEM_MODE
        ]
        .Group__c
      );
    }
  }

  @IsTest
  static void aRefusedRowSaveNamesTheRowAndSavesNothing() {
    camp();
    System.runAs(scheduler(ids)) {
      try {
        save(
          new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 0),
          new Location__c(GroupsThatFit__c = 1)
        );
        Assert.fail('Refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().startsWith('"Pool"'), e.getMessage());
      }
      Assert.areEqual(1, pool().GroupsThatFit__c);
    }
  }

  @IsTest
  static void fieldsTheScreensDontSaveAreNeitherComparedNorRead() {
    camp();
    System.runAs(scheduler(ids)) {
      try {
        save(
          new Location__c(Id = ids.get('Pool'), Season__c = ids.get('Season')),
          new Location__c(Season__c = null)
        );
        Assert.fail('Refused');
      } catch (AuraHandledException e) {
        Assert.areEqual('These screens can\'t change that.', e.getMessage());
      }
    }
  }

  @IsTest
  static void whoTheSameAsTheDirectorChoseIsNoConflict() {
    camp();
    System.runAs(scheduler(ids)) {
      Id swim = SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.recurring(ids, 'Bunk swim', 'Period 1')
        }
      )[0];
      ScreenSaves.Extras groupA = SetTimeTestData.extras(
        null,
        null,
        new List<SetTimeWho.Who>{
          SetTimeTestData.who(null, swim, new List<Id>{ ids.get('Group A') })
        }
      );
      // Someone else already chose Group A.
      SetTimeTestData.save(
        new List<SObject>{ new RecurringActivity__c(Id = swim) },
        groupA
      );
      groupA.seenWho = new List<Id>();
      RowSaves.Result result = SetupTablesController.saveRow(
        new RecurringActivity__c(Id = swim),
        null,
        groupA
      );
      Assert.areEqual(swim, result.id);
    }
  }

  @IsTest
  static void weekTicksAndWhoAreForTheSavedRowOnly() {
    camp();
    System.runAs(scheduler(ids)) {
      Id swim = SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.recurring(ids, 'Bunk swim', 'Period 1')
        }
      )[0];
      WeekException__c gymOff = new WeekException__c(
        Week__c = ids.get('Week 2'),
        Location__c = ids.get('Gym')
      );
      Database.insert(gymOff, AccessLevel.SYSTEM_MODE);
      List<ScreenSaves.Extras> refused = new List<ScreenSaves.Extras>{
        // Another row's who.
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(null, swim, new List<Id>{ ids.get('Group A') })
          }
        ),
        // Another row's week off.
        SetTimeTestData.extras(
          new List<RunsIn.WeekOff>{
            SetTimeTestData.weekOff(null, swim, ids.get('Week 1'))
          },
          null,
          null
        ),
        // Another row's week ticked again.
        SetTimeTestData.extras(null, new List<Id>{ gymOff.Id }, null)
      };
      for (ScreenSaves.Extras extras : refused) {
        try {
          SetupTablesController.saveRow(
            new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 2),
            new Location__c(GroupsThatFit__c = 1),
            extras
          );
          Assert.fail('Refused: ' + extras);
        } catch (AuraHandledException e) {
          Assert.areEqual('These screens can\'t save that.', e.getMessage());
        }
      }
      Assert.areEqual(1, pool().GroupsThatFit__c);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM WeekException__c
          WHERE Id = :gymOff.Id
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  /** Every setup table saves through SetupTablesController: the scheduler must be able to call it. */
  @IsTest
  static void theSchedulerPermissionSetCanSaveRows() {
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM SetupEntityAccess
        WHERE
          Parent.Name = 'Shoresh_Scheduler'
          AND SetupEntityId IN (
            SELECT Id
            FROM ApexClass
            WHERE Name = 'SetupTablesController'
          )
      ]
    );
  }

  @IsTest
  static void someoneWithoutAccessCannotSaveARow() {
    build();
    System.runAs(ShoreshTestData.outsider()) {
      try {
        save(
          new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 2),
          new Location__c(GroupsThatFit__c = 1)
        );
        Assert.fail('Refused');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
    Assert.areEqual(1, pool().GroupsThatFit__c);
  }
}
