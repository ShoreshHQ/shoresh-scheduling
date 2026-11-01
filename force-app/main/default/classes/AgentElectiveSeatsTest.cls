/**
 * Elective seats through an agent or the command line (docs/protocol/api.md API-1.66 to API-1.68):
 * the seats read as the Elective seats screen reads its run, with the run as read (seen); Assign
 * seats and a seat moved by hand saved through the screen's own saves, refused with nothing changed
 * when the seats changed since the agent read them. On AgentElectivesTestData's synthetic camp.
 */
@IsTest
private class AgentElectiveSeatsTest {
  // API-1.66
  @IsTest
  static void theSeatsReadAreTheScreensRunWithItsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      Test.startTest();
      List<Object> read = AgentElectivesTestData.send(
        'elective_seats_now',
        'GET',
        AgentElectivesTestData.asked(new Map<String, Object>())
      );
      List<Object> noSet = AgentElectivesTestData.send(
        'elective_seats_now',
        'GET',
        AgentElectivesTestData.asked(
          new Map<String, Object>{ 'elective_set' => 'Nope' }
        )
      );
      Test.stopTest();
      String said = (String) read[1];
      Assert.areEqual(200, read[0], said);
      Assert.isTrue(
        said.contains(
          'seen: ' +
          AgentElectivesTestData.seen(AgentElectivesTestData.revision())
        ),
        said
      );
      Assert.isTrue(said.contains('Monday, Period 1'), said);
      Assert.isTrue(said.contains('Archery, Drama'), said);
      Assert.isTrue(
        said.contains('Synthetic Camper 1 #SYN-0001, Group A: no seats'),
        said
      );
      Assert.areEqual(400, noSet[0], String.valueOf(noSet[1]));
    }
  }

  // API-1.67
  @IsTest
  static void assignIsTheScreensAssignWithTheSeatsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      Decimal seen = AgentElectivesTestData.revision();
      Test.startTest();
      List<Object> read = AgentElectivesTestData.send(
        'assign_elective_seats',
        'GET',
        AgentElectivesTestData.asked(new Map<String, Object>())
      );
      List<Object> stale = AgentElectivesTestData.send(
        'assign_elective_seats',
        'POST',
        AgentElectivesTestData.asked(
          new Map<String, Object>{
            'seen' => AgentElectivesTestData.seen(seen - 1),
            'seats' => AgentElectivesTestData.everyoneInDrama()
          }
        )
      );
      Integer afterStale = AgentElectivesTestData.seats().size();
      List<Object> noSeen = AgentElectivesTestData.send(
        'assign_elective_seats',
        'POST',
        AgentElectivesTestData.asked(
          new Map<String, Object>{
            'seats' => AgentElectivesTestData.everyoneInDrama()
          }
        )
      );
      List<Object> done = AgentElectivesTestData.send(
        'assign_elective_seats',
        'POST',
        AgentElectivesTestData.asked(
          new Map<String, Object>{
            'seen' => AgentElectivesTestData.seen(seen),
            'seats' => AgentElectivesTestData.everyoneInDrama()
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, read[0]);
      Map<String, Object> inputs = (Map<String, Object>) read[1];
      Assert.isTrue(inputs.containsKey('view') && inputs.containsKey('labels'));
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(0, afterStale, 'nothing assigned when refused');
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      List<Assignment__c> now = AgentElectivesTestData.seats();
      Assert.areEqual(2, now.size());
      for (Assignment__c seat : now) {
        Assert.areEqual(
          AgentElectivesTestData.ids.get('Drama'),
          seat.Offering__c
        );
      }
      Assert.isTrue(
        AgentElectivesTestData.revision() > seen,
        'the run moved on'
      );
    }
  }

  // API-1.68
  @IsTest
  static void aMoveIsTheScreensMoveLockedWithTheSeatsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
      request.runId = AgentElectivesTestData.runId;
      request.revision = AgentElectivesTestData.revision();
      request.seats = (List<ElectiveSeatSaves.SeatIn>) JSON.deserialize(
        JSON.serialize(AgentElectivesTestData.everyoneInDrama()),
        List<ElectiveSeatSaves.SeatIn>.class
      );
      ElectiveSeatsController.assignSeats(JSON.serialize(request));
      Decimal seen = AgentElectivesTestData.revision();
      Map<String, Object> move = new Map<String, Object>{
        'camper' => 'synthetic camper 1',
        'day' => 'Monday',
        'time' => 'Period 1',
        'elective' => 'Archery'
      };
      Test.startTest();
      Map<String, Object> stale = move.clone();
      stale.put('seen', AgentElectivesTestData.seen(seen - 1));
      List<Object> refused = AgentElectivesTestData.send(
        'move_elective_seat',
        'POST',
        AgentElectivesTestData.asked(stale)
      );
      Map<String, Object> unknown = move.clone();
      unknown.put('camper', 'Nobody');
      unknown.put('seen', AgentElectivesTestData.seen(seen));
      List<Object> nobody = AgentElectivesTestData.send(
        'move_elective_seat',
        'POST',
        AgentElectivesTestData.asked(unknown)
      );
      Map<String, Object> byNumber = move.clone();
      byNumber.put('camper', '#SYN-0001');
      byNumber.put('seen', AgentElectivesTestData.seen(seen));
      List<Object> done = AgentElectivesTestData.send(
        'move_elective_seat',
        'POST',
        AgentElectivesTestData.asked(byNumber)
      );
      Test.stopTest();
      Assert.areEqual(409, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(400, nobody[0], String.valueOf(nobody[1]));
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual('Moved Synthetic Camper 1 to Archery, locked.', done[1]);
      Assignment__c first = AgentElectivesTestData.seats()[0];
      Assert.areEqual(
        AgentElectivesTestData.ids.get('Archery'),
        first.Offering__c
      );
      Assert.isTrue(first.Locked__c && first.ByHand__c, 'by hand, locked');
      Assert.areEqual(
        AgentElectivesTestData.ids.get('Drama'),
        AgentElectivesTestData.seats()[1].Offering__c
      );
    }
  }
}
