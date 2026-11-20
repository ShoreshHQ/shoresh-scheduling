/**
 * The engine's notes kept with the Generated draft (GeneratedEngineNotes, ADR 0010 "The engine's
 * notes"), as a scheduler with the Shoresh Scheduler permission set: a build keeps the notes it
 * sends and the week reads them back with no extra query; notes too long or of another shape are
 * not kept, but the week is; a restored week keeps none (a hand edit's notes: GeneratedHandEditTest).
 * Camp and helpers: GeneratedTestData.
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
    return generate(engineNotes).scheduleId;
  }

  /** The same Generate, its whole answer. */
  private static GeneratedWeek.Result generate(String engineNotes) {
    GeneratedWeek.Save request = GeneratedTestData.filled(
      GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      ),
      'Gym games'
    );
    request.engineNotes = engineNotes;
    return GeneratedTestData.save(request);
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

  @IsTest
  static void aBuildKeepsItsNotesAndTheWeekReadsThemBackWithNoExtraQuery() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      String sent = notes(ids, 'full');
      GeneratedWeek.Result first = generate(sent);
      Id draftId = first.scheduleId;
      // GEN-10.11: the answer carries the notes kept, for the screen's next build.
      Assert.areEqual(sent, first.engineNotes);
      Test.startTest();
      Integer before = Limits.getQueries();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Integer withNotes = Limits.getQueries() - before;
      Assert.areEqual(sent, read.engine.notes);

      // Start over builds nothing: the notes of the week it replaced go.
      GeneratedWeek.Save startOver = StartOverTestData.cleared(
        GeneratedTestData.request(read, GeneratedSaves.START_OVER, 1)
      );
      GeneratedTestData.save(startOver);
      before = Limits.getQueries();
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      Integer without = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isNull(after.engine.notes);
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
      GeneratedWeek.Result result = GeneratedTestData.save(rebuild);
      Test.stopTest();
      Assert.areEqual(notes(ids, 'searched'), stored(draftId));
      // GEN-10.11: a later save answers the notes it kept too.
      Assert.areEqual(notes(ids, 'searched'), result.engineNotes);
    }
  }

  @IsTest
  static void notesTooLongOrOfAnotherShapeAreNotKeptButTheWeekIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      String tooLong =
        '{"v":1,"open":[],"blank":[],"pad":"' +
        'x'.repeat(GeneratedEngineNotes.maxLength()) +
        '"}';
      GeneratedWeek.Result result = generate(tooLong);
      Test.stopTest();
      Id draftId = result.scheduleId;
      Assert.isNotNull(draftId);
      Assert.isNull(stored(draftId));
      // GEN-10.11: the answer says none were kept, so the screen builds on none and says so.
      Assert.isNull(result.engineNotes);
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
    // Exactly 4 or 6 pieces, as the screen reads them: never 5.
    Assert.isNull(
      GeneratedEngineNotes.kept(
        '{"v":1,"open":[["d","g","b","minCost","g1"]],"blank":[]}'
      )
    );
    Assert.isNull(
      GeneratedEngineNotes.kept('{"v":1,"open":[],"blank":[["fit"]]}')
    );
  }

  @IsTest
  static void aHandEditDropsItsCellsReasonAndTheFloorNote() {
    // Id-shaped, as the cells' group and time block Ids are compared as Ids (SlotIds.indexOf).
    String prefix = Schema.SObjectType.Schedule__c.getKeyPrefix();
    String g1 = prefix + '000000000001';
    String g2 = prefix + '000000000002';
    String t1 = prefix + '000000000003';
    List<Object> kept = new List<Object>{
      new List<Object>{ '2026-06-29', g2, t1, 'full' }
    };
    List<Object> open = new List<Object>{
      new List<Object>{ '2026-06-29', g1, t1, 'full' },
      kept[0]
    };
    String notes = JSON.serialize(
      new Map<String, Object>{
        'v' => 1,
        'open' => open,
        'blank' => new List<Object>(),
        'floor' => new Map<String, Object>{ 'kind' => 'frame' },
        'cut' => 0
      }
    );
    List<String> cell = new List<String>{ '2026-06-29', g1, t1 };
    Map<String, Object> left = (Map<String, Object>) JSON.deserializeUntyped(
      GeneratedEngineNotes.withoutCell(notes, cell)
    );
    Assert.areEqual(
      JSON.deserializeUntyped(JSON.serialize(kept)),
      left.get('open')
    );
    Assert.isNull(left.get('floor'));
    // Notes it can't keep, none.
    Assert.isNull(GeneratedEngineNotes.withoutCell('not json', cell));
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
