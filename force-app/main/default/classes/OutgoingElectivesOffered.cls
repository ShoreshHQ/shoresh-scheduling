/**
 * electives_offered: what each elective set offers, going out so a form can collect choices
 * (docs/protocol/api.md; repo ADR 0024 choice 2). Web address /v1/electives_offered and the
 * Flow action send_electives_offered: one piece of logic (rows). An offering only proposed is
 * not offered yet, so it stays inside.
 */
@RestResource(urlMapping='/v1/electives_offered')
global with sharing class OutgoingElectivesOffered implements OutgoingDoors.Capability {
  private static final List<String> FIELDS = new List<String>{
    'elective_set',
    'activity',
    'seats',
    'minimum_to_run'
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
      label='as_csv'
      description='true to send a CSV file instead of JSON.'
    )
    global Boolean as_csv;
  }

  @InvocableMethod(
    label='send_electives_offered'
    description='Send what each elective set offers, with its seats, to a saved destination.'
    category='Shoresh'
    callout=true
  )
  global static List<OutgoingResult> send(List<Request> requests) {
    List<OutgoingDoors.Send> sends = new List<OutgoingDoors.Send>();
    for (Request each : requests) {
      OutgoingDoors.Send one = new OutgoingDoors.Send();
      one.toSystem = each.to_system;
      one.season = each.season;
      one.asCsv = each.as_csv;
      sends.add(one);
    }
    return OutgoingDoors.bySend(new OutgoingElectivesOffered(), sends);
  }

  @HttpGet
  global static void get() {
    OutgoingDoors.byWeb(new OutgoingElectivesOffered());
  }

  // ---------------------------------------------------------------- the capability

  public String name() {
    return 'electives_offered';
  }
  public String what() {
    return 'the electives offered';
  }
  public String permissionSet() {
    return 'Read_Electives_Offered';
  }
  public String permissionLabel() {
    return 'Read electives offered';
  }
  public List<String> fields() {
    return FIELDS;
  }

  /** Each set's offerings in name order; seats blank when an offering has no seat limit. */
  public List<Map<String, Object>> rows(Season__c season, String week) {
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    for (Offering__c offering : [
      SELECT
        ElectiveSet__r.Name,
        Activity__r.Name,
        Seats__c,
        NoSeatLimit__c,
        MinimumToRun__c
      FROM Offering__c
      WHERE ElectiveSet__r.Season__c = :season.Id AND Proposed__c = FALSE
      WITH USER_MODE
      ORDER BY ElectiveSet__r.Name, Activity__r.Name
      LIMIT 10000
    ]) {
      rows.add(
        new Map<String, Object>{
          'elective_set' => offering.ElectiveSet__r.Name,
          'activity' => offering.Activity__r.Name,
          // Blank or 0 seats are no limit (ELECT-4.1): sent blank, as no limit is.
          'seats' => ElectiveSeatCounts.limitOf(offering),
          'minimum_to_run' => offering.MinimumToRun__c
        }
      );
    }
    return rows;
  }
}
