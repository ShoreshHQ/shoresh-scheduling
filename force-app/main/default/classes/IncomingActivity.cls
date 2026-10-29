/**
 * activity: activities from the camp's other system (docs/protocol/api.md; repo ADR 0024). Web address
 * /v1/activity and the Flow action "activity": one piece of logic (IncomingBatch, IncomingNamedPlan).
 * One Shoresh doesn't have is added; one it has is left as it is; nothing is deleted.
 */
@RestResource(urlMapping='/v1/activity')
global with sharing class IncomingActivity implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'activity_name'
  };

  /** One activity as the other system has it. */
  global class Record {
    @InvocableVariable(
      label='season'
      description='The season\'s name in Shoresh, like Summer 2026.'
      required=true
    )
    global String season;
    @InvocableVariable(
      label='source_system'
      description='The name of the sending system, as the camp calls it, like CampMinder.'
      required=true
    )
    global String source_system;
    @InvocableVariable(
      label='activity_name'
      description='The activity\'s name, like Archery.'
      required=true
    )
    global String activity_name;
  }

  @InvocableMethod(
    label='activity'
    description='Add activities from another system. One Shoresh has is left as it is; nothing is deleted.'
    category='Shoresh'
  )
  global static List<IncomingResult> activity(List<Record> records) {
    return IncomingDoors.byFlow(new IncomingActivity(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(new IncomingActivity(), Record.class, FIELDS);
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Activities';
  }
  public String permissionLabel() {
    return 'Send activities';
  }
  public String what() {
    return 'Activities';
  }
  public String seasonOf(Object record) {
    return ((Record) record).season;
  }
  public String systemOf(Object record) {
    return ((Record) record).source_system;
  }

  public void plan(IncomingBatch batch, List<Object> records) {
    List<IncomingNamedPlan.Named> named = new List<IncomingNamedPlan.Named>();
    for (Object item : records) {
      Record record = item == null ? new Record() : (Record) item;
      IncomingNamedPlan.Named one = new IncomingNamedPlan.Named();
      one.name = record.activity_name;
      named.add(one);
    }
    new IncomingNamedPlan(batch, kind(batch.season.Id)).plan(named);
  }

  /** The season's activities, in user mode. */
  private static IncomingNamedPlan.Kind kind(Id seasonId) {
    IncomingNamedPlan.Kind kind = new IncomingNamedPlan.Kind();
    kind.term = 'Activity';
    kind.nameField = 'activity_name';
    kind.seasonField = Activity__c.Season__c;
    IncomingNamedPlan.have(
      kind,
      [
        SELECT Id, Name
        FROM Activity__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    return kind;
  }
}
