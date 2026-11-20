/**
 * A special day's or event's own schedule and "Set it up" through an agent or the command line
 * (docs/protocol/api.md API-1.76 to API-1.79), on synthetic camps (SpecialScheduleTestData's
 * Color War, SetTimeTestData): read as its page shows it, a cell and the frame changed by the
 * screen's own saves only while they hold what the AI read (a cell typed in as the page's week
 * editor types: full length, a longer placement replaced), and Set it up as the screen's, keeping
 * no version and with no Undo, as on screen (API-1.148). Records are made inside the scheduler's
 * runAs.
 */
@IsTest
private class AgentSpecialScheduleTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  /** One request to a door; answers [status, sentence]. */
  private static List<Object> ask(
    AgentRequest.Change door,
    String method,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    AgentAskFirstTestCalls.answer(door);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static Map<String, Object> colorWar(
    String season,
    Map<String, Object> more
  ) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => season,
      'special' => 'color war'
    };
    body.putAll(more);
    return body;
  }

  private static String seasonName(Id seasonId) {
    return [SELECT Name FROM Season__c WHERE Id = :seasonId WITH SYSTEM_MODE]
    .Name;
  }

  /**
   * Typing in Open cells of the plan as the connector sends it (worked out by the page's own
   * editor): the run over the column's (g) time blocks from first, from Open to after.
   */
  private static Map<String, Object> typed(
    Map<String, Object> asked,
    String change,
    List<Object> after
  ) {
    List<Object> before = new List<Object>();
    for (Object cell : after) {
      before.add('');
    }
    AgentSpecials.Found found = AgentSpecials.find(asked);
    ScheduleGrid grid = found.grid;
    Integer g = (Integer) asked.remove('g');
    Object firstAsked = asked.remove('first');
    Integer first = firstAsked instanceof Integer
      ? (Integer) firstAsked
      : blockAt(grid, (String) firstAsked);
    List<Object> blockIds = new List<Object>();
    for (Integer b = first; b < first + after.size(); b++) {
      blockIds.add(grid.blocks[b].id);
    }
    Map<String, Object> body = new Map<String, Object>(asked);
    body.put('change', change);
    body.put(
      'runs',
      new List<Object>{
        new Map<String, Object>{
          'day' => String.valueOf(SpecialSchedule.PLAN_DAY),
          'groupId' => grid.groups[g].id,
          'firstBlockId' => grid.blocks[first].id,
          'blockIds' => blockIds,
          'before' => before,
          'after' => after
        }
      }
    );
    return body;
  }

  /** The time block of that name. */
  private static Integer blockAt(ScheduleGrid grid, String name) {
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      if (grid.blocks[b].name == name) {
        return b;
      }
    }
    Assert.fail('No time block called ' + name);
    return null;
  }

  /** Color War's cell asked for: its column (g) and first time block, by name. */
  private static Map<String, Object> at(
    String season,
    Integer g,
    String first
  ) {
    return colorWar(
      season,
      new Map<String, Object>{ 'g' => g, 'first' => first }
    );
  }

  /** GET /v1/change_special_schedule_cell, as the connector reads what the page opens. */
  private static List<Object> opened(Map<String, Object> asked) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    for (String key : asked.keySet()) {
      RestContext.request.addParameter(key, String.valueOf(asked.get(key)));
    }
    RestContext.response = new RestResponse();
    AgentSpecialCell.get();
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  // API-1.76, API-1.77: the connector reads what the page opens, and the runs it worked out are
  // the page's own save, only while the cells hold what was read.
  @IsTest
  static void aCellIsTheScreensSaveOnlyWhileItHoldsWhatWasRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      String swim = 'A:' + ids.get('Swim');
      Test.startTest();
      List<Object> read = opened(colorWar(season, new Map<String, Object>()));
      Map<String, Object> placing = typed(
        at(season, 0, 'Relays'),
        'Placed Swim · Blue · Color War · Relays',
        new List<Object>{ swim }
      );
      List<Object> placed = ask(new AgentSpecialCell(), 'POST', placing);
      // The agent still thinks it is Open.
      List<Object> stale = ask(new AgentSpecialCell(), 'POST', placing);
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Map<String, Object> page = (Map<String, Object>) read[1];
      Assert.areEqual(
        new Set<String>{ 'plan', 'setup', 'labels', 'season' },
        page.keySet()
      );
      Assert.areEqual(
        String.valueOf(eventId),
        ((Map<String, Object>) page.get('plan')).get('itemId')
      );
      Assert.areEqual(200, placed[0], String.valueOf(placed[1]));
      Assert.areEqual('Placed Swim · Blue · Color War · Relays.', placed[1]);
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        'Changed by someone else since you read it: Placed Swim · Blue · Color War · Relays. Nothing was changed. Read it again with read_special_schedule.',
        stale[1]
      );
      Assert.areEqual(
        swim,
        SlotIds.ofRow(SpecialPlans.read(eventId).grid, 0)[1]
      );
    }
  }

  // API-1.14, API-1.77: a cell's Undo is its page's: the runs back the connector holds for the
  // conversation, made through the page's own save; nothing held is said.
  @IsTest
  static void aCellIsUndoneAsItsPageUndoesIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      String swim = 'A:' + ids.get('Swim');
      Test.startTest();
      Map<String, Object> placing = typed(
        at(season, 0, 'Relays'),
        'Placed Swim · Blue · Color War · Relays',
        new List<Object>{ swim }
      );
      List<Object> placed = ask(new AgentSpecialCell(), 'POST', placing);
      Map<String, Object> held = AgentUndoTestCalls.manualHeld(
        AgentUndoTestCalls.undoIn(RestContext.response),
        (List<Object>) placing.get('runs')
      );
      List<Object> undone = ask(
        new AgentUndo(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{ 'held' => AgentUndoTestCalls.held(held) }
        )
      );
      List<String> after = SlotIds.ofRow(SpecialPlans.read(eventId).grid, 0);
      List<Object> nothing = ask(
        new AgentUndo(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{ 'held' => new Map<String, Object>() }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, placed[0], String.valueOf(placed[1]));
      Assert.areEqual('edit', held.get('kind'));
      Assert.areEqual(String.valueOf(eventId), held.get('schedule'));
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(
        'Undone: Placed Swim · Blue · Color War · Relays.',
        undone[1]
      );
      for (String slot : after) {
        Assert.areEqual('', slot, String.valueOf(after));
      }
      Assert.areEqual(400, nothing[0], String.valueOf(nothing[1]));
      Assert.isTrue(
        String.valueOf(nothing[1])
          .startsWith(
            'Nothing to undo: this conversation hasn\'t changed "Color War".'
          ),
        String.valueOf(nothing[1])
      );
    }
  }

  // API-1.77, SPECIAL-1.3: an elective set in a special day's cell is the page's save; an
  // event's refuses it in the screen's words, with nothing changed.
  @IsTest
  static void aCellOfASpecialDayTakesAnElectiveSetAndAnEventsRefusesIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialScheduleTestData.colorWar(ids);
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      String season = seasonName(ids.get('Season'));
      Map<String, Object> fieldDay = new Map<String, Object>{
        'season' => season,
        'special' => 'field day',
        'g' => 0,
        'first' => 0
      };
      Test.startTest();
      List<Object> placed = ask(
        new AgentSpecialCell(),
        'POST',
        typed(fieldDay, 'Placed Chugim', new List<Object>{ 'E:' + chugim.Id })
      );
      List<Object> inEvent = ask(
        new AgentSpecialCell(),
        'POST',
        typed(
          at(season, 0, 'Relays'),
          'Placed Chugim',
          new List<Object>{ 'E:' + chugim.Id }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, placed[0], String.valueOf(placed[1]));
      ScheduleViews.DayView after = SpecialScheduleController.openPlan(
          ids.get('Field Day')
        )
        .schedule.days[0];
      Integer token = Integer.valueOf(after.rows[0].split(',', -1)[0]);
      Assert.areEqual('E', after.items[token - 1].kind);
      Assert.areEqual(String.valueOf(chugim.Id), after.items[token - 1].id);
      Assert.areEqual(
        'Nothing was changed. Color War\'s columns are stations, not groups, so it can\'t hold elective sets.',
        inEvent[1],
        String.valueOf(inEvent[0])
      );
    }
  }

  // API-1.78
  @IsTest
  static void theFrameIsTheScreensChangeAtTheRevisionSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      Test.startTest();
      List<Object> stale = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'add_station',
            'name' => 'Green',
            'seen' => '3'
          }
        )
      );
      List<Object> added = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'add_time_block',
            'start_time' => '1:00 PM',
            'end_time' => '2pm',
            'seen' => '4'
          }
        )
      );
      List<Object> moved = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'move_station',
            'target' => 'Gold',
            'direction' => 'left',
            'seen' => '5'
          }
        )
      );
      List<Object> noSeen = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(season, new Map<String, Object>{ 'action' => 'clear' })
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(200, added[0], String.valueOf(added[1]));
      Assert.isTrue(
        String.valueOf(added[1]).endsWith('seen is now 5.'),
        String.valueOf(added[1])
      );
      Assert.areEqual(200, moved[0], String.valueOf(moved[1]));
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      ScheduleGrid grid = SpecialPlans.read(eventId).grid;
      Assert.areEqual(3, grid.blocks.size());
      Assert.areEqual('13:00', grid.blocks[2].startTime);
      Assert.areEqual('Gold', grid.groups[0].name);
    }
  }

  /** The page's own Add station, at the revision it opened the plan at. */
  private static Boolean screenAddsStation(Id eventId, Integer opened) {
    SpecialScheduleFrame.Change change = new SpecialScheduleFrame.Change();
    change.action = 'addStation';
    change.name = 'Purple';
    try {
      SpecialScheduleController.changeFrame(eventId, opened, change);
      return true;
    } catch (Exception e) {
      Assert.isTrue(
        ScreenErrors.words(e).startsWith('Someone else changed'),
        ScreenErrors.words(e)
      );
      return false;
    }
  }

  // API-1.104, API-1.78: AI over screen, then screen over AI. The AI read the plan at 4; the
  // person added a station, so the AI's change from 4 is refused. The AI read it again (5) and
  // changed it; the page still open at 5 is refused in its own words. Nothing is overwritten.
  @IsTest
  static void aSpecialPlanIsChangedOnlyAtTheRevisionEachSideRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      Map<String, Object> addGreen = new Map<String, Object>{
        'action' => 'add_station',
        'name' => 'Green'
      };
      Test.startTest();
      Boolean screenFirst = screenAddsStation(eventId, 4);
      addGreen.put('seen', '4');
      List<Object> aiStale = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(season, addGreen)
      );
      addGreen.put('seen', '5');
      List<Object> aiAgain = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(season, addGreen)
      );
      Boolean screenStale = screenAddsStation(eventId, 5);
      Test.stopTest();
      Assert.isTrue(screenFirst);
      Assert.areEqual(409, aiStale[0], String.valueOf(aiStale[1]));
      Assert.areEqual(200, aiAgain[0], String.valueOf(aiAgain[1]));
      Assert.isFalse(screenStale, 'The page opened before the AI\'s change');
      List<String> stations = new List<String>();
      for (
        ScheduleGrid.GroupRef station : SpecialPlans.read(eventId).grid.groups
      ) {
        stations.add(station.name);
      }
      Assert.isTrue(stations.contains('Purple'), String.valueOf(stations));
      Assert.isTrue(stations.contains('Green'), String.valueOf(stations));
    }
  }

  // API-1.79, API-1.148: the screen's Set it up and nothing else: no version, and no Undo.
  @IsTest
  static void setItUpIsTheScreensAndKeepsNoVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id draftId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
        if (read.day == MONDAY) {
          read.grid.items.add(new ScheduleGrid.Item('S', '', 'Carnival'));
          read.grid.rows[0][0] = String.valueOf(read.grid.items.size());
          ScheduleDaySaves.write(
            draftId,
            new List<ScheduleDaySaves.DaySave>{
              new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
            }
          );
        }
      }
      Map<String, Object> body = new Map<String, Object>{
        'season' => seasonName(ids.get('Season')),
        'week' => 'Week 1',
        'program' => 'Main',
        'kind' => 'Special event',
        'name' => 'carnival'
      };
      Test.startTest();
      List<Object> setUp = ask(new AgentSetUpNoted(), 'POST', body);
      Map<String, Object> held = AgentUndoTestCalls.undoIn(
        RestContext.response
      );
      // Set up already: nothing noted with that name now.
      List<Object> again = ask(new AgentSetUpNoted(), 'POST', body);
      Test.stopTest();
      Assert.areEqual(200, setUp[0], String.valueOf(setUp[1]));
      Assert.isTrue(
        String.valueOf(setUp[1])
          .startsWith('"Carnival" is set up as a special event.'),
        String.valueOf(setUp[1])
      );
      Assert.areEqual(409, again[0], String.valueOf(again[1]));
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE SourceSchedule__c = :draftId
          WITH SYSTEM_MODE
        ],
        'No version kept, as on the screen'
      );
      // The screen reads the week again and keeps its Undo history: so does the connector.
      Assert.areEqual('kept', held.get('kind'));
    }
  }

  @IsTest
  static void aTripIsSetUpAsASpecialDay() {
    // SPECIAL-1.5: a trip is set up as a special day, through an AI as on the screen.
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id draftId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
        if (read.day == MONDAY) {
          read.grid.items.add(new ScheduleGrid.Item('T', '', 'Zoo trip'));
          read.grid.rows[0][0] = String.valueOf(read.grid.items.size());
          ScheduleDaySaves.write(
            draftId,
            new List<ScheduleDaySaves.DaySave>{
              new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
            }
          );
        }
      }
      Test.startTest();
      List<Object> setUp = ask(
        new AgentSetUpNoted(),
        'POST',
        new Map<String, Object>{
          'season' => seasonName(ids.get('Season')),
          'week' => 'Week 1',
          'program' => 'Main',
          'kind' => 'Special day',
          'name' => 'zoo trip'
        }
      );
      Test.stopTest();
      Assert.areEqual(200, setUp[0], String.valueOf(setUp[1]));
      Assert.isTrue(
        String.valueOf(setUp[1])
          .startsWith('"Zoo trip" is set up as a special day, on Monday.'),
        String.valueOf(setUp[1])
      );
    }
  }

  // CORE-1.0, CORE-1.35: a special schedule's refusals say the camp's own words, with its own
  // plurals: its special days and events, an event's stations and its time blocks.
  @IsTest
  static void aSpecialScheduleIsRefusedInTheCampsOwnWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialScheduleTestData.colorWar(ids);
      String season = seasonName(ids.get('Season'));
      Id campId = [
        SELECT Camp__c
        FROM Season__c
        WHERE Id = :ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Camp__c;
      List<CampLabel__c> labels = new List<CampLabel__c>();
      for (
        List<String> word : new List<List<String>>{
          new List<String>{ 'SpecialDay', 'Yom meyuchad', 'Yamim meyuchadim' },
          new List<String>{ 'SpecialEvent', 'Maccabiah', 'Maccabiot' },
          new List<String>{ 'Station', 'Tachana', 'Tachanot' },
          new List<String>{ 'TimeBlock', 'Perek', 'Prakim' }
        }
      ) {
        labels.add(
          new CampLabel__c(
            Camp__c = campId,
            ModelTerm__c = word[0],
            Singular__c = word[1],
            Plural__c = word[2]
          )
        );
      }
      Database.insert(labels, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      List<Object> noSpecial = ask(
        new AgentSpecialFrame(),
        'POST',
        new Map<String, Object>{
          'season' => season,
          'special' => 'Carnival',
          'action' => 'add_station',
          'name' => 'Green',
          'seen' => '4'
        }
      );
      List<Object> noStation = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'move_station',
            'target' => 'Silver',
            'direction' => 'left',
            'seen' => '4'
          }
        )
      );
      List<Object> noBlock = ask(
        new AgentSpecialFrame(),
        'POST',
        colorWar(
          season,
          new Map<String, Object>{
            'action' => 'move_time_block',
            'target' => 'Period 9',
            'direction' => 'later',
            'seen' => '4'
          }
        )
      );
      Test.stopTest();
      for (
        List<Object> each : new List<List<Object>>{
          new List<Object>{
            noSpecial[1],
            'There is no Yom meyuchad or Maccabiah called "Carnival" in ' +
            season +
            '. The Yamim meyuchadim and Maccabiot: '
          },
          new List<Object>{
            noStation[1],
            'There is no Tachana called "Silver" in this schedule. The Tachanot: '
          },
          new List<Object>{
            noBlock[1],
            'There is no Perek called "Period 9" in this schedule. The Prakim: '
          }
        }
      ) {
        Assert.isTrue(
          String.valueOf(each[0]).startsWith((String) each[1]),
          String.valueOf(each[0])
        );
      }
    }
  }
}
