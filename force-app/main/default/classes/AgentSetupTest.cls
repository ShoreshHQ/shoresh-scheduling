/**
 * Renaming and deleting setup records through an agent or the command line (docs/protocol/api.md
 * API-1.47, API-1.48), on GeneratedTestData's synthetic camp: the setup table's own row save and
 * Camp Setup's own Delete, refused in their words. Also a blank start that someone else's start
 * beat (API-1.46).
 */
@IsTest
private class AgentSetupTest {
  /** POST to rename or delete in the camp's season (or the one fields name); answers [status, sentence]. */
  private static List<Object> post(String action, Map<String, Object> fields) {
    Map<String, Object> body = fields.containsKey('season')
      ? new Map<String, Object>()
      : new Map<String, Object>{
          'season' => [
            SELECT Name
            FROM Season__c
            WHERE Id = :GeneratedTestData.ids.get('Season')
            WITH SYSTEM_MODE
          ]
          .Name
        };
    body.putAll(fields);
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentAskFirstTestCalls.answer(
      action == 'rename'
        ? (AgentWeeks.Action) new AgentRenameSetup()
        : new AgentDeleteSetup()
    );
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static String nameOf(Id recordId) {
    return (String) Database.query(
        'SELECT Name FROM ' +
          recordId.getSObjectType().getDescribe().getName() +
          ' WHERE Id = :recordId'
      )[0]
      .get('Name');
  }

  // API-1.11: every change through an agent is refused in the same words without the access
  @IsTest
  static void someoneWithoutShoreshRenamesNothing() {
    String season;
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      season = [
        SELECT Name
        FROM Season__c
        WHERE Id = :GeneratedTestData.ids.get('Season')
      ]
      .Name;
    }
    System.runAs(ShoreshTestData.outsider()) {
      Test.startTest();
      List<Object> renamed = post(
        'rename',
        new Map<String, Object>{
          'season' => season,
          'kind' => 'group',
          'name' => 'Group A',
          'new_name' => 'Cabin A'
        }
      );
      Test.stopTest();
      Assert.areEqual(400, renamed[0]);
      Assert.areEqual(AgentWeeks.NO_ACCESS, renamed[1]);
    }
  }

