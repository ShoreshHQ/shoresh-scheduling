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

  /** Both campers in Drama, Archery down to one seat: the camp the two move tests share. */
  private static void dramaAndOneArcherySeat() {
    AgentElectivesTestData.camp();
    ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
    request.runId = AgentElectivesTestData.runId;
    request.revision = AgentElectivesTestData.revision();
    request.seats = (List<ElectiveSeatSaves.SeatIn>) JSON.deserialize(
      JSON.serialize(AgentElectivesTestData.everyoneInDrama()),
      List<ElectiveSeatSaves.SeatIn>.class
    );
    ElectiveSeatsController.assignSeats(JSON.serialize(request));
    Database.update(
      new Offering__c(
        Id = AgentElectivesTestData.ids.get('Archery'),
        Seats__c = 1
      ),
      AccessLevel.USER_MODE
    );
  }

  // API-1.68: a move to the seat a camper holds says so truthfully, to the AI and on screen.
  @IsTest
  static void aMoveToTheSeatHeldSaysSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      dramaAndOneArcherySeat();
      Test.startTest();
      List<Object> already = move('Synthetic Camper 1', 'Drama');
      String screen;
      try {
        ElectiveSeatChange.ChangeRequest same = new ElectiveSeatChange.ChangeRequest();
        same.runId = AgentElectivesTestData.runId;
        same.revision = AgentElectivesTestData.revision();
        same.camperId = AgentElectivesTestData.campers[0];
        same.day = AgentElectivesTestData.MONDAY;
        same.blockId = AgentElectivesTestData.ids.get('Period 1');
        same.offeringId = AgentElectivesTestData.ids.get('Drama');
        ElectiveSeatsController.changeSeat(JSON.serialize(same));
      } catch (Exception e) {
        screen = ScreenErrors.words(e);
      }
      Test.stopTest();
      String words = 'Synthetic Camper 1 is already in Drama then; nothing changed.';
      Assert.areEqual(200, already[0], String.valueOf(already[1]));
      Assert.areEqual(words, already[1]);
      Assert.areEqual(words, screen);
    }
  }

  // API-1.68: a move into a full offering is refused, as the desktop refuses it.
  @IsTest
  static void aMoveIntoAFullOfferingIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      dramaAndOneArcherySeat();
      Test.startTest();
      List<Object> first = move('Synthetic Camper 1', 'Archery');
      List<Object> over = move('Synthetic Camper 2', 'Archery');
      Test.stopTest();
      Assert.areEqual('Moved Synthetic Camper 1 to Archery, locked.', first[1]);
      Assert.areEqual(400, over[0], String.valueOf(over[1]));
      Assert.areEqual(
        'Archery is full then (1 of 1 seats); nothing changed.',
        over[1]
      );
      Assert.areEqual(
        AgentElectivesTestData.ids.get('Drama'),
        AgentElectivesTestData.seats()[1].Offering__c,
        'the second camper stays in Drama'
      );
    }
  }

  // API-1.68: an offering over its seats (its seats lowered after Assign) is said in the read,
  // as the screen's "over Seats" problem shows it.
  @IsTest
  static void theSeatsReadSaysAnOfferingOverItsSeats() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      List<Object> seats = AgentElectivesTestData.everyoneInDrama();
      for (Object each : seats) {
        ((Map<String, Object>) each)
          .put('offeringId', AgentElectivesTestData.ids.get('Archery'));
      }
      ElectiveSeatSaves.AssignRequest request = new ElectiveSeatSaves.AssignRequest();
      request.runId = AgentElectivesTestData.runId;
      request.revision = AgentElectivesTestData.revision();
      request.seats = (List<ElectiveSeatSaves.SeatIn>) JSON.deserialize(
        JSON.serialize(seats),
        List<ElectiveSeatSaves.SeatIn>.class
      );
      ElectiveSeatsController.assignSeats(JSON.serialize(request));
      Database.update(
        new Offering__c(
          Id = AgentElectivesTestData.ids.get('Archery'),
          Seats__c = 1
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      List<Object> read = AgentElectivesTestData.send(
        'elective_seats_now',
        'GET',
        AgentElectivesTestData.asked(new Map<String, Object>())
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(
        String.valueOf(read[1])
          .contains('Archery is over its seats on Monday, Period 1: 2 of 1.'),
        String.valueOf(read[1])
      );
    }
  }

  private static List<Object> move(String camper, String elective) {
    return AgentElectivesTestData.send(
      'move_elective_seat',
      'POST',
      AgentElectivesTestData.asked(
        new Map<String, Object>{
          'camper' => camper,
          'day' => 'Monday',
          'time' => 'Period 1',
          'elective' => elective,
          'seen' => AgentElectivesTestData.seen(
            AgentElectivesTestData.revision()
          )
        }
      )
    );
  }
}
