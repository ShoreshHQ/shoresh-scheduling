/**
 * An archived season can't be changed (docs/protocol/week.md WEEK-1.10, WEEK-1.11): through an AI
 * (publish, unpublish, restore a version, rename in setup) and on the week's own screens (Undo of a
 * build, keeping a rainy-day copy) each change is refused in plain words, nothing saved, and
 * archive_season and bring_back_season answer at their web addresses. GeneratedTestData's camp,
 * made inside the scheduler's runAs.
 */
@IsTest
private class AgentArchivedSeasonTest {
  private static String season() {
    return [
      SELECT Name
      FROM Season__c
      WHERE Id = :GeneratedTestData.ids.get('Season')
      WITH SYSTEM_MODE
    ]
    .Name;
  }

  /** POST at the web address (door: its own post()); answers [status, sentence]. */
  private static List<Object> post(String door, Map<String, Object> body) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    if (door == 'publish_week') {
      AgentPublish.post();
    } else if (door == 'unpublish_week') {
      AgentUnpublish.post();
    } else if (door == 'restore_version') {
      AgentRestoreVersion.post();
    } else if (door == 'rename_in_setup') {
      AgentRenameSetup.post();
    } else if (door == 'archive_season') {
      AgentArchiveSeason.post();
    } else {
      AgentBringBackSeason.post();
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static Map<String, Object> mainWeek(Map<String, Object> more) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => season(),
      'week' => 'Week 1',
      'program' => 'Main'
    };
    body.putAll(more);
    return body;
  }

  private static String archived() {
    return '"' + season() + '" is archived, so it can\'t be changed.';
  }

  private static Integer versions() {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Program__c = :GeneratedTestData.ids.get('Main')
      WITH SYSTEM_MODE
    ];
  }

  // WEEK-1.10: an archived season's week isn't published or restored through an AI; the answer
  // says what didn't happen and why; nothing is saved. Unpublish finds nothing published.
  @IsTest
  static void anArchivedWeekIsNotPublishedOrRestored() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      GeneratedScheduleController.saveVersion(draftId, 'Plain');
      SeasonArchive.archive(GeneratedTestData.ids.get('Season'));
      Integer before = versions();
      Test.startTest();
      List<Object> published = post(
        'publish_week',
        mainWeek(new Map<String, Object>())
      );
      List<Object> restored = post(
        'restore_version',
        mainWeek(new Map<String, Object>{ 'version' => 'Plain' })
      );
      List<Object> unpublished = post(
        'unpublish_week',
        mainWeek(new Map<String, Object>())
      );
      Test.stopTest();
      Assert.areEqual(400, published[0], String.valueOf(published[1]));
      Assert.areEqual('Week 1 was not published. ' + archived(), published[1]);
      Assert.areEqual(400, restored[0], String.valueOf(restored[1]));
      Assert.isTrue(
        ((String) restored[1])
          .startsWith('Plain wasn\'t restored. Nothing was changed.'),
        String.valueOf(restored[1])
      );
      Assert.isTrue(
        ((String) restored[1]).contains(archived()),
        String.valueOf(restored[1])
      );
      Assert.areEqual(200, unpublished[0], String.valueOf(unpublished[1]));
      Assert.areEqual(
        'Week 1 isn\'t published, so there is nothing to unpublish.',
        unpublished[1]
      );
      Assert.areEqual(before, versions(), 'Nothing saved');
    }
  }

  // WEEK-1.10: renaming in an archived season's setup is refused, nothing saved; a blank new name
  // is asked for; the name it already has changes nothing.
  @IsTest
  static void anArchivedSeasonsSetupIsNotRenamed() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      SeasonArchive.archive(GeneratedTestData.ids.get('Season'));
      Map<String, Object> groupA = new Map<String, Object>{
        'season' => season(),
        'kind' => 'group',
        'name' => 'Group A'
      };
      Map<String, Object> blank = new Map<String, Object>(groupA);
      blank.put('new_name', ' ');
      Map<String, Object> same = new Map<String, Object>(groupA);
      same.put('new_name', 'Group A');
      Map<String, Object> cabin = new Map<String, Object>(groupA);
      cabin.put('new_name', 'Cabin A');
      Test.startTest();
      List<Object> noName = post('rename_in_setup', blank);
      List<Object> unchanged = post('rename_in_setup', same);
      List<Object> renamed = post('rename_in_setup', cabin);
      Test.stopTest();
      Assert.areEqual(400, noName[0], String.valueOf(noName[1]));
      Assert.areEqual('Say what to call the group now (new_name).', noName[1]);
      Assert.areEqual(200, unchanged[0], String.valueOf(unchanged[1]));
      Assert.areEqual('The group is already called "Group A".', unchanged[1]);
      Assert.areEqual(400, renamed[0], String.valueOf(renamed[1]));
      // Also names the row by the name it was refused ("Cabin A"): listed in the PR, not pinned.
      Assert.isTrue(
        ((String) renamed[1]).startsWith('"Group A" not saved. '),
        String.valueOf(renamed[1])
      );
      Assert.isTrue(
        ((String) renamed[1]).endsWith(archived()),
        String.valueOf(renamed[1])
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Id = :GeneratedTestData.ids.get('Group A') AND Name = 'Group A'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  // WEEK-1.10: on the week's own screens, a rainy-day copy and an Undo of a build are refused in
  // an archived season with its words; an Undo from a week seen before a change is not done.
  @IsTest
  static void theWeeksScreensRefuseAnArchivedSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      String seen = WeekTickets.stamp(ScheduleDays.read(draftId));
      Test.startTest();
      Boolean stale = GeneratedUndoController.undoBuild(
        draftId,
        mine,
        seen + 'x'
      );
      SeasonArchive.archive(GeneratedTestData.ids.get('Season'));
      String keepRefused;
      try {
        RainyDayController.keepGeneratedWeek(draftId, 'Rainy Monday');
      } catch (AuraHandledException e) {
        keepRefused = e.getMessage();
      }
      String undoRefused;
      try {
        GeneratedUndoController.undoBuild(draftId, mine, seen);
      } catch (AuraHandledException e) {
        undoRefused = e.getMessage();
      }
      Test.stopTest();
      Assert.isFalse(stale, 'A week changed since it was seen is not undone');
      Assert.isNotNull(keepRefused, 'The rainy-day copy is refused');
      Assert.isTrue(keepRefused.contains(archived()), keepRefused);
      Assert.isNotNull(undoRefused, 'The Undo is refused');
      Assert.isTrue(undoRefused.contains(archived()), undoRefused);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Name = 'Rainy Monday'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  // WEEK-1.10, WEEK-1.11: at their web addresses, a season never published isn't archived (it can
  // be deleted instead), and an archived one is brought back.
  @IsTest
  static void archiveAndBringBackAnswerAtTheirAddresses() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Map<String, Object> body = new Map<String, Object>{
        'season' => season()
      };
      Test.startTest();
      List<Object> neverPublished = post('archive_season', body);
      SeasonArchive.archive(GeneratedTestData.ids.get('Season'));
      List<Object> back = post('bring_back_season', body);
      Test.stopTest();
      Assert.areEqual(
        400,
        neverPublished[0],
        String.valueOf(neverPublished[1])
      );
      Assert.areEqual(
        '"' +
          season() +
          '" was never published, so it can\'t be archived. It can be deleted instead (delete_season).',
        neverPublished[1]
      );
      Assert.areEqual(200, back[0], String.valueOf(back[1]));
      Assert.areEqual(
        'Brought back "' + season() + '". It can be changed again.',
        back[1]
      );
      Assert.isFalse(
        ArchivedSeasons.isArchived(GeneratedTestData.ids.get('Season'))
      );
    }
  }
}
