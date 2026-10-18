@IsTest
private class RowSavesTest {
  private static Map<String, Id> ids;

  private static Map<String, Id> camp() {
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

  @IsTest
  static void aNewRowIsSavedWithNothingToCompare() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
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
  static void someoneWithoutAccessCannotSaveARow() {
    camp();
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
