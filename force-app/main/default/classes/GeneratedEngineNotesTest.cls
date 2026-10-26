/**
 * The engine's notes kept with the Generated draft (GeneratedEngineNotes, ADR 0010 "The engine's
 * notes"), as a scheduler with the Shoresh Scheduler permission set: a build keeps the notes it
 * sends and the week reads them back with no extra query; notes too long or of another shape are
 * not kept, but the week is; a hand edit keeps the notes it sends only when nobody saved the week
 * since; a restored week keeps none. Camp and helpers: GeneratedTestData.
 */
@IsTest
private class GeneratedEngineNotesTest {
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
    return GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
  }

  /** Swim by hand in a group's Monday Lunch (Open after the first Generate). */
  private static SlotEdits.Result swimInLunch(
    Map<String, Id> ids,
    Id draftId,
    String seen,
    String engineNotes,
    String groupKey
  ) {
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    return GeneratedScheduleController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            GeneratedTestData.MONDAY,
            ids.get(groupKey),
            ids.get('Lunch')
          ),
          new List<String>{ '' },
          new List<String>{ GeneratedTestData.a('Swim') }
        )
      },
      seen,
      engineNotes
    );
  }

  @IsTest
  static void aBuildKeepsItsNotesAndTheWeekReadsThemBackWithNoExtraQuery() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      String sent = notes(ids, 'full');
      Id draftId = generatedWith(sent);
      Test.startTest();
      Integer before = Limits.getQueries();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Integer withNotes = Limits.getQueries() - before;
      Assert.areEqual(sent, read.engineNotes);

      // Start over builds nothing: the notes of the week it replaced go.
      GeneratedWeek.Save startOver = GeneratedTestData.request(
        read,
        GeneratedSaves.START_OVER,
        1
      );
      GeneratedTestData.save(startOver);
      before = Limits.getQueries();
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      Integer without = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isNull(after.engineNotes);
      Assert.isNull(stored(draftId));
      // A field on the draft already read: reading the notes costs no query.
      Assert.areEqual(without, withNotes);
    }
  }

  @IsTest
  static void aRebuildKeepsItsOwnNotesNotTheWeeksBefore() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = generatedWith(notes(ids, 'full'));
      Test.startTest();
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
      Test.stopTest();
      Assert.areEqual(notes(ids, 'searched'), stored(draftId));
    }
  }

  @IsTest
  static void notesTooLongOrOfAnotherShapeAreNotKeptButTheWeekIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      String tooLong =
        '{"v":1,"open":[],"blank":[],"pad":"' +
        'x'.repeat(GeneratedEngineNotes.maxLength()) +
        '"}';
      Id draftId = generatedWith(tooLong);
      Test.stopTest();
      Assert.isNotNull(draftId);
      Assert.isNull(stored(draftId));
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
    }
  }

  @IsTest
  static void onlyNotesOfTheShapeTheScreenMakesAreKept() {
    String good =
      '{"v":1,"open":[["2026-06-29","g1","t1","full"],' +
      '["2026-06-29","g2","t1","minCost","g1","a1"]],' +
      '"blank":[["fit","l1"]],"floor":{"kind":"frame"},"cut":0}';
    Assert.areEqual(good, GeneratedEngineNotes.kept(good));
    Assert.isNull(GeneratedEngineNotes.kept(null));
    Assert.isNull(GeneratedEngineNotes.kept(''));
    Assert.isNull(GeneratedEngineNotes.kept('not json'));
    Assert.isNull(GeneratedEngineNotes.kept('[1,2]'));
    Assert.isNull(GeneratedEngineNotes.kept('{"v":2,"open":[],"blank":[]}'));
    Assert.isNull(GeneratedEngineNotes.kept('{"v":1,"open":[]}'));
    Assert.isNull(
      GeneratedEngineNotes.kept('{"v":1,"open":[["a","b"]],"blank":[]}')
    );
    Assert.isNull(
      GeneratedEngineNotes.kept('{"v":1,"open":[[1,2,3,4]],"blank":[]}')
    );
    Assert.isNull(
      GeneratedEngineNotes.kept('{"v":1,"open":[],"blank":[["fit"]]}')
    );
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
      swimInLunch(ids, draftId, revisionNow(draftId), null, 'Group A');
      Assert.areEqual(built, stored(draftId));
      // The notes without the cell the edit changed.
      SlotEdits.Result edited = swimInLunch(
        ids,
        draftId,
        revisionNow(draftId),
        none,
        'Group B'
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
      SlotEdits.Result edited = swimInLunch(
        ids,
        draftId,
        seen,
        notes(ids, 'budget'),
        'Group A'
      );
      Assert.isTrue(edited.conflicts.isEmpty());
      Test.stopTest();
      Assert.isTrue(String.isEmpty(edited.revision));
      Assert.areEqual(notes(ids, 'searched'), stored(draftId));
    }
  }

  @IsTest
  static void aRestoredWeekKeepsNoNotes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = generatedWith(notes(ids, 'full'));
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      Test.startTest();
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        mine,
        revisionNow(draftId)
      );
      Test.stopTest();
      Assert.isTrue(restored);
      Assert.isNull(stored(draftId));
      // Versions keep none either.
      Assert.isNull(stored(mine));
    }
  }

  @IsTest
  static void theSchedulerCanReadAndKeepTheNotes() {
    System.runAs(ShoreshTestData.scheduler()) {
      DescribeFieldResult field = Schedule__c.EngineNotes__c.getDescribe();
      Assert.isTrue(field.isAccessible());
      Assert.isTrue(field.isUpdateable());
      Assert.isTrue(field.isCreateable());
    }
    System.runAs(ShoreshTestData.outsider()) {
      Assert.isFalse(Schedule__c.EngineNotes__c.getDescribe().isAccessible());
    }
  }
}
