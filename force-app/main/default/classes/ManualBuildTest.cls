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
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  private static Map<String, Id> camp() {
    Map<String, Id> ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
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
  private static List<String> slots(ScheduleViews.DayView day, Integer g) {
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

  /** Where a run starts: a day, a group, and its first time block. */
  private static SlotEdits.Run at(
    Date day,
    String groupId,
    String firstBlockId
  ) {
    return SlotRunsTestData.at(day, groupId, firstBlockId);
  }

  private static SlotEdits.Edit edit(
    SlotEdits.Run run,
    List<String> before,
    List<String> after
  ) {
    return SlotRunsTestData.edit(run, before, after);
  }

  private static SlotEdits.Result save(Id scheduleId, SlotEdits.Edit edit) {
    return ManualBuildController.saveSlots(
      scheduleId,
      new List<SlotEdits.Edit>{ edit }
    );
  }

  private static String refusal(Id scheduleId, SlotEdits.Edit edit) {
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
      Assert.areEqual(MONDAY, view.schedule.days[0].dateValue);
      Assert.areEqual('Draft', view.schedule.status);
      ScheduleViews.DayView mon = monday(view.schedule);
      Assert.areEqual(3, mon.groups.size());
      Assert.areEqual('Group A', mon.groups[0].name);
      Assert.areEqual('Period 1', mon.blocks[0].name);
      Assert.areEqual('09:00', mon.blocks[0].startTime);
      String flagpole = 'F:' + ids.get('Flagpole');
      String rest = 'R:' + ids.get('Rest');
      // Flagpole for everyone in Period 1; Rest for the Seniors at Monday's lunch.
      Assert.areEqual(new List<String>{ flagpole, '', '' }, slots(mon, 0));
      Assert.areEqual(new List<String>{ flagpole, '', rest }, slots(mon, 2));
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
      Database.update(
        new Activity__c(Id = ids.get('Soccer'), NoWeeklyMax__c = true),
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
      // ShoreshTestData's activities: once or twice a week.
      Assert.areEqual(1, byName.get('Swim').minPerWeek);
      Assert.areEqual(2, byName.get('Swim').maxPerWeek);
      // No weekly limit: none sent.
      Assert.isNull(byName.get('Soccer').maxPerWeek);
      Assert.areEqual(1, view.away.size());
      Assert.areEqual(ids.get('Group C'), view.away[0].groupId);
      Assert.areEqual(new List<Id>{ ids.get('Lunch') }, view.away[0].blockIds);
      // The season's activity and location records come with the week, as the setup screen
      // reads them, so the screen's checks are as fresh as the week.
      Map<Id, Activity__c> records = new Map<Id, Activity__c>(
        view.activityRecords
      );
      Assert.areEqual(view.activities.size(), records.size());
      Assert.areEqual(2, records.get(ids.get('Swim')).TimesPerWeekMax__c);
      Assert.isTrue(records.get(ids.get('Soccer')).NoWeeklyMax__c);
      Assert.areEqual(
        [
          SELECT COUNT()
          FROM Location__c
          WHERE Season__c = :ids.get('Season')
          WITH SYSTEM_MODE
        ],
        view.locationRecords.size()
      );
      // The program's groups with their divisions, and where its set-time items are.
      Map<Id, Group__c> groupsById = new Map<Id, Group__c>(view.groupRecords);
      Assert.isNotNull(groupsById.get(ids.get('Group C')).Division__c);
      Assert.areEqual(
        [
          SELECT COUNT()
          FROM FixedActivity__c
          WHERE Program__c = :ids.get('Main')
          WITH SYSTEM_MODE
        ],
        view.fixedActivityRecords.size()
      );
      Assert.areEqual(
        [
          SELECT COUNT()
          FROM RecurringActivity__c
          WHERE Program__c = :ids.get('Main')
          WITH SYSTEM_MODE
        ],
        view.recurringActivityRecords.size()
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
      SlotEdits.Result first = save(
        draftId,
        edit(
          at(mon, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      SlotEdits.Result second = save(
        draftId,
        edit(
          at(mon, ids.get('Group B'), ids.get('Period 2')),
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
          at(mon, ids.get('Group B'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Soccer') }
        )
      );
      // Someone who saw the slot Open now puts Gym games there.
      SlotEdits.Result late = save(
        draftId,
        edit(
          at(mon, ids.get('Group B'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Gym games') }
        )
      );
      Assert.areEqual(new List<Integer>{ 0 }, late.conflicts);
      // Theirs is kept, and sent back for "keep theirs or use yours".
      Assert.areEqual(a(ids, 'Soccer'), slots(monday(late.schedule), 1)[1]);
      // "Use yours": the same edit, naming what is there now.
      SlotEdits.Result mine = save(
        draftId,
        edit(
          at(mon, ids.get('Group B'), ids.get('Period 2')),
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
        edit(
          at(mon, groupB, period2),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Soccer') }
        )
      );
      save(
        draftId,
        edit(
          at(mon, groupB, period2),
          new List<String>{ a(ids, 'Soccer') },
          new List<String>{ a(ids, 'Gym games') }
        )
      );
      // My undo puts back Open where I left Soccer: their Gym games is not overwritten.
      SlotEdits.Result undo = save(
        draftId,
        edit(
          at(mon, groupB, period2),
          new List<String>{ a(ids, 'Soccer') },
          new List<String>{ '' }
        )
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
      SlotEdits.Result placed = save(
        draftId,
        edit(
          at(mon, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '', '' },
          new List<String>{ soccer, '^' + soccer }
        )
      );
      ScheduleViews.DayView day = monday(placed.schedule);
      Assert.areEqual(soccer, slots(day, 0)[1]);
      Assert.areEqual('^' + soccer, slots(day, 0)[2]);
      // Changing only its first block would cut into the block it carries on into: the screen's
      // picture was out of date, so it comes back as a conflict, and nothing changes.
      SlotEdits.Result cut = save(
        draftId,
        edit(
          at(mon, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ soccer },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.areEqual(new List<Integer>{ 0 }, cut.conflicts);
      Assert.areEqual(soccer, slots(monday(cut.schedule), 0)[1]);
      SlotEdits.Result removed = save(
        draftId,
        edit(
          at(mon, ids.get('Group A'), ids.get('Period 2')),
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
  static void aRunIsMadeOnlyOnTheTimeBlocksItWasMadeOn() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      Date mon = monday(view.schedule).dateValue;
      String soccer = a(ids, 'Soccer');
      // The screen placed Soccer in Period 2 and a block it knew as next to it: since then, the
      // block after Period 2 is Lunch, not that one. A conflict, and nothing is written.
      SlotEdits.Run moved = at(mon, ids.get('Group A'), ids.get('Period 2'));
      moved.blockIds = new List<String>{
        ids.get('Period 2'),
        ids.get('Period 1')
      };
      SlotEdits.Result shifted = save(
        draftId,
        edit(
          moved,
          new List<String>{ '', '' },
          new List<String>{ soccer, '^' + soccer }
        )
      );
      Assert.areEqual(new List<Integer>{ 0 }, shifted.conflicts);
      Assert.areEqual(
        new List<String>{ '', '' },
        new List<String>{
          slots(monday(shifted.schedule), 0)[1],
          slots(monday(shifted.schedule), 0)[2]
        }
      );
      // Naming fewer blocks than it changes is a conflict too.
      SlotEdits.Run fewer = at(mon, ids.get('Group A'), ids.get('Period 2'));
      fewer.blockIds = new List<String>{ ids.get('Period 2') };
      Assert.areEqual(
        new List<Integer>{ 0 },
        save(
            draftId,
            edit(
              fewer,
              new List<String>{ '', '' },
              new List<String>{ soccer, '^' + soccer }
            )
          )
          .conflicts
      );
      // On the blocks it names (15-character Ids match 18-character ones), it is made.
      SlotEdits.Run same = at(mon, ids.get('Group A'), ids.get('Period 2'));
      same.blockIds = new List<String>{
        String.valueOf(ids.get('Period 2')).left(15),
        ids.get('Lunch')
      };
      SlotEdits.Result made = save(
        draftId,
        edit(
          same,
          new List<String>{ '', '' },
          new List<String>{ soccer, '^' + soccer }
        )
      );
      Assert.areEqual(0, made.conflicts.size());
      Assert.areEqual(soccer, slots(monday(made.schedule), 0)[1]);
      Assert.areEqual('^' + soccer, slots(monday(made.schedule), 0)[2]);
      // A run that names no blocks wasn't sent by the screen as it is: refused, not guessed.
      SlotEdits.Run unnamed = at(mon, ids.get('Group B'), ids.get('Period 2'));
      unnamed.blockIds = new List<String>();
      Assert.areEqual(
        'That change could not be read. Reload the page and try again.',
        refusal(
          draftId,
          edit(unnamed, new List<String>{ '' }, new List<String>{ soccer })
        )
      );
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
          at(mon, ids.get('Group A'), ids.get('Period 1')),
          new List<String>{ 'F:' + ids.get('Flagpole') },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.isTrue(
        overFlagpole.contains('stay where they are set up'),
        overFlagpole
      );
      String placingFixed = refusal(
        draftId,
        edit(
          at(mon, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ 'F:' + ids.get('Flagpole') }
        )
      );
      Assert.isTrue(
        placingFixed.contains('stay where they are set up'),
        placingFixed
      );
      String away = refusal(
        draftId,
        edit(
          at(mon, ids.get('Group B'), ids.get('Lunch')),
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
          at(MONDAY, ids.get('Group A'), ids.get('Period 2')),
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
      Activity__c stranger = ShoreshTestData.activity(
        other.Id,
        'Archery',
        null
      );
      Database.insert(stranger, AccessLevel.SYSTEM_MODE);
      String refused = refusal(
        view.schedule.schedule.id,
        edit(
          at(
            monday(view.schedule).dateValue,
            ids.get('Group A'),
            ids.get('Period 2')
          ),
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
        SELECT
          Name,
          Length__c,
          TimesPerWeekMin__c,
          TimesPerWeekMax__c,
          Season__c
        FROM Activity__c
        WHERE Id = :added.id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Arts and crafts', saved.Name);
      Assert.areEqual(1, saved.Length__c);
      Assert.areEqual(1, saved.TimesPerWeekMax__c);
      Assert.areEqual(ids.get('Season'), saved.Season__c);
      Assert.isTrue(added.notFor.isEmpty());
      // Its setup record comes back too, as the setup screen reads it, for the screen's checks.
      Assert.areEqual(added.id, added.record.Id);
      Assert.areEqual(1, added.record.TimesPerWeekMin__c);
      Assert.areEqual(1, added.record.TimesPerWeekMax__c);
      Assert.areEqual(1, added.record.GroupsAtOnce__c);
      Assert.isFalse(added.record.NoGroupLimit__c);
      // The same name again (spaces and capitals aside) is the same activity.
      Assert.areEqual(
        added.id,
        ManualBuildController.addActivity(draftId, 'artsand Crafts').id
      );
      ManualBuildViews.ActivityOption swim = ManualBuildController.addActivity(
        draftId,
        'SWIM'
      );
      Assert.areEqual(ids.get('Swim'), swim.id);
      Assert.areEqual(ids.get('Swim'), swim.record.Id);
    }
  }

  @IsTest
  static void aRunMayNotStartPartwayThroughSomeoneElsesPlacement() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      String soccer = a(ids, 'Soccer');
      save(
        draftId,
        edit(
          at(MONDAY, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '', '' },
          new List<String>{ soccer, '^' + soccer }
        )
      );
      // Its second block alone, even naming it correctly, would cut Soccer short unasked.
      String cut = refusal(
        draftId,
        edit(
          at(MONDAY, ids.get('Group A'), ids.get('Lunch')),
          new List<String>{ '^' + soccer },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.isTrue(cut.contains('cut into'), cut);
    }
  }

  @IsTest
  static void editsAreMatchedByRecordNotSpellingAndEachConflictIsNamed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
      String swim15 = 'A:' + String.valueOf(ids.get('Swim')).left(15);
      List<SlotEdits.Edit> edits = new List<SlotEdits.Edit>{
        // 15-character Ids for the group, the block, and the activity.
        edit(
          at(
            MONDAY,
            String.valueOf(ids.get('Group A')).left(15),
            String.valueOf(ids.get('Period 2')).left(15)
          ),
          new List<String>{ '' },
          new List<String>{ swim15 }
        ),
        // Names a slot as Soccer, which it never held: a conflict, and only this one.
        edit(
          at(MONDAY, ids.get('Group B'), ids.get('Period 2')),
          new List<String>{ a(ids, 'Soccer') },
          new List<String>{ '' }
        ),
        edit(
          at(MONDAY, ids.get('Group C'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Soccer') }
        )
      };
      SlotEdits.Result result = ManualBuildController.saveSlots(draftId, edits);
      Assert.areEqual(new List<Integer>{ 1 }, result.conflicts);
      ScheduleViews.DayView day = monday(result.schedule);
      Assert.areEqual(a(ids, 'Swim'), slots(day, 0)[1]);
      Assert.areEqual(a(ids, 'Soccer'), slots(day, 2)[1]);
    }
  }

  @IsTest
  static void aDayThatCannotBeReadIsRefusedNotAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      ManualBuildViews.DraftView view = start(ids, 'Week 1');
      Id draftId = view.schedule.schedule.id;
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
      String refused = refusal(
        draftId,
        edit(
          at(MONDAY, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ a(ids, 'Swim') }
        )
      );
      Assert.isTrue(refused.startsWith('This day could not be read'), refused);
    }
  }

  @IsTest
  static void anActivityIsAddedOnlyFromAManualBuildDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      try {
        ManualBuildController.addActivity(version.Id, 'Archery');
        Assert.fail('An activity was added from a version.');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('can\'t be changed'),
          e.getMessage()
        );
      }
    }
  }

  private static String startRefusal(Id programId, Id weekId) {
    try {
      ManualBuildController.startBlankWeek(programId, weekId);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  @IsTest
  static void aWeekFromAnotherSeasonOrAProgramWithoutTimeBlocksIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Other summer');
      Week__c otherWeek = ShoreshTestData.weeks(other.Id, 1)[0];
      Program__c empty = ShoreshTestData.program(ids.get('Season'), 'Evenings');
      Test.startTest();
      Assert.areEqual(
        'That week is not in Main\'s season.',
        startRefusal(ids.get('Main'), otherWeek.Id)
      );
      Assert.areEqual(
        'Add time blocks to Evenings first.',
        startRefusal(empty.Id, ids.get('Week 1'))
      );
      Test.stopTest();
      Assert.isNull(ManualDrafts.find(empty.Id, ids.get('Week 1')));
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
