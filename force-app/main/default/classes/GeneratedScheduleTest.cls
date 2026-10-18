/**
 * Generated Schedule's server side (ADR 0010, G2), as a scheduler with the Shoresh Scheduler
 * permission set: reading what the engine needs, the first save making the week's Generated
 * draft (beside Manual Build's, one per program and week), whole-week saves with the
 * schedule-level revision check, Rebuild and Start over keeping a version first, and every save
 * the server refuses. The engine itself runs in the browser; here the tests place cells as it
 * would. Synthetic camp (SetTimeTestData): Group A and Group B (Juniors), Group C (Seniors);
 * Period 1, Period 2, Lunch; Main runs Monday to Thursday; Group A is away in Week 3; Flagpole
 * (fixed) in Period 1 for everyone, Rest (recurring) at Monday's Lunch for the Seniors.
 */
@IsTest
private class GeneratedScheduleTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Integer GROUP_A = 0;
  private static final Integer GROUP_B = 1;
  private static final Integer GROUP_C = 2;
  private static final Integer PERIOD_1 = 0;
  private static final Integer PERIOD_2 = 1;
  private static final Integer LUNCH = 2;

  private static Map<String, Id> camp() {
    Map<String, Id> ids = SetTimeTestData.camp();
    FixedActivity__c flagpole = SetTimeTestData.fixed(
      ids,
      'Flagpole',
      'Period 1'
    );
    Database.insert(flagpole, AccessLevel.SYSTEM_MODE);
    ids.put('Flagpole', flagpole.Id);
    RecurringActivity__c rest = SetTimeTestData.recurring(ids, 'Rest', 'Lunch');
    Database.insert(rest, AccessLevel.SYSTEM_MODE);
    Database.insert(
      new Coverage__c(
        RecurringActivity__c = rest.Id,
        Division__c = ids.get('Seniors'),
        Season__c = ids.get('Season')
      ),
      AccessLevel.SYSTEM_MODE
    );
    ids.put('Rest', rest.Id);
    return ids;
  }

  private static GeneratedInputs.Inputs inputs(Map<String, Id> ids) {
    return GeneratedScheduleController.getInputs(
      ids.get('Main'),
      ids.get('Week 1')
    );
  }

  /** The week as read, ready to send back as the engine would after building it. */
  private static GeneratedWeek.Save request(
    Map<String, Id> ids,
    GeneratedInputs.Inputs read,
    String action,
    Integer option
  ) {
    GeneratedWeek.Save save = new GeneratedWeek.Save();
    save.programId = ids.get('Main');
    save.weekId = ids.get('Week 1');
    save.scheduleId = read.scheduleId;
    save.revision = read.revision;
    save.action = action;
    save.option = option;
    save.days = new List<GeneratedWeek.Day>();
    for (ScheduleViews.DayView view : read.days) {
      save.days.add(dayOf(view));
    }
    return save;
  }

  private static GeneratedWeek.Day dayOf(ScheduleViews.DayView view) {
    GeneratedWeek.Day day = new GeneratedWeek.Day();
    day.dateValue = view.dateValue;
    day.blockIds = new List<String>();
    for (ScheduleViews.Ref block : view.blocks) {
      day.blockIds.add(block.id);
    }
    day.groupIds = new List<String>();
    for (ScheduleViews.Ref grp : view.groups) {
      day.groupIds.add(grp.id);
    }
    day.items = new List<GeneratedWeek.Item>();
    for (ScheduleViews.Ref ref : view.items) {
      day.items.add(item(ref.kind, ref.id, ref.name));
    }
    day.rows = new List<String>(view.rows);
    return day;
  }

  private static GeneratedWeek.Item item(String kind, String id, String name) {
    GeneratedWeek.Item item = new GeneratedWeek.Item();
    item.kind = kind;
    item.id = id;
    item.name = name;
    return item;
  }

  /** Puts something in one cell of a day (one block long), as the engine would. */
  private static void put(
    GeneratedWeek.Day day,
    Integer g,
    Integer b,
    String kind,
    String id,
    String name
  ) {
    Integer number = -1;
    for (Integer i = 0; i < day.items.size(); i++) {
      if (day.items[i].kind == kind && day.items[i].id == id) {
        number = i + 1;
      }
    }
    if (number < 0) {
      day.items.add(item(kind, id, name));
      number = day.items.size();
    }
    setCell(day, g, b, String.valueOf(number));
  }

  private static void put(
    Map<String, Id> ids,
    GeneratedWeek.Day day,
    Integer g,
    Integer b,
    String activity
  ) {
    put(day, g, b, 'A', ids.get(activity), activity);
  }

  private static void setCell(
    GeneratedWeek.Day day,
    Integer g,
    Integer b,
    String token
  ) {
    List<String> cells = day.rows[g].split(',', -1);
    cells[b] = token;
    day.rows[g] = String.join(cells, ',');
  }

  /** Gym games in every group's Period 2, every day: what a generated week holds here. */
  private static GeneratedWeek.Save built(
    Map<String, Id> ids,
    GeneratedInputs.Inputs read,
    String action,
    Integer option,
    String activity
  ) {
    GeneratedWeek.Save save = request(ids, read, action, option);
    for (GeneratedWeek.Day day : save.days) {
      for (Integer g = 0; g < day.groupIds.size(); g++) {
        put(ids, day, g, PERIOD_2, activity);
      }
    }
    return save;
  }

  private static GeneratedWeek.Result save(GeneratedWeek.Save request) {
    return GeneratedScheduleController.saveWeek(request);
  }

  private static String refusal(GeneratedWeek.Save request) {
    try {
      save(request);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Expected the save to be refused');
    return null;
  }

  /** What a group's cells hold on a day of a saved schedule ('' Open, 'A:<Id>', '^A:<Id>'). */
  private static List<String> slots(Id scheduleId, Integer day, Integer g) {
    return SlotIds.ofRow(ScheduleDays.read(scheduleId)[day].grid, g);
  }

  private static String a(Map<String, Id> ids, String name) {
    return 'A:' + ids.get(name);
  }

  private static Integer generatedDrafts(Map<String, Id> ids) {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE
        Program__c = :ids.get('Main')
        AND Week__c = :ids.get('Week 1')
        AND Status__c = 'Draft'
        AND Origin__c = 'Generated'
      WITH SYSTEM_MODE
    ];
  }

  @IsTest
  static void aWeekNotGeneratedYetReadsAsABlankWeekWithTheSeasonsRecords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Activity__c = ids.get('Soccer')
          ),
          new WeekException__c(
            Week__c = ids.get('Week 2'),
            Activity__c = ids.get('Swim')
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      GeneratedInputs.Inputs read = inputs(ids);
      Test.stopTest();

      Assert.isNull(read.scheduleId);
      Assert.areEqual('', read.revision);
      Assert.isNull(read.option);
      // Main runs Monday to Thursday; Flagpole for everyone in Period 1, Rest for the Seniors
      // at Monday's Lunch, the rest Open.
      Assert.areEqual(4, read.days.size());
      Assert.areEqual(MONDAY, read.days[0].dateValue);
      ScheduleViews.DayView monday = read.days[0];
      Assert.areEqual(3, monday.groups.size());
      Assert.areEqual('F', monday.items[0].kind);
      Assert.areEqual(ids.get('Flagpole'), monday.items[0].id);
      Assert.areEqual('1,,', monday.rows[GROUP_A]);
      Assert.areEqual('1,,2', monday.rows[GROUP_C]);
      // The season's records, with the fields the engine reads.
      Assert.areEqual(3, read.activities.size());
      Activity__c swim = read.activities[0];
      Assert.areEqual('Swim', swim.Name);
      Assert.areEqual(1, swim.Length__c);
      Assert.areEqual(1, swim.GroupsAtOnce__c);
      Assert.areEqual(ids.get('Pool'), swim.Location__c);
      Assert.isFalse(read.eligibilities.isEmpty());
      Assert.areEqual(3, read.locations.size());
      Assert.areEqual(3, read.groups.size());
      Assert.areEqual('AllDay', read.groups[0].Availability__c);
      Assert.areEqual(3, read.timeBlocks.size());
      Assert.areEqual('Afternoon', read.timeBlocks[LUNCH].PartOfDay__c);
      Assert.areEqual(ids.get('Flagpole'), read.fixedActivities[0].Id);
      Assert.areEqual(ids.get('Rest'), read.recurringActivities[0].Id);
      // Only this week's exceptions.
      Assert.areEqual(1, read.weekExceptions.size());
      Assert.areEqual(ids.get('Soccer'), read.weekExceptions[0].Activity__c);
      // Reading saves nothing.
      Assert.areEqual(0, [SELECT COUNT() FROM Schedule__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void theFirstGenerateMakesTheGeneratedDraftBesideManualBuild() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      GeneratedWeek.Result result = save(
        built(ids, inputs(ids), GeneratedSaves.GENERATE, 3, 'Gym games')
      );
      Test.stopTest();

      Assert.isFalse(result.conflict);
      Assert.isNull(result.versionId);
      Schedule__c draft = [
        SELECT Name, Status__c, Origin__c, EngineOption__c, VersionReason__c
        FROM Schedule__c
        WHERE Id = :result.scheduleId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Generated Schedule', draft.Name);
      Assert.areEqual('Draft', draft.Status__c);
      Assert.areEqual('Generated', draft.Origin__c);
      Assert.areEqual(3, draft.EngineOption__c);
      Assert.isNull(draft.VersionReason__c);
      // Two separate schedules (Greg, 2026-10-17); Manual Build's is untouched.
      Assert.areNotEqual(manualId, result.scheduleId);
      Assert.areEqual(
        manualId,
        ManualDrafts.find(ids.get('Main'), ids.get('Week 1')).Id
      );
      Assert.areEqual(
        new List<String>{ 'F:' + ids.get('Flagpole'), '', '' },
        slots(manualId, 0, GROUP_A)
      );
      // A draft is not a version.
      Assert.areEqual(
        0,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))
          .size()
      );
      // Read again: the draft, what it was saved at, and its option.
      GeneratedInputs.Inputs again = inputs(ids);
      Assert.areEqual(result.scheduleId, again.scheduleId);
      Assert.areEqual(result.revision, again.revision);
      Assert.areEqual(
        '2026-06-29:1|2026-06-30:1|2026-07-01:1|2026-07-02:1',
        again.revision
      );
      Assert.areEqual(3, again.option);
      Assert.areEqual(
        new List<String>{
          'F:' + ids.get('Flagpole'),
          a(ids, 'Gym games'),
          'R:' + ids.get('Rest')
        },
        slots(result.scheduleId, 0, GROUP_C)
      );
    }
  }

  @IsTest
  static void twoFirstGeneratesMakeOneDraftAndTheSecondHearsOfIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      // Two people open the week before either has generated it.
      GeneratedInputs.Inputs mine = inputs(ids);
      GeneratedInputs.Inputs theirs = inputs(ids);
      GeneratedWeek.Result first = save(
        built(ids, theirs, GeneratedSaves.GENERATE, 1, 'Gym games')
      );
      // The second waits for the program's lock, then finds the first one's draft.
      GeneratedWeek.Result second = save(
        built(ids, mine, GeneratedSaves.GENERATE, 1, 'Soccer')
      );
      Test.stopTest();

      Assert.isFalse(first.conflict);
      Assert.isTrue(second.conflict);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, second.message);
      Assert.isNull(second.scheduleId);
      Assert.areEqual(1, generatedDrafts(ids));
      Assert.areEqual(
        a(ids, 'Gym games'),
        slots(first.scheduleId, 0, GROUP_A)[PERIOD_2]
      );
    }
  }

  @IsTest
  static void aSaveOverSomeoneElsesNewerSaveIsAConflictAndWritesNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      save(built(ids, inputs(ids), GeneratedSaves.GENERATE, 1, 'Gym games'));
      Test.startTest();
      GeneratedInputs.Inputs mine = inputs(ids);
      GeneratedInputs.Inputs theirs = inputs(ids);
      GeneratedWeek.Result tried = save(
        built(ids, theirs, GeneratedSaves.TRY_ANOTHER, 2, 'Soccer')
      );
      GeneratedWeek.Result late = save(
        built(ids, mine, GeneratedSaves.REBUILD, 1, 'Swim')
      );
      Test.stopTest();

      Assert.isFalse(tried.conflict);
      Assert.isTrue(late.conflict);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, late.message);
      // Theirs stands: their option, their cells, their revision; no version was kept.
      Schedule__c draft = [
        SELECT EngineOption__c
        FROM Schedule__c
        WHERE Id = :tried.scheduleId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(2, draft.EngineOption__c);
      Assert.areEqual(
        a(ids, 'Soccer'),
        slots(tried.scheduleId, 0, GROUP_A)[PERIOD_2]
      );
      Assert.areEqual(tried.revision, inputs(ids).revision);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Version'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void rebuildAndStartOverKeepTheWeekAsAVersionFirst() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = save(
          built(ids, inputs(ids), GeneratedSaves.GENERATE, 4, 'Gym games')
        )
        .scheduleId;
      Test.startTest();
      GeneratedWeek.Result rebuilt = save(
        built(ids, inputs(ids), GeneratedSaves.REBUILD, 4, 'Soccer')
      );
      GeneratedWeek.Result tried = save(
        built(ids, inputs(ids), GeneratedSaves.TRY_ANOTHER, 5, 'Gym games')
      );
      GeneratedWeek.Result filled = save(
        request(ids, inputs(ids), GeneratedSaves.FILL_OPEN, 5)
      );
      GeneratedWeek.Result startedOver = save(
        built(ids, inputs(ids), GeneratedSaves.START_OVER, 6, 'Swim')
      );
      Test.stopTest();

      // Try another and Fill the open cells keep no version.
      Assert.isNull(tried.versionId);
      Assert.isNull(filled.versionId);
      Assert.isNotNull(rebuilt.versionId);
      Assert.isNotNull(startedOver.versionId);
      Schedule__c beforeRebuild = [
        SELECT
          Name,
          Status__c,
          Origin__c,
          VersionReason__c,
          SourceSchedule__c,
          EngineOption__c,
          Program__c,
          Week__c
        FROM Schedule__c
        WHERE Id = :rebuilt.versionId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Before Rebuild', beforeRebuild.Name);
      Assert.areEqual('Version', beforeRebuild.Status__c);
      Assert.areEqual('Generated', beforeRebuild.Origin__c);
      Assert.areEqual('AutoSaved', beforeRebuild.VersionReason__c);
      Assert.areEqual(draftId, beforeRebuild.SourceSchedule__c);
      Assert.areEqual(4, beforeRebuild.EngineOption__c);
      Assert.areEqual(ids.get('Week 1'), beforeRebuild.Week__c);
      // The version holds the week as it was before the rebuild, every day of it.
      Assert.areEqual(4, ScheduleDays.read(rebuilt.versionId).size());
      Assert.areEqual(
        a(ids, 'Gym games'),
        slots(rebuilt.versionId, 3, GROUP_B)[PERIOD_2]
      );
      Schedule__c beforeStartOver = [
        SELECT Name, EngineOption__c
        FROM Schedule__c
        WHERE Id = :startedOver.versionId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Before Start over', beforeStartOver.Name);
      Assert.areEqual(5, beforeStartOver.EngineOption__c);
      Assert.areEqual(
        a(ids, 'Gym games'),
        slots(startedOver.versionId, 0, GROUP_A)[PERIOD_2]
      );
      // The draft is the newest week; both versions are listed.
      Assert.areEqual(draftId, startedOver.scheduleId);
      Assert.areEqual(a(ids, 'Swim'), slots(draftId, 0, GROUP_A)[PERIOD_2]);
      Assert.areEqual(
        2,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))
          .size()
      );
    }
  }

  @IsTest
  static void namesComeFromSetupNotFromTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      GeneratedWeek.Save request = request(
        ids,
        inputs(ids),
        GeneratedSaves.GENERATE,
        1
      );
      put(
        request.days[0],
        GROUP_A,
        PERIOD_2,
        'A',
        ids.get('Swim'),
        'Something else'
      );
      request.days[0].items[0].name = 'Not Flagpole';
      Test.startTest();
      Id draftId = save(request).scheduleId;
      Test.stopTest();
      ScheduleGrid monday = ScheduleDays.read(draftId)[0].grid;
      Assert.areEqual('Flagpole', monday.items[0].name);
      Assert.areEqual('Swim', monday.items[2].name);
    }
  }

  @IsTest
  static void fixedAndRecurringActivitiesStayWhereTheyAreSetUp() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      GeneratedInputs.Inputs read = inputs(ids);
      GeneratedWeek.Save cleared = request(
        ids,
        read,
        GeneratedSaves.GENERATE,
        1
      );
      setCell(cleared.days[0], GROUP_A, PERIOD_1, '');
      GeneratedWeek.Save covered = request(
        ids,
        read,
        GeneratedSaves.GENERATE,
        1
      );
      put(ids, covered.days[0], GROUP_C, LUNCH, 'Soccer');
      GeneratedWeek.Save placed = request(
        ids,
        read,
        GeneratedSaves.GENERATE,
        1
      );
      put(placed.days[1], GROUP_B, PERIOD_2, 'R', ids.get('Rest'), 'Rest');
      for (
        GeneratedWeek.Save request : new List<GeneratedWeek.Save>{
          cleared,
          covered,
          placed
        }
      ) {
        String refused = refusal(request);
        Assert.areEqual(
          'Fixed activities and recurring activities stay where they are set up.',
          refused
        );
      }
      Test.stopTest();
      Assert.areEqual(0, generatedDrafts(ids));
    }
  }

  @IsTest
  static void nothingIsPutWhereAGroupIsNotAtCampButALeftoverMayGo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      // Generated while Group B was at camp all day, with Soccer at Lunch.
      GeneratedWeek.Save first = request(
        ids,
        inputs(ids),
        GeneratedSaves.GENERATE,
        1
      );
      put(ids, first.days[0], GROUP_B, LUNCH, 'Soccer');
      Id draftId = save(first).scheduleId;
      Database.update(
        new Group__c(Id = ids.get('Group B'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      GeneratedWeek.Save away = request(
        ids,
        inputs(ids),
        GeneratedSaves.FILL_OPEN,
        1
      );
      put(ids, away.days[1], GROUP_B, LUNCH, 'Soccer');
      Assert.areEqual('Group B isn\'t at camp in Lunch.', refusal(away));
      // Fill the open cells keeps the leftover as it is.
      GeneratedWeek.Result kept = save(
        request(ids, inputs(ids), GeneratedSaves.FILL_OPEN, 1)
      );
      Assert.isFalse(kept.conflict);
      // A full build clears it (ADR 0010 §3).
      GeneratedWeek.Save cleared = request(
        ids,
        inputs(ids),
        GeneratedSaves.TRY_ANOTHER,
        2
      );
      setCell(cleared.days[0], GROUP_B, LUNCH, '');
      Assert.isFalse(save(cleared).conflict);
      Test.stopTest();
      Assert.areEqual('', slots(draftId, 0, GROUP_B)[LUNCH]);
    }
  }

  @IsTest
  static void onlyThisSeasonsActivitiesArePlaced() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Other summer');
      Activity__c stranger = ShoreshTestData.activity(
        other.Id,
        'Archery',
        null
      );
      Database.insert(stranger, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      GeneratedInputs.Inputs read = inputs(ids);
      GeneratedWeek.Save otherSeason = request(
        ids,
        read,
        GeneratedSaves.GENERATE,
        1
      );
      put(otherSeason.days[0], GROUP_A, PERIOD_2, 'A', stranger.Id, 'Archery');
      Assert.areEqual(
        'That activity was not found. It may have been deleted.',
        refusal(otherSeason)
      );
      // Something not set up yet (a trip) is only ever kept from an import, never placed.
      GeneratedWeek.Save trip = request(ids, read, GeneratedSaves.GENERATE, 1);
      put(trip.days[0], GROUP_A, PERIOD_2, 'T', '', 'Zoo trip');
      Assert.areEqual(
        'That change could not be read. Reload the page and try again.',
        refusal(trip)
      );
      Test.stopTest();
      Assert.areEqual(0, generatedDrafts(ids));
    }
  }

  @IsTest
  static void theWeekSentMustBeTheDraftsOwnDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      save(built(ids, inputs(ids), GeneratedSaves.GENERATE, 1, 'Gym games'));
      Test.startTest();
      GeneratedInputs.Inputs read = inputs(ids);
      String unreadable = 'That change could not be read. Reload the page and try again.';
      GeneratedWeek.Save dayMissing = request(
        ids,
        read,
        GeneratedSaves.TRY_ANOTHER,
        2
      );
      dayMissing.days.remove(3);
      Assert.areEqual(unreadable, refusal(dayMissing));
      GeneratedWeek.Save dayTwice = request(
        ids,
        read,
        GeneratedSaves.TRY_ANOTHER,
        2
      );
      dayTwice.days[3].dateValue = MONDAY;
      Assert.areEqual(unreadable, refusal(dayTwice));
      GeneratedWeek.Save otherBlocks = request(
        ids,
        read,
        GeneratedSaves.TRY_ANOTHER,
        2
      );
      String first = otherBlocks.days[0].blockIds[0];
      otherBlocks.days[0].blockIds[0] = otherBlocks.days[0].blockIds[1];
      otherBlocks.days[0].blockIds[1] = first;
      Assert.areEqual(unreadable, refusal(otherBlocks));
      GeneratedWeek.Save shortRow = request(
        ids,
        read,
        GeneratedSaves.TRY_ANOTHER,
        2
      );
      shortRow.days[0].rows[GROUP_A] = '1,';
      Assert.isTrue(
        refusal(shortRow).startsWith('That change could not be read: '),
        'A row of the wrong length is refused'
      );
      Test.stopTest();
    }
  }

  @IsTest
  static void aFirstGenerateAfterSetupChangedItsDaysIsAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      GeneratedInputs.Inputs read = inputs(ids);
      // A time block added after the week was read: the blank week isn't what was built on.
      ShoreshTestData.timeBlock(ids.get('Main'), 'Period 3', 11);
      Test.startTest();
      GeneratedWeek.Result result = save(
        built(ids, read, GeneratedSaves.GENERATE, 1, 'Gym games')
      );
      Test.stopTest();
      Assert.isTrue(result.conflict);
      Assert.areEqual(0, generatedDrafts(ids));
    }
  }

  @IsTest
  static void onlyThisWeeksGeneratedDraftCanBeSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      GeneratedWeek.Result generated = save(
        built(ids, inputs(ids), GeneratedSaves.GENERATE, 1, 'Gym games')
      );
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      Test.startTest();
      GeneratedInputs.Inputs read = inputs(ids);

      GeneratedWeek.Save onVersion = request(
        ids,
        read,
        GeneratedSaves.REBUILD,
        1
      );
      onVersion.scheduleId = version.Id;
      Assert.areEqual('A saved version can\'t be changed.', refusal(onVersion));

      GeneratedWeek.Save onManual = request(
        ids,
        read,
        GeneratedSaves.REBUILD,
        1
      );
      onManual.scheduleId = manualId;
      String notHere = 'Only this week\'s Generated Schedule can be saved here. Reload the page.';
      Assert.areEqual(notHere, refusal(onManual));

      GeneratedWeek.Save otherWeek = request(
        ids,
        read,
        GeneratedSaves.REBUILD,
        1
      );
      otherWeek.weekId = ids.get('Week 2');
      Assert.areEqual(notHere, refusal(otherWeek));

      String unreadable = 'That change could not be read. Reload the page and try again.';
      GeneratedWeek.Save generateAgain = request(
        ids,
        read,
        GeneratedSaves.GENERATE,
        1
      );
      Assert.areEqual(unreadable, refusal(generateAgain));
      GeneratedWeek.Save rebuildNothing = request(
        ids,
        read,
        GeneratedSaves.REBUILD,
        1
      );
      rebuildNothing.scheduleId = null;
      rebuildNothing.revision = '';
      Assert.areEqual(unreadable, refusal(rebuildNothing));
      GeneratedWeek.Save unknownAction = request(ids, read, 'Publish', 1);
      Assert.areEqual(unreadable, refusal(unknownAction));

      for (Integer option : new List<Integer>{ null, 0, -1, 10000 }) {
        GeneratedWeek.Save badOption = request(
          ids,
          read,
          GeneratedSaves.TRY_ANOTHER,
          option
        );
        Assert.areEqual('That option can\'t be built.', refusal(badOption));
      }
      Test.stopTest();
      // Nothing changed: the draft is as generated, and no version was kept.
      Assert.areEqual(generated.revision, inputs(ids).revision);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Version'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void aDayThatCannotBeReadIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = save(
          built(ids, inputs(ids), GeneratedSaves.GENERATE, 1, 'Gym games')
        )
        .scheduleId;
      GeneratedInputs.Inputs read = inputs(ids);
      ScheduleDay__c stored = [
        SELECT Id
        FROM ScheduleDay__c
        WHERE Schedule__c = :draftId AND Date__c = :MONDAY
        WITH SYSTEM_MODE
      ];
      Database.update(
        new ScheduleDay__c(Id = stored.Id, Grid__c = 'not a grid'),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      String refused = refusal(request(ids, read, GeneratedSaves.REBUILD, 1));
      Test.stopTest();
      Assert.isTrue(refused.startsWith('This day could not be read'), refused);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Version'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void someoneWithoutShoreshCanNeitherReadNorSave() {
    Map<String, Id> ids;
    GeneratedWeek.Save request;
    System.runAs(ShoreshTestData.scheduler()) {
      ids = camp();
      request = built(ids, inputs(ids), GeneratedSaves.GENERATE, 1, 'Swim');
    }
    System.runAs(ShoreshTestData.outsider()) {
      try {
        inputs(ids);
        Assert.fail('An outsider read the week.');
      } catch (Exception e) {
        Assert.isInstanceOfType(e, AuraHandledException.class);
      }
      try {
        save(request);
        Assert.fail('An outsider saved the week.');
      } catch (Exception e) {
        Assert.isInstanceOfType(e, AuraHandledException.class);
      }
    }
    Assert.areEqual(0, generatedDrafts(ids));
  }
}
