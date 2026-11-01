/**
 * What the setup screens mark as guessed from a file, read and said to look right through an agent
 * or the command line (docs/protocol/api.md API-1.59, API-1.60), on a made-up camp's import: the
 * screen's own read and its own Looks right, refused with nothing changed when what the AI saw has
 * changed. Every record is made by the scheduler, inside the same System.runAs.
 */
@IsTest
private class AgentGuessesTest {
  /** One request to a door; answers [status, sentence]. */
  private static List<Object> ask(
    AgentWeeks.Action door,
    String method,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    AgentWeeks.answer(door);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  /** A new camp's week, imported with what Camp Setup marks as guessed (as SetupGuessesTest). */
  private static Season__c guessedCamp() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    plan.put(
      'guessed',
      new List<Object>{
        guessed('Activity', 'A|Swim', new List<Object>{ 'often', 'who' }),
        guessed('Activity', 'A|Boating', new List<Object>{ 'often', 'who' }),
        guessed('Location', 'L|Hall', new List<Object>{ 'fits' }),
        guessed('Group', 'G|Bunk 1', new List<Object>{ 'division' })
      }
    );
    ImportController.saveSetup(JSON.serialize(plan));
    return season;
  }

  private static Map<String, Object> guessed(
    String kind,
    String key,
    List<Object> fields
  ) {
    return new Map<String, Object>{
      'kind' => kind,
      'key' => key,
      'fields' => fields
    };
  }

  private static Integer marked(Id seasonId) {
    return SeasonSetupController.getSeasonSetup(seasonId).guesses.size();
  }

  private static Map<String, Object> confirm(
    String kind,
    String name,
    String field,
    Object seen
  ) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => 'Summer 2027',
      'kind' => kind,
      'name' => name,
      'field' => field
    };
    if (seen != null) {
      body.put('seen', seen);
    }
    return body;
  }

  // API-1.59
  @IsTest
  static void readSaysWhatCampSetupMarksWithItsValueNow() {
    System.runAs(ShoreshTestData.scheduler()) {
      guessedCamp();
      Test.startTest();
      List<Object> read = ask(
        new AgentReadGuesses(),
        'GET',
        new Map<String, Object>{ 'season' => 'Summer 2027' }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      String said = (String) read[1];
      for (
        String one : new List<String>{
          '"Swim": how_often 1 to 2 a week',
          '"Swim": who everyone',
          '"Boating": how_often 0 to 1 a week',
          '"Boating": who Seniors',
          '"Hall": groups_that_fit 4',
          '"Bunk 1" in program "Main": division Juniors'
        }
      ) {
        Assert.isTrue(said.contains(one), one + ' in: ' + said);
      }
    }
  }

  // API-1.60
  @IsTest
  static void looksRightIsTheMarksOwnWithTheValueSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = guessedCamp();
      Id hall = [
        SELECT Id
        FROM Location__c
        WHERE Season__c = :season.Id AND Name = 'Hall'
        WITH USER_MODE
      ]
      .Id;
      Test.startTest();
      List<Object> noSeen = ask(
        new AgentConfirmGuess(),
        'POST',
        confirm('activity', 'Swim', 'how_often', null)
      );
      List<Object> stale = ask(
        new AgentConfirmGuess(),
        'POST',
        confirm('activity', 'Swim', 'how_often', '1 to 3 a week')
      );
      Integer afterRefused = marked(season.Id);
      // Changed since the AI read it: the mark is gone, and nothing is marked as looked at.
      Database.update(
        new Location__c(Id = hall, GroupsThatFit__c = 5),
        AccessLevel.USER_MODE
      );
      List<Object> changed = ask(
        new AgentConfirmGuess(),
        'POST',
        confirm('location', 'Hall', 'groups_that_fit', '4')
      );
      Integer before = Limits.getQueries();
      List<Object> done = ask(
        new AgentConfirmGuess(),
        'POST',
        confirm('Activity', 'swim', 'how often', '1 to 2 a week')
      );
      Integer queries = Limits.getQueries() - before;
      List<Object> again = ask(
        new AgentConfirmGuess(),
        'POST',
        confirm('activity', 'Swim', 'how_often', '1 to 2 a week')
      );
      List<Object> bunk = ask(
        new AgentConfirmGuess(),
        'POST',
        confirm('group', 'Bunk 1', 'division', 'Juniors')
      );
      Test.stopTest();

      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(6, afterRefused, 'a refusal marks nothing as looked at');
      Assert.areEqual(409, changed[0], String.valueOf(changed[1]));
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual(409, again[0], 'once looked at, it is no longer marked');
      Assert.areEqual(200, bunk[0], String.valueOf(bunk[1]));
      // Of six: Hall's changed, Swim's how often and Bunk 1's division looked at.
      Assert.areEqual(3, marked(season.Id));
      Assert.isTrue(
        queries < 100,
        'One Looks right stays under 100 queries: ' + queries
      );
    }
  }
}
