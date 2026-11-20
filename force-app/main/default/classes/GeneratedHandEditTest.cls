/**
 * Generated Schedule's hand edit through its own module (GeneratedHandEdit), as a scheduler with
 * the Shoresh Scheduler permission set: the edit is made and what it fills is locked (LOCK-1.1);
 * the answer has the week as the screen shows it and the revision after the edit; the engine's
 * notes it sends are kept only when nobody saved the week since. Camp and helpers:
 * GeneratedTestData. The lock rules themselves: GeneratedLocksTest, GeneratedEditLocksTest.
 */
@IsTest
private class GeneratedHandEditTest {
  /** Notes as the screen keeps them (c/shoreshEngine notes.js): one Open cell, Group A's Lunch. */
  private static String notes(Map<String, Id> ids, String why) {
    return JSON.serialize(
      new Map<String, Object>{
        'v' => 1,
        'open' => new List<Object>{
          new List<String>{
            String.valueOf(GeneratedTestData.MONDAY),
            ids.get('Group A'),
            ids.get('Lunch'),
            why
          }
        },
        'blank' => new List<Object>(),
        'floor' => null,
        'cut' => 0
      }
    );
  }

  /** The first Generate of Week 1 (Gym games in every Period 2), with these notes. */
  private static Id generatedWith(String engineNotes) {
    GeneratedWeek.Save request = GeneratedTestData.filled(
      GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      ),
      'Gym games'
    );
    request.engineNotes = engineNotes;
    return GeneratedTestData.save(request).scheduleId;
  }

  private static String stored(Id draftId) {
    return [
      SELECT EngineNotes__c
      FROM Schedule__c
      WHERE Id = :draftId
      WITH SYSTEM_MODE
    ]
    .EngineNotes__c;
  }

  private static String revisionNow(Id draftId) {
    return WeekTickets.stamp(ScheduleDays.read(draftId));
  }

  /**
   * Swim by hand in a group's Monday Lunch (Open after the first Generate), from a screen that
   * read the week at seen; the caller adds the engine's notes it sends.
   */
  private static GeneratedWeek.HandEdits swimInLunch(
    Id draftId,
    String groupKey,
    String seen
  ) {
    Map<String, Id> ids = GeneratedTestData.ids;
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    GeneratedWeek.HandEdits request = new GeneratedWeek.HandEdits();
    request.scheduleId = draftId;
    request.revision = seen;
    request.edits = new List<SlotEdits.Edit>{
      SlotRunsTestData.edit(
        SlotRunsTestData.at(
          GeneratedTestData.MONDAY,
          ids.get(groupKey),
          ids.get('Lunch')
        ),
        new List<String>{ '' },
        new List<String>{ GeneratedTestData.a('Swim') }
      )
    };
    return request;
  }

  private static SlotEdits.Result saved(
    GeneratedWeek.HandEdits request,
    String engineNotes
  ) {
    request.engineNotes = engineNotes;
    return GeneratedHandEdit.save(request);
  }

  // LOCK-1.1
  @IsTest
  static void aHandEditIsMadeLockedAndAnsweredWithTheWeekAndItsRevision() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = generatedWith(null);
      Test.startTest();
      SlotEdits.Result edited = saved(
        swimInLunch(draftId, 'Group A', revisionNow(draftId)),
        null
      );
      Test.stopTest();
      Assert.isTrue(edited.conflicts.isEmpty());
      List<Integer> mondayA = GeneratedTestData.at(
        0,
        GeneratedTestData.GROUP_A
      );
      Assert.areEqual(
        GeneratedTestData.a('Swim'),
        GeneratedTestData.slots(draftId, mondayA)[GeneratedTestData.LUNCH]
      );
      Assert.isTrue(
        ScheduleGridLocks.isLocked(
          ScheduleDays.read(draftId)[0].grid,
          GeneratedTestData.GROUP_A,
          GeneratedTestData.LUNCH
        )
      );
      Assert.areEqual(revisionNow(draftId), edited.revision);
      // The week as it is after the edit.
      Assert.areEqual(edited.revision, edited.schedule.revisions);
    }
  }

  @IsTest
  static void aHandEditKeepsTheNotesItSendsOrLeavesThemAsTheyAre() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      String built = notes(ids, 'full');
      Id draftId = generatedWith(built);
      String none = JSON.serialize(
        new Map<String, Object>{
          'v' => 1,
          'open' => new List<Object>(),
          'blank' => new List<Object>(),
          'floor' => null,
          'cut' => 0
        }
      );
      Test.startTest();
      // No notes sent: kept as they are.
      saved(swimInLunch(draftId, 'Group A', revisionNow(draftId)), null);
      Assert.areEqual(built, stored(draftId));
      // The notes without the cell the edit changed.
      SlotEdits.Result edited = saved(
        swimInLunch(draftId, 'Group B', revisionNow(draftId)),
        none
      );
      Assert.isTrue(edited.conflicts.isEmpty());
      Test.stopTest();
      Assert.isFalse(String.isEmpty(edited.revision));
      Assert.areEqual(none, stored(draftId));
    }
  }

  @IsTest
  static void aHandEditFromAnOlderReadLeavesTheNewerNotes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = generatedWith(notes(ids, 'full'));
      String seen = revisionNow(draftId);
      // The camp's setup and first build leave too few queries for the rest outside the test.
      Test.startTest();
      // Someone else rebuilt since this screen read the week, with notes of their own.
      GeneratedWeek.Save rebuild = GeneratedTestData.filled(
        GeneratedTestData.request(
          GeneratedTestData.inputs(),
          GeneratedSaves.REBUILD,
          1
        ),
        'Gym games'
      );
      rebuild.engineNotes = notes(ids, 'searched');
      GeneratedTestData.save(rebuild);
      SlotEdits.Result edited = saved(
        swimInLunch(draftId, 'Group A', seen),
        notes(ids, 'budget')
      );
      Assert.isTrue(edited.conflicts.isEmpty());
      Test.stopTest();
      Assert.isTrue(String.isEmpty(edited.revision));
      Assert.areEqual(notes(ids, 'searched'), stored(draftId));
    }
  }

  @IsTest
  static void noRequestIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      try {
        GeneratedHandEdit.save(null);
        Assert.fail('A missing request must be refused.');
      } catch (ShoreshException e) {
        Assert.areEqual(GeneratedTestData.UNREADABLE, e.getMessage());
      }
    }
  }
}
