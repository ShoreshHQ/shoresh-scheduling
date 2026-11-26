/**
 * staff, coming in (IncomingStaff; docs/protocol/api/outside-systems.md API-2.7, API-4.11). Every
 * batch is sent as a user holding only "Send staff"; Undo is a director's (Shoresh Scheduler).
 * Synthetic data only.
 */
@IsTest
private class IncomingStaffTest {
  private static Map<String, Object> send(List<Map<String, Object>> records) {
    for (Map<String, Object> record : records) {
      if (!record.containsKey('season')) {
        record.put('season', 'Summer 2026');
      }
      if (!record.containsKey('source_system')) {
        record.put('source_system', IncomingTestData.SYSTEM_NAME);
      }
    }
    return IncomingTestData.post(
      'staff',
      JSON.serialize(new Map<String, Object>{ 'records' => records })
    );
  }

  private static Map<String, Object> one(String outsideId, String name) {
    Map<String, Object> record = new Map<String, Object>();
    if (outsideId != null) {
      record.put('staff_id', outsideId);
    }
    if (name != null) {
      record.put('staff_name', name);
    }
    return record;
  }

  /** A staff member already in the season (from the sending system when outsideId is given). */
  private static StaffMember__c staffMember(
    IncomingTestData camp,
    String name,
    String outsideId
  ) {
    StaffMember__c person = new StaffMember__c(
      Season__c = camp.season.Id,
      Name = name,
      SortOrder__c = 1,
      OutsideId__c = outsideId,
      SourceSystem__c = outsideId == null ? null : IncomingTestData.SYSTEM_NAME
    );
    Database.insert(person, AccessLevel.SYSTEM_MODE);
    return person;
  }

  private static List<StaffMember__c> staff(Id seasonId) {
    return [
      SELECT Id, Name, OutsideId__c, SourceSystem__c, SortOrder__c
      FROM StaffMember__c
      WHERE Season__c = :seasonId
      WITH SYSTEM_MODE
      ORDER BY SortOrder__c, Name
    ];
  }

