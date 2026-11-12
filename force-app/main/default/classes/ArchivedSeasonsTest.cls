/**
 * A season that was ever published is archived, never deleted (docs/protocol/week.md WEEK-1.9 to
 * WEEK-1.13; ADR 0029): Delete offers Archive, an archived season is read-only whoever saves, it is
 * out of the picker and never opened on by default, it comes back, and it can still be copied.
 * Every test acts as a scheduler with only the Shoresh Scheduler permission set. Names are made up.
 */
@IsTest
private class ArchivedSeasonsTest {
  private class AlwaysPublished implements PublishedHistory.Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return recordIds;
    }
  }

  private static Boolean archivedNow(Id seasonId) {
    return [
      SELECT Archived__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH SYSTEM_MODE
    ]
    .Archived__c;
  }

  private static String refusalOf(Database.SaveResult result) {
    Assert.isFalse(result.isSuccess(), 'Saved in an archived season');
    return result.getErrors()[0].getMessage();
  }

  // WEEK-1.9: Delete season on a season with published history is refused in words that offer
  // Archive, and the refusal says it can be archived; Archive keeps everything.
  @IsTest
  static void aPublishedSeasonsDeleteOffersArchiveAndArchiveKeepsEverything() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Integer groups = [
        SELECT COUNT()
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :season.Id
      ];
      PublishedHistory.finder = new AlwaysPublished();
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(season.Id);
      SeasonArchive.archive(season.Id);
      Test.stopTest();
      Assert.isTrue(
        preview.refusal.endsWith('Archive it instead.'),
        preview.refusal
      );
      Assert.isFalse(preview.refusal.contains('Finished'), preview.refusal);
      Assert.isTrue(preview.archivable);
      Assert.isTrue(archivedNow(season.Id));
      Assert.areEqual(
        groups,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :season.Id
        ]
      );
    }
  }

  // WEEK-1.9: a season with nothing published is deleted as before, not offered Archive.
  @IsTest
  static void aSeasonNeverPublishedIsStillAskedToBeDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(season.Id);
      Test.stopTest();
      Assert.isNull(preview.refusal);
      Assert.isFalse(preview.archivable);
      Assert.isTrue(preview.label.startsWith('Delete'), preview.label);
    }
  }

  // WEEK-1.10: inside an archived season nothing is added, changed or deleted, whoever saves it,
  // and the season itself is neither changed nor deleted; another season is untouched.
  @IsTest
  static void anArchivedSeasonIsReadOnlyWhoeverSaves() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      Season__c other = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Program__c otherProgram = ShoreshTestData.program(other.Id, 'Main');
      SeasonArchive.archive(season.Id);
      Test.startTest();
      String added = refusalOf(
        Database.insert(
          new Group__c(
            Division__c = ids.get('Juniors'),
            Name = 'Group C',
            Availability__c = 'MorningOnly'
          ),
          false,
          AccessLevel.USER_MODE
        )
      );
      String changed = refusalOf(
        Database.update(
          new TimeBlock__c(Id = ids.get('Period 1'), Name = 'First'),
          false,
          AccessLevel.SYSTEM_MODE
        )
      );
      Database.DeleteResult deleted = Database.delete(
        ids.get('Week 1'),
        false,
        AccessLevel.USER_MODE
      );
      String renamed = refusalOf(
        Database.update(
          new Season__c(Id = season.Id, Name = 'Renamed'),
          false,
          AccessLevel.USER_MODE
        )
      );
      Database.DeleteResult seasonDeleted = Database.delete(
        season.Id,
        false,
        AccessLevel.USER_MODE
      );
      Database.SaveResult elsewhere = Database.insert(
        new Division__c(Program__c = otherProgram.Id, Name = 'Seniors'),
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      String expected = '"Summer 2026" is archived, so it can\'t be changed. Bring it back first.';
      Assert.areEqual(expected, added);
      Assert.areEqual(expected, changed);
      Assert.areEqual(expected, renamed);
      Assert.isFalse(deleted.isSuccess());
      Assert.areEqual(expected, deleted.getErrors()[0].getMessage());
      Assert.isFalse(seasonDeleted.isSuccess());
      Assert.areEqual(expected, seasonDeleted.getErrors()[0].getMessage());
      Assert.isTrue(
        elsewhere.isSuccess(),
        String.valueOf(elsewhere.getErrors())
      );
      Assert.areEqual(
        6,
        [SELECT COUNT() FROM Week__c WHERE Season__c = :season.Id]
      );
    }
  }

  // WEEK-1.10: a screen's delete refuses before asking; an AI hears what is wrong with no advice.
  @IsTest
  static void anArchivedSeasonsDeleteIsRefusedBeforeAskingAndAnAiHearsOnlyWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Id groupId = ShoreshTestData.lastSeasonIds.get('Group A');
      SeasonArchive.archive(season.Id);
      Test.startTest();
      SetupDelete.Preview preview = SetupDelete.preview(groupId);
      AgentRefusal.forAgent = true;
      String agent = ArchivedSeasons.refusalFor(groupId);
      AgentRefusal.forAgent = false;
      Test.stopTest();
      Assert.areEqual(
        '"Summer 2026" is archived, so it can\'t be changed. Bring it back first.',
        preview.refusal
      );
      Assert.areEqual(
        '"Summer 2026" is archived, so it can\'t be changed.',
        agent
      );
      Assert.areEqual(1, [SELECT COUNT() FROM Group__c WHERE Id = :groupId]);
    }
  }

  // WEEK-1.10: with a season archived, a save in another season costs a bounded few queries.
  @IsTest
  static void aSaveBesideAnArchivedSeasonStaysWithinItsQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c archived = ShoreshTestData.season(camp.Id, 'Summer 2025');
      SeasonArchive.archive(archived.Id);
      Season__c live = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Program__c program = ShoreshTestData.program(live.Id, 'Main');
      Division__c division = ShoreshTestData.division(program.Id, 'Juniors');
      List<Group__c> groups = new List<Group__c>();
      for (Integer i = 0; i < 30; i++) {
        groups.add(
          new Group__c(
            Division__c = division.Id,
            Name = 'Group ' + i,
            Availability__c = 'MorningOnly'
          )
        );
      }
      Test.startTest();
      Database.insert(groups, AccessLevel.USER_MODE);
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.isTrue(queries < 40, 'Queries: ' + queries);
    }
  }

  // WEEK-1.10: with no season archived the guard reads nothing more, even after a season is made.
  @IsTest
  static void withNothingArchivedTheGuardUsesNoQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Program__c program = ShoreshTestData.program(season.Id, 'Main');
      Division__c division = ShoreshTestData.division(program.Id, 'Juniors');
      Test.startTest();
      Assert.isFalse(ArchivedSeasons.isArchived(season.Id));
      ShoreshTestData.season(camp.Id, 'Summer 2027');
      Integer before = Limits.getQueries();
      List<Group__c> groups = new List<Group__c>{
        new Group__c(Division__c = division.Id, Name = 'Group A')
      };
      List<Week__c> weeks = new List<Week__c>{
        new Week__c(Season__c = season.Id, Name = 'Week 9')
      };
      ArchivedSeasons.refuse(groups, null);
      ArchivedSeasons.refuse(weeks, weeks);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(0, used, 'The guard used queries with nothing archived');
      Assert.isFalse(groups[0].hasErrors());
      Assert.isFalse(weeks[0].hasErrors());
    }
  }

  // WEEK-1.11: the picker's list says which seasons are archived; an AI's list marks them, and the
  // season the screens open on is never an archived one.
  @IsTest
  static void anArchivedSeasonIsMarkedAndNeverOpenedOn() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c older = ShoreshTestData.season(camp.Id, 'Summer 2025');
      Season__c newest = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Database.update(
        new Season__c(
          Id = newest.Id,
          StartDate__c = Date.newInstance(2027, 6, 28),
          EndDate__c = Date.newInstance(2027, 8, 6)
        ),
        AccessLevel.USER_MODE
      );
      SeasonArchive.archive(newest.Id);
      Test.startTest();
      List<Season__c> listed = SeasonSetupController.getSeasons(camp.Id);
      Map<String, Object> asked = AgentSeasons.answer();
      Test.stopTest();
      Assert.areEqual(2, listed.size());
      Assert.isTrue(listed[0].Archived__c);
      Assert.isFalse(listed[1].Archived__c);
      Assert.areEqual('Summer 2025', asked.get('opens_on'));
      for (Object each : (List<Object>) asked.get('seasons')) {
        Map<String, Object> season = (Map<String, Object>) each;
        Assert.areEqual(
          season.get('season') == 'Summer 2027' ? true : null,
          season.get('archived')
        );
      }
      Assert.isTrue(
        OutgoingRows.seasonsSaid().contains('Summer 2027 (archived)'),
        OutgoingRows.seasonsSaid()
      );
      Assert.areEqual(older.Id, SeasonToOpen.find().Id);
    }
  }

  // WEEK-1.12: a season brought back can be changed again.
  @IsTest
  static void aSeasonBroughtBackCanBeChangedAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Id juniors = ShoreshTestData.lastSeasonIds.get('Juniors');
      SeasonArchive.archive(season.Id);
      Test.startTest();
      SeasonArchive.bringBack(season.Id);
      Database.SaveResult added = Database.insert(
        new Group__c(
          Division__c = juniors,
          Name = 'Group C',
          Availability__c = 'MorningOnly'
        ),
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      Assert.isFalse(archivedNow(season.Id));
      Assert.isTrue(added.isSuccess(), String.valueOf(added.getErrors()));
    }
  }

  // WEEK-1.13: Copy season copies from an archived season; the copy is a season like any other.
  @IsTest
  static void anArchivedSeasonCanBeCopiedAndTheCopyIsNotArchived() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      SeasonArchive.archive(season.Id);
      Test.startTest();
      Id copy = SeasonSetupController.copySeason(
        season.Id,
        'Summer 2027',
        Date.newInstance(2027, 6, 28)
      );
      Test.stopTest();
      Assert.isFalse(archivedNow(copy));
      Assert.isTrue(archivedNow(season.Id));
      Assert.areEqual(6, [SELECT COUNT() FROM Week__c WHERE Season__c = :copy]);
    }
  }
}
