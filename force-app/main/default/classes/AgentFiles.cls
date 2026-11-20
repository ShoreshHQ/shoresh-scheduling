/**
 * What the doors a file is made from share (docs/protocol/api.md API-1.86 to API-1.89): a GET of
 * exactly what the screen reads before its Download, Excel or Print, answered as JSON for the
 * connector, which makes the same file with the screen's own modules on the person's computer.
 * Each door is an AgentRequest.Read. Nothing is changed and no file is made here. User mode: the
 * person's own access.
 */
public with sharing class AgentFiles {
  /** The season named (or the one the screens open on), with its camp. */
  public static Season__c seasonOf(Map<String, Object> asked) {
    Id seasonId = OutgoingRows.seasonCalled(AgentFields.text(asked, 'season'))
      .Id;
    return [
      SELECT Id, Name, Camp__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
  }

  /** The season's setup as the screens read it (SeasonSetupController.getSeasonSetupInCamp). */
  public static String setupOf(Season__c season) {
    return JSON.serialize(
      SeasonSetupController.getSeasonSetupInCamp(season.Camp__c, season.Id),
      true
    );
  }

  /** {"name": value as JSON, ...}: each part serialized as its own read serializes it. */
  public static String joined(Map<String, String> parts) {
    List<String> said = new List<String>();
    for (String key : parts.keySet()) {
      said.add(JSON.serialize(key) + ':' + parts.get(key));
    }
    return '{' + String.join(said, ',') + '}';
  }
}
