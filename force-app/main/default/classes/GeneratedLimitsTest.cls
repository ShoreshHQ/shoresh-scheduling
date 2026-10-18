/**
 * Generated Schedule stays well inside Salesforce's limits on a realistic week: 8 groups (two
 * divisions), 5 days, 8 time blocks, a fixed activity every morning. Opening the week and each
 * kind of save use a small, fixed number of queries, whatever the size of the week (no query per
 * day, group or cell). Synthetic camp.
 */
@IsTest
private class GeneratedLimitsTest {
  // Each call is one request from the screen: Salesforce allows 100 queries in one. Measured
  // in shoresh-test (2026-10-18), on the smaller camp: opening a week 18 (not generated yet) or
  // 12, the first Generate 21, Fill the open cells 14, a Rebuild with its version 19. The bound
  // is per request, whatever the week's size: no query runs per day, group or cell.
  private static final Integer MOST_QUERIES = 25;

  private static Map<String, Id> bigCamp() {
    SetTimeGuard.defer();
    try {
      return bigCampDeferred();
    } finally {
      SetTimeGuard.resume();
    }
  }

  private static Map<String, Id> bigCampDeferred() {
    Camp__c camp = ShoreshTestData.camp('Camp Cedar');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    Program__c program = ShoreshTestData.program(season.Id, 'Main');
    Database.update(
      new Program__c(Id = program.Id, Friday__c = true),
      AccessLevel.SYSTEM_MODE
    );
    List<TimeBlock__c> blocks = new List<TimeBlock__c>();
    for (Integer hour = 8; hour < 16; hour++) {
      blocks.add(
        new TimeBlock__c(
          Program__c = program.Id,
          Name = 'Period ' + (hour - 7),
          StartTime__c = Time.newInstance(hour, 0, 0, 0),
          EndTime__c = Time.newInstance(hour, 45, 0, 0),
          PartOfDay__c = hour < 12 ? 'Morning' : 'Afternoon',
          SortOrder__c = hour
        )
      );
    }
    Database.insert(blocks, AccessLevel.SYSTEM_MODE);
    List<Division__c> divisions = new List<Division__c>{
      new Division__c(
        Program__c = program.Id,
        Name = 'Juniors',
        SortOrder__c = 1
      ),
      new Division__c(
        Program__c = program.Id,
        Name = 'Seniors',
        SortOrder__c = 2
      )
    };
    Database.insert(divisions, AccessLevel.SYSTEM_MODE);
    List<Group__c> groups = new List<Group__c>();
    for (Integer g = 0; g < 8; g++) {
      groups.add(
        new Group__c(
          Division__c = divisions[g / 4].Id,
          // ShoreshTestData.placesAndActivities sets Swim up for Group A.
          Name = g == 0 ? 'Group A' : 'Bunk ' + (g + 1),
          Availability__c = 'AllDay',
          SortOrder__c = g
        )
      );
    }
    Database.insert(groups, AccessLevel.SYSTEM_MODE);
    Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
    ids.put('Camp', camp.Id);
    ids.put('Season', season.Id);
    ids.put('Main', program.Id);
    ids.put('Week 1', week.Id);
    Database.insert(
      new FixedActivity__c(
        Program__c = program.Id,
        Name = 'Flagpole',
        TimeBlock__c = blocks[0].Id,
        Length__c = 1
      ),
      AccessLevel.SYSTEM_MODE
    );
    SetTimeGuard.checkPending();
    GeneratedTestData.ids = ids;
    return ids;
  }

