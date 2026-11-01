/**
 * read_last_imports: the imports Undo is offered for, through an agent or the command line
 * (docs/protocol/api.md API-1.82). Web address /v1/read_last_imports, GET ?season=. As Roots and
 * Settings list them (SeasonSetupController.getSeasonSetup: lastImport, lastFromOutside): the
 * person's own last import that stands, and each outside system's last batch, each with when it
 * was made and the seen undo_import carries back.
 */
@RestResource(urlMapping='/v1/read_last_imports')
global with sharing class AgentReadLastImports implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadLastImports());
  }

  public String run() {
    for (String key : RestContext.request.params.keySet()) {
      if (key != 'season') {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: season.'
        );
      }
    }
    Season__c season = AgentChangeCampWords.seasonOf(
      RestContext.request.params.get('season')
    );
    SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
      season.Id
    );
    List<String> said = new List<String>();
    if (setup.lastImport != null) {
      said.add(
        'Last import: ' + filesOf(setup.lastImport) + lineEnd(setup.lastImport)
      );
    }
    for (Import__c last : setup.lastFromOutside) {
      said.add(
        'Last from ' +
          last.Source__c +
          ': ' +
          filesOf(last).substringBefore(' from ') +
          lineEnd(last) +
          ', from: "' +
          last.Source__c +
          '"'
      );
    }
    if (said.isEmpty()) {
      return 'Nothing imported into "' +
        season.Name +
        '" can be undone: there is no import, or the last one was undone.';
    }
    return 'Imports in "' +
      season.Name +
      '" that can be undone, each the last of its kind: ' +
      String.join(said, '; ') +
      '. To undo one, use undo_import with its seen (and its from, for an outside system), after asking the person.';
  }

  private static String filesOf(Import__c last) {
    return String.isBlank(last.Files__c) ? 'a file' : last.Files__c;
  }

  /** ", 1 Nov 2026 10:03 AM, seen: <id>" in the person's own time zone. */
  private static String lineEnd(Import__c last) {
    return ', ' +
      last.CreatedDate.format('d MMM yyyy h:mm a') +
      ', seen: "' +
      last.Id +
      '"';
  }
}
