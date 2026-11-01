/**
 * camper_elective_choice, coming in (IncomingCamperElectiveChoice; docs/protocol/api.md). Every
 * batch is sent as a user holding only "Send elective choices". Synthetic data only.
 */
@IsTest
private class IncomingCamperElectiveChoiceTest {
  private static Map<String, Object> record(String first, String second) {
    return new Map<String, Object>{
      'season' => 'Summer 2026',
      'source_system' => IncomingTestData.SYSTEM_NAME,
      'camper_id' => 'SYN-1',
      'elective' => 'Chugim',
      'week' => 'Week 1',
      'first_choice' => first,
      'second_choice' => second
    };
  }

  private static Map<String, Object> send(List<Map<String, Object>> records) {
    return IncomingTestData.post(
      'camper_elective_choice',
      JSON.serialize(new Map<String, Object>{ 'records' => records })
    );
  }

  private static Preference__c saved(Id camperId) {
    return [
      SELECT Id, Choices__c, ImportedChoices__c
      FROM Preference__c
      WHERE Camper__c = :camperId
      WITH SYSTEM_MODE
    ];
  }

  private static String firstChoice(String stored) {
    return ((List<ChoicesImport.SheetChoice>) JSON.deserialize(
        stored,
        List<ChoicesImport.SheetChoice>.class
      ))[0]
      .n;
  }

