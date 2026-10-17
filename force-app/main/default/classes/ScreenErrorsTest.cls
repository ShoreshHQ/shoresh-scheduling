@IsTest
private class ScreenErrorsTest {
  @IsTest
  static void aRefusedDeleteIsExplainedInPlainWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.season(camp.Id, 'Summer 2026');
    try {
      Database.delete(camp, AccessLevel.SYSTEM_MODE);
      Assert.fail('A camp with seasons is kept');
    } catch (DmlException e) {
      Assert.areEqual(
        'This can\'t be deleted while something else still uses it. Change that first.',
        ScreenErrors.of(e).getMessage(),
        'The platform\'s own wording, which names objects, is not shown'
      );
    }
  }

  @IsTest
  static void otherProblemsKeepTheirOwnMessage() {
    Assert.areEqual(
      'Plain words.',
      ScreenErrors.of(new ShoreshException('Plain words.')).getMessage()
    );
  }

  @IsTest
  static void aCheckOnSaveKeepsItsOwnMessage() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c first = ShoreshTestData.weeks(season.Id, 1)[0];
    try {
      Database.insert(
        new Week__c(
          Season__c = season.Id,
          Name = 'Again',
          StartDate__c = first.StartDate__c,
          EndDate__c = first.EndDate__c
        ),
        AccessLevel.SYSTEM_MODE
      );
      Assert.fail('Two weeks never start on the same day');
    } catch (DmlException e) {
      String shown = ScreenErrors.of(e).getMessage();
      Assert.areEqual(e.getDmlMessage(0), shown);
      Assert.areNotEqual('Couldn\'t save. Try again.', shown);
    }
  }

  @IsTest
  static void anythingElseShowsAShortTryAgain() {
    Exception unexpected;
    try {
      List<Integer> none = new List<Integer>();
      Assert.fail('Not reached: ' + none[3]);
    } catch (Exception e) {
      unexpected = e;
    }
    Assert.areEqual(
      'Couldn\'t save. Try again.',
      ScreenErrors.of(unexpected).getMessage()
    );
    Assert.areEqual(
      'Couldn\'t open this. Try again.',
      ScreenErrors.ofLoading(unexpected).getMessage()
    );
  }

  @IsTest
  static void somethingRemovedMeanwhileSaysToReload() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Program__c gone = ShoreshTestData.program(season.Id, 'Main');
    Database.delete(gone, AccessLevel.SYSTEM_MODE);
    try {
      UserModeWrites.save(
        new List<SObject>{ new Program__c(Id = gone.Id, Name = 'Renamed') }
      );
      Assert.fail('A removed row is not saved');
    } catch (UserModeWrites.SaveException e) {
      Assert.areEqual(
        '"Renamed": That was removed. Reload the page.',
        ScreenErrors.of(e).getMessage()
      );
    }
  }

  @IsTest
  static void aNumberedRowIsNotNamedInTheMessage() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    CampLabel__c label = new CampLabel__c(
      Camp__c = camp.Id,
      ModelTerm__c = 'Group',
      Singular__c = 'Bunk',
      Plural__c = 'Bunks'
    );
    Database.insert(label, AccessLevel.SYSTEM_MODE);
    try {
      // A change to a saved row is where its name (here CL-00001) used to be read.
      UserModeWrites.save(
        new List<SObject>{ new CampLabel__c(Id = label.Id, Singular__c = null) }
      );
      Assert.fail('A label needs its words');
    } catch (UserModeWrites.SaveException e) {
      Assert.areEqual(
        'Something required is blank. Fill it in and save again.',
        ScreenErrors.of(e).getMessage(),
        'No "CL-00001" in front'
      );
    }
  }

  @IsTest
  static void aWeekIsNamedInTheCampsOwnWord() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'Week',
        Singular__c = 'Session',
        Plural__c = 'Sessions'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c saved = ShoreshTestData.weeks(season.Id, 1)[0];
    Assert.areEqual(
      'Session',
      ScreenErrorWords.forWeek(new Week__c(Season__c = season.Id))
        .singularInSentence('Week')
    );
    Assert.areEqual(
      'Session',
      ScreenErrorWords.forWeek(new Week__c(Id = saved.Id))
        .singularInSentence('Week')
    );
    Assert.areEqual(
      'week',
      ScreenErrorWords.forWeek(new Week__c()).singularInSentence('Week'),
      'Unknown camp: the standard word'
    );
  }
}
