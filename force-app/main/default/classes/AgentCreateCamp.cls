/**
 * create_camp: name the camp, as Camp Setup's first screen does, through an agent or the command
 * line (docs/protocol/api.md API-1.139). Web address /v1/create_camp, POST {name}. The first screen
 * shows only while the person can see no camp, so anything else is refused, naming the camps
 * there are. The screen's own save (SeasonSetupController.saveRecords).
 */
@RestResource(urlMapping='/v1/create_camp')
global with sharing class AgentCreateCamp implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{ 'name' };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCreateCamp());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    String name = AgentFields.text(body, 'name');
    if (String.isBlank(name)) {
      throw new ShoreshException('Say the camp\'s name (name).');
    }
    List<String> camps = new List<String>();
    for (Camp__c camp : SeasonSetupController.getCamps()) {
      camps.add(camp.Name);
    }
    if (!camps.isEmpty()) {
      throw new ShoreshException(
        'A camp is set up already: ' +
          String.join(camps, ', ') +
          '. Nothing was changed.'
      );
    }
    try {
      SeasonSetupController.saveRecords(
        new List<SObject>{ new Camp__c(Name = name) }
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'Camp not created. Nothing was saved. ' + ScreenErrors.words(e)
      );
    }
    return 'Created the camp "' + name + '".';
  }
}
