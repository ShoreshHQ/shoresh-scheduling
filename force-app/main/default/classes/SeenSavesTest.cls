/**
 * SeenSaves, nothing overwritten unseen (ADR 0011 choice 5): a save hands back its ticket, and
 * what someone else changed since is answered, never overwritten. On GeneratedTestData's
 * synthetic camp.
 */
@IsTest
private class SeenSavesTest {
  private static Id groupNamed(String name) {
    return [
      SELECT Id
      FROM Group__c
      WHERE
        Name = :name
        AND Division__r.Program__r.Season__c = :GeneratedTestData.ids.get(
          'Season'
        )
      WITH SYSTEM_MODE
      LIMIT 1
    ]
    .Id;
  }

  @IsTest
  static void aFieldStillAsSeenOrChangedTheSameWayIsNoQuestion() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id swim = GeneratedTestData.ids.get('Swim');
      update as user new Activity__c(Id = swim, Notes__c = 'Towels');
      Test.startTest();
      RowSaves.Result asSeen = SeenSaves.row(
        new Activity__c(Id = swim, Notes__c = 'Goggles'),
        new Activity__c(Id = swim, Notes__c = 'Towels'),
        null,
        null
      );
      RowSaves.Result same = SeenSaves.row(
        new Activity__c(Id = swim, Notes__c = 'Towels'),
        new Activity__c(Id = swim, Notes__c = null),
        null,
        null
      );
      RowSaves.Result changed = SeenSaves.row(
        new Activity__c(Id = swim, Notes__c = 'Goggles'),
        new Activity__c(Id = swim, Notes__c = 'towels'),
        null,
        null
      );
      Test.stopTest();
      Assert.isTrue(asSeen.saved());
      Assert.isTrue(same.saved(), 'Someone else made the same change');
      Assert.areEqual(new List<String>{ 'Notes__c' }, changed.changed);
      Assert.areEqual('Towels', changed.theirs.get(Activity__c.Notes__c));
    }
  }

  @IsTest
  static void whoCanDoItIsComparedInAnyOrder() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id swim = GeneratedTestData.ids.get('Swim');
      Id a = groupNamed('Group A');
      Id b = groupNamed('Group B');
      Test.startTest();
      RowSaves.Result asSeen = SeenSaves.row(
        new Activity__c(Id = swim),
        new Activity__c(Id = swim),
        new List<Id>{ a },
        new List<Id>{ b }
      );
      RowSaves.Result stale = SeenSaves.row(
        new Activity__c(Id = swim),
        new Activity__c(Id = swim),
        new List<Id>(),
        new List<Id>{ b }
      );
      RowSaves.Result sameChoice = SeenSaves.row(
        new Activity__c(Id = swim),
        new Activity__c(Id = swim),
        new List<Id>(),
        new List<Id>{ a }
      );
      Test.stopTest();
      Assert.isTrue(asSeen.saved());
      Assert.areEqual(new List<Id>{ a }, stale.theirWho);
      Assert.isTrue(sameChoice.saved(), 'Someone else chose the same');
    }
  }

  @IsTest
  static void aRowSomeoneDeletedIsSaidInPlainWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id swim = GeneratedTestData.ids.get('Swim');
      Test.startTest();
      delete as user [SELECT Id FROM Activity__c WHERE Id = :swim];
      try {
        SeenSaves.row(
          new Activity__c(Id = swim, Notes__c = 'x'),
          new Activity__c(Id = swim, Name = 'Swim', Notes__c = null),
          null,
          null
        );
        Assert.fail('Refused');
      } catch (ShoreshException e) {
        Assert.areEqual('"Swim" was deleted by someone else.', e.getMessage());
      }
      Test.stopTest();
    }
  }

  @IsTest
  static void aWeekIsAsSeenOnlyAtTheRevisionRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      List<ScheduleDays.DayGrid> days = ScheduleDays.read(draftId);
      String read = GeneratedDrafts.revisionOf(days);
      Test.startTest();
      Boolean asRead = SeenSaves.week(days, read);
      Boolean none = SeenSaves.week(days, null);
      Boolean blank = SeenSaves.week(days, '');
      Boolean other = SeenSaves.week(days, read + '1');
      Test.stopTest();
      Assert.isTrue(asRead);
      Assert.isFalse(none, 'No ticket is never as seen');
      Assert.isFalse(blank);
      Assert.isFalse(other);
    }
  }

  // The details panel's save hands back what it saw; without it nothing is saved.
  @IsTest
  static void detailsWithoutWhatWasSeenAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id swim = GeneratedTestData.ids.get('Swim');
      Test.startTest();
      List<String> refused = new List<String>();
      for (Integer i = 0; i < 2; i++) {
        try {
          ActivitiesController.saveActivityDetails(
            i == 0
              ? new Activity__c(Id = swim, Notes__c = 'x')
              : new Activity__c(Id = swim),
            i == 0 ? null : new List<Id>(),
            new Activity__c(Id = swim),
            null
          );
        } catch (AuraHandledException e) {
          refused.add(e.getMessage());
        }
      }
      Test.stopTest();
      Assert.areEqual(
        new List<String>{
          'These screens can\'t save that.',
          'These screens can\'t save that.'
        },
        refused
      );
    }
  }
}
