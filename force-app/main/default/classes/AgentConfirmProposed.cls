/**
 * confirm_proposed_offering: Camp Setup's Confirm on a proposed offering, through an agent or the
 * command line (docs/protocol/api.md API-1.101). Web address /v1/confirm_proposed_offering, POST
 * {season, elective_set, activity, seen}. It is the screen's own save of the row's Confirm
 * (SetupTablesController.saveRow with Proposed off, proposed as seen), done only while the
 * offering, locked, is still proposed as the AI read it (seen "proposed"); otherwise refused
 * (409), nothing changed.
 */
@RestResource(urlMapping='/v1/confirm_proposed_offering')
global with sharing class AgentConfirmProposed implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'elective_set',
    'activity',
    'seen'
  };
  private static final String NOTHING = ' Nothing was changed.';

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentConfirmProposed());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    String activity = AgentFields.text(body, 'activity');
    String setName = AgentFields.text(body, 'elective_set');
    if (String.isBlank(activity)) {
      throw new ShoreshException(
        'Say which activity is offered (activity), as read_proposed_offerings said it.'
      );
    }
    if (AgentFields.text(body, 'seen') != 'proposed') {
      throw new ShoreshException(
        'Say what read_proposed_offerings said it is (seen: "proposed"), so one confirmed since isn\'t confirmed again.'
      );
    }
    // Locked first: no one else's save comes between this read and the Confirm.
    Offering__c now = onlyOne(
      [
        SELECT Id, Proposed__c, ElectiveSet__r.Name, Activity__r.Name
        FROM Offering__c
        WHERE
          ElectiveSet__r.Season__c = :season.Id
          AND Activity__r.Name = :activity
        WITH USER_MODE
        FOR UPDATE
      ],
      activity,
      setName
    );
    String named =
      '"' +
      now.Activity__r.Name +
      '" in ' +
      now.ElectiveSet__r.Name;
    if (!now.Proposed__c) {
      throw new AgentWeeks.ConflictException(
        named +
          ' isn\'t proposed now: someone confirmed it since.' +
          NOTHING +
          ' read_proposed_offerings says what is proposed.'
      );
    }
    RowSaves.Result result;
    try {
      // The row's Confirm, saved as Camp Setup's table saves it (ADR 0011).
      result = SetupTablesController.saveRow(
        new Offering__c(Id = now.Id, Proposed__c = false),
        new Offering__c(Id = now.Id, Proposed__c = true),
        null
      );
    } catch (Exception e) {
      throw new ShoreshException(ScreenErrors.words(e) + NOTHING);
    }
    if (!result.saved()) {
      throw new AgentWeeks.ConflictException(
        'Someone else changed ' + named + ' since.' + NOTHING
      );
    }
    return 'Confirmed ' +
      named +
      ': it is offered now, and campers can get a seat in it.';
  }

  /** The offering named, in the elective set asked about when the activity is in two. */
  @TestVisible
  private static Offering__c onlyOne(
    List<Offering__c> found,
    String activity,
    String setName
  ) {
    List<Offering__c> matched = new List<Offering__c>();
    List<String> sets = new List<String>();
    for (Offering__c offering : found) {
      if (
        String.isBlank(setName) ||
        IncomingBatch.fold(offering.ElectiveSet__r.Name) ==
        IncomingBatch.fold(setName)
      ) {
        matched.add(offering);
        sets.add(offering.ElectiveSet__r.Name);
      }
    }
    if (matched.isEmpty()) {
      throw new ShoreshException(
        'No elective set' +
          (String.isBlank(setName) ? '' : ' "' + setName.left(80) + '"') +
          ' offers "' +
          activity.left(80) +
          '".' +
          NOTHING +
          ' read_proposed_offerings says what is proposed.'
      );
    }
    if (matched.size() > 1) {
      sets.sort();
      throw new ShoreshException(
        'More than one elective set offers "' +
          activity.left(80) +
          '". Say which (elective_set): ' +
          String.join(sets, ', ') +
          '.' +
          NOTHING
      );
    }
    return matched[0];
  }
}
