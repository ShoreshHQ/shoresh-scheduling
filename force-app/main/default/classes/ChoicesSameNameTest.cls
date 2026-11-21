/**
 * ELECT-2.7 (Greg 2026-11-21): two campers may share a name. Bringing in a choices sheet matches a
 * name only when one camper in the season has it; rows the director called different campers
 * come in as two; when the season has more than one camper of a row's name, the director says
 * which (or a new camper), never Shoresh. Every test acts as a scheduler and makes its records
 * inside the same runAs. Names are made up.
 */
@IsTest
private class ChoicesSameNameTest {
  private class Camp {
    Season__c season;
    Map<String, Id> ids;
    ElectiveSet__c chugim;
    Schedule__c schedule;

    Camp() {
      season = ShoreshTestData.fullSeason(
        ShoreshTestData.camp('Camp Willow').Id
      );
      ids = ShoreshTestData.lastSeasonIds.clone();
      Activity__c archery = ShoreshTestData.activity(
        season.Id,
        'Archery',
        null
      );
      Database.insert(archery, AccessLevel.USER_MODE);
      ids.put('Archery', archery.Id);
      chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
      Database.insert(chugim, AccessLevel.USER_MODE);
      Database.insert(
        new Offering__c(
          ElectiveSet__c = chugim.Id,
          Activity__c = archery.Id,
          NoSeatLimit__c = true
        ),
        AccessLevel.USER_MODE
      );
      schedule = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 1'),
        Name = 'Week 1 draft',
        Status__c = 'Draft',
        Origin__c = 'Manual'
      );
      Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    }

    /** A sheet of Noa Oakhollow rows, one per group named, with no camper number. */
    ChoicesImport.Request noas(List<String> groups, Boolean apart) {
      ChoicesImport.Request result = new ChoicesImport.Request();
      result.seasonId = season.Id;
      result.electiveSetId = chugim.Id;
      result.weekId = ids.get('Week 1');
      result.scheduleId = schedule.Id;
      result.fileName = 'noa.csv';
      for (Integer i = 0; i < groups.size(); i++) {
        ChoicesImport.SheetCamper row = new ChoicesImport.SheetCamper();
        row.row = i + 2;
        row.name = 'Noa Oakhollow';
        row.groupId = ids.get(groups[i]);
        row.apart = apart ? true : null;
        ChoicesImport.SheetChoice choice = new ChoicesImport.SheetChoice();
        choice.n = 'Archery';
        choice.a = ids.get('Archery');
        choice.r = 1;
        choice.k = 'ranked';
        row.choices.add(choice);
        result.campers.add(row);
      }
      return result;
    }

    List<Camper__c> noasSaved() {
      return [
        SELECT Id
        FROM Camper__c
        WHERE Season__c = :season.Id
        WITH SYSTEM_MODE
        ORDER BY CreatedDate, Id
      ];
    }

