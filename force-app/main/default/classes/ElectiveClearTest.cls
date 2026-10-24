/**
 * End-of-season Clear and the downloads' read (electives slice E10; repo ADR 0018 choices 38 to
 * 45). Clear removes exactly what its picture showed: the runs with their choices and seats, and
 * the campers no remaining run uses; elective sets, offerings and linked choices stay. The whole
 * season and one week, a picture gone stale, a run still being worked on, and nothing to clear.
 * Every test acts as a scheduler with only the Shoresh Scheduler permission set and makes its
 * records inside the same runAs; requests are bounded in queries and rows for 270 campers. Names
 * and numbers are made up.
 */
@IsTest
private class ElectiveClearTest {
  private static final Date WEEK_1_MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date WEEK_2_MONDAY = WEEK_1_MONDAY.addDays(7);
  // Week 1: campers 0 to 259. Week 2: campers 0 to 129 again, and 260 to 269 new.
  private static final Integer CAMPER_COUNT = 270;
  private static final Integer WEEK_1 = 260;
  private static final Integer SHARED = 130;

  /**
   * A season with "Chugim" (Archery and Drama, and "Archery double" linked across Monday and
   * Wednesday) and a final run in Week 1 and in Week 2, each camper choosing Drama then Archery
   * and seated in Drama on the week's Monday, Period 1.
   */
  private class ClearCamp {
    Map<String, Id> ids;
    Id setId;
    List<Id> campers = new List<Id>();
    Id week1Run;
    Id week2Run;

    ClearCamp() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      makeMenu();
      List<Camper__c> made = new List<Camper__c>();
      for (Integer i = 0; i < CAMPER_COUNT; i++) {
        made.add(
          new Camper__c(
            Season__c = ids.get('Season'),
            Name = 'Synthetic Camper ' + i,
            CamperNumber__c = 'SYN-' + String.valueOf(i).leftPad(4, '0')
          )
        );
      }
      Database.insert(made, AccessLevel.USER_MODE);
      for (Camper__c camper : made) {
        campers.add(camper.Id);
      }
      week1Run = makeRun('Week 1', WEEK_1_MONDAY, 0, WEEK_1);
      week2Run = makeRun('Week 2', WEEK_2_MONDAY, 0, SHARED);
      addToRun(week2Run, WEEK_2_MONDAY, WEEK_1, CAMPER_COUNT);
    }

    void makeMenu() {
      List<Activity__c> activities = new List<Activity__c>{
        ShoreshTestData.activity(ids.get('Season'), 'Archery', null),
        ShoreshTestData.activity(ids.get('Season'), 'Drama', null)
      };
      Database.insert(activities, AccessLevel.USER_MODE);
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      setId = chugim.Id;
      List<Offering__c> offerings = new List<Offering__c>{
        new Offering__c(
          ElectiveSet__c = setId,
          Activity__c = activities[0].Id,
          Seats__c = 12
        ),
        new Offering__c(
          ElectiveSet__c = setId,
          Activity__c = activities[1].Id,
          NoSeatLimit__c = true
        )
      };
      Database.insert(offerings, AccessLevel.USER_MODE);
      ids.put('Archery', activities[0].Id);
      ids.put('Drama', activities[1].Id);
      ids.put('o:Archery', offerings[0].Id);
      ids.put('o:Drama', offerings[1].Id);
      LinkedChoice__c linked = new LinkedChoice__c(
        ElectiveSet__c = setId,
        Name = 'Archery double',
        Offering__c = offerings[0].Id,
        AppliesTo__c = 'All',
        SortOrder__c = 1
      );
      Database.insert(linked, AccessLevel.USER_MODE);
      Database.insert(
        new List<LinkedChoiceTime__c>{
          new LinkedChoiceTime__c(
            LinkedChoice__c = linked.Id,
            Weekday__c = 'Monday',
            TimeBlock__c = ids.get('Period 1')
          ),
          new LinkedChoiceTime__c(
            LinkedChoice__c = linked.Id,
            Weekday__c = 'Wednesday',
            TimeBlock__c = ids.get('Period 1')
          )
        },
        AccessLevel.USER_MODE
      );
    }

