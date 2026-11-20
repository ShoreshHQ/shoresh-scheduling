/**
 * CORE-3.9 / API-1.147: the shared fixed-over examples (staticresources/ShoreshFixedOverExamples
 * .json), which the screen's fixedOver.js must also pass (shoreshProgram fixedOverExamples.test.js):
 * AgentFixedOver.of asks the same question and keeps the same pieces (FixedOverExampleCamp). One
 * test each, so each camp gets its own limits: everySharedExampleHasItsTest fails unless the
 * names in the file and the names this class's tests run are the same, each exactly once.
 */
@IsTest
private class FixedOverExamplesTest {
  private static List<Object> examples() {
    String ours = ShoreshSchema.namespace();
    StaticResource read = [
      SELECT Body
      FROM StaticResource
      WHERE Name = 'ShoreshFixedOverExamples' AND NamespacePrefix = :ours
      LIMIT 1
    ];
    return (List<Object>) ((Map<String, Object>) JSON.deserializeUntyped(
        read.Body.toString()
      ))
      .get('examples');
  }

  /** The example of that name, as the scheduler: [expected, said]. */
  private static List<String> run(String name) {
    Map<String, Object> example;
    for (Object each : examples()) {
      if (((Map<String, Object>) each).get('name') == name) {
        example = (Map<String, Object>) each;
      }
    }
    Assert.isNotNull(example, 'No example called ' + name);
    return FixedOverExampleCamp.expectedAndSaid(example);
  }

  /** Each name a test in this class runs, as its source calls run with it. */
  private static List<String> namesRun() {
    String ours = ShoreshSchema.namespace();
    ApexClass source = [
      SELECT Body
      FROM ApexClass
      WHERE Name = 'FixedOverExamplesTest' AND NamespacePrefix = :ours
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    Matcher call = Pattern.compile(
        'run\\(\\s*\'((?:[^\'\\\\]|\\\\.)*)\'\\s*\\)'
      )
      .matcher(source.Body);
    List<String> result = new List<String>();
    while (call.find()) {
      result.add(call.group(1).replace('\\\'', '\''));
    }
    return result;
  }

  @IsTest
  static void everySharedExampleHasItsTest() {
    List<String> inFile = new List<String>();
    for (Object each : examples()) {
      inFile.add((String) ((Map<String, Object>) each).get('name'));
    }
    List<String> tested = namesRun();
    Assert.areEqual(
      inFile.size(),
      new Set<String>(inFile).size(),
      'A name twice in the file'
    );
    Assert.areEqual(
      tested.size(),
      new Set<String>(tested).size(),
      'An example run by two tests'
    );
    Assert.areEqual(new Set<String>(inFile), new Set<String>(tested));
  }

  @IsTest
  static void addedOverOne() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run(
        'added over one: it keeps its other time blocks'
      );
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void movedOverOne() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('moved over one');
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void twoRecurringTogether() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('two recurring together');
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void mondayToFriday() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run(
        'every day of a Monday to Friday program is said as a range'
      );
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void onSomeDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('on some days: asked about on those');
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void aWeekTickedBackOn() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('a week ticked back on that meets it');
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void nothingUnderIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('nothing under it');
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void cantGoAround() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run(
        'only where it goes: it can\'t go around, so nothing is asked'
      );
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void weeksOffOnTheSavedOne() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run(
        'weeks off on the saved fixed activity: they never meet'
      );
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void weeksTickedOffInTheSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run(
        'weeks ticked off in this save: they never meet'
      );
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void aDayTheProgramDoesntRun() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('only on a day the program doesn\'t run');
      Assert.areEqual(words[0], words[1]);
    }
  }

  @IsTest
  static void noGroupItCoversIsThere() {
    System.runAs(ShoreshTestData.scheduler()) {
      List<String> words = run('no group it covers is there then');
      Assert.areEqual(words[0], words[1]);
    }
  }
}
