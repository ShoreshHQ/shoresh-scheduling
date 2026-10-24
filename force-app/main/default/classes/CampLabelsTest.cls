@IsTest
private class CampLabelsTest {
  @IsTest
  static void modelTermsShowWhenACampHasNoLabels() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    CampLabels labels = CampLabels.forCamp(camp.Id);
    Assert.areEqual('Group', labels.singular('Group'));
    Assert.areEqual('Groups', labels.plural('Group'));
    Assert.areEqual('time block', labels.singularInSentence('TimeBlock'));
    Assert.areEqual('activities', labels.pluralInSentence('Activity'));
    Assert.areEqual('Rainy days', labels.plural('RainyDay'));
    Assert.areEqual('Seats', labels.plural('Seats'));
    // Electives are a camp word too (wiki decision 66).
    Assert.areEqual('Elective', labels.singular('Elective'));
    Assert.areEqual('Electives', labels.plural('Elective'));
    Assert.areEqual('electives', labels.pluralInSentence('Elective'));
  }

  @IsTest
  static void campLabelsReplaceModelTermsExactlyAsTyped() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'Group',
        Singular__c = 'Bunk',
        Plural__c = 'Bunks'
      ),
      AccessLevel.SYSTEM_MODE
    );
    CampLabels labels = CampLabels.forCamp(camp.Id);
    Assert.areEqual('Bunk', labels.singular('Group'));
    Assert.areEqual(
      'Bunks',
      labels.pluralInSentence('Group'),
      'A camp label keeps its own capitals'
    );
    Assert.areEqual('Division', labels.singular('Division'));
  }

  @IsTest
  static void labelsBelongToTheirOwnCamp() {
    Camp__c willow = ShoreshTestData.camp('Camp Willow');
    Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
    Database.insert(
      new CampLabel__c(
        Camp__c = willow.Id,
        ModelTerm__c = 'Group',
        Singular__c = 'Bunk',
        Plural__c = 'Bunks'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Map<Id, CampLabels> byCamp = CampLabels.forCamps(
      new Set<Id>{ willow.Id, cedar.Id }
    );
    Assert.areEqual('Bunk', byCamp.get(willow.Id).singular('Group'));
    Assert.areEqual('Group', byCamp.get(cedar.Id).singular('Group'));
  }

  @IsTest
  static void allListsEveryTermWithItsLabel() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    CampLabel__c bunk = new CampLabel__c(
      Camp__c = camp.Id,
      ModelTerm__c = 'Group',
      Singular__c = 'Bunk',
      Plural__c = 'Bunks'
    );
    Database.insert(bunk, AccessLevel.SYSTEM_MODE);
    List<CampLabels.TermLabel> all = CampLabels.forCamp(camp.Id).all();
    Assert.areEqual(
      CampLabel__c.ModelTerm__c.getDescribe().getPicklistValues().size(),
      all.size()
    );
    for (CampLabels.TermLabel row : all) {
      if (row.term == 'Group') {
        Assert.isTrue(row.isCustom);
        Assert.areEqual(bunk.Id, row.labelId);
        Assert.areEqual('Bunk', row.singular);
        Assert.areEqual('Group', row.modelSingular);
      } else {
        Assert.isFalse(row.isCustom);
        Assert.areEqual(row.modelSingular, row.singular);
      }
    }
  }

  @IsTest
  static void keyIsFilledAndASecondLabelForTheSameTermIsRefused() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    CampLabel__c first = new CampLabel__c(
      Camp__c = camp.Id,
      ModelTerm__c = 'Group',
      Singular__c = 'Bunk',
      Plural__c = 'Bunks'
    );
    Database.insert(first, AccessLevel.SYSTEM_MODE);
    Assert.areEqual(
      camp.Id + '|Group',
      [SELECT Key__c FROM CampLabel__c WHERE Id = :first.Id WITH SYSTEM_MODE]
      .Key__c
    );

    Database.SaveResult result = Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'Group',
        Singular__c = 'Cabin',
        Plural__c = 'Cabins'
      ),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(result.isSuccess());
    Assert.isTrue(
      result.getErrors()[0].getMessage().contains('already has its own word')
    );

    // Editing the existing label is fine.
    first.Singular__c = 'Cabin';
    Database.update(first, AccessLevel.SYSTEM_MODE);
  }

  @IsTest
  static void twoLabelsForOneTermInOneSaveAreRefused() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    List<Database.SaveResult> results = Database.insert(
      new List<CampLabel__c>{
        new CampLabel__c(
          Camp__c = camp.Id,
          ModelTerm__c = 'Week',
          Singular__c = 'Session',
          Plural__c = 'Sessions'
        ),
        new CampLabel__c(
          Camp__c = camp.Id,
          ModelTerm__c = 'Week',
          Singular__c = 'Term',
          Plural__c = 'Terms'
        )
      },
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(results[0].isSuccess() && results[1].isSuccess());
  }

  @IsTest
  static void onlyThisCampsOwnLabelsAreChangedOrRemoved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      Season__c season = ShoreshTestData.season(willow.Id, 'Summer 2026');
      Program__c main = ShoreshTestData.program(season.Id, 'Main');
      CampLabel__c cedars = new CampLabel__c(
        Camp__c = cedar.Id,
        ModelTerm__c = 'Group',
        Singular__c = 'Cabin',
        Plural__c = 'Cabins'
      );
      Database.insert(cedars, AccessLevel.SYSTEM_MODE);
      // Blank words with a program's Id would delete the program; words with another camp's
      // label Id would change that camp's label.
      Map<Id, String> sent = new Map<Id, String>{
        main.Id => '/',
        cedars.Id => 'Bunk/Bunks'
      };
      for (Id labelId : sent.keySet()) {
        List<CampLabels.TermLabel> labels = SeasonSetupController.getLabels(
          willow.Id
        );
        for (CampLabels.TermLabel row : labels) {
          if (row.term == 'Group') {
            row.singular = sent.get(labelId).substringBefore('/');
            row.plural = sent.get(labelId).substringAfter('/');
            row.labelId = labelId;
          }
        }
        try {
          SeasonSetupController.saveCampLabels(willow.Id, labels);
          Assert.fail('Refused: ' + labelId);
        } catch (AuraHandledException e) {
          Assert.areEqual(
            'Some of these words were changed somewhere else. Reload the page and try again.',
            e.getMessage()
          );
        }
      }
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Program__c WHERE Id = :main.Id WITH SYSTEM_MODE]
      );
      Assert.areEqual('Cabin', CampLabels.forCamp(cedar.Id).singular('Group'));
    }
  }
}
