@IsTest
private class SeasonCopierTest {
  private static final Date NEW_START = Date.newInstance(2027, 6, 28); // Monday, 52 weeks later

  // Everything about the original season, read with every field the copy could touch plus
  // the system timestamps, so "exactly unchanged" means unchanged.
  private class Snapshot {
    List<Season__c> seasons;
    List<Week__c> weeks;
    List<Program__c> programs;
    List<Division__c> divisions;
    List<Group__c> groups;
    List<TimeBlock__c> blocks;
    List<WeekException__c> exceptions;

    Snapshot(Id seasonId) {
      seasons = [
        SELECT
          Id,
          Name,
          Camp__c,
          StartDate__c,
          EndDate__c,
          Status__c,
          CopiedFrom__c,
          OwnerId,
          LastModifiedDate,
          LastModifiedById,
          SystemModstamp
        FROM Season__c
        WHERE Id = :seasonId
        WITH SYSTEM_MODE
      ];
      weeks = [
        SELECT
          Id,
          Name,
          Season__c,
          StartDate__c,
          EndDate__c,
          SortOrder__c,
          Key__c,
          LastModifiedDate,
          SystemModstamp
        FROM Week__c
        WHERE Season__c = :seasonId
        WITH SYSTEM_MODE
        ORDER BY Id
      ];
      programs = [
        SELECT
          Id,
          Name,
          Season__c,
          Monday__c,
          Tuesday__c,
          Wednesday__c,
          Thursday__c,
          Friday__c,
          SortOrder__c,
          CopiedFrom__c,
          LastModifiedDate,
          SystemModstamp
        FROM Program__c
        WHERE Season__c = :seasonId
        WITH SYSTEM_MODE
        ORDER BY Id
      ];
      divisions = [
        SELECT
          Id,
          Name,
          Program__c,
          SortOrder__c,
          CopiedFrom__c,
          LastModifiedDate,
          SystemModstamp
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId
        WITH SYSTEM_MODE
        ORDER BY Id
      ];
      groups = [
        SELECT
          Id,
          Name,
          Division__c,
          Availability__c,
          SortOrder__c,
          CopiedFrom__c,
          LastModifiedDate,
          SystemModstamp
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
        WITH SYSTEM_MODE
        ORDER BY Id
      ];
      blocks = [
        SELECT
          Id,
          Name,
          Program__c,
          StartTime__c,
          EndTime__c,
          PartOfDay__c,
          SortOrder__c,
          CopiedFrom__c,
          LastModifiedDate,
          SystemModstamp
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :seasonId
        WITH SYSTEM_MODE
        ORDER BY Id
      ];
      exceptions = [
        SELECT Id, Week__c, Group__c, LastModifiedDate, SystemModstamp
        FROM WeekException__c
        WHERE Week__r.Season__c = :seasonId
        WITH SYSTEM_MODE
        ORDER BY Id
      ];
    }

    void assertSameAs(Snapshot other) {
      Assert.areEqual(other.seasons, seasons);
      Assert.areEqual(other.weeks, weeks);
      Assert.areEqual(other.programs, programs);
      Assert.areEqual(other.divisions, divisions);
      Assert.areEqual(other.groups, groups);
      Assert.areEqual(other.blocks, blocks);
      Assert.areEqual(other.exceptions, exceptions);
    }
  }

  // A full season, a snapshot of it, and its copy.
  private class Copied {
    Id campId;
    Id originalId;
    Snapshot before;
    Snapshot copy;

    Copied() {
      campId = ShoreshTestData.camp('Camp Willow').Id;
      originalId = ShoreshTestData.fullSeason(campId).Id;
      before = new Snapshot(originalId);
      Test.startTest();
      Id copyId = new SeasonCopier(originalId, NEW_START).copy('Summer 2027');
      Test.stopTest();
      copy = new Snapshot(copyId);
    }
  }

