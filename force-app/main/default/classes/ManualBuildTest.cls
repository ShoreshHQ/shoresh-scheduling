/**
 * Manual Build, as a scheduler with the Shoresh Scheduler permission set: starting a blank week
 * (fixed and recurring activities placed, groups away left out, one draft per program and week),
 * slot saves (two people on the same day, conflicts, undo over someone else's newer edit, what
 * can't be changed), and adding an activity typed into a slot. Synthetic camp (SetTimeTestData):
 * Group A and Group B (Juniors), Group C (Seniors); Period 1, Period 2, Lunch; Main runs Monday to
 * Thursday; Group A is away in Week 3; Swim is for Group A only, Gym games for Juniors.
 */
@IsTest
private class ManualBuildTest {
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

  private static ManualBuildViews.DraftView start(
    Map<String, Id> ids,
    String week
  ) {
    return ManualBuildController.startBlankWeek(ids.get('Main'), ids.get(week));
  }

  private static ScheduleViews.DayView monday(ScheduleViews.ScheduleView view) {
    return view.days[0];
  }

  /** What a group's slots hold on a day, as identities ('' Open, 'A:<Id>', '^A:<Id>'). */
  private static List<String> slots(
    ScheduleViews.DayView day,
    Integer g
  ) {
    List<String> result = new List<String>();
    String carrying = '';
    for (String token : day.rows[g].split(',', -1)) {
      if (token == '^') {
        result.add('^' + carrying);
      } else if (String.isBlank(token)) {
        carrying = '';
        result.add('');
      } else {
        ScheduleViews.Ref item = day.items[Integer.valueOf(token) - 1];
        carrying = item.kind + ':' + item.id;
        result.add(carrying);
      }
    }
    return result;
  }

  private static SlotSaves.SlotEdit edit(
    Date day,
    Id groupId,
    Id firstBlockId,
    List<String> before,
    List<String> after
  ) {
    SlotSaves.SlotRun run = new SlotSaves.SlotRun();
    run.day = day;
    run.groupId = groupId;
    run.firstBlockId = firstBlockId;
    run.before = before;
    run.after = after;
    SlotSaves.SlotEdit edit = new SlotSaves.SlotEdit();
    edit.runs = new List<SlotSaves.SlotRun>{ run };
    return edit;
  }

  private static SlotSaves.Result save(Id scheduleId, SlotSaves.SlotEdit edit) {
    return ManualBuildController.saveSlots(
      scheduleId,
      new List<SlotSaves.SlotEdit>{ edit }
    );
  }