  /** Every Open cell filled, the three activities in turn, as a generated week would be. */
  private static GeneratedWeek.Save built(
    GeneratedInputs.Inputs read,
    String action
  ) {
    GeneratedWeek.Save save = GeneratedTestData.request(read, action, 1);
    List<String> names = new List<String>{ 'Swim', 'Soccer', 'Gym games' };
    Integer turn = 0;
    for (GeneratedWeek.Day day : save.days) {
      for (Integer g = 0; g < day.groupIds.size(); g++) {
        List<String> cells = day.rows[g].split(',', -1);
        for (Integer b = 0; b < cells.size(); b++) {
          if (String.isBlank(cells[b])) {
            GeneratedTestData.put(
              day,
              GeneratedTestData.at(g, b),
              names[Math.mod(turn++, names.size())]
            );
          }
        }
      }
    }
    return save;
  }

  private static void assertFew(Integer used, String what) {
    Assert.isTrue(
      used <= MOST_QUERIES,
      what + ' used ' + used + ' queries (at most ' + MOST_QUERIES + ')'
    );
  }

  @IsTest
  static void openingAWeekUsesFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Integer used = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(5, read.days.size());
      Assert.areEqual(8, read.days[0].groups.size());
      Assert.areEqual(8, read.days[0].blocks.size());
      assertFew(used, 'Opening a week not generated yet');
    }
  }

  @IsTest
  static void theFirstSaveUsesFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
      GeneratedWeek.Save save = built(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE
      );
      Test.startTest();
      GeneratedWeek.Result result = GeneratedTestData.save(save);
      Integer used = Limits.getQueries();
      Test.stopTest();
      Assert.isFalse(result.conflict);
      assertFew(used, 'The first Generate');
    }
  }

  @IsTest
  static void aRebuildUsesFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
      Id draftId = GeneratedTestData.save(
          built(GeneratedTestData.inputs(), GeneratedSaves.GENERATE)
        )
        .scheduleId;
      GeneratedWeek.Save rebuild = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.REBUILD,
        2
      );
      Test.startTest();
      GeneratedWeek.Result result = GeneratedTestData.save(rebuild);
      Integer used = Limits.getQueries();
      GeneratedInputs.Inputs again = GeneratedTestData.inputs();
      Integer reading = Limits.getQueries() - used;
      Test.stopTest();
      Assert.isFalse(result.conflict);
      Assert.areEqual(draftId, again.scheduleId);
      assertFew(used, 'A Rebuild (with its version)');
      assertFew(reading, 'Opening a generated week');
    }
  }

  @IsTest
  static void aLockAndAHandEditUseFewQueries() {
    System.runAs(ShoreshTestData.scheduler()) {
      bigCamp();
      Id draftId = GeneratedTestData.save(
          built(GeneratedTestData.inputs(), GeneratedSaves.GENERATE)
        )
        .scheduleId;
      String revision = GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
      GeneratedWeek.LockChange wholeDay = new GeneratedWeek.LockChange();
      wholeDay.action = GeneratedWeek.LOCK;
      wholeDay.dateValue = GeneratedTestData.MONDAY;
      Test.startTest();
      GeneratedWeek.Locked locked = GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{ wholeDay },
        revision
      );
      Integer locking = Limits.getQueries();
      // A hand edit on Tuesday (not locked): Period 2 of the first group, cleared.
      ScheduleViews.DayView tuesday = locked.schedule.days[1];
      SlotEdits.Run run = new SlotEdits.Run();
      run.day = tuesday.dateValue;
      run.groupId = tuesday.groups[0].id;
      run.firstBlockId = tuesday.blocks[1].id;
      run.blockIds = new List<String>{ tuesday.blocks[1].id };
      run.before = new List<String>{
        SlotIds.ofRow(ScheduleDays.read(draftId)[1].grid, 0)[1]
      };
      run.after = new List<String>{ '' };
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>{ run };
      Integer before = Limits.getQueries();
      SlotEdits.Result edited = GeneratedScheduleController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{ edit },
        locked.revision
      );
      Integer editing = Limits.getQueries() - before;
      Assert.isFalse(locked.conflict);
      Assert.isTrue(edited.conflicts.isEmpty());
      Assert.isNotNull(edited.revision);
      assertFew(locking, 'Locking a whole day');
      assertFew(editing, 'A hand edit');
    }
  }
}
