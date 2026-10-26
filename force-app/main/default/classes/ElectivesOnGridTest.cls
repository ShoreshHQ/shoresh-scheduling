/**
 * Elective sets on the week grid (repo ADR 0018 slice E5): placed on Manual Build by their record
 * (one cell per time block), shown as still there, another season's refused; "Set it up" binds the
 * cells a file noted by name to the season's set (made when there is none); Start from another
 * week carries them; a Generated build keeps them and never places one. As a scheduler, with
 * records made inside the same System.runAs; each request's queries are bounded. Synthetic data.
 */
@IsTest
private class ElectivesOnGridTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  /** Chugim, offering Swim (the Pool) and Soccer (Field A), both confirmed. */
  private static Id chugim(Map<String, Id> ids) {
    ElectiveSet__c chugim = new ElectiveSet__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim'
    );
    Database.insert(chugim, AccessLevel.USER_MODE);
    Database.insert(
      new List<Offering__c>{
        new Offering__c(
          ElectiveSet__c = chugim.Id,
          Activity__c = ids.get('Swim'),
          Seats__c = 12
        ),
        new Offering__c(
          ElectiveSet__c = chugim.Id,
          Activity__c = ids.get('Soccer'),
          NoSeatLimit__c = true
        )
      },
      AccessLevel.USER_MODE
    );
    return chugim.Id;
  }

  /** One edit putting the set in Monday's Period 1 and Period 2, each block on its own. */
  private static List<SlotEdits.Edit> placing(
    ManualBuildViews.DraftView view,
    Id groupId,
    String slot
  ) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = MONDAY;
    run.groupId = groupId;
    run.firstBlockId = view.schedule.days[0].blocks[0].id;
    run.blockIds = new List<String>{
      view.schedule.days[0].blocks[0].id,
      view.schedule.days[0].blocks[1].id
    };
    run.before = new List<String>{ '', '' };
    run.after = new List<String>{ slot, slot };
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    return new List<SlotEdits.Edit>{ edit };
  }

  private static ManualBuildViews.DraftView blankWeek(
    Map<String, Id> ids,
    String week
  ) {
    return ManualBuildController.startBlankWeek(ids.get('Main'), ids.get(week));
  }

  /** The item in a group's Monday cell of a view ('' when Open). */
  private static ScheduleViews.Ref mondayItem(
    ScheduleViews.DayView day,
    Integer g,
    Integer b
  ) {
    String token = day.rows[g].split(',', -1)[b];
    return String.isBlank(token) ? null : day.items[Integer.valueOf(token) - 1];
  }

  @IsTest
  static void aSetIsPlacedByItsRecordOneCellPerTimeBlock() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids);
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      // Flagpole-free camp: Period 1 and Period 2 are Open for Group B.
      Test.startTest();
      Integer before = Limits.getQueries();
      SlotEdits.Result saved = ManualBuildController.saveSlots(
        view.schedule.schedule.id,
        placing(view, ids.get('Group B'), 'E:' + setId)
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 40, 'Queries to place an elective set: ' + used);
      Assert.isTrue(saved.conflicts.isEmpty());
      ScheduleViews.DayView monday = saved.schedule.days[0];
      Integer g = 1;
      Assert.areEqual('Group B', monday.groups[g].name);
      ScheduleViews.Ref first = mondayItem(monday, g, 0);
      Assert.areEqual('E', first.kind);
      Assert.areEqual(String.valueOf(setId), first.id);
      Assert.areEqual('Chugim', first.name);
      Assert.isFalse(first.gone, 'The set is still there');
      // Each time block holds the set on its own (no carrying on).
      Assert.areEqual(
        monday.rows[g].split(',', -1)[0],
        monday.rows[g].split(',', -1)[1]
      );
    }
  }

  @IsTest
  static void aSetOfAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Summer 2027');
      ElectiveSet__c elsewhere = new ElectiveSet__c(
        Season__c = other.Id,
        Name = 'Chugim'
      );
      Database.insert(elsewhere, AccessLevel.USER_MODE);

      Test.startTest();
      String refusal;
      try {
        ManualBuildController.saveSlots(
          view.schedule.schedule.id,
          placing(view, ids.get('Group B'), 'E:' + elsewhere.Id)
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();

      Assert.areEqual(
        'That elective set was not found. It may have been deleted.',
        refusal
      );
    }
  }

  /** The refusal of a set or event that isn't the season's names it in the camp's words. */
  @IsTest
  static void aSetOrEventNotFoundIsNamedInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      Database.insert(
        new List<CampLabel__c>{
          new CampLabel__c(
            Camp__c = ids.get('Camp'),
            ModelTerm__c = 'ElectiveSet',
            Singular__c = 'Chug block',
            Plural__c = 'Chug blocks'
          ),
          new CampLabel__c(
            Camp__c = ids.get('Camp'),
            ModelTerm__c = 'SpecialEvent',
            Singular__c = 'Big Day',
            Plural__c = 'Big Days'
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Summer 2027');
      ElectiveSet__c elsewhere = new ElectiveSet__c(
        Season__c = other.Id,
        Name = 'Chugim'
      );
      Database.insert(elsewhere, AccessLevel.USER_MODE);
      Id eventElsewhere = SpecialScheduleTestData.addEvent(
        other.Id,
        'Carnival'
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      String setRefusal = refusalOf(
        view,
        placing(view, ids.get('Group B'), 'E:' + elsewhere.Id)
      );
      Integer used = Limits.getQueries() - before;
      String eventRefusal = refusalOf(
        view,
        placing(view, ids.get('Group B'), 'S:' + eventElsewhere)
      );
      Test.stopTest();

      Assert.areEqual(
        'That Chug block was not found. It may have been deleted.',
        setRefusal
      );
      Assert.areEqual(
        'That Big Day was not found. It may have been deleted.',
        eventRefusal
      );
      Assert.isTrue(used <= 40, 'Queries for one refused save: ' + used);
    }
  }

  /** Setting up a noted set says what it is set up as in the camp's word for sets. */
  @IsTest
  static void aNotedSetIsSetUpInTheCampsWord() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Database.insert(
        new CampLabel__c(
          Camp__c = ids.get('Camp'),
          ModelTerm__c = 'ElectiveSet',
          Singular__c = 'Option block',
          Plural__c = 'Option blocks'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Id draftId = draftNoting(ids, new ScheduleGrid.Item('E', '', 'Bechirot'));

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialSetUp.Done done = SpecialPlacingController.setUpItem(
        draftId,
        'E',
        'Bechirot'
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      // "an": the article follows the camp's word, not the standard one.
      Assert.areEqual('"Bechirot" is set up as an Option block.', done.said);
      Assert.isTrue(used <= 30, 'Queries to set up a set: ' + used);
    }
  }

  /** The message a Manual Build save is refused with, or null when it is saved. */
  private static String refusalOf(
    ManualBuildViews.DraftView view,
    List<SlotEdits.Edit> edits
  ) {
    try {
      ManualBuildController.saveSlots(view.schedule.schedule.id, edits);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  /** The Manual Build draft of Week 1, Monday's Period 1 of every group holding a noted item. */
  private static Id draftNoting(Map<String, Id> ids, ScheduleGrid.Item noted) {
    Id draftId = blankWeek(ids, 'Week 1').schedule.schedule.id;
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == MONDAY) {
        read.grid.items.add(noted);
        for (List<String> row : read.grid.rows) {
          row[1] = String.valueOf(read.grid.items.size());
        }
        ScheduleDaySaves.write(
          draftId,
          new List<ScheduleDaySaves.DaySave>{
            new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
          }
        );
      }
    }
    return draftId;
  }

  /** Monday's grid of a draft, as stored. */
  private static ScheduleGrid monday(Id draftId) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == MONDAY) {
        return read.grid;
      }
    }
    return null;
  }

  @IsTest
  static void settingUpANotedElectiveBindsItsCellsToTheSetOfThatName() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids);
      // As a file wrote it: other capitals, a space.
      Id draftId = draftNoting(ids, new ScheduleGrid.Item('E', '', 'CHUGIM '));

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialSetUp.Done done = SpecialPlacingController.setUpItem(
        draftId,
        'E',
        'CHUGIM '
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 30, 'Queries to set up an elective: ' + used);
      Assert.areEqual('"Chugim" is set up as an elective set.', done.said);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM ElectiveSet__c
          WHERE Season__c = :ids.get('Season')
          WITH USER_MODE
        ],
        'No second set'
      );
      ScheduleGrid grid = monday(draftId);
      ScheduleGrid.Item item = grid.items[Integer.valueOf(grid.rows[0][1]) - 1];
      Assert.areEqual('E', item.kind);
      Assert.areEqual(String.valueOf(setId), item.id);
      Assert.areEqual('Chugim', item.name);
      Assert.areEqual(
        grid.rows[0][1],
        grid.rows[2][1],
        'One item, every group'
      );
    }
  }

  @IsTest
  static void settingUpANotedElectiveWithNoSetMakesOneAsTheFileNamedIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id draftId = draftNoting(ids, new ScheduleGrid.Item('E', '', 'Bechirot'));

      Test.startTest();
      SpecialSetUp.Done done = SpecialPlacingController.setUpItem(
        draftId,
        'E',
        'Bechirot'
      );
      Test.stopTest();

      Assert.areEqual('"Bechirot" is set up as an elective set.', done.said);
      List<ElectiveSet__c> made = [
        SELECT Id, Name, (SELECT Id FROM Offerings__r)
        FROM ElectiveSet__c
        WHERE Season__c = :ids.get('Season')
        WITH USER_MODE
      ];
      Assert.areEqual(1, made.size());
      Assert.areEqual('Bechirot', made[0].Name);
      Assert.areEqual(0, made[0].Offerings__r.size(), 'No offerings yet');
      ScheduleGrid grid = monday(draftId);
      Assert.areEqual(
        String.valueOf(made[0].Id),
        grid.items[Integer.valueOf(grid.rows[1][1]) - 1].id
      );
    }
  }

  @IsTest
  static void startFromAnotherWeekCarriesTheSet() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids);
      ManualBuildViews.DraftView weekOne = blankWeek(ids, 'Week 1');
      ManualBuildController.saveSlots(
        weekOne.schedule.schedule.id,
        placing(weekOne, ids.get('Group B'), 'E:' + setId)
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        weekOne.schedule.schedule.id
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 45, 'Queries to start from another week: ' + used);
      Assert.isTrue(view.leftOut.isEmpty(), String.join(view.leftOut, '; '));
      ScheduleViews.Ref placed = mondayItem(view.schedule.days[0], 1, 1);
      Assert.areEqual('E', placed.kind);
      Assert.areEqual(String.valueOf(setId), placed.id);
    }
  }

  @IsTest
  static void aGeneratedBuildKeepsTheSetAndNeverPlacesOne() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id setId = chugim(ids);
      Id draftId = GeneratedTestData.generated();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      List<Integer> cell = GeneratedTestData.at(
        GeneratedTestData.GROUP_A,
        GeneratedTestData.PERIOD_2
      );

      Test.startTest();
      // A build never places a set.
      GeneratedWeek.Save placedByBuild = GeneratedTestData.request(
        read,
        GeneratedSaves.TRY_ANOTHER,
        1
      );
      GeneratedTestData.put(
        placedByBuild.days[0],
        cell,
        GeneratedTestData.item('E', setId, 'Chugim')
      );
      Assert.areEqual(
        GeneratedTestData.UNREADABLE,
        GeneratedTestData.refusal(placedByBuild)
      );
      // Placed by hand, it is kept: a build that changes it is refused, by the set's name (Start
      // over, which lets go of the hand edit's lock, still keeps it).
      SlotEdits.Run run = new SlotEdits.Run();
      run.day = MONDAY;
      run.groupId = ids.get('Group A');
      run.firstBlockId = read.days[0].blocks[GeneratedTestData.PERIOD_2].id;
      run.blockIds = new List<String>{ run.firstBlockId };
      run.before = new List<String>{ GeneratedTestData.a('Gym games') };
      run.after = new List<String>{ 'E:' + setId };
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>{ run };
      SlotEdits.Result saved = GeneratedTestData.handEdits(
        draftId,
        new List<SlotEdits.Edit>{ edit },
        read.revision
      );
      Assert.isTrue(saved.conflicts.isEmpty());
      GeneratedInputs.Inputs now = GeneratedTestData.inputs();
      GeneratedWeek.Save changed = GeneratedTestData.request(
        now,
        GeneratedSaves.START_OVER,
        1
      );
      GeneratedTestData.put(changed.days[0], cell, 'Soccer');
      String refusal = GeneratedTestData.refusal(changed);
      Test.stopTest();

      Assert.areEqual('Chugim stays where it is.', refusal);
    }
  }
}
