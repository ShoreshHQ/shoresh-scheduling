/**
 * Renaming and deleting setup records through an agent or the command line (docs/protocol/api.md
 * API-1.47, API-1.48), on GeneratedTestData's synthetic camp: the setup table's own row save and
 * Camp Setup's own Delete, refused in their words. Also a blank start that someone else's start
 * beat (API-1.46).
 */
@IsTest
private class AgentSetupTest {
  /** POST to rename or delete in the camp's season; answers [status, sentence]. */
  private static List<Object> post(String action, Map<String, Object> fields) {
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
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(
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
