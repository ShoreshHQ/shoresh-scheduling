/**
 * elective_seats: who has a seat in which elective, when, going out (docs/protocol/api.md; repo
 * ADR 0024 choice 2). Web address /v1/elective_seats and the Flow action send_elective_seats: one
 * piece of logic (rows), only from finalized seats (API-6.2).
 *
 * API-4.6: a camper from an outside system goes out by that system and its ID only; their name,
 * number and bunk are that system's, so they are not sent back. A camper Shoresh holds itself
 * goes out by name, number and bunk.
 */
@RestResource(urlMapping='/v1/elective_seats')
global with sharing class OutgoingElectiveSeats implements OutgoingDoors.Capability {
  private static final List<String> FIELDS = new List<String>{
    'week',
    'elective_set',
    'date',
    'time_block',
    'activity',
    'location',
    'source_system',
    'camper_id',
    'camper_name',
    'camper_number',
    'bunk'
  };

  /** One send a Flow asks for. */
  global class Request {
    @InvocableVariable(
      label='to_system'
      description='Where to send it: the name of a Named Credential the camp made, like formstack.'
      required=true
    )
    global String to_system;
    @InvocableVariable(
      label='season'
      description='The season\'s name in Shoresh, like Summer 2026.'
      required=true
    )
    global String season;
    @InvocableVariable(
      label='week'
      description='The week\'s name in Shoresh, like Week 2. Its seats must be finalized.'
      required=true
    )
    global String week;
    @InvocableVariable(
      label='as_csv'
      description='true to send a CSV file instead of JSON.'
    )
    global Boolean as_csv;
  }

  @InvocableMethod(
    label='send_elective_seats'
    description='Send a week\'s finalized elective seats to a saved destination.'
    category='Shoresh'
    callout=true
  )
  global static List<OutgoingResult> send(List<Request> requests) {
    List<OutgoingDoors.Send> sends = new List<OutgoingDoors.Send>();
    for (Request each : requests) {
      OutgoingDoors.Send one = new OutgoingDoors.Send();
      one.toSystem = each.to_system;
      one.season = each.season;
      one.week = each.week;
      one.asCsv = each.as_csv;
      sends.add(one);
    }
    return OutgoingDoors.bySend(new OutgoingElectiveSeats(), sends);
  }

  @HttpGet
  global static void get() {
    OutgoingDoors.byWeb(new OutgoingElectiveSeats());
  }

  // ---------------------------------------------------------------- the capability

  public String name() {
    return 'elective_seats';
  }
  public String what() {
    return 'the elective seats';
  }
  public String permissionSet() {
    return 'Read_Elective_Seats';
  }
  public String permissionLabel() {
    return 'Read elective seats';
  }
  public List<String> fields() {
    return FIELDS;
  }

  /** The week's finalized runs' seats, by set, day, time and activity; withdrawn campers left out. */
  public List<Map<String, Object>> rows(Season__c season, String week) {
    Set<Id> finalRuns = finalRuns(season, week);
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    for (Assignment__c seat : [
      SELECT
        ElectiveRun__r.ElectiveSet__r.Name,
        Date__c,
        TimeBlock__r.Name,
        ActivityName__c,
        LocationName__c,
        GroupName__c,
        Camper__r.Name,
        Camper__r.CamperNumber__c,
        Camper__r.SourceSystem__c,
        Camper__r.OutsideId__c
      FROM Assignment__c
      WHERE ElectiveRun__c IN :finalRuns AND Camper__r.Withdrawn__c = FALSE
      WITH USER_MODE
      ORDER BY
        ElectiveRun__r.ElectiveSet__r.Name,
        Date__c,
        TimeBlock__r.SortOrder__c,
        ActivityName__c,
        Camper__r.Name,
        Id
      LIMIT 50000
    ]) {
      rows.add(rowOf(seat, week));
    }
    return rows;
  }

  /** The week's finalized runs, or refused when none is final yet. */
  private static Set<Id> finalRuns(Season__c season, String week) {
    OutgoingRows.weekIn(season, week);
    Set<Id> finalRuns = new Set<Id>();
    for (ElectiveRun__c run : [
      SELECT Id, Week__r.Name
      FROM ElectiveRun__c
      WHERE
        Season__c = :season.Id
        AND Status__c = :ElectiveRunState.FINAL_STATUS
      WITH USER_MODE
      LIMIT 1000
    ]) {
      if (OutgoingRows.sameWeek(run.Week__r.Name, week)) {
        finalRuns.add(run.Id);
      }
    }
    if (finalRuns.isEmpty()) {
      throw new ShoreshException(
        'No elective seats in "' +
          week.left(80) +
          '" are final yet. Seats go out once they are finalized.'
      );
    }
    return finalRuns;
  }

  /** One seat; an outside camper by their system and ID only (API-4.6). */
  private static Map<String, Object> rowOf(Assignment__c seat, String week) {
    Boolean outside = String.isNotBlank(seat.Camper__r.SourceSystem__c);
    return new Map<String, Object>{
      'week' => week,
      'elective_set' => seat.ElectiveRun__r.ElectiveSet__r.Name,
      'date' => String.valueOf(seat.Date__c),
      'time_block' => seat.TimeBlock__r.Name,
      'activity' => seat.ActivityName__c,
      'location' => seat.LocationName__c,
      'source_system' => outside ? seat.Camper__r.SourceSystem__c : null,
      'camper_id' => outside ? seat.Camper__r.OutsideId__c : null,
      'camper_name' => outside ? null : seat.Camper__r.Name,
      'camper_number' => outside ? null : seat.Camper__r.CamperNumber__c,
      'bunk' => outside ? null : seat.GroupName__c
    };
  }
}