    /** A final run of the week with campers [first, last), and its schedule. */
    Id makeRun(String week, Date monday, Integer first, Integer last) {
      Schedule__c schedule = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get(week),
        Name = week,
        Status__c = 'Draft',
        Origin__c = 'Manual'
      );
      Database.insert(schedule, AccessLevel.USER_MODE);
      ElectiveRun__c run = new ElectiveRun__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim · ' + week,
        ElectiveSet__c = setId,
        Week__c = ids.get(week),
        Schedule__c = schedule.Id,
        Status__c = 'Final',
        FinalizedAt__c = Datetime.newInstance(
          monday,
          Time.newInstance(9, 0, 0, 0)
        ),
        Revision__c = 3
      );
      Database.insert(run, AccessLevel.USER_MODE);
      addToRun(run.Id, monday, first, last);
      return run.Id;
    }

    void addToRun(Id runId, Date monday, Integer first, Integer last) {
      List<Preference__c> prefs = new List<Preference__c>();
      List<Assignment__c> seats = new List<Assignment__c>();
      for (Integer i = first; i < last; i++) {
        Id grp = Math.mod(i, 2) == 0 ? ids.get('Group A') : ids.get('Group B');
        prefs.add(
          new Preference__c(
            ElectiveRun__c = runId,
            Camper__c = campers[i],
            Group__c = grp,
            Choices__c = '[{"n":"Drama","a":"' +
              ids.get('Drama') +
              '","r":1,"k":"ranked"},{"n":"Archery","a":"' +
              ids.get('Archery') +
              '","r":2,"k":"ranked"}]'
          )
        );
        seats.add(
          new Assignment__c(
            ElectiveRun__c = runId,
            Camper__c = campers[i],
            Group__c = grp,
            Date__c = monday,
            TimeBlock__c = ids.get('Period 1'),
            Offering__c = ids.get('o:Drama')
          )
        );
      }
      Database.insert(prefs, AccessLevel.USER_MODE);
      Database.insert(seats, AccessLevel.USER_MODE);
    }

    ElectiveClear.Result clear(Id weekId, String stamp) {
      ElectiveClear.ClearRequest request = new ElectiveClear.ClearRequest();
      request.seasonId = ids.get('Season');
      request.weekId = weekId;
      request.stamp = stamp;
      return ElectiveSeatsController.clearElectives(JSON.serialize(request));
    }

    String stamp() {
      return ElectiveSeatsController.clearPicture(ids.get('Season')).stamp;
    }
  }

  private static ElectiveClear.WeekCounts weekNamed(
    ElectiveClear.Picture picture,
    String name
  ) {
    for (ElectiveClear.WeekCounts week : picture.weeks) {
      if (week.name == name) {
        return week;
      }
    }
    Assert.fail('No week named ' + name);
    return null;
  }

  /** What stays, whatever was cleared: the set, its two offerings and the linked choice. */
  private static void assertMenuStays(ClearCamp camp) {
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM ElectiveSet__c WHERE Id = :camp.setId],
      'The set stays'
    );
    Assert.areEqual(
      2,
      [SELECT COUNT() FROM Offering__c WHERE ElectiveSet__c = :camp.setId],
      'The offerings stay'
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM LinkedChoice__c WHERE ElectiveSet__c = :camp.setId],
      'The linked choice stays'
    );
    Assert.areEqual(
      2,
      [
        SELECT COUNT()
        FROM LinkedChoiceTime__c
        WHERE LinkedChoice__r.ElectiveSet__c = :camp.setId
      ],
      'Its periods stay'
    );
    Assert.areEqual(
      2,
      [
        SELECT COUNT()
        FROM Activity__c
        WHERE
          Id IN :new List<Id>{ camp.ids.get('Archery'), camp.ids.get('Drama') }
      ],
      'The activities stay'
    );
  }

  private static String refusalOf(ClearCamp camp, Id weekId, String stamp) {
    try {
      camp.clear(weekId, stamp);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Refused');
    return null;
  }

  // ---------------------------------------------------------------- the picture

  @IsTest
  static void thePictureCountsEachWeekAndWhatStays() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();

      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveClear.Picture picture = ElectiveSeatsController.clearPicture(
        camp.ids.get('Season')
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 10, 'The picture is bounded: ' + used);
      Assert.areEqual('Summer 2026', picture.seasonName);
      Assert.areEqual(CAMPER_COUNT, picture.campers);
      Assert.areEqual(6, picture.weeks.size(), 'Every week is drawn');
      ElectiveClear.WeekCounts week1 = weekNamed(picture, 'Week 1');
      Assert.areEqual(WEEK_1, week1.campers);
      Assert.areEqual(WEEK_1 - SHARED, week1.campersOnlyHere);
      Assert.areEqual(WEEK_1 * 2, week1.choices, 'Two choices each');
      Assert.areEqual(WEEK_1, week1.seats);
      Assert.areEqual(1, week1.runs);
      Assert.areEqual(1, week1.finals);
      Assert.isTrue(week1.working.isEmpty());
      Assert.isTrue(week1.camperName.startsWith('Synthetic Camper '));
      ElectiveClear.WeekCounts week2 = weekNamed(picture, 'Week 2');
      Assert.areEqual(SHARED + CAMPER_COUNT - WEEK_1, week2.campers);
      Assert.areEqual(CAMPER_COUNT - WEEK_1, week2.campersOnlyHere);
      Assert.areEqual(0, weekNamed(picture, 'Week 3').runs);
      Assert.areEqual(new List<String>{ 'Chugim' }, picture.sets);
      Assert.areEqual(
        new List<String>{ 'Archery', 'Drama' },
        picture.offerings
      );
      Assert.areEqual(new List<String>{ 'Archery double' }, picture.linked);
      Assert.isTrue(String.isNotBlank(picture.stamp));
    }
  }

  // ---------------------------------------------------------------- the whole season

  @IsTest
  static void theWholeSeasonGoesAndTheMenuStays() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      String stamp = camp.stamp();
      List<Id> runIds = new List<Id>{ camp.week1Run, camp.week2Run };

      Test.startTest();
      Integer queries = Limits.getQueries();
      Integer rows = Limits.getDmlRows();
      ElectiveClear.Result result = camp.clear(null, stamp);
      queries = Limits.getQueries() - queries;
      rows = Limits.getDmlRows() - rows;
      Test.stopTest();

      Assert.isTrue(queries <= 25, 'Clear is bounded in queries: ' + queries);
      // The runs and the campers, each deleted and then emptied from the Recycle Bin, and the
      // run held first; their choices and seats go with them.
      Assert.isTrue(
        rows <= 2 * (CAMPER_COUNT + 2),
        'Clear is bounded in rows: ' + rows
      );
      Assert.areEqual(2, result.runs);
      Assert.areEqual(CAMPER_COUNT, result.campers);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Id IN :runIds],
        'The runs are gone'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Preference__c WHERE ElectiveRun__c IN :runIds],
        'Their choices are gone'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Assignment__c WHERE ElectiveRun__c IN :runIds],
        'Their seats are gone'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Camper__c WHERE Id IN :camp.campers],
        'Every camper is gone'
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Camper__c
          WHERE Id IN :camp.campers AND IsDeleted = TRUE
          ALL ROWS
        ],
        'Not in the Recycle Bin either'
      );
      assertMenuStays(camp);
      Assert.areEqual(0, result.picture.campers);
      Assert.areEqual(0, weekNamed(result.picture, 'Week 1').runs);
      Assert.areEqual(new List<String>{ 'Chugim' }, result.picture.sets);
    }
  }

  // ---------------------------------------------------------------- one week

  @IsTest
  static void oneWeekGoesWithTheCampersOnlyItHad() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      String stamp = camp.stamp();

      Test.startTest();
      Integer rows = Limits.getDmlRows();
      ElectiveClear.Result result = camp.clear(camp.ids.get('Week 1'), stamp);
      rows = Limits.getDmlRows() - rows;
      Test.stopTest();

      Assert.isTrue(
        rows <= 2 * (WEEK_1 - SHARED + 1) + 1,
        'Clear is bounded in rows: ' + rows
      );
      Assert.areEqual(1, result.runs);
      Assert.areEqual(WEEK_1 - SHARED, result.campers);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Id = :camp.week1Run]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Preference__c
          WHERE ElectiveRun__c = :camp.week1Run
        ]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Assignment__c
          WHERE ElectiveRun__c = :camp.week1Run
        ]
      );
      // Week 2 is as it was: its run, every choice and seat, and every camper it has.
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Id = :camp.week2Run]
      );
      Integer week2 = SHARED + CAMPER_COUNT - WEEK_1;
      Assert.areEqual(
        week2,
        [
          SELECT COUNT()
          FROM Preference__c
          WHERE ElectiveRun__c = :camp.week2Run
        ]
      );
      Assert.areEqual(
        week2,
        [
          SELECT COUNT()
          FROM Assignment__c
          WHERE ElectiveRun__c = :camp.week2Run
        ]
      );
      Assert.areEqual(
        week2,
        [SELECT COUNT() FROM Camper__c WHERE Id IN :camp.campers],
        'Only the campers no other week has went'
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Camper__c WHERE Id = :camp.campers[0]],
        'A camper in both weeks stays'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Camper__c WHERE Id = :camp.campers[WEEK_1 - 1]],
        'A camper only Week 1 had is gone'
      );
      assertMenuStays(camp);
    }
  }

  // ---------------------------------------------------------------- refusals

  @IsTest
  static void aPictureGoneStaleIsRefusedAndNothingGoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      String stamp = camp.stamp();
      // A save to a run since the picture was drawn.
      Database.update(
        new ElectiveRun__c(Id = camp.week2Run, Revision__c = 4),
        AccessLevel.USER_MODE
      );

      Test.startTest();
      String refusal = refusalOf(camp, null, stamp);
      Test.stopTest();

      Assert.areEqual(
        'Something changed since this was drawn. Look again, then clear.',
        refusal
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ElectiveRun__c
          WHERE Id IN :new List<Id>{ camp.week1Run, camp.week2Run }
        ]
      );
      Assert.areEqual(
        CAMPER_COUNT,
        [SELECT COUNT() FROM Camper__c WHERE Id IN :camp.campers]
      );
    }
  }

  @IsTest
  static void aRunStillBeingWorkedOnIsRefusedByName() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      Database.update(
        new ElectiveRun__c(
          Id = camp.week2Run,
          Status__c = 'Committed',
          FinalizedAt__c = null
        ),
        AccessLevel.USER_MODE
      );
      String stamp = camp.stamp();

      Test.startTest();
      String refusal = refusalOf(camp, null, stamp);
      // Week 1 alone has nothing in progress: it clears.
      ElectiveClear.Result week1 = camp.clear(camp.ids.get('Week 1'), stamp);
      Test.stopTest();

      Assert.areEqual(
        '"Chugim · Week 2" is still being worked on. Finalize first, then clear.',
        refusal
      );
      Assert.areEqual(1, week1.runs);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Id = :camp.week2Run],
        'The run being worked on stays'
      );
      Assert.areEqual(
        new List<String>{ 'Chugim · Week 2' },
        weekNamed(week1.picture, 'Week 2').working
      );
    }
  }

  @IsTest
  static void aWeekWithNothingHasNothingToClear() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      String stamp = camp.stamp();

      Test.startTest();
      String refusal = refusalOf(camp, camp.ids.get('Week 3'), stamp);
      Test.stopTest();

      Assert.areEqual('Nothing to clear.', refusal);
      Assert.areEqual(
        CAMPER_COUNT,
        [SELECT COUNT() FROM Camper__c WHERE Id IN :camp.campers]
      );
    }
  }

  // ---------------------------------------------------------------- the downloads' read

  @IsTest
  static void downloadsWaitForFinalize() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      Database.update(
        new ElectiveRun__c(
          Id = camp.week2Run,
          Status__c = 'Committed',
          FinalizedAt__c = null
        ),
        AccessLevel.USER_MODE
      );

      Test.startTest();
      String refusal;
      try {
        ElectiveSeatsController.runDownload(camp.week2Run);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();

      Assert.areEqual(ElectiveDownloads.NOT_FINAL, refusal);
    }
  }

  @IsTest
  static void aFinalRunsDownloadHasEachBunksWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      ClearCamp camp = new ClearCamp();
      Id scheduleId = [
        SELECT Schedule__c
        FROM ElectiveRun__c
        WHERE Id = :camp.week1Run
      ]
      .Schedule__c;
      // Monday: Group A has Chugim in Period 1 and Lunch after; Group B has Swim across both.
      ScheduleGrid grid = new ScheduleGrid();
      grid.blocks.add(
        new ScheduleGrid.Block(camp.ids.get('Period 1'), 'Period 1')
          .at('09:00', '09:45')
      );
      grid.blocks.add(
        new ScheduleGrid.Block(camp.ids.get('Lunch'), 'Lunch')
          .at('12:00', '12:45')
      );
      grid.groups.add(
        new ScheduleGrid.GroupRef(camp.ids.get('Group A'), 'Group A')
      );
      grid.groups.add(
        new ScheduleGrid.GroupRef(camp.ids.get('Group B'), 'Group B')
      );
      grid.items.add(new ScheduleGrid.Item('E', camp.setId, 'Chugim'));
      grid.items.add(new ScheduleGrid.Item('T', null, 'Lunch'));
      grid.items.add(new ScheduleGrid.Item('A', camp.ids.get('Drama'), 'Swim'));
      grid.rows.add(new List<String>{ '1', '2' });
      grid.rows.add(new List<String>{ '3', '^' });
      ScheduleDaySaves.write(
        scheduleId,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(WEEK_1_MONDAY, grid, null)
        }
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveDownloads.Download download = ElectiveSeatsController.runDownload(
        camp.week1Run
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 10, 'The download read is bounded: ' + used);
      Assert.areEqual('Week 1', download.weekName);
      Assert.areEqual(WEEK_1, download.view.campers.size());
      Assert.areEqual(WEEK_1, download.view.seats.size());
      Assert.areEqual(1, download.days.size());
      ElectiveDownloads.BunkDay monday = download.days[0];
      Assert.areEqual(WEEK_1_MONDAY, monday.day);
      Assert.areEqual(2, monday.blocks.size());
      Assert.areEqual('09:00', monday.blocks[0].startTime);
      Assert.areEqual(2, monday.bunks.size());
      ElectiveDownloads.BunkCells groupA = monday.bunks[0];
      Assert.areEqual(camp.ids.get('Group A'), groupA.groupId);
      Assert.areEqual(2, groupA.cells.size());
      Assert.isTrue(groupA.cells[0].thisSet, 'Chugim is where the seat goes');
      Assert.areEqual('Lunch', groupA.cells[1].name);
      Assert.isFalse(groupA.cells[1].thisSet);
      ElectiveDownloads.BunkCells groupB = monday.bunks[1];
      Assert.areEqual(1, groupB.cells.size(), 'Swim across two blocks, once');
      Assert.areEqual('Swim', groupB.cells[0].name);
      Assert.areEqual(2, groupB.cells[0].blocks);
    }
  }
}
