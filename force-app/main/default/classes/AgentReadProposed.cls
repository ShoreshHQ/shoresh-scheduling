/**
 * read_proposed_offerings: the offerings Camp Setup shows as proposed (a dashed edge and a
 * Confirm at the row's end), not yet confirmed, through an agent or the command line
 * (docs/protocol/api.md API-1.100). Web address /v1/read_proposed_offerings, GET ?season=. Each is
 * said by its elective set and activity, as confirm_proposed_offering takes it.
 */
@RestResource(urlMapping='/v1/read_proposed_offerings')
global with sharing class AgentReadProposed implements AgentWeeks.Action {
  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadProposed());
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
    List<String> said = new List<String>();
    for (Offering__c offering : [
      SELECT ElectiveSet__r.Name, Activity__r.Name
      FROM Offering__c
      WHERE ElectiveSet__r.Season__c = :season.Id AND Proposed__c = TRUE
      WITH USER_MODE
      ORDER BY ElectiveSet__r.Name, Activity__r.Name
    ]) {
      said.add(
        offering.Activity__r.Name +
          ' (elective set ' +
          offering.ElectiveSet__r.Name +
          ')'
      );
    }
    if (said.isEmpty()) {
      return 'Nothing in "' +
        season.Name +
        '" is proposed: every offering is confirmed.';
    }
    return 'Proposed in "' +
      season.Name +
      '" and not confirmed yet (Camp Setup shows each with a Confirm; no camper gets a seat in it until it is confirmed): ' +
      String.join(said, '; ') +
      '. To confirm one, use confirm_proposed_offering with seen "proposed".';
  }
}
