/**
 * make_linked_choice: make a linked choice, as "+ Linked choice" and the first period picked do in
 * the linked choices editor, through an agent or the command line (docs/protocol/api.md API-1.132).
 * Web address /v1/make_linked_choice, POST {season, elective_set, activity, name, periods,
 * applies_to, divisions}. Saved by the editor's own save (LinkedChoiceSaves). The connector fills
 * in a name left out with the editor's proposal.
 */
@RestResource(urlMapping='/v1/make_linked_choice')
global with sharing class AgentMakeLinkedChoice implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'elective_set',
    'activity',
    'name',
    'periods',
    'applies_to',
    'divisions'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentMakeLinkedChoice());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(body);
    Offering__c offering = refs.offeringOf(AgentFields.text(body, 'activity'));
    LinkedChoicePlaces.Places places = refs.places();
    if (places.complete && places.cells.isEmpty()) {
      throw new ShoreshException(
        refs.electiveSet.Name +
          ' isn\'t on any schedule, so no ' +
          refs.word() +
          ' can be made for it. Nothing was changed.'
      );
    }
    List<Object> periods = AgentFields.listOf(body, 'periods');
    if (periods.isEmpty()) {
      throw new ShoreshException(
        'Say its periods (periods): a ' + refs.word() + ' starts with one.'
      );
    }
    LinkedChoiceSaves.Edit edit = new LinkedChoiceSaves.Edit();
    edit.offeringId = offering.Id;
    edit.name = AgentFields.text(body, 'name');
    AgentLinkedChoiceRefs.refuseLongName(edit.name);
    edit.appliesTo = AgentLinkedChoiceRefs.appliesToOf(body) ?? 'All';
    edit.periodsOn = new AgentLinkedPeriods(refs)
      .of(periods, new AgentLinkedPeriods(refs).placed());
    List<Object> divisions = AgentFields.listOf(body, 'divisions');
    // The editor has no divisions to tick while it applies to All.
    if (edit.appliesTo == 'All' && !divisions.isEmpty()) {
      throw new ShoreshException(
        'It applies to All, so it names no ' +
          refs.labels.pluralInSentence('Division') +
          '. Nothing was changed.'
      );
    }
    edit.divisionsOn = new AgentLinkedDivisions(refs)
      .idsOf(divisions, new AgentLinkedDivisions(refs).offered());
    LinkedChoiceSaves.save(edit);
    return 'Made the ' + refs.word() + ' "' + edit.name + '".';
  }
}
