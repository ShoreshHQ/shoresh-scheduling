/**
 * group: groups (bunks) from the camp's other system (docs/protocol/api.md; repo ADR 0024). Web address
 * /v1/group and the Flow action "group": one piece of logic (IncomingBatch, IncomingNamedPlan).
 * One Shoresh doesn't have is added; one it has is left as it is; nothing is deleted.
 */
@RestResource(urlMapping='/v1/group')
global with sharing class IncomingGroup implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'group_name',
    'division'
  };

  /** One group as the other system has it. */
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
      label='group_name'
      description='The group\'s (bunk\'s) name, like Bunk 3.'
      required=true
    )
    global String group_name;
    @InvocableVariable(
      label='division'
      description='The division it is in. Leave it out when the season has one division.'
    )
    global String division;
  }

  @InvocableMethod(
    label='group'
    description='Add groups (bunks) from another system. One Shoresh has is left as it is; nothing is deleted.'
    category='Shoresh'
  )
  global static List<IncomingResult> groups(List<Record> records) {
    return IncomingDoors.byFlow(new IncomingGroup(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(new IncomingGroup(), Record.class, FIELDS);
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Groups';
  }
  public String permissionLabel() {
    return 'Send groups';
  }
  public String what() {
    return 'Groups';
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
      one.name = record.group_name;
      one.parent = record.division;
      named.add(one);
    }
    new IncomingNamedPlan(batch, kind(batch.season.Id)).plan(named);
  }

  /** The season's divisions and their groups, in user mode. */
  private static IncomingNamedPlan.Kind kind(Id seasonId) {
    IncomingNamedPlan.Kind kind = new IncomingNamedPlan.Kind();
    kind.term = 'Group';
    kind.nameField = 'group_name';
    kind.parentTerm = 'Division';
    kind.parentField = 'division';
    kind.parentLink = Group__c.Division__c;
    kind.sortField = Group__c.SortOrder__c;
    for (Division__c division : [
      SELECT Id, Name
      FROM Division__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      IncomingNamedPlan.parent(kind, division.Id, division.Name);
    }
    IncomingNamedPlan.have(
      kind,
      [
        SELECT Id, Name, Division__c
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    return kind;
  }
}