  private static String refusal(Id scheduleId, SlotSaves.SlotEdit edit) {
    try {
      save(scheduleId, edit);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  private static String a(Map<String, Id> ids, String name) {
    return 'A:' + ids.get(name);
  }

  @IsTest
  static void aBlankWeekPlacesFixedAndRecurringAndLeavesTheRestOpen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');

      // Main runs Monday to Thursday.
      Assert.areEqual(4, view.schedule.days.size());
      Assert.areEqual(
        Date.newInstance(2026, 6, 29),
        view.schedule.days[0].dateValue
      );
      Assert.areEqual('Draft', view.schedule.status);
      ScheduleViews.DayView mon = monday(view.schedule);
      Assert.areEqual(3, mon.groups.size());
      Assert.areEqual('Group A', mon.groups[0].name);
      Assert.areEqual('Period 1', mon.blocks[0].name);
      Assert.areEqual('09:00', mon.blocks[0].startTime);
      String flagpole = 'F:' + ids.get('Flagpole');
      String rest = 'R:' + ids.get('Rest');
      // Flagpole for everyone in Period 1; Rest for the Seniors at Monday's lunch.
      Assert.areEqual(
        new List<String>{ flagpole, '', '' },
        slots(mon, 0)
      );
      Assert.areEqual(
        new List<String>{ flagpole, '', rest },
        slots(mon, 2)
      );
      // Rest is on Mondays only.
      Assert.areEqual(
        new List<String>{ flagpole, '', '' },
        slots(view.schedule.days[1], 2)
      );
      // Not a version: the Versions list stays empty.
      Assert.areEqual(
        0,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))
          .size()
      );
    }
  }

  @IsTest
  static void aGroupAwayThatWeekIsLeftOut() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 3');
      ScheduleViews.DayView mon = monday(view.schedule);
      Assert.areEqual(2, mon.groups.size());
      Assert.areEqual('Group B', mon.groups[0].name);
    }
  }

  @IsTest
  static void startingTwiceGivesTheSameDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Assert.isNull(
        ManualBuildController.getDraft(ids.get('Main'), ids.get('Week 1'))
      );
      ManualBuildViews.DraftView first = start(ids, 'Week 1');
      // A second start (someone else's, or a second click) waits for the program's lock and
      // then finds the first one's draft.
      ManualBuildViews.DraftView second = start(ids, 'Week 1');
      Assert.areEqual(first.schedule.schedule.id, second.schedule.schedule.id);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Program__c = :ids.get('Main') AND Week__c = :ids.get('Week 1')
          WITH SYSTEM_MODE
        ]
      );
      Assert.areEqual(
        first.schedule.schedule.id,
        ManualBuildController.getDraft(ids.get('Main'), ids.get('Week 1'))
          .schedule.schedule.id
      );
    }
  }

  @IsTest
  static void theDraftNamesWhatToPlaceAndWhereGroupsAreAway() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Database.update(
        new Group__c(Id = ids.get('Group C'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Map<String, ManualBuildViews.ActivityOption> byName = new Map<String, ManualBuildViews.ActivityOption>();
      for (ManualBuildViews.ActivityOption option : view.activities) {
        byName.put(option.name, option);
      }
      Assert.areEqual(
        new Set<Id>{ ids.get('Group B'), ids.get('Group C') },
        new Set<Id>(byName.get('Swim').notFor)
      );
      Assert.areEqual(
        new List<Id>{ ids.get('Group C') },
        byName.get('Gym games').notFor
      );
      Assert.isTrue(byName.get('Soccer').notFor.isEmpty());
      Assert.areEqual(1, view.away.size());
      Assert.areEqual(ids.get('Group C'), view.away[0].groupId);
      Assert.areEqual(
        new List<Id>{ ids.get('Lunch') },
        view.away[0].blockIds
      );
    }
  }

  @IsTest
  static void twoPeopleOnDifferentGroupsOfTheSameDayBothSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      Date mon = monday(view.schedule).dateValue;
      // Both opened the week before either saved: each names the slot as it was then.
      SlotSaves.Result first = save(
        draftId,
        edit(
          mon,
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      SlotSaves.Result second = save(
        draftId,
        edit(
          mon,
          ids.get('Group B'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Soccer') }
        )
      );
      Assert.isTrue(first.conflicts.isEmpty());
      Assert.isTrue(second.conflicts.isEmpty());
      ScheduleViews.DayView day = monday(second.schedule);
      Assert.areEqual(a(ids, 'Swim'), slots(day, 0)[1]);
      Assert.areEqual(a(ids, 'Soccer'), slots(day, 1)[1]);
    }
  }

  @IsTest
  static void theSameSlotChangedSinceComesBackAsAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      Date mon = monday(view.schedule).dateValue;
      save(
        draftId,
        edit(
          mon,
          ids.get('Group B'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Soccer') }
        )
      );
      // Someone who saw the slot Open now puts Gym games there.
      SlotSaves.Result late = save(
        draftId,
        edit(
          mon,
          ids.get('Group B'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Gym games') }
        )
      );
      Assert.areEqual(new List<Integer>{ 0 }, late.conflicts);
      // Theirs is kept, and sent back for "keep theirs or use yours".
      Assert.areEqual(a(ids, 'Soccer'), slots(monday(late.schedule), 1)[1]);
      // "Use yours": the same edit, naming what is there now.
      SlotSaves.Result mine = save(
        draftId,
        edit(
          mon,
          ids.get('Group B'),
          ids.get('Period 2'),
          new List<String>{ a(ids, 'Soccer') },
          new List<String>{ a(ids, 'Gym games') }
        )
      );
      Assert.isTrue(mine.conflicts.isEmpty());
      Assert.areEqual(a(ids, 'Gym games'), slots(monday(mine.schedule), 1)[1]);
    }
  }

  @IsTest
  static void undoOverSomeoneElsesNewerEditAsksToo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      Date mon = monday(view.schedule).dateValue;
      Id groupB = ids.get('Group B');
      Id period2 = ids.get('Period 2');
      // I place Soccer; someone else then changes it to Gym games.
      save(
        draftId,
        edit(mon, groupB, period2, new List<String>{ '' }, new List<String>{ a(ids, 'Soccer') })
      );
      save(
        draftId,
        edit(
          mon,
          groupB,
          period2,
          new List<String>{ a(ids, 'Soccer') },
          new List<String>{ a(ids, 'Gym games') }
        )
      );
      // My undo puts back Open where I left Soccer: their Gym games is not overwritten.
      SlotSaves.Result undo = save(
        draftId,
        edit(mon, groupB, period2, new List<String>{ a(ids, 'Soccer') }, new List<String>{ '' })
      );
      Assert.areEqual(new List<Integer>{ 0 }, undo.conflicts);
      Assert.areEqual(a(ids, 'Gym games'), slots(monday(undo.schedule), 1)[1]);
    }
  }

  @IsTest
  static void aMultiBlockPlacementAndItsRemoval() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      Date mon = monday(view.schedule).dateValue;
      String soccer = a(ids, 'Soccer');
      SlotSaves.Result placed = save(
        draftId,
        edit(
          mon,
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ '', '' },
          new List<String>{ soccer, '^' + soccer }
        )
      );
      ScheduleViews.DayView day = monday(placed.schedule);
      Assert.areEqual(soccer, slots(day, 0)[1]);
      Assert.areEqual('^' + soccer, slots(day, 0)[2]);
      // Changing only its first block would cut into the block it carries on into.
      String cut = refusal(
        draftId,
        edit(
          mon,
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ soccer },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.isTrue(cut.contains('cut into'), cut);
      SlotSaves.Result removed = save(
        draftId,
        edit(
          mon,
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ soccer, '^' + soccer },
          new List<String>{ '', '' }
        )
      );
      ScheduleViews.DayView after = monday(removed.schedule);
      Assert.areEqual('', slots(after, 0)[1]);
      // An item no slot uses is dropped from the day's list.
      for (ScheduleViews.Ref item : after.items) {
        Assert.areNotEqual('Soccer', item.name);
      }
    }
  }

  @IsTest
  static void fixedRecurringAndAwaySlotsCannotBeChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Database.update(
        new Group__c(Id = ids.get('Group B'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      Date mon = monday(view.schedule).dateValue;
      String overFlagpole = refusal(
        draftId,
        edit(
          mon,
          ids.get('Group A'),
          ids.get('Period 1'),
          new List<String>{ 'F:' + ids.get('Flagpole') },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.isTrue(overFlagpole.contains('stay where they are set up'), overFlagpole);
      String placingFixed = refusal(
        draftId,
        edit(
          mon,
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ 'F:' + ids.get('Flagpole') }
        )
      );
      Assert.isTrue(placingFixed.contains('stay where they are set up'), placingFixed);
      String away = refusal(
        draftId,
        edit(
          mon,
          ids.get('Group B'),
          ids.get('Lunch'),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Soccer') }
        )
      );
      Assert.areEqual('Group B isn\'t at camp in Lunch.', away);
    }
  }

  @IsTest
  static void aVersionCannotBeChangedHere() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      String refused = refusal(
        version.Id,
        edit(
          Date.newInstance(2026, 6, 29),
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.isTrue(refused.contains('can\'t be changed'), refused);
    }
  }

  @IsTest
  static void anActivityFromAnotherSeasonIsNotPlaced() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Other summer');
      Activity__c stranger = ShoreshTestData.activity(other.Id, 'Archery', null);
      Database.insert(stranger, AccessLevel.SYSTEM_MODE);
      String refused = refusal(
        view.schedule.schedule.id,
        edit(
          monday(view.schedule).dateValue,
          ids.get('Group A'),
          ids.get('Period 2'),
          new List<String>{ '' },
          new List<String>{ 'A:' + stranger.Id }
        )
      );
      Assert.isTrue(refused.contains('was not found'), refused);
    }
  }

  @IsTest
  static void aTypedNameAddsAnActivityOnceWithHandAddedStartingValues() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      ManualBuildViews.ActivityOption added = ManualBuildController.addActivity(
        draftId,
        '  Arts   and crafts '
      );
      Activity__c saved = [
        SELECT Name, Length__c, TimesPerWeekMin__c, TimesPerWeekMax__c, Season__c
        FROM Activity__c
        WHERE Id = :added.id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Arts and crafts', saved.Name);
      Assert.areEqual(1, saved.Length__c);
      Assert.areEqual(1, saved.TimesPerWeekMax__c);
      Assert.areEqual(ids.get('Season'), saved.Season__c);
      Assert.isTrue(added.notFor.isEmpty());
      // The same name again (spaces and capitals aside) is the same activity.
      Assert.areEqual(
        added.id,
        ManualBuildController.addActivity(draftId, 'artsand Crafts').id
      );
      Assert.areEqual(
        ids.get('Swim'),
        ManualBuildController.addActivity(draftId, 'SWIM').id
      );
    }
  }

  @IsTest
  static void someoneWithoutShoreshCannotStartAWeek() {
    Map<String, Id> ids;
    System.runAs(ShoreshTestData.scheduler()) {
      ids = camp();
    }
    System.runAs(ShoreshTestData.outsider()) {
      try {
        start(ids, 'Week 1');
        Assert.fail('An outsider started a week.');
      } catch (Exception e) {
        Assert.isInstanceOfType(e, AuraHandledException.class);
      }
    }
  }
}
