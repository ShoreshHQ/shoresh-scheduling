/**
 * Rules Shoresh guessed are marked for a look (Greg, decision 45; ADR 0006 §21): an import
 * remembers, for the camp, what it worked out rather than read, with the value it saved; the
 * setup screens mark it until the director says it looks right or changes it. Made-up camps
 * only; every record is made by the scheduler, inside the same System.runAs.
 */
@IsTest
private class SetupGuessesTest {
  private static final Set<String> ALL_MARKS = new Set<String>{
    'Swim|often',
    'Swim|who',
    'Boating|often',
    'Boating|who',
    'Hall|fits',
    'Bunk 1|division|Juniors'
  };

  /** A new camp's week (ImportTestPlans.newCamp), with what the screen marks as guessed. */
  private static Map<String, Object> guessedPlan(Id seasonId) {
    Map<String, Object> plan = ImportTestPlans.newCamp(seasonId);
    plan.put(
      'guessed',
      new List<Object>{
        guessed('Activity', 'A|Swim', new List<Object>{ 'often', 'who' }),
        guessed('Activity', 'A|Boating', new List<Object>{ 'often', 'who' }),
        guessed('Location', 'L|Hall', new List<Object>{ 'fits' }),
        guessed('Group', 'G|Bunk 1', new List<Object>{ 'division' }),
        // A field that kind can't have guessed is not kept.
        guessed('Group', 'G|Bunk 2', new List<Object>{ 'often' })
      }
    );
    return plan;
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

  private static Map<String, String> answersOf(Id campId) {
    Map<String, String> result = new Map<String, String>();
    for (ImportAnswers.Answer answer : ImportController.getAnswers(campId)) {
      if (answer.key.startsWith(SetupGuessValues.PREFIX)) {
        result.put(answer.key, answer.answer);
      }
    }
    return result;
  }

  /** The guesses the setup screen gets, as "<record name>|<field>[|<value>]". */
  private static Set<String> marks(Id seasonId) {
    SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
      seasonId
    );
    Map<Id, String> names = new Map<Id, String>();
    for (Activity__c row : setup.activities) {
      names.put(row.Id, row.Name);
    }
    for (Location__c row : setup.locations) {
      names.put(row.Id, row.Name);
    }
    for (SeasonSetupReader.ProgramSetup entry : setup.programs) {
      for (SeasonSetupReader.DivisionSetup d : entry.divisions) {
        for (Group__c g : d.groups) {
          names.put(g.Id, g.Name);
        }
      }
    }
    Set<String> result = new Set<String>();
    for (SetupGuesses.Guess guess : setup.guesses) {
      result.add(
        names.get(guess.recordId) +
          '|' +
          guess.field +
          (guess.value == null ? '' : '|' + guess.value)
      );
    }
    return result;
  }

  private static Id idOf(Id seasonId, String name) {
    for (Activity__c row : [
      SELECT Id
      FROM Activity__c
      WHERE Season__c = :seasonId AND Name = :name
      WITH USER_MODE
    ]) {
      return row.Id;
    }
    for (Location__c row : [
      SELECT Id
      FROM Location__c
      WHERE Season__c = :seasonId AND Name = :name
      WITH USER_MODE
    ]) {
      return row.Id;
    }
    return [
      SELECT Id
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :seasonId AND Name = :name
      WITH USER_MODE
    ]
    .Id;
  }

  @IsTest
  static void anImportRemembersWhatItGuessedAndSetupMarksIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ImportController.saveSetup(JSON.serialize(guessedPlan(season.Id)));

