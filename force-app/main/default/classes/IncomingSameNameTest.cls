/**
 * ELECT-2.7 (Greg 2026-11-21) through another system's batches (camper, camper_group; API-2.1,
 * 2.2): two children of one name with their own IDs are both added; a name more than one camper
 * has, sent with no ID, is a question, never a guess. Synthetic data only.
 */
@IsTest
private class IncomingSameNameTest {
  private static Map<String, Object> send(
    String capability,
    List<Map<String, Object>> records
  ) {
    for (Map<String, Object> record : records) {
      record.put('season', 'Summer 2026');
      record.put('source_system', IncomingTestData.SYSTEM_NAME);
    }
    return IncomingTestData.post(
      capability,
      JSON.serialize(new Map<String, Object>{ 'records' => records })
    );
  }

  private static Integer noas(Id seasonId) {
    return [
      SELECT COUNT()
      FROM Camper__c
      WHERE Season__c = :seasonId AND Name = 'Noa Levi'
      WITH SYSTEM_MODE
    ];
  }

  @IsTest
  static void twoChildrenOfOneNameWithTheirOwnIdsAreBothAdded() {
    IncomingTestData camp = new IncomingTestData();
    // One Noa came in before with her ID.
    camp.camper('Noa Levi', 'SYN-1');
    List<Map<String, Object>> records = new List<Map<String, Object>>{
      new Map<String, Object>{
        'camper_id' => 'SYN-2',
        'camper_name' => 'Noa Levi'
      },
      new Map<String, Object>{
        'camper_id' => 'SYN-3',
        'camper_name' => 'noa  levi'
      }
    };
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> first = send('camper', records);
      Assert.areEqual(
        'saved: Added this camper.',
        IncomingTestData.said(first, 1)
      );
      Assert.areEqual(
        'saved: Added this camper.',
        IncomingTestData.said(first, 2)
      );
      Map<String, Object> again = send('camper', records);
      Assert.areEqual(2, again.get('unchanged'), 'The same batch adds no one');
    }
    Assert.areEqual(3, noas(camp.season.Id), 'Three Noas, three IDs');
  }

  @IsTest
  static void aNameTwoCampersHaveSentWithNoIdIsAQuestion() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Camper__c first = camp.camper('Noa Levi', null);
    camp.camper('Noa Levi', null);
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> answer = send(
        'camper',
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_name' => 'Noa Levi',
            'withdrawn' => true
          }
        }
      );
      Assert.areEqual(
        'problem: ' + IncomingCampers.SAME_NAME,
        IncomingTestData.said(answer, 1)
      );
    }
    System.runAs(camp.sender('Send_Camper_Groups')) {
      Map<String, Object> answer = send(
        'camper_group',
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_name' => 'Noa Levi',
            'bunk' => 'Group A'
          }
        }
      );
      Assert.areEqual(
        'problem: ' + IncomingCampers.SAME_NAME,
        IncomingTestData.said(answer, 1)
      );
    }
    Assert.areEqual(2, noas(camp.season.Id), 'No one added');
    Assert.areEqual(
      0,
      [
        SELECT COUNT()
        FROM Camper__c
        WHERE Season__c = :camp.season.Id AND Withdrawn__c = TRUE
        WITH SYSTEM_MODE
      ],
      'Neither Noa was guessed'
    );
    Map<String, Object> question = (Map<String, Object>) ((List<Object>) JSON.deserializeUntyped(
      camp.imports()[0].Open__c
    ))[0];
    Assert.areEqual('incoming|camper|' + first.Id, question.get('key'));
    Assert.isTrue(
      ((String) question.get('title'))
        .contains('more than one camper in this season has that name'),
      (String) question.get('title')
    );
  }
}
