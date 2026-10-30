/**
 * Accepted counter lines kept with the week (WeekAccepts, CORE-6.8), as a scheduler with the
 * Shoresh Scheduler permission set: an accept is read back by a later visit; accepting the same
 * line again replaces the earlier accept; a Rebuild clears them and a version keeps none; lines of another shape are not
 * read; a line with no key is refused. Camp and helpers: GeneratedTestData.
 */
@IsTest
private class WeekAcceptsTest {
  /** A line as the screen sends it. */
  private static String line(String k, String s, Integer n) {
    return JSON.serialize(
      new Map<String, Object>{ 'k' => k, 's' => s, 'n' => n }
    );
  }

  private static List<Object> read(Id draftId) {
    return (List<Object>) JSON.deserializeUntyped(
      WeekAccepts.accepted(draftId)
    );
  }

  @IsTest
  static void anAcceptIsReadBackOnALaterVisit() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Assert.areEqual(0, read(draftId).size());
      WeekAccepts.accept(draftId, line('under|a1|2|4', 'under|a1', 2));
      WeekAccepts.accept(draftId, line('note|x', null, null));
      List<Object> lines = read(draftId);
      Test.stopTest();
      Assert.areEqual(2, lines.size());
      Map<String, Object> first = (Map<String, Object>) lines[0];
      Assert.areEqual('under|a1|2|4', first.get('k'));
      Assert.areEqual('under|a1', first.get('s'));
      Assert.areEqual(2, first.get('n'));
      Assert.isNull(((Map<String, Object>) lines[1]).get('s'));
    }
  }

  @IsTest
  static void acceptingTheSameLineAgainReplacesTheEarlierAccept() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      WeekAccepts.accept(draftId, line('under|a1|2|4', 'under|a1', 2));
      WeekAccepts.accept(draftId, line('over|a2|3|1', 'over|a2', 2));
      WeekAccepts.accept(draftId, line('under|a1|1|4', 'under|a1', 3));
      List<Object> lines = read(draftId);
      Test.stopTest();
      Assert.areEqual(2, lines.size());
      Map<String, Object> last = (Map<String, Object>) lines[1];
      Assert.areEqual('under|a1|1|4', last.get('k'));
      Assert.areEqual(3, last.get('n'));
    }
  }

  @IsTest
  static void aRebuildClearsTheAcceptedLines() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      WeekAccepts.accept(draftId, line('under|a1|2|4', 'under|a1', 2));
      Test.startTest();
      GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.REBUILD,
            1
          ),
          'Gym games'
        )
      );
      Test.stopTest();
      Assert.areEqual(0, read(draftId).size());
      // The version the Rebuild kept first is history: only a draft keeps accepts.
      Id versionId = [
        SELECT Id
        FROM Schedule__c
        WHERE Status__c = 'Version'
        WITH USER_MODE
        LIMIT 1
      ]
      .Id;
      try {
        WeekAccepts.accept(versionId, line('under|a1|2|4', 'under|a1', 2));
        Assert.fail('A version kept an accept.');
      } catch (AuraHandledException e) {
        Assert.areEqual(0, read(versionId).size());
      }
    }
  }

  @IsTest
  static void onlyLinesOfTheRightShapeAreRead() {
    Assert.isNull(WeekAccepts.oneLine('{"k":"a","n":-1}'));
    Assert.isNull(WeekAccepts.oneLine('{"k":"","n":1}'));
    Assert.isNotNull(WeekAccepts.oneLine('{"k":"a","s":null,"n":null}'));
    Assert.areEqual(0, WeekAccepts.linesOf(null).size());
    Assert.areEqual(0, WeekAccepts.linesOf('not json').size());
    Assert.areEqual(0, WeekAccepts.linesOf('{"k":"x"}').size());
    Assert.areEqual(
      1,
      WeekAccepts.linesOf(
          '[{"k":"a","s":"b","n":1},{"k":1},{"k":"c","n":"2"},"d"]'
        )
        .size()
    );
  }

  @IsTest
  static void aLineWithNoKeyIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      try {
        WeekAccepts.accept(draftId, line(' ', null, null));
        Assert.fail('A line with no key was accepted.');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().length() > 0);
      }
      Test.stopTest();
      Assert.areEqual(0, read(draftId).size());
    }
  }
}
