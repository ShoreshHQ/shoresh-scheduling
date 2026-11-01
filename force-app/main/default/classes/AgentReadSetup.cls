/**
 * read_setup_record: what one of the season's setup records holds in the fields
 * change_setup_record changes, as the person sees them, through an agent or the command line
 * (docs/protocol/api.md API-1.49). Web address /v1/read_setup_record, GET ?season=&kind=&name=&program=. Found as rename_setup_record finds it; each value is said as a change takes it (a
 * date 2026-07-06, a time 9:00 AM, yes or no, a choice's label, another record's name or none),
 * so the agent can send it back as seen.
 */
@RestResource(urlMapping='/v1/read_setup_record')
global with sharing class AgentReadSetup implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program'
  };

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadSetup());
  }

  public String run() {
    AgentSetupRecords.Found found = AgentSetupRecords.find(asked());

    List<String> keys = AgentSetupFields.namesOf(found.term);
    if (keys.isEmpty()) {
      return AgentSetupFields.aOrAn(found.kind) +
        ' has nothing but its name: "' +
        found.name +
        '".';
    }
    List<String> columns = new List<String>();
    for (String key : keys) {
      columns.add(
        ShoreshSchema.queryName(AgentSetupFields.fieldOf(found.term, key))
      );
    }
    SObject now = Database.queryWithBinds(
      'SELECT ' +
        String.join(columns, ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(found.id.getSObjectType()) +
        ' WHERE Id = :recordId',
      new Map<String, Object>{ 'recordId' => found.id },
      AccessLevel.USER_MODE
    )[0];
    List<String> said = new List<String>();
    for (String key : keys) {
      said.add(
        key + ': ' + shown(AgentSetupFields.fieldOf(found.term, key), now)
      );
    }
    return 'The ' +
      found.kind +
      ' "' +
      found.name +
      '" holds ' +
      String.join(said, '; ') +
      '. Send these back as seen when changing them.';
  }

  /** The web address's fields; one Shoresh doesn't know is refused, as a body's is. */
  private static Map<String, Object> asked() {
    Map<String, Object> result = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: kind, name, program, season.'
        );
      }
      result.put(key, RestContext.request.params.get(key));
    }
    return result;
  }

  /** One value as a change takes it. */
  private static String shown(Schema.SObjectField field, SObject now) {
    Object value = now.get(field);
    Schema.DescribeFieldResult about = field.getDescribe();
    Schema.DisplayType type = about.getType();
    if (type == Schema.DisplayType.BOOLEAN) {
      return value == true ? 'yes' : 'no';
    }
    if (value == null) {
      return type == Schema.DisplayType.REFERENCE ? 'none' : '(blank)';
    }
    if (type == Schema.DisplayType.REFERENCE) {
      return nameOf((Id) value);
    }
    return plain(about, value);
  }

  /** A time as 9:00 AM, a choice by its label, anything else as it is. */
  private static String plain(Schema.DescribeFieldResult about, Object value) {
    if (about.getType() == Schema.DisplayType.TIME) {
      return DateTime.newInstanceGmt(Date.today(), (Time) value)
        .formatGmt('h:mm a');
    }
    for (Schema.PicklistEntry entry : about.getPicklistValues()) {
      if (entry.getValue().equals(value)) {
        return entry.getLabel();
      }
    }
    return String.valueOf(value);
  }

  /** Another record's name; a group's holding division is No division (DIV-1.1): none. */
  private static String nameOf(Id recordId) {
    if (recordId.getSObjectType() == Division__c.SObjectType) {
      Division__c division = [
        SELECT Name, NoDivision__c
        FROM Division__c
        WHERE Id = :recordId
        WITH USER_MODE
      ];
      return division.NoDivision__c ? 'none' : division.Name;
    }
    return (String) Database.queryWithBinds(
        'SELECT Name FROM ' +
          ShoreshSchema.queryName(recordId.getSObjectType()) +
          ' WHERE Id = :recordId',
        new Map<String, Object>{ 'recordId' => recordId },
        AccessLevel.USER_MODE
      )[0]
      .get('Name');
  }
}
