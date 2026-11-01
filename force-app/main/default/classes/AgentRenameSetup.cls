/**
 * rename_setup_record: rename one of the season's setup records (a week, program, division,
 * group, time block, location type, location, activity, fixed or recurring activity, special day
 * or event, or elective set), as the person, through an agent or the command line
 * (docs/protocol/api.md API-1.47). Web address /v1/rename_setup_record, POST {season, kind, name,
 * program, new_name}. It is the setup table's own row save (SetupTablesController.saveRow), the
 * name the person saw sent as seen, so someone else's change since is refused, never overwritten.
 * Answered and refused in the screen's own words.
 */
@RestResource(urlMapping='/v1/rename_setup_record')
global with sharing class AgentRenameSetup implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'kind',
    'name',
    'program',
    'new_name'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentRenameSetup());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentSetupRecords.Found found = AgentSetupRecords.find(body);
    String newName = AgentFields.text(body, 'new_name');
    if (String.isBlank(newName)) {
      throw new ShoreshException(
        'Say what to call the ' + found.kind + ' now (new_name).'
      );
    }
    // Case counts: "bunk a" to "Bunk A" is a rename (Apex's == ignores case).
    if (newName.equals(found.name)) {
      return 'The ' + found.kind + ' is already called "' + newName + '".';
    }
    SObject record = found.id.getSObjectType().newSObject(found.id);
    record.put('Name', newName);
    SObject seen = found.id.getSObjectType().newSObject(found.id);
    seen.put('Name', found.name);
    RowSaves.Result result;
    try {
      // The setup table's own save of one row (ADR 0011).
      result = SetupTablesController.saveRow(
        record,
        seen,
        new ScreenSaves.Extras()
      );
    } catch (Exception e) {
      throw new ShoreshException(
        '"' + found.name + '" not saved. ' + ScreenErrors.words(e)
      );
    }
    if (!result.saved()) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed "' +
          found.name +
          '" since, so nothing was saved. Read it again in Shoresh.'
      );
    }
    return 'Renamed the ' +
      found.kind +
      ' "' +
      found.name +
      '" to "' +
      newName +
      '".';
  }
}