    /** Each saved Noa's group in the run, by camper. */
    Map<Id, Id> groupOf() {
      Map<Id, Id> result = new Map<Id, Id>();
      for (Preference__c row : [
        SELECT Camper__c, Group__c
        FROM Preference__c
        WHERE Camper__r.Season__c = :season.Id
        WITH SYSTEM_MODE
      ]) {
        result.put(row.Camper__c, row.Group__c);
      }
      return result;
    }
  }

  private static ChoicesImport.Check check(ChoicesImport.Request request) {
    return ChoicesImportController.checkChoices(JSON.serialize(request));
  }

  private static ChoicesImport.Done bringIn(ChoicesImport.Request request) {
    return ChoicesImportController.bringInChoices(JSON.serialize(request));
  }

  private static String refusal(ChoicesImport.Request request) {
    try {
      bringIn(request);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Refused');
    return null;
  }

  @IsTest
  static void bringingInAgainMatchesTheOneCamperOfThatName() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      bringIn(camp.noas(new List<String>{ 'Group A' }, false));

      Test.startTest();
      ChoicesImport.Check again = check(
        camp.noas(new List<String>{ 'Group A' }, false)
      );
      bringIn(camp.noas(new List<String>{ 'Group A' }, false));
      Test.stopTest();

      Assert.areEqual(1, again.known);
      Assert.areEqual(0, again.added);
      Assert.isTrue(again.whichCamper.isEmpty(), 'Nothing to ask');
      Assert.areEqual(1, camp.noasSaved().size(), 'No one added twice');
    }
  }

  @IsTest
  static void rowsCalledDifferentCampersComeInAsTwo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      List<String> groups = new List<String>{ 'Group A', 'Group B' };

      Test.startTest();
      ChoicesImport.Check first = check(camp.noas(groups, true));
      ChoicesImport.Done done = bringIn(camp.noas(groups, true));
      Test.stopTest();

      Assert.areEqual(2, first.added);
      Assert.isTrue(first.whichCamper.isEmpty(), 'None here yet');
      Assert.areEqual(2, done.added);
      List<Camper__c> saved = camp.noasSaved();
      Assert.areEqual(2, saved.size(), 'Two Noas');
      Map<Id, Id> groupOf = camp.groupOf();
      Assert.areEqual(camp.ids.get('Group A'), groupOf.get(saved[0].Id));
      Assert.areEqual(camp.ids.get('Group B'), groupOf.get(saved[1].Id));
      // Not said: one name on two rows is still one camper written two ways.
      String message = refusal(camp.noas(groups, false));
      Assert.isTrue(message.startsWith('Rows 2 and 3 are one camper'), message);
    }
  }

  @IsTest
  static void aNameTwoCampersHaveIsAskedNeverGuessed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      List<String> groups = new List<String>{ 'Group A', 'Group B' };
      bringIn(camp.noas(groups, true));
      List<Camper__c> saved = camp.noasSaved();
      // One row now: still two Noas here, so it is asked.
      ChoicesImport.Request one = camp.noas(new List<String>{ 'Group B' }, false);

      Test.startTest();
      Integer before = Limits.getQueries();
      ChoicesImport.Check asked = check(one);
      Integer queries = Limits.getQueries() - before;
      String unanswered = refusal(one);
      one.campers[0].camperId = saved[1].Id;
      ChoicesImport.Check answered = check(one);
      bringIn(one);
      Test.stopTest();

      Assert.isTrue(queries < 20, 'A check is bounded: ' + queries);
      Assert.areEqual(0, asked.known + asked.added, 'Neither until said');
      Assert.areEqual(1, asked.whichCamper.size());
      ChoicesImport.Which which = asked.whichCamper[0];
      Assert.areEqual(0, which.index);
      Assert.areEqual(2, which.row);
      Assert.areEqual(saved[0].Id, which.choices[0].id);
      Assert.areEqual('Noa Oakhollow, Group A', which.choices[0].label);
      Assert.areEqual('Noa Oakhollow, Group B', which.choices[1].label);
      Assert.areEqual(
        'Row 2: more than one camper in this season has this name. Say which this is, or a new camper.',
        unanswered
      );
      Assert.areEqual(1, answered.known);
      Assert.isTrue(answered.whichCamper.isEmpty());
      Assert.areEqual(2, camp.noasSaved().size(), 'No one added');
    }
  }

  @IsTest
  static void aNewCamperIsAddedWhenTheDirectorSaysSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      bringIn(camp.noas(new List<String>{ 'Group A' }, false));
      // Two rows called different, and one Noa here: each row is asked.
      ChoicesImport.Request two = camp.noas(
        new List<String>{ 'Group A', 'Group B' },
        true
      );

      Test.startTest();
      ChoicesImport.Check asked = check(two);
      two.campers[0].camperId = camp.noasSaved()[0].Id;
      two.campers[1].newCamper = true;
      ChoicesImport.Done done = bringIn(two);
      Test.stopTest();

      Assert.areEqual(2, asked.whichCamper.size(), 'Each row is asked');
      Assert.areEqual(
        'Noa Oakhollow, Group A',
        asked.whichCamper[0].choices[0].label
      );
      Assert.areEqual(1, done.added);
      Assert.areEqual(2, camp.noasSaved().size());
    }
  }

  @IsTest
  static void aChosenCamperMustBeOfTheRowsNameAndChosenOnce() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      bringIn(camp.noas(new List<String>{ 'Group A', 'Group B' }, true));
      List<Camper__c> saved = camp.noasSaved();
      Camper__c other = new Camper__c(
        Season__c = camp.season.Id,
        Name = 'Eli Marblecrest'
      );
      Database.insert(other, AccessLevel.USER_MODE);
      ChoicesImport.Request twice = camp.noas(
        new List<String>{ 'Group A', 'Group B' },
        true
      );
      twice.campers[0].camperId = saved[0].Id;
      twice.campers[1].camperId = saved[0].Id;
      ChoicesImport.Request wrong = camp.noas(
        new List<String>{ 'Group A' },
        false
      );
      wrong.campers[0].camperId = other.Id;

      Test.startTest();
      String twiceMessage = refusal(twice);
      String wrongMessage = refusal(wrong);
      Test.stopTest();

      Assert.areEqual(
        'Rows 2 and 3 are one camper here. Choose another for one of them.',
        twiceMessage
      );
      Assert.areEqual(
        'Row 2: the camper chosen for this row is not one of this name in the season. Check the file again.',
        wrongMessage
      );
      Assert.isFalse(wrongMessage.contains('Noa'), 'No refusal names a camper');
    }
  }
}
