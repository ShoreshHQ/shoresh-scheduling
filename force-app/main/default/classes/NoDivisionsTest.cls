/**
 * DIV-1.1: a group in no division is held alone in a flagged division record; a group added by
 * hand with no division gets one; deleting or moving the group out removes it; CIT alone in
 * division CIT stays a division. Made-up camps only.
 */
@IsTest
private class NoDivisionsTest {
  private static Program__c newProgram() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    return ShoreshTestData.program(season.Id, 'Main');
  }

  private static Division__c divisionOf(Id groupId) {
    return [
      SELECT Id, Name, NoDivision__c, Program__c
      FROM Division__c
      WHERE Id IN (SELECT Division__c FROM Group__c WHERE Id = :groupId)
    ];
  }

  // DIV-1.1
  @IsTest
  static void aGroupAddedByHandWithNoDivisionGetsItsOwnHoldingRecord() {
    System.runAs(ShoreshTestData.scheduler()) {
      Program__c program = newProgram();
      ScreenSaves.Extras extras = new ScreenSaves.Extras();
      extras.noDivisionProgram = program.Id;
      Group__c tent = new Group__c(Name = 'Tent 1', Availability__c = 'AllDay');
      Test.startTest();
      Id saved = ScreenSaves.save(new List<SObject>{ tent }, extras)[0];
      Test.stopTest();
      Division__c holder = divisionOf(saved);
      Assert.isTrue(holder.NoDivision__c);
      Assert.areEqual(program.Id, holder.Program__c);
    }
  }

  // DIV-1.1
  @IsTest
  static void deletingTheGroupRemovesItsHoldingRecord() {
    System.runAs(ShoreshTestData.scheduler()) {
      Program__c program = newProgram();
      Division__c holder = new Division__c(
        Program__c = program.Id,
        Name = 'Seniors',
        NoDivision__c = true
      );
      insert as user holder;
      Group__c seniors = ShoreshTestData.groupIn(holder.Id, 'Seniors');
      Test.startTest();
      delete as user seniors;
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Division__c WHERE Id = :holder.Id]
      );
    }
  }

  // DIV-1.1
  @IsTest
  static void movingAGroupIntoARealDivisionRemovesItsHoldingRecord() {
    System.runAs(ShoreshTestData.scheduler()) {
      Program__c program = newProgram();
      Division__c juniors = ShoreshTestData.division(program.Id, 'Juniors');
      Division__c holder = new Division__c(
        Program__c = program.Id,
        Name = 'Tent 1',
        NoDivision__c = true
      );
      insert as user holder;
      Group__c tent = ShoreshTestData.groupIn(holder.Id, 'Tent 1');
      Test.startTest();
      update as user new Group__c(Id = tent.Id, Division__c = juniors.Id);
      Test.stopTest();
      Assert.areEqual(juniors.Id, divisionOf(tent.Id).Id);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Division__c WHERE Id = :holder.Id]
      );
    }
  }

  // DIV-1.1
  @IsTest
  static void anotherGroupsHoldingRecordIsNoDivisionToJoin() {
    System.runAs(ShoreshTestData.scheduler()) {
      Program__c program = newProgram();
      Division__c juniors = ShoreshTestData.division(program.Id, 'Juniors');
      Group__c bunk = ShoreshTestData.groupIn(juniors.Id, 'Bunk 1');
      Division__c holder = new Division__c(
        Program__c = program.Id,
        Name = 'Tent 1',
        NoDivision__c = true
      );
      insert as user holder;
      ShoreshTestData.groupIn(holder.Id, 'Tent 1');
      Database.SaveResult result = Database.update(
        new Group__c(Id = bunk.Id, Division__c = holder.Id),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(result.isSuccess());
    }
  }

  // DIV-1.1 DIV-3.1
  @IsTest
  static void citAloneInDivisionCitStaysADivision() {
    System.runAs(ShoreshTestData.scheduler()) {
      Program__c program = newProgram();
      Division__c cit = ShoreshTestData.division(program.Id, 'CIT');
      Group__c citGroup = ShoreshTestData.groupIn(cit.Id, 'CIT');
      Test.startTest();
      delete as user citGroup;
      Test.stopTest();
      // Not a holding record: never flagged, never removed with its group.
      Division__c kept = [
        SELECT NoDivision__c
        FROM Division__c
        WHERE Id = :cit.Id
      ];
      Assert.isFalse(kept.NoDivision__c);
    }
  }

  // DIV-1.1
  @IsTest
  static void aGuessedGroupInNoDivisionIsRememberedInNone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Program__c program = ShoreshTestData.program(season.Id, 'Main');
      Division__c holder = new Division__c(
        Program__c = program.Id,
        Name = 'Holding record',
        NoDivision__c = true
      );
      insert as user holder;
      Group__c tent = ShoreshTestData.groupIn(holder.Id, 'Tent 1');
      Test.startTest();
      SetupGuessRecords.remember(
        camp.Id,
        new Map<Id, Set<String>>{
          tent.Id => new Set<String>{ SetupGuessValues.DIVISION }
        }
      );
      Test.stopTest();
      for (ImportAnswers.Answer answer : ImportController.getAnswers(camp.Id)) {
        Assert.areNotEqual('Holding record', answer.answer);
      }
    }
  }

  // DIV-1.1
  @IsTest
  static void aGroupMovedByHandToNoDivisionGetsItsOwnHoldingRecord() {
    System.runAs(ShoreshTestData.scheduler()) {
      Program__c program = newProgram();
      Division__c juniors = ShoreshTestData.division(program.Id, 'Juniors');
      Group__c bunk = ShoreshTestData.groupIn(juniors.Id, 'Bunk 1');
      ScreenSaves.Extras extras = new ScreenSaves.Extras();
      extras.noDivisionProgram = program.Id;
      Test.startTest();
      ScreenSaves.save(
        new List<SObject>{ new Group__c(Id = bunk.Id, Division__c = null) },
        extras
      );
      Test.stopTest();
      Division__c holder = divisionOf(bunk.Id);
      Assert.isTrue(holder.NoDivision__c);
      Assert.areEqual('Bunk 1', holder.Name);
      Assert.areEqual(program.Id, holder.Program__c);
    }
  }
}
