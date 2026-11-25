/**
 * A name as camps type it (docs/protocol/api.md API-1.25), as AgentWeeks.named (AgentNamed) finds a program,
 * elective set or special day: exactly so wins, one that reads the same is taken, and two that
 * read the same are refused naming both, never one picked silently. Records in memory only.
 */
@IsTest
private class AgentWeeksNamedTest {
  private static List<SObject> programs(List<String> names) {
    List<SObject> rows = new List<SObject>();
    for (String name : names) {
      rows.add(new Program__c(Name = name));
    }
    return rows;
  }

  private static String refusal(List<SObject> rows, String asked) {
    try {
      AgentWeeks.named(rows, asked, 'Program');
    } catch (ShoreshException e) {
      return e.getMessage();
    }
    return null;
  }

  // API-1.25
  @IsTest
  static void twoNamesThatReadTheSameAreRefusedNamingBoth() {
    List<SObject> rows = programs(
      new List<String>{ 'Day Camp', 'Day-Camp', 'Teens' }
    );
    Assert.areEqual(
      '"Day Camp" and "Day-Camp" are both programs with that name, so Shoresh can\'t tell which you mean. Nothing was changed.',
      refusal(rows, 'day camp')
    );
  }

  // API-1.25
  @IsTest
  static void theNameSpelledExactlySoWins() {
    List<SObject> rows = programs(
      new List<String>{ 'Day Camp', 'Day-Camp', 'Teens' }
    );
    Assert.areEqual(
      'Day-Camp',
      (String) AgentWeeks.named(rows, 'Day-Camp', 'Program').get('Name')
    );
  }

  // API-1.25
  @IsTest
  static void oneThatReadsTheSameIsTaken() {
    List<SObject> rows = programs(new List<String>{ 'Arts & Crafts', 'Teens' });
    Assert.areEqual(
      'Arts & Crafts',
      (String) AgentWeeks.named(rows, 'arts and crafts', 'Program').get('Name')
    );
  }

  // API-1.25
  @IsTest
  static void threeThatReadTheSameAreAllNamed() {
    List<SObject> rows = programs(
      new List<String>{ 'Teens', 'teens', 'TEENS!' }
    );
    Assert.areEqual(
      '"Teens", "teens" and "TEENS!" are all programs with that name, so Shoresh can\'t tell which you mean. Nothing was changed.',
      refusal(rows, 'Teens ')
    );
  }
}
