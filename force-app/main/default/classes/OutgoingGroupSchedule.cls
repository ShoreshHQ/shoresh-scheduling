/**
 * group_schedule: each group's published week, going out (docs/protocol/api.md; repo ADR 0024
 * choice 2). Web address /v1/group_schedule and the Flow action send_group_schedule: one piece
 * of logic (rows), only from a published week (API-6.2).
 */
@RestResource(urlMapping='/v1/group_schedule')
global with sharing class OutgoingGroupSchedule implements OutgoingDoors.Capability {
  private static final List<String> FIELDS = new List<String>{
    'week',
    'date',
    'group',
    'time_block',
    'start_time',
    'end_time',
    'activity',
    'division'
  };

  private static final Pattern ID_LIKE = Pattern.compile(
    '[A-Za-z0-9]{15}([A-Za-z0-9]{3})?'
  );

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
      description='The week\'s name in Shoresh, like Week 2. It must be published.'
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
    label='send_group_schedule'
    description='Send each group\'s published schedule for a week to a saved destination.'
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
    return OutgoingDoors.bySend(new OutgoingGroupSchedule(), sends);
  }

  @HttpGet
  global static void get() {
    OutgoingDoors.byWeb(new OutgoingGroupSchedule());
  }

  // ---------------------------------------------------------------- the capability

  public String name() {
    return 'group_schedule';
  }
  public String what() {
    return 'the group schedule';
  }
  public String permissionSet() {
    return 'Read_Group_Schedules';
  }
  public String permissionLabel() {
    return 'Read group schedules';
  }
  public List<String> fields() {
    return FIELDS;
  }

  /**
   * Day by day, each group in the schedule's order, each thing it does in time order, with the
   * group's division, so two groups of one name are told apart (API-6.6).
   */
  public List<Map<String, Object>> rows(Season__c season, String week) {
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    List<OutgoingPublished.Thing> things = OutgoingPublished.of(season, week);
    Map<String, String> divisions = divisionsOf(things);
    for (OutgoingPublished.Thing thing : things) {
      rows.add(
        new Map<String, Object>{
          'week' => week,
          'date' => String.valueOf(thing.day),
          'group' => thing.groupName,
          'time_block' => thing.block,
          'start_time' => thing.startTime,
          'end_time' => thing.endTime,
          'activity' => thing.activity,
          'division' => divisions.get(thing.groupId)
        }
      );
    }
    return rows;
  }

  /**
   * Each published group's division by its id; none for a group in no division. Read in system
   * mode on purpose: a key holds these groups' names already, and only the division's name (or
   * that there is none) comes of it.
   */
  private static Map<String, String> divisionsOf(
    List<OutgoingPublished.Thing> things
  ) {
    Set<String> ids = new Set<String>();
    for (OutgoingPublished.Thing thing : things) {
      if (thing.groupId != null && ID_LIKE.matcher(thing.groupId).matches()) {
        ids.add(thing.groupId);
      }
    }
    Map<String, String> result = new Map<String, String>();
    for (Group__c each : [
      SELECT Id, Division__r.Name, Division__r.NoDivision__c
      FROM Group__c
      WHERE Id IN :ids
      WITH SYSTEM_MODE
    ]) {
      result.put(
        each.Id,
        each.Division__r.NoDivision__c ? null : each.Division__r.Name
      );
    }
    return result;
  }
}
