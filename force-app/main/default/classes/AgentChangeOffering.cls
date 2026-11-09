/**
 * change_offering: an offering's seats, its No limit tick and its minimum to run, as the cells of
 * its row on the Electives list do, through an agent or the command line (docs/protocol/api.md
 * API-1.136). Web address /v1/change_offering, POST {season, elective_set, activity, fields, seen}.
 * It is the setup table's own save of one row (SetupTablesController.saveRow, ADR 0011), so what
 * someone else changed since is a conflict and the object's own rules refuse what they refuse.
 * Seats below those already given are saved and shown as over (ELECT-4.5); blank or 0 keep their
 * meaning (ELECT-4.1).
 */
@RestResource(urlMapping='/v1/change_offering')
global with sharing class AgentChangeOffering implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'elective_set',
    'activity',
    'fields',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentChangeOffering());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(body);
    Offering__c now = refs.offeringOf(AgentFields.text(body, 'activity'));
    AgentSetupRecords.Found found = foundOf(refs, now);
    Offering__c record = new Offering__c(Id = now.Id);
    AgentSetupFields.Put put = AgentSetupFields.put(
      record,
      body.get('fields'),
      found
    );
    refuseNothingAsked(put);
    refuseSeatsWithNoLimit(put, record, now);
    refuseSeenLeftOut(body, put);
    SObject seen = AgentSetupFields.seen(now.Id, body.get('seen'), put);
    RowSaves.Result result;
    try {
      // The setup table's own save of one row (ADR 0011).
      result = SetupTablesController.saveRow(record, seen, put.extras);
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
    return 'Changed "' +
      found.name +
      '" in ' +
      refs.electiveSet.Name +
      ': ' +
      String.join(put.said, ', ') +
      '.';
  }

  private static AgentSetupRecords.Found foundOf(
    AgentLinkedChoiceRefs refs,
    Offering__c offering
  ) {
    AgentSetupRecords.Found found = new AgentSetupRecords.Found();
    found.id = offering.Id;
    found.name = offering.Activity__r.Name;
    found.term = 'Offering';
    found.kind = refs.labels.singularInSentence('Offering');
    found.labels = refs.labels;
    found.seasonId = refs.season.Id;
    return found;
  }

  /** What each field held is read_offerings's to say (seen), so one changed since is kept. */
  private static void refuseSeenLeftOut(
    Map<String, Object> body,
    AgentSetupFields.Put put
  ) {
    Map<String, Object> said = AgentSetupFields.given(body.get('seen'));
    for (String key : AgentSetupFields.namesOf('Offering')) {
      if (
        put.fields.contains(AgentSetupFields.fieldOf('Offering', key)) &&
        !said.containsKey(key)
      ) {
        throw new ShoreshException(
          'Say what ' +
            key +
            ' held when you read it (seen), as read_offerings gives it, so a change someone made since isn\'t overwritten.'
        );
      }
    }
  }

  private static void refuseNothingAsked(AgentSetupFields.Put put) {
    if (put.fields.isEmpty()) {
      throw new ShoreshException(
        'Say what to change (fields). Its fields: ' +
          String.join(AgentSetupFields.namesOf('Offering'), ', ') +
          '.'
      );
    }
  }

  /** The row's seats can't be typed while No limit is ticked; ticking it keeps them. */
  private static void refuseSeatsWithNoLimit(
    AgentSetupFields.Put put,
    Offering__c record,
    Offering__c now
  ) {
    Boolean noLimit = put.fields.contains(Offering__c.NoSeatLimit__c)
      ? record.NoSeatLimit__c
      : now.NoSeatLimit__c;
    if (noLimit && put.fields.contains(Offering__c.Seats__c)) {
      throw new ShoreshException(
        '"' +
          now.Activity__r.Name +
          '" has No limit, so it has no ' +
          put.found.labels.pluralInSentence('Seats') +
          ' to set. Nothing was changed.'
      );
    }
  }
}