  // WEEK-1.4
  @IsTest
  static void copyLeavesTheOriginalExactlyUnchanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Copied result = new Copied();
      Snapshot after = new Snapshot(result.originalId);
      Assert.areEqual(
        6,
        after.weeks.size(),
        'The original still has its weeks'
      );
      after.assertSameAs(result.before);
    }
  }

  @IsTest
  static void theNewSeasonHasNewDatesAndLinksToTheOriginal() {
    System.runAs(ShoreshTestData.scheduler()) {
      Copied result = new Copied();
      Season__c season = result.copy.seasons[0];
      Assert.areEqual('Summer 2027', season.Name);
      Assert.areEqual(result.originalId, season.CopiedFrom__c);
      Assert.areEqual(result.campId, season.Camp__c);
      Assert.areEqual('Planning', season.Status__c);
      Assert.areEqual(NEW_START, season.StartDate__c);
      Assert.areEqual(Date.newInstance(2027, 8, 6), season.EndDate__c);
    }
  }

  // WEEK-1.4
  @IsTest
  static void everyWeekMovesByTheSameNumberOfDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Copied result = new Copied();
      Assert.areEqual(6, result.copy.weeks.size());
      Map<Decimal, Week__c> oldWeeks = new Map<Decimal, Week__c>();
      for (Week__c week : result.before.weeks) {
        oldWeeks.put(week.SortOrder__c, week);
      }
      for (Week__c week : result.copy.weeks) {
        Week__c old = oldWeeks.get(week.SortOrder__c);
        Assert.areEqual(old.Name, week.Name);
        Assert.areEqual(old.StartDate__c.addDays(364), week.StartDate__c);
        Assert.areEqual(old.EndDate__c.addDays(364), week.EndDate__c);
      }
    }
  }

  // WEEK-1.4
  @IsTest
  static void programsDivisionsGroupsAndBlocksAreLinkedCopies() {
    System.runAs(ShoreshTestData.scheduler()) {
      Copied result = new Copied();
      assertLinked(result.before.programs, result.copy.programs);
      assertLinked(result.before.divisions, result.copy.divisions);
      assertLinked(result.before.groups, result.copy.groups);
      assertLinked(result.before.blocks, result.copy.blocks);
      Assert.areEqual(false, result.copy.programs[0].Friday__c);
      Assert.areEqual(
        result.before.groups[0].Availability__c,
        result.copy.groups[0].Availability__c
      );
      Assert.areEqual(
        result.before.blocks[0].StartTime__c,
        result.copy.blocks[0].StartTime__c
      );

      // Each copied record hangs under the copied parent, never the original.
      Set<Id> copiedProgramIds = new Map<Id, Program__c>(result.copy.programs)
        .keySet();
      for (Division__c division : result.copy.divisions) {
        Assert.isTrue(copiedProgramIds.contains(division.Program__c));
      }
      for (TimeBlock__c block : result.copy.blocks) {
        Assert.isTrue(copiedProgramIds.contains(block.Program__c));
      }
    }
  }

  @IsTest
  static void weekExceptionsMoveToTheCopiedWeekAndGroup() {
    System.runAs(ShoreshTestData.scheduler()) {
      Copied result = new Copied();
      Assert.areEqual(1, result.copy.exceptions.size());
      WeekException__c copied = [
        SELECT Week__r.SortOrder__c, Week__r.Season__c, Group__r.CopiedFrom__c
        FROM WeekException__c
        WHERE Id = :result.copy.exceptions[0].Id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(3, copied.Week__r.SortOrder__c);
      Assert.areEqual(result.copy.seasons[0].Id, copied.Week__r.Season__c);
      Assert.areEqual(
        result.before.exceptions[0].Group__c,
        copied.Group__r.CopiedFrom__c
      );
    }
  }

  private static void assertLinked(
    List<SObject> originals,
    List<SObject> copies
  ) {
    Assert.areEqual(originals.size(), copies.size());
    Map<Id, SObject> byId = new Map<Id, SObject>(originals);
    for (SObject copy : copies) {
      SObject original = byId.get((Id) copy.get('CopiedFrom__c'));
      Assert.isNotNull(original, 'Every copy links to its original');
      Assert.areEqual(original.get('Name'), copy.get('Name'));
      Assert.areEqual(original.get('SortOrder__c'), copy.get('SortOrder__c'));
    }
  }

  @IsTest
  static void previewWarnsWhenWeeksLandOnDifferentWeekdays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c original = ShoreshTestData.fullSeason(camp.Id);

      SeasonCopier.Preview sameDays = new SeasonCopier(
          original.Id,
          Date.newInstance(2027, 6, 28)
        )
        .preview();
      Assert.isFalse(sameDays.weekdaysChange);
      Assert.areEqual('Monday', sameDays.newWeekday);
      Assert.areEqual(6, sameDays.weeks.size());
      Assert.areEqual(
        Date.newInstance(2027, 6, 28),
        sameDays.weeks[0].startDate
      );
      Assert.areEqual(
        Date.newInstance(2026, 6, 29),
        sameDays.weeks[0].oldStartDate
      );

      SeasonCopier.Preview shifted = new SeasonCopier(
          original.Id,
          Date.newInstance(2027, 6, 29)
        )
        .preview();
      Assert.isTrue(shifted.weekdaysChange);
      Assert.areEqual('Monday', shifted.oldWeekday);
      Assert.areEqual('Tuesday', shifted.newWeekday);
      Assert.areEqual(Date.newInstance(2027, 8, 7), shifted.endDate);
    }
  }

  @IsTest
  static void copyNeedsANameAndAStartDate() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Database.insert(
        new CampLabel__c(
          Camp__c = camp.Id,
          ModelTerm__c = 'Season',
          Singular__c = 'Summer',
          Plural__c = 'Summers'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Season__c original = ShoreshTestData.season(camp.Id, 'Summer 2026');
      try {
        new SeasonCopier(original.Id, Date.newInstance(2027, 6, 28)).copy('  ');
        Assert.fail('A blank name is refused');
      } catch (SeasonCopier.CopyException e) {
        Assert.areEqual('Give the new Summer a name.', e.getMessage());
      }
      try {
        new SeasonCopier(original.Id, null);
        Assert.fail('A missing date is refused');
      } catch (SeasonCopier.CopyException e) {
        Assert.areEqual(
          'Choose a start date for the new Summer.',
          e.getMessage()
        );
      }
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void aSchedulerWithThePermissionSetCanCopy() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    User scheduler = ShoreshTestData.scheduler();
    Season__c original;
    System.runAs(scheduler) {
      original = ShoreshTestData.fullSeason(camp.Id);
      Id copyId = new SeasonCopier(original.Id, Date.newInstance(2027, 6, 28))
        .copy('Summer 2027');
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :copyId
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void aUserWithoutShoreshAccessCannotCopy() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c original = ShoreshTestData.fullSeason(camp.Id);
    // A Standard User without the permission set cannot even read the season.
    User outsider = ShoreshTestData.outsider();
    System.runAs(outsider) {
      try {
        new SeasonCopier(original.Id, Date.newInstance(2027, 6, 28))
          .copy('Summer 2027');
        Assert.fail('Copy without access is refused');
      } catch (SeasonCopier.CopyException e) {
        Assert.areEqual(
          'That was not found, or you don\'t have access to it. Reload the page.',
          e.getMessage()
        );
      }
    }
    Assert.areEqual(1, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
  }

  @IsTest
  static void aSchedulerCanCopyASeasonSharedWithThem() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c original = ShoreshTestData.fullSeason(camp.Id);
    User scheduler = ShoreshTestData.scheduler();
    Database.insert(
      new Season__Share(
        ParentId = original.Id,
        UserOrGroupId = scheduler.Id,
        AccessLevel = 'Read'
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(scheduler) {
      Id copyId = new SeasonCopier(original.Id, NEW_START).copy('Summer 2027');
      Assert.areEqual(
        scheduler.Id,
        [SELECT OwnerId FROM Season__c WHERE Id = :copyId WITH USER_MODE]
        .OwnerId,
        'The copy belongs to the scheduler who made it'
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :copyId
          WITH USER_MODE
        ]
      );
    }
  }
}
