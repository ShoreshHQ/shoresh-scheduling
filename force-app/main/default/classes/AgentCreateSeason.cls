/**
 * create_season: a blank season of a camp, as Camp Setup's New season does, through an agent or the
 * command line (docs/protocol/api.md API-1.140). Web address /v1/create_season, POST {camp, name,
 * start_date, end_date}. The screen's own save (SeasonSetupController.saveRecords), Planning as it
 * starts one, so the season's own rules refuse what they refuse.
 */
@RestResource(urlMapping='/v1/create_season')
global with sharing class AgentCreateSeason implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'camp',
    'name',
    'start_date',
    'end_date'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCreateSeason());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Camp__c camp = campOf(AgentFields.text(body, 'camp'));
    String name = AgentFields.text(body, 'name');
    String first = AgentFields.text(body, 'start_date');
    String last = AgentFields.text(body, 'end_date');
    if (String.isBlank(name) || String.isBlank(first) || String.isBlank(last)) {
      throw new ShoreshException(
        'Say its name, first day and last day (name, start_date, end_date).'
      );
    }
    AgentCopySeason.refuseTaken(name);
    AgentLinkedChoiceRefs.refuseLongName(name);
    Season__c season = new Season__c(
      Camp__c = camp.Id,
      Status__c = 'Planning',
      Name = name,
      StartDate__c = dateOf('start_date', first),
      EndDate__c = dateOf('end_date', last)
    );
    try {
      List<Id> made = SeasonSetupController.saveRecords(
        new List<SObject>{ season }
      );
      OutgoingRows.usedIs(new Season__c(Id = made[0], Name = name));
    } catch (Exception e) {
      throw new ShoreshException(
        'Season not created. Nothing was saved. ' + ScreenErrors.words(e)
      );
    }
    return 'Created the season "' +
      name +
      '" in ' +
      camp.Name +
      '. Nothing is set up in it yet.';
  }

  /** The camp named, or the only one; never one picked from several. */
  private static Camp__c campOf(String asked) {
    List<Camp__c> camps = SeasonSetupController.getCamps();
    List<String> names = new List<String>();
    for (Camp__c camp : camps) {
      if (IncomingBatch.fold(camp.Name) == IncomingBatch.fold(asked)) {
        return camp;
      }
      names.add(camp.Name);
    }
    if (String.isBlank(asked) && camps.size() == 1) {
      return camps[0];
    }
    throw new ShoreshException(
      camps.isEmpty()
        ? 'There is no camp yet. Nothing was changed.'
        : (String.isBlank(asked)
            ? 'Say which camp (camp).'
            : 'No camp called "' + asked.left(80) + '".') +
          ' There are: ' +
          String.join(names, ', ') +
          '.'
    );
  }

  /** A date as written; one that doesn't exist (February 30) isn't moved to one that does. */
  private static Date dateOf(String field, String asked) {
    Date read;
    try {
      read = Date.valueOf(asked);
    } catch (Exception e) {
      read = null;
    }
    if (read == null || String.valueOf(read) != asked) {
      throw new ShoreshException(
        'Give ' + field + ' as a date that exists, like 2027-06-28.'
      );
    }
    return read;
  }
}
