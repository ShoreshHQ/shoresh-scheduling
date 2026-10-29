/**
 * division: divisions from the camp's other system (docs/protocol/api.md; repo ADR 0024). Web address
 * /v1/division and the Flow action "division": one piece of logic (IncomingBatch, IncomingNamedPlan).
 * One Shoresh doesn't have is added; one it has is left as it is; nothing is deleted.
 */
@RestResource(urlMapping='/v1/division')
global with sharing class IncomingDivision implements IncomingBatch.Capability {
  // The record's fields by their plain names (API-1.5), for the web address.
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'source_system',
    'division_name',
    'program'
  };

  /** One division as the other system has it. */
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
      label='division_name'
      description='The division\'s name, like Juniors.'
      required=true
    )
    global String division_name;
    @InvocableVariable(
      label='program'
      description='The program it is in. Leave it out when the season has one program.'
    )
    global String program;
  }

  @InvocableMethod(
    label='division'
    description='Add divisions from another system. One Shoresh has is left as it is; nothing is deleted.'
    category='Shoresh'
  )
  global static List<IncomingResult> division(List<Record> records) {
    return IncomingDoors.byFlow(new IncomingDivision(), records);
  }

  @HttpPost
  global static void post() {
    IncomingDoors.byWeb(new IncomingDivision(), Record.class, FIELDS);
  }

  // ---------------------------------------------------------------- the capability

  public String permissionSet() {
    return 'Send_Divisions';
  }
  public String permissionLabel() {
    return 'Send divisions';
  }
  public String what() {
    return 'Divisions';
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
      one.name = record.division_name;
      one.parent = record.program;
      named.add(one);
    }
    new IncomingNamedPlan(batch, kind(batch.season.Id)).plan(named);
  }

  /** The season's programs and their divisions, in user mode. */
  private static IncomingNamedPlan.Kind kind(Id seasonId) {
    IncomingNamedPlan.Kind kind = new IncomingNamedPlan.Kind();
    kind.term = 'Division';
    kind.nameField = 'division_name';
    kind.parentTerm = 'Program';
    kind.parentField = 'program';
    kind.parentLink = Division__c.Program__c;
    kind.sortField = Division__c.SortOrder__c;
    for (Program__c program : [
      SELECT Id, Name
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      IncomingNamedPlan.parent(kind, program.Id, program.Name);
    }
    IncomingNamedPlan.have(
      kind,
      [
        SELECT Id, Name, Program__c
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    return kind;
  }
}