  // API-2.7, API-2.3, API-2.5, API-6.3: new staff are added to the season's Staff list, after
  // those it has, and said so; the same batch again changes nothing and records no second import.
  // A batch of 50 stays well under the query limit.
  @IsTest
  static void aBatchAddsStaffAndTheSameBatchAgainChangesNothing() {
    IncomingTestData camp = new IncomingTestData();
    staffMember(camp, 'Avi Hand', null);
    List<Map<String, Object>> records = new List<Map<String, Object>>();
    for (Integer i = 1; i <= 50; i++) {
      records.add(one('S-' + i, 'Synthetic Leader ' + i));
    }
    User sender = camp.sender('Send_Staff');
    Integer queries;
    System.runAs(sender) {
      Test.startTest();
      Map<String, Object> first = send(records);
      queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, first.get('status'), String.valueOf(first));
      Assert.areEqual(
        'saved: Added this staff member.',
        IncomingTestData.said(first, 1)
      );
      Assert.areEqual(50, first.get('saved'));
      Map<String, Object> again = send(records);
      Assert.areEqual(
        'unchanged: Already up to date.',
        IncomingTestData.said(again, 1)
      );
      Assert.areEqual(50, again.get('unchanged'));
    }
    Assert.isTrue(queries < 40, 'A batch read ' + queries + ' queries');
    List<StaffMember__c> after = staff(camp.season.Id);
    Assert.areEqual(51, after.size());
    Assert.areEqual('Avi Hand', after[0].Name);
    Assert.areEqual('Synthetic Leader 1', after[1].Name);
    Assert.areEqual(2, after[1].SortOrder__c);
    Assert.areEqual('S-1', after[1].OutsideId__c);
    Assert.areEqual(IncomingTestData.SYSTEM_NAME, after[1].SourceSystem__c);
    List<Import__c> imports = camp.imports();
    Assert.areEqual(1, imports.size(), 'The second batch recorded nothing');
    Assert.areEqual('Staff from Sign-up Form', imports[0].Files__c);
  }

  // API-2.7, API-4.11: a name fixed in the camp's system updates the same staff member, found by
  // the system and its ID; Shoresh's ID stays, and the name is still not renamed by hand after.
  @IsTest
  static void aNameFixedOutsideUpdatesTheSameStaffMember() {
    IncomingTestData camp = new IncomingTestData();
    StaffMember__c dana = staffMember(camp, 'Dana Levi', 'S-1');
    System.runAs(camp.sender('Send_Staff')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{ one('S-1', 'Dana Levy') }
      );
      Assert.areEqual(
        'saved: Updated: name.',
        IncomingTestData.said(answer, 1)
      );
      Database.SaveResult byHand = Database.update(
        new StaffMember__c(Id = dana.Id, Name = 'Dana L.'),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(byHand.isSuccess(), 'Only a batch renames them');
      Assert.areEqual(
        StaffMemberTriggerHandler.nameRefusal(IncomingTestData.SYSTEM_NAME),
        byHand.getErrors()[0].getMessage()
      );
    }
    List<StaffMember__c> after = staff(camp.season.Id);
    Assert.areEqual(1, after.size());
    Assert.areEqual(dana.Id, after[0].Id);
    Assert.areEqual('Dana Levy', after[0].Name);
  }

  // API-4.11: a staff member added in Camp Setup, with no outside ID, is renamed there freely.
  @IsTest
  static void aStaffMemberAddedByHandIsRenamedFreely() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Staff')) {
      StaffMember__c avi = new StaffMember__c(
        Season__c = camp.season.Id,
        Name = 'Avi',
        SortOrder__c = 1
      );
      Database.insert(avi, AccessLevel.USER_MODE);
      Database.SaveResult renamed = Database.update(
        new StaffMember__c(Id = avi.Id, Name = 'Avi Stone'),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isTrue(renamed.isSuccess(), String.valueOf(renamed.getErrors()));
    }
    Assert.areEqual('Avi Stone', staff(camp.season.Id)[0].Name);
  }

  // API-2.7, API-6.3: staff are found only by the system and its ID, never by name: a name
  // Shoresh already has, sent with an ID, is another person; a record with no ID is a problem;
  // an ID Shoresh doesn't have needs a name; the same person twice in a batch is used once.
  @IsTest
  static void staffAreFoundByTheirIdNeverByName() {
    IncomingTestData camp = new IncomingTestData();
    StaffMember__c byHand = staffMember(camp, 'Noa Bar', null);
    staffMember(camp, 'Eli Stone', 'S-2');
    Map<String, Object> answer;
    System.runAs(camp.sender('Send_Staff')) {
      answer = send(
        new List<Map<String, Object>>{
          one('S-9', 'Noa Bar'),
          one(null, 'Eli Stone'),
          one('S-7', null),
          one('s-2', 'Eli Stone'),
          one('S-9', 'Noa Bar')
        }
      );
    }
    Assert.areEqual(
      'saved: Added this staff member.',
      IncomingTestData.said(answer, 1)
    );
    Assert.areEqual(
      'problem: ' + IncomingStaffPlan.SAY_WHO,
      IncomingTestData.said(answer, 2)
    );
    Assert.areEqual(
      'problem: Shoresh has no staff member with this ID yet. Send their name (staff_name) to add them.',
      IncomingTestData.said(answer, 3)
    );
    // IDs are kept as the system writes them: "s-2" is not "S-2".
    Assert.areEqual(
      'saved: Added this staff member.',
      IncomingTestData.said(answer, 4)
    );
    Assert.areEqual(
      'problem: This staff member is in the batch more than once. Only the first was used.',
      IncomingTestData.said(answer, 5)
    );
    List<StaffMember__c> after = staff(camp.season.Id);
    Assert.areEqual(4, after.size());
    Integer noas = 0;
    for (StaffMember__c person : after) {
      if (person.Name == 'Noa Bar') {
        noas++;
      }
      if (person.Id == byHand.Id) {
        Assert.isNull(person.OutsideId__c, 'The one added by hand is kept');
      }
    }
    Assert.areEqual(2, noas);
  }

  // API-2.3, API-4.11: a batch is undone like any import: who it added goes, a name it changed
  // comes back (Undo of a batch may change a name the system owns).
  @IsTest
  static void undoTakesAStaffBatchBack() {
    IncomingTestData camp = new IncomingTestData();
    StaffMember__c dana = staffMember(camp, 'Dana Levi', 'S-1');
    System.runAs(camp.sender('Send_Staff')) {
      send(
        new List<Map<String, Object>>{
          one('S-1', 'Dana Levy'),
          one('S-2', 'Eli Stone')
        }
      );
    }
    Id importId = camp.imports()[0].Id;
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      ImportUndo.Result undone = ImportUndo.undo(importId);
      Assert.areEqual(1, undone.removed);
      Assert.areEqual(1, undone.restored);
    }
    List<StaffMember__c> after = staff(camp.season.Id);
    Assert.areEqual(1, after.size());
    Assert.areEqual(dana.Id, after[0].Id);
    Assert.areEqual('Dana Levi', after[0].Name);
  }

  // API-4.4, API-4.7: a key without "Send staff" is refused whole; a person holding Shoresh
  // Scheduler brings staff in without it.
  @IsTest
  static void onlySendStaffOrASchedulerBringsStaffIn() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> refused = send(
        new List<Map<String, Object>>{ one('S-1', 'Dana Levi') }
      );
      Assert.areEqual(403, refused.get('status'));
      Assert.areEqual(
        'This connection can\'t send staff. A Salesforce admin can give it the "Send staff" permission set.',
        refused.get('message')
      );
    }
    Assert.areEqual(0, staff(camp.season.Id).size());
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{ one('S-1', 'Dana Levi') }
      );
      Assert.areEqual(
        'saved: Added this staff member.',
        IncomingTestData.said(answer, 1)
      );
    }
  }

  // API-1.3: a Flow action and the web address give the same result, and each sees what the
  // other saved.
  @IsTest
  static void aFlowActionAndTheWebAddressGiveTheSameResult() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Staff')) {
      IncomingStaff.Record byFlow = new IncomingStaff.Record();
      byFlow.season = 'Summer 2026';
      byFlow.source_system = IncomingTestData.SYSTEM_NAME;
      byFlow.staff_id = 'S-1';
      byFlow.staff_name = 'Dana Levi';
      String flowSaid = IncomingTestData.said(
        IncomingStaff.staff(new List<IncomingStaff.Record>{ byFlow }),
        1
      );
      String webSaid = IncomingTestData.said(
        send(new List<Map<String, Object>>{ one('S-2', 'Eli Stone') }),
        1
      );
      Assert.areEqual(flowSaid, webSaid);
      Assert.areEqual(
        'unchanged: Already up to date.',
        IncomingTestData.said(
          send(new List<Map<String, Object>>{ one('S-1', 'Dana Levi') }),
          1
        )
      );
    }
  }
}
