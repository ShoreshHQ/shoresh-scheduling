/**
 * change_linked_choice: rename a linked choice, say who it applies to and tick or untick its
 * periods and divisions, as the linked choices editor's gestures do, through an agent or the
 * command line (docs/protocol/api.md API-1.133). Web address /v1/change_linked_choice, POST
 * {season, elective_set, activity, name, new_name, applies_to, periods_on, periods_off,
 * divisions_on, divisions_off}. Saved by the editor's own save (LinkedChoiceSaves), all or none: a
 * change says only what it changes, so ticking twice is the same as once.
 */
@RestResource(urlMapping='/v1/change_linked_choice')
global with sharing class AgentChangeLinkedChoice implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'elective_set',
    'activity',
    'name',
    'new_name',
    'applies_to',
    'periods_on',
    'periods_off',
    'divisions_on',
    'divisions_off'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeLinkedChoice());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(body);
    LinkedChoice__c choice = refs.choiceOf(body);
    LinkedChoiceSaves.Edit edit = editOf(body, refs, choice);
    LinkedChoiceSaves.save(edit);
    return 'Changed the ' +
      refs.word() +
      ' "' +
      (edit.name ?? choice.Name) +
      '".';
  }

  private static LinkedChoiceSaves.Edit editOf(
    Map<String, Object> body,
    AgentLinkedChoiceRefs refs,
    LinkedChoice__c choice
  ) {
    LinkedChoiceSaves.Edit edit = new LinkedChoiceSaves.Edit();
    edit.id = choice.Id;
    // A name sent blank is refused by the save, in the editor's words.
    edit.name = body.containsKey('new_name')
      ? AgentFields.text(body, 'new_name')
      : null;
    AgentLinkedChoiceRefs.refuseLongName(edit.name);
    edit.appliesTo = AgentLinkedChoiceRefs.appliesToOf(body);
    Set<String> offered = new AgentLinkedPeriods(refs).placed();
    Set<String> held = AgentLinkedPeriods.heldBy(choice);
    offered.addAll(held);
    edit.periodsOn = new AgentLinkedPeriods(refs)
      .of(AgentFields.listOf(body, 'periods_on'), offered);
    // Unticking what is already off is the same as once: the save leaves it.
    edit.periodsOff = new AgentLinkedPeriods(refs)
      .of(AgentFields.listOf(body, 'periods_off'), offered);
    edit.divisionsOn = new AgentLinkedDivisions(refs)
      .idsOf(ticked(body, refs, choice), offeredTo(refs, choice));
    edit.divisionsOff = new AgentLinkedDivisions(refs)
      .idsOf(
        AgentFields.listOf(body, 'divisions_off'),
        offeredTo(refs, choice)
      );
    if (
      edit.name == null &&
      edit.appliesTo == null &&
      edit.periodsOn.isEmpty() &&
      edit.periodsOff.isEmpty() &&
      edit.divisionsOn.isEmpty() &&
      edit.divisionsOff.isEmpty()
    ) {
      throw new ShoreshException(
        'Say what changes: new_name, applies_to, periods_on, periods_off, divisions_on or divisions_off.'
      );
    }
    return edit;
  }

  /** The divisions to tick, after refusing either list while it applies to All. */
  private static List<Object> ticked(
    Map<String, Object> body,
    AgentLinkedChoiceRefs refs,
    LinkedChoice__c choice
  ) {
    List<Object> ticks = AgentFields.listOf(body, 'divisions_on');
    // The editor has no divisions to tick while it applies to All.
    if (
      (AgentLinkedChoiceRefs.appliesToOf(body) ?? choice.AppliesTo__c) ==
      'All' &&
      !(ticks.isEmpty() && AgentFields.listOf(body, 'divisions_off').isEmpty())
    ) {
      throw new ShoreshException(
        '"' +
          choice.Name +
          '" applies to All, so it names no ' +
          refs.labels.pluralInSentence('Division') +
          '. Nothing was changed.'
      );
    }
    return ticks;
  }

  /** The divisions offered, once each: one it names is usually one the set sits in. */
  private static List<Division__c> offeredTo(
    AgentLinkedChoiceRefs refs,
    LinkedChoice__c choice
  ) {
    Map<Id, Division__c> once = new Map<Id, Division__c>(
      new AgentLinkedDivisions(refs).offered()
    );
    once.putAll(new AgentLinkedDivisions(refs).namedBy(choice));
    return once.values();
  }
}
