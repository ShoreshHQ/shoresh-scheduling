/**
 * Bringing in choices (electives slice E6; repo ADRs 0017 and 0018): what a check says, what a
 * save writes, bringing in again into a committed run, and what is refused. Every test acts as a
 * scheduler with only the Shoresh Scheduler permission set and makes its records inside the same
 * runAs. Names and numbers are made up.
 */
@IsTest
private class ChoicesImportTest {
  /** A season with "Chugim" offering Archery and Drama, Pottery not offered, and a Week 1 schedule. */
  private class ChoicesCamp {
    Season__c season;
    Map<String, Id> ids;
    ElectiveSet__c chugim;
    Schedule__c schedule;

    ChoicesCamp() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      season = ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      List<Activity__c> activities = new List<Activity__c>{
        ShoreshTestData.activity(season.Id, 'Archery', null),
        ShoreshTestData.activity(season.Id, 'Drama', null),
        ShoreshTestData.activity(season.Id, 'Pottery', null)
      };
      Database.insert(activities, AccessLevel.USER_MODE);
      ids.put('Archery', activities[0].Id);
      ids.put('Drama', activities[1].Id);
      ids.put('Pottery', activities[2].Id);
      chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
      Database.insert(chugim, AccessLevel.USER_MODE);
      Database.insert(
        new List<Offering__c>{
          new Offering__c(
            ElectiveSet__c = chugim.Id,
            Activity__c = ids.get('Archery'),
            Seats__c = 12
          ),
          new Offering__c(
            ElectiveSet__c = chugim.Id,
            Activity__c = ids.get('Drama'),
            NoSeatLimit__c = true
          )
        },
        AccessLevel.USER_MODE
      );
      schedule = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Week 1 draft'
      );
    }

    ChoicesImport.Request request() {
      ChoicesImport.Request result = new ChoicesImport.Request();
      result.seasonId = season.Id;
      result.electiveSetId = chugim.Id;
      result.weekId = ids.get('Week 1');
      result.scheduleId = schedule.Id;
      result.fileName = 'chugim-week1.xlsx';
      result.fingerprint = 'a1b2c3';
      return result;
    }
  }

  private static ChoicesImport.SheetCamper camper(
    Integer row,
    String name,
    String num
  ) {
    ChoicesImport.SheetCamper result = new ChoicesImport.SheetCamper();
    result.row = row;
    result.name = name;
    result.camperNumber = num;
    return result;
  }

  private static ChoicesImport.SheetCamper withChoices(
    ChoicesImport.SheetCamper sheetCamper,
    List<ChoicesImport.SheetChoice> choices
  ) {
    sheetCamper.choices = choices;
    return sheetCamper;
  }

  private static ChoicesImport.SheetCamper inGroup(
    ChoicesImport.SheetCamper sheetCamper,
    Id groupId
  ) {
    sheetCamper.groupId = groupId;
    return sheetCamper;
  }

  private static ChoicesImport.SheetChoice ranked(
    String name,
    Id activityId,
    Integer rank
  ) {
    ChoicesImport.SheetChoice result = new ChoicesImport.SheetChoice();
    result.n = name;
    result.a = activityId;
    result.r = rank;
    result.k = 'ranked';
    return result;
  }

  private static List<ChoicesImport.SheetChoice> archeryThenDrama(
    ChoicesCamp camp
  ) {
    return new List<ChoicesImport.SheetChoice>{
      ranked('Archery', camp.ids.get('Archery'), 1),
      ranked('Drama', camp.ids.get('Drama'), 2)
    };
  }

  private static String refusal(ChoicesImport.Request request) {
    try {
      ChoicesImportController.bringInChoices(JSON.serialize(request));
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Refused');
    return null;
  }

  // ---------------------------------------------------------------- a first sheet

  @IsTest
  static void aBigSheetIsBroughtInWithinItsQueryBudget() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request request = camp.request();
      for (Integer i = 1; i <= 260; i++) {
        request.campers.add(
          inGroup(
            withChoices(
              camper(
                i + 1,
                'Synthetic Camper ' + i,
                'SYN-' + String.valueOf(i).leftPad(4, '0')
              ),
              archeryThenDrama(camp)
            ),
            Math.mod(i, 2) == 0
              ? camp.ids.get('Group A')
              : camp.ids.get('Group B')
          )
        );
      }
      request.campers[0].comment = 'Prefers mornings.';
      String sent = JSON.serialize(request);

      Test.startTest();
      Integer before = Limits.getQueries();
      ChoicesImport.Check check = ChoicesImportController.checkChoices(sent);
      Integer checkQueries = Limits.getQueries() - before;
      before = Limits.getQueries();
      ChoicesImport.Done done = ChoicesImportController.bringInChoices(sent);
      Integer saveQueries = Limits.getQueries() - before;
      Test.stopTest();

      Assert.areEqual(260, check.added, 'All new');
      Assert.areEqual(0, check.known);
      Assert.isNull(check.runId, 'No run yet');
      Assert.isTrue(checkQueries <= 8, 'A check reads little: ' + checkQueries);
      Assert.isTrue(saveQueries <= 30, 'A save stays bounded: ' + saveQueries);

      assertSavedRun(camp, done);
    }
  }

  /** The run, campers and choices the 260-camper sheet saved. */
  private static void assertSavedRun(
    ChoicesCamp camp,
    ChoicesImport.Done done
  ) {
    Assert.areEqual(260, done.campers);
    Assert.areEqual(260, done.added);
    Assert.areEqual('Chugim · Week 1', done.runName);
    ElectiveRun__c run = [
      SELECT
        Status__c,
        SourceFile__c,
        SourceFingerprint__c,
        Revision__c,
        Schedule__c
      FROM ElectiveRun__c
      WHERE Id = :done.runId
    ];
    Assert.areEqual('Committed', run.Status__c);
    Assert.areEqual('chugim-week1.xlsx', run.SourceFile__c);
    Assert.areEqual('a1b2c3', run.SourceFingerprint__c);
    Assert.areEqual(1, run.Revision__c);
    Assert.areEqual(camp.schedule.Id, run.Schedule__c);
    Assert.areEqual(
      260,
      [SELECT COUNT() FROM Camper__c WHERE Season__c = :camp.season.Id]
    );
    List<Preference__c> prefs = [
      SELECT
        Choices__c,
        ImportedChoices__c,
        Group__c,
        Camper__r.ParentComments__c,
        Camper__r.CamperNumber__c
      FROM Preference__c
      WHERE ElectiveRun__c = :done.runId
      ORDER BY Camper__r.CamperNumber__c
    ];
    Assert.areEqual(260, prefs.size());
    Assert.areEqual(prefs[0].Choices__c, prefs[0].ImportedChoices__c);
    Assert.areEqual('Prefers mornings.', prefs[0].Camper__r.ParentComments__c);
    Assert.areEqual(camp.ids.get('Group B'), prefs[0].Group__c);
    List<Object> choices = (List<Object>) JSON.deserializeUntyped(
      prefs[0].Choices__c
    );
    Map<String, Object> first = (Map<String, Object>) choices[0];
    Assert.areEqual('Archery', first.get('n'));
    Assert.areEqual(String.valueOf(camp.ids.get('Archery')), first.get('a'));
    Assert.areEqual(1, first.get('r'));
    Assert.areEqual('ranked', first.get('k'));
    Assert.isFalse(first.containsKey('d'), 'No blank keys stored');
  }

  @IsTest
  static void theStartListsSetsRunsAndRememberedAnswers() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request request = camp.request();
      request.campers.add(
        withChoices(camper(2, 'Maya Fernwood', '1001'), archeryThenDrama(camp))
      );
      request.remember.put('choiceName|potterywheel', 'same|Pottery');
      request.remember.put('notMine|x', 'y');
      ChoicesImportController.bringInChoices(JSON.serialize(request));

      Test.startTest();
      ChoicesImport.Situation situation = ChoicesImportController.choicesSetup(
        camp.season.Id
      );
      Test.stopTest();

      Assert.areEqual(1, situation.sets.size());
      Assert.areEqual('Chugim', situation.sets[0].name);
      Assert.areEqual(2, situation.sets[0].activityIds.size());
      Assert.areEqual(1, situation.runs.size());
      Assert.areEqual('Committed', situation.runs[0].status);
      Assert.areEqual(1, situation.answers.size(), 'Only answers about names');
      Assert.areEqual('same|Pottery', situation.answers[0].answer);
    }
  }

  @IsTest
  static void anAddedNameBecomesAnActivityOfferedAsProposed() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request request = camp.request();
      ChoicesImport.SheetChoice photo = ranked('Photo club', null, 1);
      photo.add = 'Photo club';
      request.addActivities.add('Photo club');
      request.campers.add(
        withChoices(
          camper(2, 'Talia Brightwater', '1017'),
          new List<ChoicesImport.SheetChoice>{
            photo,
            ranked('Pottery Wheel', camp.ids.get('Pottery'), 2)
          }
        )
      );

      Test.startTest();
      ChoicesImport.Done done = ChoicesImportController.bringInChoices(
        JSON.serialize(request)
      );
      Test.stopTest();

      Assert.areEqual(1, done.activitiesAdded);
      Activity__c added = [
        SELECT Id
        FROM Activity__c
        WHERE Season__c = :camp.season.Id AND Name = 'Photo club'
      ];
      Offering__c offering = [
        SELECT Proposed__c
        FROM Offering__c
        WHERE ElectiveSet__c = :camp.chugim.Id AND Activity__c = :added.Id
      ];
      Assert.isTrue(offering.Proposed__c, 'Confirmed on the Electives screen');
      String stored = [
        SELECT Choices__c
        FROM Preference__c
        WHERE ElectiveRun__c = :done.runId
      ]
      .Choices__c;
      Assert.isTrue(stored.contains(String.valueOf(added.Id)), stored);
      Assert.isFalse(stored.contains('"add"'), stored);
      // Same as an activity the set doesn't offer: kept as that activity, no offering made.
      Assert.isTrue(stored.contains(String.valueOf(camp.ids.get('Pottery'))));
      Assert.areEqual(
        3,
        [SELECT COUNT() FROM Offering__c WHERE ElectiveSet__c = :camp.chugim.Id]
      );
    }
  }

  // ---------------------------------------------------------------- bringing in again

  @IsTest
  static void bringingInAgainKeepsHandChangesAndSaysWhereTheSheetDiffers() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request first = camp.request();
      first.campers.add(
        inGroup(
          withChoices(
            camper(2, 'Maya Fernwood', '1001'),
            archeryThenDrama(camp)
          ),
          camp.ids.get('Group A')
        )
      );
      first.campers.add(
        inGroup(
          withChoices(
            camper(3, 'Eli Marblecrest', '1002'),
            archeryThenDrama(camp)
          ),
          camp.ids.get('Group A')
        )
      );
      first.campers.add(
        withChoices(camper(4, 'Ari Quillfield', null), archeryThenDrama(camp))
      );
      first.campers[0].comment = 'Prefers mornings.';
      ChoicesImport.Done done = ChoicesImportController.bringInChoices(
        JSON.serialize(first)
      );
      Preference__c maya = [
        SELECT Id, Choices__c
        FROM Preference__c
        WHERE
          ElectiveRun__c = :done.runId
          AND Camper__r.CamperNumber__c = '1001'
      ];
      maya.Choices__c =
        '[{"n":"Drama","a":"' +
        camp.ids.get('Drama') +
        '","r":1,"k":"ranked"}]';
      maya.ManualChange__c = true;
      Database.update(maya, AccessLevel.USER_MODE);

      // The second sheet: Maya's number under another spelling of her name, Ari again (no
      // number), a new camper, and no Eli.
      ChoicesImport.Request second = camp.request();
      second.runRevision = 1;
      second.campers.add(
        withChoices(camper(2, 'Maya Fernwod', '1001'), archeryThenDrama(camp))
      );
      second.campers.add(
        withChoices(camper(3, 'ari  QUILLFIELD', null), archeryThenDrama(camp))
      );
      second.campers.add(
        inGroup(
          withChoices(
            camper(4, 'Noa Oakhollow', '1050'),
            archeryThenDrama(camp)
          ),
          camp.ids.get('Group B')
        )
      );
      second.campers[0].comment = 'Loves the outdoors.';

      Test.startTest();
      ChoicesImport.Check check = ChoicesImportController.checkChoices(
        JSON.serialize(second)
      );
      ChoicesImport.Done again = ChoicesImportController.bringInChoices(
        JSON.serialize(second)
      );
      Test.stopTest();

      Assert.areEqual(done.runId, check.runId, 'The same committed run');
      Assert.areEqual(2, check.known);
      Assert.areEqual(1, check.added);
      Assert.areEqual(new List<Integer>{ 0 }, check.handChanged);
      Assert.areEqual(new List<Integer>{ 0 }, check.differs);
      Assert.areEqual(1, check.renamed.size());
      Assert.areEqual('Maya Fernwood', check.renamed[0].savedName);
      Assert.areEqual(1, check.notOnSheet, 'Eli is not on this sheet');

      Assert.areEqual(done.runId, again.runId);
      Assert.areEqual(1, again.handKept);
      assertKept(camp, done.runId, maya.Id);
    }
  }

  /** After the second sheet: the hand change, Shoresh's name and both comments kept. */
  private static void assertKept(ChoicesCamp camp, Id runId, Id mayaId) {
    Preference__c kept = [
      SELECT
        Choices__c,
        ImportedChoices__c,
        Group__c,
        Camper__r.Name,
        Camper__r.ParentComments__c
      FROM Preference__c
      WHERE Id = :mayaId
    ];
    Assert.isTrue(
      kept.Choices__c.startsWith('[{"n":"Drama"'),
      'Hand change kept'
    );
    Assert.isTrue(
      kept.ImportedChoices__c.contains('Archery'),
      'What the sheet says'
    );
    Assert.areEqual(
      camp.ids.get('Group A'),
      kept.Group__c,
      'No bunk on the sheet: kept'
    );
    Assert.areEqual(
      'Maya Fernwood',
      kept.Camper__r.Name,
      'Shoresh\'s name is kept'
    );
    Assert.areEqual(
      'Prefers mornings.\nLoves the outdoors.',
      kept.Camper__r.ParentComments__c
    );
    Assert.areEqual(
      4,
      [SELECT COUNT() FROM Preference__c WHERE ElectiveRun__c = :runId],
      'Eli keeps his choices'
    );
    Assert.areEqual(
      4,
      [SELECT COUNT() FROM Camper__c WHERE Season__c = :camp.season.Id],
      'Ari is matched by name'
    );
    Assert.areEqual(
      2,
      [SELECT Revision__c FROM ElectiveRun__c WHERE Id = :runId].Revision__c
    );
  }

  @IsTest
  static void aRunChangedSinceTheCheckIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request request = camp.request();
      request.campers.add(
        withChoices(camper(2, 'Maya Fernwood', '1001'), archeryThenDrama(camp))
      );
      ChoicesImportController.bringInChoices(JSON.serialize(request));

      Test.startTest();
      // The screen checked before that save: it saw no run.
      String message = refusal(request);
      Test.stopTest();

      Assert.areEqual(
        'Someone else brought in choices for this run since you started. Choose the file again to see them.',
        message
      );
    }
  }

  // ---------------------------------------------------------------- refused

  @IsTest
  static void aFinalRunTakesNoNewChoices() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request request = camp.request();
      request.campers.add(
        withChoices(camper(2, 'Maya Fernwood', '1001'), archeryThenDrama(camp))
      );
      ChoicesImport.Done done = ChoicesImportController.bringInChoices(
        JSON.serialize(request)
      );
      Database.update(
        new ElectiveRun__c(Id = done.runId, Status__c = 'Final'),
        AccessLevel.USER_MODE
      );
      request.runRevision = 1;

      Test.startTest();
      ChoicesImport.Check check = ChoicesImportController.checkChoices(
        JSON.serialize(request)
      );
      String message = refusal(request);
      Test.stopTest();

      Assert.isTrue(check.isFinal);
      Assert.areEqual('Chugim · Week 1', check.runName);
      Assert.areEqual(
        '"Chugim · Week 1" is final, so it can\'t take new choices.',
        message
      );
    }
  }

  @IsTest
  static void oneCamperWrittenTwoWaysIsRefusedByRowNotByName() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      ChoicesImport.Request request = camp.request();
      request.campers.add(
        withChoices(camper(2, 'Maya Fernwood', 'SYN 1'), archeryThenDrama(camp))
      );
      request.campers.add(
        withChoices(camper(9, 'Maya Fernwood', 'syn1'), archeryThenDrama(camp))
      );

      Test.startTest();
      String message = refusal(request);
      Test.stopTest();

      Assert.areEqual(
        'Rows 2 and 9 are one camper written two ways. Write them one way in the sheet, then choose it again.',
        message
      );
      Assert.isFalse(message.contains('Maya'), 'No message names a camper');
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Camper__c WHERE Season__c = :camp.season.Id]
      );
    }
  }

  @IsTest
  static void aGroupOfAnotherProgramOrAnUnreadableChoiceIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      Program__c other = ShoreshTestData.program(camp.season.Id, 'Teens');
      Division__c seniors = ShoreshTestData.division(other.Id, 'Seniors');
      Group__c cedar = ShoreshTestData.groupIn(seniors.Id, 'Cedar');
      ChoicesImport.Request request = camp.request();
      request.campers.add(
        inGroup(
          withChoices(
            camper(2, 'Maya Fernwood', '1001'),
            archeryThenDrama(camp)
          ),
          cedar.Id
        )
      );
      ChoicesImport.Request unreadable = camp.request();
      ChoicesImport.SheetChoice odd = ranked('Archery', null, 1);
      odd.k = 'favourite';
      unreadable.campers.add(
        withChoices(
          camper(3, 'Eli Marblecrest', '1002'),
          new List<ChoicesImport.SheetChoice>{ odd }
        )
      );

      Test.startTest();
      String wrongGroup = refusal(request);
      String wrongKind = refusal(unreadable);
      Test.stopTest();

      Assert.areEqual(
        'A camper\'s group is not in this schedule\'s program. Reload the page.',
        wrongGroup
      );
      Assert.areEqual(
        'Row 3: a choice could not be read. Choose the file again.',
        wrongKind
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Season__c = :camp.season.Id],
        'Nothing saved'
      );
    }
  }

  @IsTest
  static void aGroupOfAnotherDivisionThanTheRowsIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      Division__c boys = ShoreshTestData.division(camp.ids.get('Main'), 'Boys');
      Division__c girls = ShoreshTestData.division(
        camp.ids.get('Main'),
        'Girls'
      );
      Group__c boysBunk = ShoreshTestData.groupIn(boys.Id, 'Bunk 1');
      ShoreshTestData.groupIn(girls.Id, 'Bunk 1');
      ChoicesImport.Request request = camp.request();
      ChoicesImport.SheetCamper dana = inGroup(
        withChoices(
          camper(2, 'Dana Brookfield', '2001'),
          archeryThenDrama(camp)
        ),
        boysBunk.Id
      );
      dana.divisionId = girls.Id;
      request.campers.add(dana);

      Test.startTest();
      String wrongDivision = refusal(request);
      Test.stopTest();

      Assert.areEqual(
        'Row 2: the group is not in the row\'s division. Reload the page.',
        wrongDivision
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveRun__c WHERE Season__c = :camp.season.Id],
        'Nothing saved'
      );
    }
  }

  @IsTest
  static void anOutsiderCannotReadOrBringIn() {
    ChoicesCamp camp;
    System.runAs(ShoreshTestData.scheduler()) {
      camp = new ChoicesCamp();
    }
    ChoicesImport.Request request = camp.request();
    request.campers.add(
      withChoices(camper(2, 'Maya Fernwood', '1001'), archeryThenDrama(camp))
    );
    System.runAs(ShoreshTestData.outsider()) {
      Test.startTest();
      String message = refusal(request);
      Test.stopTest();
      Assert.isNotNull(message);
    }
    Assert.areEqual(0, [SELECT COUNT() FROM Camper__c]);
  }

  // ---------------------------------------------------------------- helpers

  @IsTest
  static void commentsAddUpAndChoicesCompareByWhatTheyAre() {
    Assert.areEqual('A', ChoicesImportCampers.commentWith(null, ' A '));
    Assert.areEqual('A', ChoicesImportCampers.commentWith('A', ''));
    Assert.areEqual(
      'A and B',
      ChoicesImportCampers.commentWith('A and B', 'B')
    );
    Assert.areEqual('A\nC', ChoicesImportCampers.commentWith('A', 'C'));
    Assert.areEqual(
      ChoicesImportChoices.signature(
        '[{"n":"Archery","r":1,"k":"ranked"},{"n":"Drama","r":2,"k":"ranked"}]'
      ),
      ChoicesImportChoices.signature(
        '[{"n":"drama","r":2,"k":"ranked"},{"n":"ARCHERY","r":1,"k":"ranked"}]'
      )
    );
    Assert.areNotEqual(
      ChoicesImportChoices.signature('[{"n":"Archery","r":1,"k":"ranked"}]'),
      ChoicesImportChoices.signature('[{"n":"Archery","r":2,"k":"ranked"}]')
    );
    Assert.areEqual('not json', ChoicesImportChoices.signature('not json'));
    Assert.areEqual('potterywheel', ChoicesImport.fold('Pottery-Wheel '));
  }

  // ---------------------------------------------------------------- linked choices (slice E8)

  @IsTest
  static void aChoiceNamingALinkedChoiceKeepsItWithItsOfferingsActivity() {
    System.runAs(ShoreshTestData.scheduler()) {
      ChoicesCamp camp = new ChoicesCamp();
      Offering__c drama = [
        SELECT Id
        FROM Offering__c
        WHERE
          ElectiveSet__c = :camp.chugim.Id
          AND Activity__c = :camp.ids.get('Drama')
      ];
      LinkedChoice__c both = new LinkedChoice__c(
        ElectiveSet__c = camp.chugim.Id,
        Name = 'Drama both days',
        Offering__c = drama.Id,
        AppliesTo__c = 'All'
      );
      ElectiveSet__c bechirot = new ElectiveSet__c(
        Season__c = camp.season.Id,
        Name = 'Bechirot'
      );
      Database.insert(bechirot, AccessLevel.USER_MODE);
      Offering__c elsewhere = new Offering__c(
        ElectiveSet__c = bechirot.Id,
        Activity__c = camp.ids.get('Pottery'),
        NoSeatLimit__c = true
      );
      Database.insert(elsewhere, AccessLevel.USER_MODE);
      LinkedChoice__c otherSet = new LinkedChoice__c(
        ElectiveSet__c = bechirot.Id,
        Name = 'Pottery double',
        Offering__c = elsewhere.Id,
        AppliesTo__c = 'All'
      );
      Database.insert(
        new List<LinkedChoice__c>{ both, otherSet },
        AccessLevel.USER_MODE
      );
      ChoicesImport.Request request = camp.request();
      // The screen named the wrong activity: the server goes by the linked choice.
      ChoicesImport.SheetChoice linked = ranked(
        'Drama both days',
        camp.ids.get('Archery'),
        1
      );
      linked.l = both.Id;
      request.campers.add(
        withChoices(
          camper(2, 'Synthetic Camper 1', 'SYN-0001'),
          new List<ChoicesImport.SheetChoice>{
            linked,
            ranked('Archery', camp.ids.get('Archery'), 2)
          }
        )
      );

      Test.startTest();
      ChoicesImport.Done done = ChoicesImportController.bringInChoices(
        JSON.serialize(request)
      );
      ChoicesImport.Request wrongSet = camp.request();
      // Into the run just made, at its revision.
      wrongSet.runRevision = 1;
      ChoicesImport.SheetChoice notOurs = ranked(
        'Pottery double',
        camp.ids.get('Pottery'),
        1
      );
      notOurs.l = otherSet.Id;
      wrongSet.campers.add(
        withChoices(
          camper(2, 'Synthetic Camper 2', 'SYN-0002'),
          new List<ChoicesImport.SheetChoice>{ notOurs }
        )
      );
      String refused = refusal(wrongSet);
      Test.stopTest();

      List<ChoicesImport.SheetChoice> kept = (List<ChoicesImport.SheetChoice>) JSON.deserialize(
        [
          SELECT Choices__c
          FROM Preference__c
          WHERE ElectiveRun__c = :done.runId
        ]
        .Choices__c,
        List<ChoicesImport.SheetChoice>.class
      );
      Assert.areEqual(both.Id, kept[0].l);
      Assert.areEqual(camp.ids.get('Drama'), kept[0].a);
      Assert.isNull(kept[1].l);
      Assert.areEqual(
        'Row 2: a choice names a linked choice that is no longer in this set. Reload the page.',
        refused
      );
    }
  }
}
