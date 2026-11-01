/**
 * The rest of Elective seats through an agent or the command line (docs/protocol/api.md API-1.69
 * to API-1.72): a seat locked or unlocked, a new version of final seats, and the end-of-season
 * Clear, each the screen's own, refused with nothing changed when what the agent read changed
 * since. On AgentElectivesTestData's synthetic camp.
 */
@IsTest
private class AgentElectivesRestTest {
  // API-1.69
  @IsTest
  static void aLockIsTheScreensPadlockWithTheSeatsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.assigned();
      Map<String, Object> lock = new Map<String, Object>{
        'camper' => 'Synthetic Camper 1',
        'day' => 'Monday',
        'time' => 'Period 1',
        'locked' => true
      };
      Test.startTest();
      Map<String, Object> stale = lock.clone();
      stale.put(
        'seen',
        AgentElectivesTestData.seen(AgentElectivesTestData.revision() - 1)
      );
      List<Object> refused = AgentElectivesTestData.send(
        'lock_elective_seat',
        'POST',
        AgentElectivesTestData.asked(stale)
      );
      Map<String, Object> current = lock.clone();
      current.put(
        'seen',
        AgentElectivesTestData.seen(AgentElectivesTestData.revision())
      );
      List<Object> locked = AgentElectivesTestData.send(
        'lock_elective_seat',
        'POST',
        AgentElectivesTestData.asked(current)
      );
      Boolean wasLocked = AgentElectivesTestData.seats()[0].Locked__c;
      Map<String, Object> unlock = lock.clone();
      unlock.put('locked', false);
      unlock.put(
        'seen',
        AgentElectivesTestData.seen(AgentElectivesTestData.revision())
      );
      List<Object> unlocked = AgentElectivesTestData.send(
        'lock_elective_seat',
        'POST',
        AgentElectivesTestData.asked(unlock)
      );
      Test.stopTest();
      Assert.areEqual(409, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(200, locked[0], String.valueOf(locked[1]));
      Assert.areEqual('Locked Synthetic Camper 1.', locked[1]);
      Assert.isTrue(wasLocked, 'locked');
      Assert.areEqual(200, unlocked[0], String.valueOf(unlocked[1]));
      Assert.areEqual('Unlocked Synthetic Camper 1.', unlocked[1]);
      Assignment__c seat = AgentElectivesTestData.seats()[0];
      Assert.isFalse(seat.Locked__c, 'unlocked');
      Assert.areEqual(
        AgentElectivesTestData.ids.get('Drama'),
        seat.Offering__c,
        'never moved'
      );
    }
  }

  // API-1.66, API-1.69
  @IsTest
  static void aSeenFromAnotherRunIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.assigned();
      Map<String, Object> lock = new Map<String, Object>{
        'camper' => 'Synthetic Camper 1',
        'day' => 'Monday',
        'time' => 'Period 1',
        'locked' => true
      };
      Test.startTest();
      Map<String, Object> otherRun = lock.clone();
      otherRun.put(
        'seen',
        AgentElectives.seenText(
          AgentElectivesTestData.ids.get('Season'),
          AgentElectivesTestData.revision()
        )
      );
      List<Object> wrongRun = AgentElectivesTestData.send(
        'lock_elective_seat',
        'POST',
        AgentElectivesTestData.asked(otherRun)
      );
      Test.stopTest();
      Assert.areEqual(409, wrongRun[0], String.valueOf(wrongRun[1]));
      Assert.isFalse(
        AgentElectivesTestData.seats()[0].Locked__c,
        'nothing changed'
      );
    }
  }

  // API-1.66, API-1.70
  @IsTest
  static void aNewVersionIsTheScreensWithTheFinalRunSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.finalized();
      Map<String, Object> none = new Map<String, Object>();
      Test.startTest();
      List<Object> read = AgentElectivesTestData.send(
        'elective_seats_now',
        'GET',
        AgentElectivesTestData.asked(none)
      );
      Map<String, Object> stale = new Map<String, Object>{
        'seen' => AgentElectivesTestData.seen(
          AgentElectivesTestData.revision() - 1
        )
      };
      List<Object> refused = AgentElectivesTestData.send(
        'start_new_elective_version',
        'POST',
        AgentElectivesTestData.asked(stale)
      );
      Map<String, Object> current = new Map<String, Object>{
        'seen' => AgentElectivesTestData.seen(AgentElectivesTestData.revision())
      };
      List<Object> started = AgentElectivesTestData.send(
        'start_new_elective_version',
        'POST',
        AgentElectivesTestData.asked(current)
      );
      List<Object> again = AgentElectivesTestData.send(
        'start_new_elective_version',
        'POST',
        AgentElectivesTestData.asked(current)
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(
        ((String) read[1]).contains('finalized;'),
        String.valueOf(read[1])
      );
      Assert.areEqual(409, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(200, started[0], String.valueOf(started[1]));
      Assert.areEqual(409, again[0], String.valueOf(again[1]));
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM ElectiveRun__c
          WHERE
            NewVersionOf__c = :AgentElectivesTestData.runId
            AND Status__c = 'Committed'
          WITH SYSTEM_MODE
        ],
        'one new version, to work on'
      );
    }
  }

  // API-1.71, API-1.72
  @IsTest
  static void clearIsTheScreensClearWithThePictureSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.finalized();
      Test.startTest();
      String season = (String) AgentElectivesTestData.asked(
          new Map<String, Object>()
        )
        .get('season');
      String stamp = ElectiveSeatsController.clearPicture(
          AgentElectivesTestData.ids.get('Season')
        )
        .stamp;
      List<Object> read = AgentElectivesTestData.send(
        'electives_to_clear',
        'GET',
        new Map<String, Object>{ 'season' => season }
      );
      List<Object> noSeen = AgentElectivesTestData.send(
        'clear_electives',
        'POST',
        new Map<String, Object>{ 'season' => season }
      );
      List<Object> stale = AgentElectivesTestData.send(
        'clear_electives',
        'POST',
        new Map<String, Object>{ 'season' => season, 'seen' => 'not it' }
      );
      Integer runsAfterRefused = [
        SELECT COUNT()
        FROM ElectiveRun__c
        WITH SYSTEM_MODE
      ];
      List<Object> cleared = AgentElectivesTestData.send(
        'clear_electives',
        'POST',
        new Map<String, Object>{
          'season' => season,
          'week' => 'Week 1',
          'seen' => stamp
        }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(
        ((String) read[1]).contains('seen: ' + stamp),
        String.valueOf(read[1])
      );
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(1, runsAfterRefused, 'nothing cleared when refused');
      Assert.areEqual(200, cleared[0], String.valueOf(cleared[1]));
      Assert.areEqual('Cleared: 1 run, 2 campers.', cleared[1]);
      Assert.areEqual(0, [SELECT COUNT() FROM ElectiveRun__c WITH SYSTEM_MODE]);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ElectiveSet__c WITH SYSTEM_MODE],
        'the set stays'
      );
    }
  }
}
