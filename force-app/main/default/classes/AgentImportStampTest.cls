/**
 * The setup's stamp an import's review carries back as seen (docs/protocol/api.md API-1.80,
 * API-1.81, API-1.84): the same while nothing changes, another once something inside the season,
 * the camp's words or (for Import last year) the weeks' schedules is added or removed. Made-up camp;
 * records are made inside the scheduler's runAs.
 */
@IsTest
private class AgentImportStampTest {
  // API-1.80
  @IsTest
  static void theStampStaysTheSameWhileNothingChanges() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Cedar Brook (made up)');
      Id seasonId = ShoreshTestData.fullSeason(camp.Id).Id;
      Test.startTest();
      String first = AgentImportStamp.of(seasonId, camp.Id);
      String last = AgentImportStamp.withSchedules(seasonId, camp.Id);
      Integer queries = Limits.getQueries();
      Integer lists = Limits.getAggregateQueries();
      Test.stopTest();
      Assert.areEqual(16, first.length());
      Assert.areEqual(first, AgentImportStamp.of(seasonId, camp.Id));
      Assert.areEqual(32, last.length());
      Assert.areEqual(last, AgentImportStamp.withSchedules(seasonId, camp.Id));
      Assert.isTrue(last.startsWith(first), 'the setup\'s stamp, then more');
      // Bound: 7 queries for the setup's stamp, 9 for Import last year's: 16 (2026-11-25).
      Assert.isTrue(queries < 21, 'queries: ' + queries);
      // A list inside a query counts once against its own limit of 300: 18 for the setup's stamp,
      // 23 for Import last year's: 41 (2026-11-25).
      Assert.isTrue(lists < 46, 'lists inside queries: ' + lists);
    }
  }

  // API-1.80, API-1.81: a record added or removed anywhere the review read gives another stamp.
  @IsTest
  static void aRecordAddedOrRemovedInsideGivesAnotherStamp() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Cedar Brook (made up)');
      Id seasonId = ShoreshTestData.fullSeason(camp.Id).Id;
      Map<String, Id> made = ShoreshTestData.lastSeasonIds;
      Set<String> seen = new Set<String>{
        AgentImportStamp.of(seasonId, camp.Id)
      };
      Test.startTest();
      // A group, inside a division inside a program.
      ShoreshTestData.groupIn(made.get('Juniors'), 'Group C');
      Assert.isTrue(seen.add(AgentImportStamp.of(seasonId, camp.Id)), 'group');
      // A week off, inside a week.
      Database.delete(
        [
          SELECT Id
          FROM WeekException__c
          WHERE Week__r.Season__c = :seasonId
          WITH USER_MODE
        ],
        AccessLevel.USER_MODE
      );
      Assert.isTrue(
        seen.add(AgentImportStamp.of(seasonId, camp.Id)),
        'week off'
      );
      // A camp word.
      Database.insert(
        new CampLabel__c(
          Camp__c = camp.Id,
          ModelTerm__c = 'Group',
          Singular__c = 'Bunk',
          Plural__c = 'Bunks'
        ),
        AccessLevel.USER_MODE
      );
      Assert.isTrue(
        seen.add(AgentImportStamp.of(seasonId, camp.Id)),
        'camp word'
      );
      Test.stopTest();
    }
  }

  // API-1.84: Import last year's stamp also covers the weeks' schedules; the setup's does not.
  @IsTest
  static void importLastYearsStampAlsoSeesTheWeeksSchedules() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Cedar Brook (made up)');
      Id seasonId = ShoreshTestData.fullSeason(camp.Id).Id;
      Map<String, Id> made = ShoreshTestData.lastSeasonIds;
      String setup = AgentImportStamp.of(seasonId, camp.Id);
      String withSchedules = AgentImportStamp.withSchedules(seasonId, camp.Id);
      Test.startTest();
      ShoreshTestData.savedVersion(
        made.get('Main'),
        made.get('Week 1'),
        'Kept'
      );
      String setupAfter = AgentImportStamp.of(seasonId, camp.Id);
      String withSchedulesAfter = AgentImportStamp.withSchedules(
        seasonId,
        camp.Id
      );
      Test.stopTest();
      Assert.areEqual(setup, setupAfter);
      Assert.areNotEqual(withSchedules, withSchedulesAfter);
    }
  }

  // A list inside a query longer than 200 is read in parts, not refused: 201 groups in one
  // division read, and a 202nd seen.
  @IsTest
  static void moreThan200InOneListAreAllRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Cedar Brook (made up)');
      Id seasonId = ShoreshTestData.fullSeason(camp.Id).Id;
      Id divisionId = ShoreshTestData.lastSeasonIds.get('Juniors');
      List<Group__c> groups = new List<Group__c>();
      for (Integer i = 0; i < 199; i++) {
        groups.add(
          new Group__c(
            Division__c = divisionId,
            Name = 'Bunk ' + i,
            Availability__c = 'MorningOnly',
            SortOrder__c = i + 3
          )
        );
      }
      Database.insert(groups, AccessLevel.USER_MODE);
      String before = AgentImportStamp.of(seasonId, camp.Id);
      Test.startTest();
      ImportKeys keys = new ImportKeys(seasonId, CampLabels.forCamp(camp.Id));
      ShoreshTestData.groupIn(divisionId, 'Bunk 199');
      String after = AgentImportStamp.of(seasonId, camp.Id);
      Test.stopTest();
      Assert.areEqual(
        202,
        [SELECT COUNT() FROM Group__c WHERE Division__c = :divisionId]
      );
      for (Group__c grp : groups) {
        Assert.isTrue(keys.knows(grp.Id), 'every group is the season\'s');
      }
      Assert.areNotEqual(before, after, 'the 202nd group is seen');
    }
  }
}
