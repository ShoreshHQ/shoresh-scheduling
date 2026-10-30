/**
 * activity_schedule: each activity's published week, going out (docs/protocol/api.md; repo ADR
 * 0024 choice 2): which groups it has, when. Web address /v1/activity_schedule and the Flow
 * action send_activity_schedule: one piece of logic (rows), only from a published week (API-6.2).
 */
@RestResource(urlMapping='/v1/activity_schedule')
global with sharing class OutgoingActivitySchedule implements OutgoingDoors.Capability {
  private static final List<String> FIELDS = new List<String>{
    'week',
    'date',
    'activity',
    'time_block',
    'start_time',
    'end_time',
    'groups'
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
    label='send_activity_schedule'
    description='Send each activity\'s published schedule for a week to a saved destination.'
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
    return OutgoingDoors.bySend(new OutgoingActivitySchedule(), sends);
  }

  @HttpGet
  global static void get() {
    OutgoingDoors.byWeb(new OutgoingActivitySchedule());
  }

  // ---------------------------------------------------------------- the capability

  public String name() {
    return 'activity_schedule';
  }
  public String what() {
    return 'the activity schedule';
  }
  public String permissionSet() {
    return 'Read_Activity_Schedules';
  }
  public String permissionLabel() {
    return 'Read activity schedules';
  }
  public List<String> fields() {
    return FIELDS;
  }

  /**
   * Day by day in time order, each activity once per time it runs, with the groups it has then
   * (in the schedule's order). Activities at one time are in name order.
   */
  public List<Map<String, Object>> rows(Season__c season, String week) {
    Map<String, Map<String, Object>> byKey = new Map<String, Map<String, Object>>();
    for (OutgoingPublished.Thing thing : OutgoingPublished.of(season, week)) {
      String key =
        String.valueOf(thing.day) +
        '|' +
        thing.startTime +
        '|' +
        thing.activity.toLowerCase() +
        '|' +
        thing.endTime +
        '|' +
        thing.block;
      if (!byKey.containsKey(key)) {
        byKey.put(
          key,
          new Map<String, Object>{
            'week' => week,
            'date' => String.valueOf(thing.day),
            'activity' => thing.activity,
            'time_block' => thing.block,
            'start_time' => thing.startTime,
            'end_time' => thing.endTime,
            'groups' => ''
          }
        );
      }
      Map<String, Object> row = byKey.get(key);
      String groups = (String) row.get('groups');
      row.put(
        'groups',
        groups == '' ? thing.groupName : groups + ', ' + thing.groupName
      );
    }
    List<String> keys = new List<String>(byKey.keySet());
    keys.sort();
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    for (String key : keys) {
      rows.add(byKey.get(key));
    }
    return rows;
  }
}
