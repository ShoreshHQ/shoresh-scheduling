/**
 * What the doors a file is made from share (docs/protocol/api.md API-1.86 to API-1.89): a GET of
 * exactly what the screen reads before its Download, Excel or Print, answered as JSON for the
 * connector, which makes the same file with the screen's own modules on the person's computer.
 * Nothing is changed and no file is made here. User mode: the person's own access.
 */
public with sharing class AgentFiles {
  /** One door's read: its fields by their plain names, answered as JSON text. */
  public interface Read {
    Set<String> fields();
    String run(Map<String, Object> asked);
  }

  /** Answers the read, or the refusal in the screen's words (400) or Shoresh's (500). */
  public static void answer(Read read) {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      response.responseBody = Blob.valueOf(read.run(asked(read.fields())));
      response.statusCode = 200;
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  /** The web address's fields; one Shoresh doesn't know is refused, naming the ones it does. */
  private static Map<String, Object> asked(Set<String> fields) {
    Map<String, Object> asked = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!fields.contains(key)) {
        List<String> known = new List<String>(fields);
        known.sort();
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: ' +
            String.join(known, ', ') +
            '.'
        );
      }
      asked.put(key, RestContext.request.params.get(key));
    }
    return asked;
  }

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
