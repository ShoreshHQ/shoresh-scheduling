/**
 * Undo's rows that go with their item (ImportUndoKeptRows): of the rows an import made, a box of
 * When it runs, a coverage row and a week off are kept when their item is kept, and only then.
 * Synthetic data only.
 */
@IsTest
private class ImportUndoKeptRowsTest {
  @IsTest
  static void aRowIsKeptOnlyWithAKeptItem() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
      ids.putAll(ShoreshTestData.lastSeasonIds);
      ActivityOffTime__c off = new ActivityOffTime__c(
        Activity__c = ids.get('Swim'),
        TimeBlock__c = ids.get('Lunch'),
        Day__c = 'Monday'
      );
      Database.insert(off, AccessLevel.USER_MODE);
      RecurringActivity__c rest = new RecurringActivity__c(
        Name = 'Rest',
        Program__c = ids.get('Main'),
        TimeBlock__c = ids.get('Lunch'),
        Length__c = 1,
        Monday__c = true
      );
      Database.insert(rest, AccessLevel.USER_MODE);
      Coverage__c who = new Coverage__c(
        Season__c = season.Id,
        RecurringActivity__c = rest.Id,
        Group__c = ids.get('Group A')
      );
      Database.insert(who, AccessLevel.USER_MODE);
      WeekException__c closed = new WeekException__c(
        Week__c = ids.get('Week 1'),
        Activity__c = ids.get('Soccer')
      );
      Database.insert(closed, AccessLevel.USER_MODE);

      Test.startTest();
      Set<Id> kept = new Set<Id>{ ids.get('Swim'), rest.Id, ids.get('Soccer') };
      Assert.areEqual(
        new Set<Id>{ off.Id },
        ImportUndoKeptRows.keptWith(
          'ActivityOffTime',
          new Set<Id>{ off.Id },
          kept
        )
      );
      Assert.areEqual(
        new Set<Id>{ who.Id },
        ImportUndoKeptRows.keptWith('Coverage', new Set<Id>{ who.Id }, kept)
      );
      Assert.areEqual(
        new Set<Id>{ closed.Id },
        ImportUndoKeptRows.keptWith(
          'WeekException',
          new Set<Id>{ closed.Id },
          kept
        )
      );
      // An item not kept keeps nothing with it.
      Set<Id> none = new Set<Id>{ ids.get('Gym games') };
      Assert.isTrue(
        ImportUndoKeptRows.keptWith(
            'ActivityOffTime',
            new Set<Id>{ off.Id },
            none
          )
          .isEmpty()
      );
      Assert.isTrue(
        ImportUndoKeptRows.keptWith('Coverage', new Set<Id>{ who.Id }, none)
          .isEmpty()
      );
      Assert.isTrue(
        ImportUndoKeptRows.keptWith(
            'WeekException',
            new Set<Id>{ closed.Id },
            none
          )
          .isEmpty()
      );
      Test.stopTest();
    }
  }
}