      String inSeason = 'guessed|' + season.Id + '|';
      Assert.areEqual(
        new Map<String, String>{
          inSeason + 'Activity||Swim|often' => '1-2',
          inSeason + 'Activity||Swim|who' => 'everyone',
          inSeason + 'Activity||Boating|often' => '0-1',
          inSeason + 'Activity||Boating|who' => 'main/seniors',
          inSeason + 'Location||Hall|fits' => '4',
          inSeason + 'Group|Main|Bunk 1|division' => 'Juniors'
        },
        answersOf(camp.Id),
        'each guess with the value saved; the season by Id, the rest by names'
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      Set<String> shown = marks(season.Id);
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(ALL_MARKS, shown);
      Assert.isTrue(
        queries < 25,
        'Reading the season with its marks stays well under 100 queries: ' +
        queries
      );
    }
  }

  @IsTest
  static void aChangeAnywhereClearsTheMark() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ImportController.saveSetup(JSON.serialize(guessedPlan(season.Id)));
      Id swim = idOf(season.Id, 'Swim');
      Id boating = idOf(season.Id, 'Boating');
      Id hall = idOf(season.Id, 'Hall');
      Id bunk = idOf(season.Id, 'Bunk 1');
      Id juniors = [
        SELECT Id
        FROM Division__c
        WHERE Program__r.Season__c = :season.Id AND Name = 'Juniors'
        WITH USER_MODE
      ]
      .Id;
      Id seniors = [
        SELECT Id
        FROM Division__c
        WHERE Program__r.Season__c = :season.Id AND Name = 'Seniors'
        WITH USER_MODE
      ]
      .Id;

      Test.startTest();
      // Edited as Salesforce's own record page would: no screen involved.
      Database.update(
        new List<SObject>{
          new Activity__c(Id = swim, TimesPerWeekMax__c = 3),
          new Location__c(Id = hall, GroupsThatFit__c = 5),
          new Group__c(Id = bunk, Division__c = seniors)
        },
        AccessLevel.USER_MODE
      );
      Database.insert(
        new ActivityEligibility__c(
          Activity__c = boating,
          Division__c = juniors
        ),
        AccessLevel.USER_MODE
      );
      Set<String> shown = marks(season.Id);
      Test.stopTest();

      Assert.areEqual(
        new Set<String>{ 'Swim|who', 'Boating|often' },
        shown,
        'only what still holds the value guessed is marked'
      );
    }
  }

  @IsTest
  static void looksRightForgetsJustThatGuess() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ImportController.saveSetup(JSON.serialize(guessedPlan(season.Id)));
      Id swim = idOf(season.Id, 'Swim');
      Id bunk = idOf(season.Id, 'Bunk 1');

      Test.startTest();
      Integer before = Limits.getQueries();
      SetupGuessesController.confirmGuess(swim, 'often');
      Integer queries = Limits.getQueries() - before;
      SetupGuessesController.confirmGuess(bunk, 'division');
      Test.stopTest();

      Assert.isTrue(queries <= 3, 'Looks right: ' + queries + ' queries');
      Set<String> expected = new Set<String>(ALL_MARKS);
      expected.remove('Swim|often');
      expected.remove('Bunk 1|division|Juniors');
      Assert.areEqual(expected, marks(season.Id));
      Assert.isFalse(
        answersOf(camp.Id)
          .containsKey('guessed|' + season.Id + '|Activity||Swim|often'),
        'forgotten, not kept as an answer'
      );
    }
  }

  /**
   * A camp that imports into two seasons: each season keeps its own guesses. A second import that
   * guesses differently, a Looks right in one season, or a guess already looked at in the other
   * never changes what the other season marks.
   */
  @IsTest
  static void eachSeasonKeepsItsOwnGuesses() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c first = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Season__c second = ShoreshTestData.season(camp.Id, 'Summer 2028');
      ImportController.saveSetup(JSON.serialize(guessedPlan(first.Id)));
      SetupGuessesController.confirmGuess(idOf(first.Id, 'Hall'), 'fits');
      // The second import guesses Swim differently: 1 to 3 times a week.
      Map<String, Object> plan = guessedPlan(second.Id);
      for (Object row : (List<Object>) plan.get('activities')) {
        Map<String, Object> activity = (Map<String, Object>) row;
        if (activity.get('name') == 'Swim') {
          activity.put('max', 3);
        }
      }

      Test.startTest();
      ImportController.saveSetup(JSON.serialize(plan));
      SetupGuessesController.confirmGuess(idOf(second.Id, 'Boating'), 'often');
      Test.stopTest();

      Set<String> firstMarks = new Set<String>(ALL_MARKS);
      firstMarks.remove('Hall|fits');
      Assert.areEqual(
        firstMarks,
        marks(first.Id),
        'the first season: Swim still marked, Boating not looked at, Hall still looked at'
      );
      Set<String> secondMarks = new Set<String>(ALL_MARKS);
      secondMarks.remove('Boating|often');
      Assert.areEqual(
        secondMarks,
        marks(second.Id),
        'the second season: its own guesses, Boating looked at'
      );
      Map<String, String> answers = answersOf(camp.Id);
      Assert.areEqual(
        '1-2',
        answers.get('guessed|' + first.Id + '|Activity||Swim|often')
      );
      Assert.areEqual(
        '1-3',
        answers.get('guessed|' + second.Id + '|Activity||Swim|often')
      );
    }
  }

  @IsTest
  static void looksRightOnSomethingThatCannotBeGuessedIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Program__c program = ShoreshTestData.program(season.Id, 'Main');
      TimeBlock__c block = ShoreshTestData.timeBlock(program.Id, 'Period 1', 9);
      Activity__c archery = ShoreshTestData.activity(
        season.Id,
        'Archery',
        null
      );
      Database.insert(archery, AccessLevel.SYSTEM_MODE);
      for (
        List<Object> call : new List<List<Object>>{
          new List<Object>{ archery.Id, 'fits' },
          new List<Object>{ block.Id, 'often' },
          new List<Object>{ null, 'often' }
        }
      ) {
        try {
          SetupGuessesController.confirmGuess((Id) call[0], (String) call[1]);
          Assert.fail('refused: ' + call);
        } catch (AuraHandledException e) {
          Assert.areEqual(
            'That can\'t be marked as looked at.',
            e.getMessage()
          );
        }
      }
    }
  }

  @IsTest
  static void anItemDeletedAndImportedAgainIsMarkedAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ImportController.saveSetup(JSON.serialize(guessedPlan(season.Id)));
      // A later second, then Swim made again (deleted, then imported again: made after the first
      // guess) and the import guessing the same values again.
      Long first = Datetime.now().getTime() / 1000;
      while (Datetime.now().getTime() / 1000 == first) {
        Datetime.now();
      }
      Test.setCreatedDate(idOf(season.Id, 'Swim'), Datetime.now());
      Map<String, String> again = new Map<String, String>();
      String swim = 'guessed|' + season.Id + '|Activity||Swim|';
      Map<String, String> remembered = answersOf(camp.Id);
      again.put(swim + 'often', remembered.get(swim + 'often'));
      again.put(swim + 'who', remembered.get(swim + 'who'));
      ImportAnswers.rememberEach(camp.Id, again);

      Test.startTest();
      Set<String> shown = marks(season.Id);
      Test.stopTest();
      Assert.areEqual(ALL_MARKS, shown, 'Swim is marked again');
    }
  }

  @IsTest
  static void anItemSetUpAgainByHandIsTheDirectors() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ImportController.saveSetup(JSON.serialize(guessedPlan(season.Id)));
      // Swim added again after the import (an Undo, a delete, a copied season): same name, same
      // values, made later than the guess.
      Test.setCreatedDate(idOf(season.Id, 'Swim'), Datetime.now().addDays(1));

      Test.startTest();
      Set<String> shown = marks(season.Id);
      Test.stopTest();

      Set<String> expected = new Set<String>(ALL_MARKS);
      expected.remove('Swim|often');
      expected.remove('Swim|who');
      Assert.areEqual(expected, shown);
    }
  }

  @IsTest
  static void aLongWhoListIsKeptAsItsDigest() {
    List<String> targets = new List<String>();
    for (Integer i = 0; i < 40; i++) {
      targets.add('main/bunk number ' + i);
    }
    String digest = SetupGuessValues.who(targets);
    Assert.isTrue(digest.startsWith('sha256:'), digest);
    Assert.isTrue(digest.length() <= 255);
    List<String> reversed = new List<String>();
    for (Integer i = targets.size() - 1; i >= 0; i--) {
      reversed.add(targets[i]);
    }
    Assert.areEqual(
      digest,
      SetupGuessValues.who(reversed),
      'the same who in any order'
    );
    Assert.areEqual('everyone', SetupGuessValues.who(new List<String>()));
  }

  @IsTest
  static void aCampWithNothingGuessedReadsAsBefore() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.newCamp(season.Id))
      );
      Assert.isTrue(answersOf(camp.Id).isEmpty());
      Assert.isTrue(marks(season.Id).isEmpty());
    }
  }
}