  @IsTest
  static void renamingIsTheSetupTablesRowSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> renamed = post(
        'rename',
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'group a',
          'new_name' => 'Cabin A'
        }
      );
      List<Object> timeBlock = post(
        'rename',
        new Map<String, Object>{
          'kind' => 'time_block',
          'name' => 'Lunch',
          'new_name' => 'Lunch and rest'
        }
      );
      List<Object> unknown = post(
        'rename',
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'Group Z',
          'new_name' => 'Cabin Z'
        }
      );
      List<Object> noKind = post(
        'rename',
        new Map<String, Object>{
          'kind' => 'camper',
          'name' => 'Group B',
          'new_name' => 'Cabin B'
        }
      );
      Assert.isTrue(
        Limits.getQueries() < 60,
        'Queries: ' + Limits.getQueries()
      );
      Test.stopTest();
      Assert.areEqual(200, renamed[0], String.valueOf(renamed[1]));
      Assert.areEqual('Renamed the group "Group A" to "Cabin A".', renamed[1]);
      Assert.areEqual('Cabin A', nameOf(GeneratedTestData.ids.get('Group A')));
      Assert.areEqual(200, timeBlock[0], String.valueOf(timeBlock[1]));
      Assert.areEqual(400, unknown[0]);
      Assert.areEqual(
        'There is no group called "Group Z" that this user can see. The groups: Group A, Group B, Group C.',
        String.valueOf(unknown[1]).replace('Cabin A', 'Group A')
      );
      Assert.areEqual(400, noKind[0]);
      Assert.isTrue(
        String.valueOf(noKind[1])
          .startsWith(
            'Shoresh\'s setup has no kind "camper". The kinds: week,'
          ),
        String.valueOf(noKind[1])
      );
    }
  }

  @IsTest
  static void aRenameThatOnlyChangesCaseIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> renamed = post(
        'rename',
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'Group A',
          'new_name' => 'GROUP A'
        }
      );
      Test.stopTest();
      Assert.areEqual(200, renamed[0], String.valueOf(renamed[1]));
      Assert.areEqual('Renamed the group "Group A" to "GROUP A".', renamed[1]);
      Assert.isTrue(
        'GROUP A'.equals(nameOf(GeneratedTestData.ids.get('Group A')))
      );
    }
  }

  // API-1.48
  @IsTest
  static void deletingIsCampSetupsDeleteWithItsRefusals() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> inUse = post(
        'delete',
        new Map<String, Object>{ 'kind' => 'location', 'name' => 'Gym' }
      );
      List<Object> deleted = post(
        'delete',
        new Map<String, Object>{ 'kind' => 'Group', 'name' => 'Group B' }
      );
      Test.stopTest();
      Assert.areEqual(400, inUse[0]);
      Assert.isTrue(
        String.valueOf(inUse[1])
          .startsWith(
            '"Gym" not deleted. Nothing was removed. This can\'t be deleted yet:'
          ),
        String.valueOf(inUse[1])
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Location__c
          WHERE Id = :GeneratedTestData.ids.get('Gym')
          WITH SYSTEM_MODE
        ]
      );
      Assert.areEqual(200, deleted[0], String.valueOf(deleted[1]));
      Assert.areEqual('Deleted "Group B".', deleted[1]);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Id = :GeneratedTestData.ids.get('Group B')
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  /** One POST to delete_setup_record exactly as given, no yes added: [status, message]. */
  private static List<Object> deleteOnce(Map<String, Object> fields) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => [
        SELECT Name
        FROM Season__c
        WHERE Id = :GeneratedTestData.ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name
    };
    body.putAll(fields);
    RestContext.request = new RestRequest();
    RestContext.request.requestURI = '/services/apexrest/v1/delete_setup_record';
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(new AgentDeleteSetup());
    return new List<Object>{
      RestContext.response.statusCode,
      ((Map<String, Object>) JSON.deserializeUntyped(
          RestContext.response.responseBody.toString()
        ))
        .get('message')
    };
  }

  private static Integer groupsCalled(String name) {
    return [SELECT COUNT() FROM Group__c WHERE Name = :name WITH SYSTEM_MODE];
  }

  // API-1.106: ask first is Shoresh's, not the description's. Without confirm nothing is deleted
  // and the answer is Camp Setup's question with a confirm; another target's confirm is refused
  // with nothing deleted; the confirm the question gave (fields in any order) deletes.
  @IsTest
  static void aDeleteIsDoneOnlyWithTheConfirmItsQuestionGave() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> asked = deleteOnce(
        new Map<String, Object>{ 'kind' => 'group', 'name' => 'Group B' }
      );
      Integer afterAsking = groupsCalled('Group B');
      String forB = AgentAskFirstTestCalls.confirmIn(RestContext.response);
      deleteOnce(
        new Map<String, Object>{ 'kind' => 'group', 'name' => 'Group C' }
      );
      String forC = AgentAskFirstTestCalls.confirmIn(RestContext.response);
      List<Object> wrong = deleteOnce(
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'Group B',
          'confirm' => forC
        }
      );
      Integer afterWrong = groupsCalled('Group B');
      List<Object> yes = deleteOnce(
        new Map<String, Object>{
          'confirm' => forB,
          'name' => 'Group B',
          'kind' => 'group'
        }
      );
      Object seasonSaid = ((Map<String, Object>) JSON.deserializeUntyped(
          RestContext.response.responseBody.toString()
        ))
        .get('season');
      Test.stopTest();
      // API-1.108: the answer says which season it used.
      Assert.areEqual(
        [
          SELECT Name
          FROM Season__c
          WHERE Id = :GeneratedTestData.ids.get('Season')
          WITH SYSTEM_MODE
        ]
        .Name,
        seasonSaid
      );
      Assert.areEqual(200, asked[0], String.valueOf(asked[1]));
      Assert.isTrue(
        String.valueOf(asked[1]).startsWith(AgentAskFirst.NOT_YET),
        String.valueOf(asked[1])
      );
      Assert.isNotNull(forB, String.valueOf(asked[1]));
      Assert.areEqual(1, afterAsking, 'Asking deletes nothing');
      Assert.areNotEqual(forB, forC, 'Each target has its own confirm');
      Assert.areEqual(409, wrong[0], String.valueOf(wrong[1]));
      Assert.areEqual(
        1,
        afterWrong,
        'Another target\'s confirm deletes nothing'
      );
      Assert.areEqual(200, yes[0], String.valueOf(yes[1]));
      Assert.areEqual('Deleted "Group B".', yes[1]);
      Assert.areEqual(0, groupsCalled('Group B'));
      Assert.areEqual(1, groupsCalled('Group C'));
    }
  }

  // API-1.106: a confirm is for the very record shown. Renamed away and another given its name,
  // the old confirm deletes nothing.
  @IsTest
  static void aDeleteConfirmIsForTheRecordShownNotOneNamedTheSameSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      deleteOnce(
        new Map<String, Object>{ 'kind' => 'group', 'name' => 'Group B' }
      );
      String confirm = AgentAskFirstTestCalls.confirmIn(RestContext.response);
      Database.update(
        new List<Group__c>{
          new Group__c(
            Id = GeneratedTestData.ids.get('Group B'),
            Name = 'Group B old'
          ),
          new Group__c(
            Id = GeneratedTestData.ids.get('Group C'),
            Name = 'Group B'
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      List<Object> old = deleteOnce(
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'Group B',
          'confirm' => confirm
        }
      );
      Test.stopTest();
      Assert.isNotNull(confirm);
      Assert.areEqual(409, old[0], String.valueOf(old[1]));
      Assert.areEqual(1, groupsCalled('Group B'), 'The other group stays');
      Assert.areEqual(1, groupsCalled('Group B old'), 'The one shown stays');
    }
  }

  /** The AI's question before a delete (GET /v1/delete_setup_record): [status, message]. */
  private static List<Object> askBeforeDelete(String kind, String name) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.put(
      'season',
      [
        SELECT Name
        FROM Season__c
        WHERE Id = :GeneratedTestData.ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name
    );
    RestContext.request.params.put('kind', kind);
    RestContext.request.params.put('name', name);
    RestContext.response = new RestResponse();
    AgentAskFirstTestCalls.answer(new AgentDeleteSetup());
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  // API-1.102: the AI asks Camp Setup's own question (SetupDelete), word for word, and is refused
  // what the screen refuses, with nothing deleted.
  @IsTest
  static void theAiAsksCampSetupsQuestionBeforeADelete() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      // Teens: a program nothing else uses (Main's groups are in "Who can do it").
      Id teens = ShoreshTestData.program(
          GeneratedTestData.ids.get('Season'),
          'Teens'
        )
        .Id;
      Database.insert(
        new Schedule__c(
          Program__c = teens,
          Week__c = GeneratedTestData.ids.get('Week 1'),
          Name = 'Build',
          Status__c = 'Draft',
          Origin__c = 'Manual'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      List<Object> program = askBeforeDelete('program', 'Teens');
      List<Object> refused = askBeforeDelete('location', 'Gym');
      String screen = SetupDelete.preview(teens).message;
      Test.stopTest();
      Assert.areEqual(200, program[0], String.valueOf(program[1]));
      Assert.areEqual(screen, program[1]);
      Assert.areEqual(
        'Delete "Teens"? Anything inside it is deleted too. That includes its Manual Build.',
        program[1]
      );
      Assert.areEqual(400, refused[0]);
      Assert.isTrue(
        String.valueOf(refused[1])
          .startsWith(
            '"Gym" not deleted. Nothing was removed. This can\'t be deleted yet:'
          ),
        String.valueOf(refused[1])
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Program__c
          WHERE Id = :teens
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void aBlankStartSomeoneElseBeatIsSaidSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id program = GeneratedTestData.ids.get('Main');
      Id week = GeneratedTestData.ids.get('Week 1');
      Test.startTest();
      ManualBuildViews.DraftView first = ManualBuildController.startBlankWeek(
        program,
        week
      );
      ManualBuildViews.DraftView second = ManualBuildController.startBlankWeek(
        program,
        week
      );
      Test.stopTest();
      Assert.isFalse(first.startedBySomeoneElse);
      Assert.isTrue(second.startedBySomeoneElse);
      // A blank start copies nothing, so it doesn't say so; a start from another week does.
      Assert.areEqual(
        'Someone else started this week.',
        AgentStartWeek.someoneElse(CampLabels.modelTermsOnly(), false)
      );
      Assert.areEqual(
        'Someone else started this week; nothing was copied.',
        AgentStartWeek.someoneElse(CampLabels.modelTermsOnly(), true)
      );
    }
  }
}