  // API-2.1, 2.3, 2.5, 6.3: choices are saved for the camper with that system's ID, stored as the
  // choices sheet stores them; the same choices again change nothing.
  @IsTest
  static void choicesAreSavedAndTheSameAgainChangeNothing() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Camper__c maya = camp.camper('Maya Cohen', 'SYN-1');
    System.runAs(camp.sender('Send_Elective_Choices')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{ record('archery', 'Swim') }
      );
      Assert.areEqual('saved: Saved.', IncomingTestData.said(answer, 1));
      Assert.areEqual(
        'unchanged: Already up to date.',
        IncomingTestData.said(
          send(new List<Map<String, Object>>{ record('Archery', 'Swim') }),
          1
        )
      );
    }
    List<ChoicesImport.SheetChoice> stored = (List<ChoicesImport.SheetChoice>) JSON.deserialize(
      saved(maya.Id).Choices__c,
      List<ChoicesImport.SheetChoice>.class
    );
    Assert.areEqual(2, stored.size());
    Assert.areEqual(camp.ids.get('Archery'), stored[0].a);
    Assert.areEqual(1, stored[0].r);
    Assert.areEqual('ranked', stored[0].k);
    Assert.areEqual(camp.ids.get('Swim'), stored[1].a);
    Assert.areEqual(1, camp.imports().size());
    Assert.areEqual(
      'Elective choices from Sign-up Form',
      camp.imports()[0].Files__c
    );
  }

  // API-1.3: the Flow action and the web address give the same result for the same data.
  @IsTest
  static void aFlowActionAndTheWebAddressGiveTheSameResult() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    camp.camper('Maya Cohen', 'SYN-1');
    camp.camper('Eli Stone', 'SYN-2');
    System.runAs(camp.sender('Send_Elective_Choices')) {
      IncomingCamperElectiveChoice.Record byFlow = new IncomingCamperElectiveChoice.Record();
      byFlow.season = 'Summer 2026';
      byFlow.source_system = IncomingTestData.SYSTEM_NAME;
      byFlow.camper_id = 'SYN-2';
      byFlow.elective = 'Chugim';
      byFlow.week = 'Week 1';
      byFlow.first_choice = 'Swim';
      byFlow.second_choice = 'Basket weaving';
      Map<String, Object> web = record('Swim', 'Basket weaving');
      Assert.areEqual(
        IncomingTestData.said(send(new List<Map<String, Object>>{ web }), 1),
        IncomingTestData.said(
          IncomingCamperElectiveChoice.camperElectiveChoice(
            new List<IncomingCamperElectiveChoice.Record>{ byFlow }
          ),
          1
        )
      );
      byFlow.second_choice = 'Archery';
      web.put('second_choice', 'Archery');
      Assert.areEqual(
        IncomingTestData.said(send(new List<Map<String, Object>>{ web }), 1),
        IncomingTestData.said(
          IncomingCamperElectiveChoice.camperElectiveChoice(
            new List<IncomingCamperElectiveChoice.Record>{ byFlow }
          ),
          1
        )
      );
    }
  }

  // API-4.1: choices a person changed are never overwritten: the incoming ones are kept beside
  // them, the sender is told, and a person is asked on Roots.
  @IsTest
  static void aPersonsChangeIsKeptAndTheIncomingKeptBesideIt() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Camper__c maya = camp.camper('Maya Cohen', 'SYN-1');
    System.runAs(camp.sender('Send_Elective_Choices')) {
      send(new List<Map<String, Object>>{ record('Archery', 'Swim') });
    }
    Preference__c had = saved(maya.Id);
    String byHand = had.ImportedChoices__c.replace('"r":1', '"r":3');
    Database.update(
      new Preference__c(
        Id = had.Id,
        Choices__c = byHand,
        ManualChange__c = true
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(camp.sender('Send_Elective_Choices')) {
      Assert.areEqual(
        'saved: A person changed these choices in Shoresh, so theirs are kept. These are kept beside them for a person to look at.',
        IncomingTestData.said(
          send(new List<Map<String, Object>>{ record('Swim', 'Archery') }),
          1
        )
      );
    }
    Preference__c after = saved(maya.Id);
    Assert.areEqual(byHand, after.Choices__c, 'The person\'s choices stay');
    Assert.areEqual('Swim', firstChoice(after.ImportedChoices__c));
    Map<String, Object> question = (Map<String, Object>) ((List<Object>) JSON.deserializeUntyped(
      camp.imports()[0].Open__c
    ))[0];
    Assert.areEqual('incoming|choices|' + had.Id, question.get('key'));
    Assert.isTrue(
      ((String) question.get('title'))
        .startsWith(
          'Maya Cohen\'s choices for Chugim · Week 1 were changed in Shoresh'
        )
    );
  }

  // API-2.5: choices older than the last taken for that camper are ignored, and said.
  @IsTest
  static void olderChoicesAreIgnored() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Camper__c maya = camp.camper('Maya Cohen', 'SYN-1');
    Map<String, Object> newer = record('Archery', 'Swim');
    newer.put('changed_at', '2026-06-02T10:00:00Z');
    Map<String, Object> older = record('Swim', 'Archery');
    older.put('changed_at', '2026-06-01T10:00:00Z');
    System.runAs(camp.sender('Send_Elective_Choices')) {
      send(new List<Map<String, Object>>{ newer });
      Assert.areEqual(
        'unchanged: Ignored: Shoresh already has later choices for this camper.',
        IncomingTestData.said(send(new List<Map<String, Object>>{ older }), 1)
      );
    }
    Assert.areEqual('Archery', firstChoice(saved(maya.Id).Choices__c));
  }

  // API-6.3: a choice not offered, a camper Shoresh doesn't have, or final seats are problems,
  // said plainly; nothing is saved for them.
  @IsTest
  static void problemsAreSaidPlainly() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    camp.camper('Maya Cohen', 'SYN-1');
    Map<String, Object> stranger = record('Swim', null);
    stranger.put('camper_id', 'SYN-404');
    System.runAs(camp.sender('Send_Elective_Choices')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{
          record('Archery', 'Basket weaving'),
          stranger
        }
      );
      Assert.areEqual(
        'problem: "Basket weaving" is not offered in Chugim. Use the activity\'s name as Shoresh has it.',
        IncomingTestData.said(answer, 1)
      );
      Assert.areEqual(
        'problem: ' + IncomingCampers.notFound(),
        IncomingTestData.said(answer, 2)
      );
    }
    Database.update(
      new ElectiveRun__c(Id = camp.run.Id, Status__c = 'Final'),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(camp.sender('Send_Elective_Choices')) {
      Assert.areEqual(
        'problem: Seats for Chugim · Week 1 are final, so choices were not changed.',
        IncomingTestData.said(
          send(new List<Map<String, Object>>{ record('Swim', null) }),
          1
        )
      );
    }
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Preference__c WITH SYSTEM_MODE],
      'Nothing saved'
    );
    Assert.areEqual(0, camp.imports().size(), 'Nothing recorded');
  }

  // API-6.4: an elective set and week with no choices brought in yet: the refusal says the one step
  // a person takes first, on the Elective seats screen; nothing is saved.
  @IsTest
  static void choicesBeforeAnyAreBroughtInSayWhatToDoFirst() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    camp.camper('Maya Cohen', 'SYN-1');
    Database.delete(camp.run, AccessLevel.SYSTEM_MODE);
    Map<String, Object> unknown = record('Swim', null);
    unknown.put('elective', 'Bechirot');
    System.runAs(camp.sender('Send_Elective_Choices')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{ record('Archery', 'Swim'), unknown }
      );
      Assert.areEqual(
        'problem: No choices brought in for Chugim in Week 1 yet, so Shoresh has nowhere to keep these. A person brings them in once on the Elective seats screen (choose Chugim and Week 1, then Bring in choices); after that, send these again.',
        IncomingTestData.said(answer, 1)
      );
      Assert.areEqual(
        'problem: There is no elective "Bechirot" in "Week 1" in this season.',
        IncomingTestData.said(answer, 2)
      );
    }
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Preference__c WITH SYSTEM_MODE],
      'Nothing saved'
    );
  }

  // API-4.4: only "Send elective choices" sends choices.
  @IsTest
  static void anotherPieceCannotSendChoices() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    camp.camper('Maya Cohen', 'SYN-1');
    System.runAs(camp.sender('Send_Camper_Groups')) {
      IncomingCamperElectiveChoice.Record byFlow = new IncomingCamperElectiveChoice.Record();
      byFlow.season = 'Summer 2026';
      byFlow.source_system = IncomingTestData.SYSTEM_NAME;
      byFlow.camper_id = 'SYN-1';
      byFlow.elective = 'Chugim';
      byFlow.week = 'Week 1';
      byFlow.first_choice = 'Swim';
      Assert.areEqual(
        'problem: This user can\'t send elective choices. A Salesforce admin can give it the "Send elective choices" permission set.',
        IncomingTestData.said(
          IncomingCamperElectiveChoice.camperElectiveChoice(
            new List<IncomingCamperElectiveChoice.Record>{ byFlow }
          ),
          1
        )
      );
    }
    Assert.areEqual(0, [SELECT COUNT() FROM Preference__c WITH SYSTEM_MODE]);
  }
}
