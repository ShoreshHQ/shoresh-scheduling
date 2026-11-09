/**
 * An offering's row through an AI (docs/protocol/api.md API-1.135 to API-1.137): the read, the
 * table's own save of seats and minimum, and the delete's question. Every test acts as a scheduler
 * with only the Shoresh Scheduler permission set. Names are made up.
 */
@IsTest
private class AgentOfferingsTest {
  /** "Drama" made by the AI's own make, for a delete to take with it. */
  private static void made(LinkedChoicesMenu menu) {
    List<Object> answer = LinkedChoicesMenu.sent(
      new AgentMakeLinkedChoice(),
      menu.at(
        new Map<String, Object>{
          'activity' => 'Drama',
          'name' => 'Drama',
          'periods' => LinkedChoicesMenu.periods('monday', 'Period 1')
        }
      )
    );
    Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
  }

  /** What change_offering sends for Drama: fields, and what was read as seen. */
  private static Map<String, Object> rowChange(
    LinkedChoicesMenu menu,
    Map<String, Object> fields,
    Map<String, Object> seen
  ) {
    return menu.at(
      new Map<String, Object>{
        'activity' => 'drama',
        'fields' => fields,
        'seen' => seen
      }
    );
  }

  private static Offering__c dramaRow(LinkedChoicesMenu menu) {
    return [
      SELECT Seats__c, NoSeatLimit__c, MinimumToRun__c
      FROM Offering__c
      WHERE Id = :menu.dramaId
    ];
  }

  // API-1.135
  @IsTest
  static void anAgentReadsWhatTheListReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.params.put(
        'season',
        (String) menu.at(new Map<String, Object>()).get('season')
      );
      RestContext.response = new RestResponse();
      AgentOfferings.get();
      Test.stopTest();
      String text = RestContext.response.responseBody.toString();
      Assert.areEqual(200, RestContext.response.statusCode, text);
      Assert.isTrue(text.contains(menu.dramaId), 'The row is in what is read');
      Assert.areEqual(
        new Set<String>{
          'elective_set',
          'set_id',
          'setup',
          'labels',
          'season'
        },
        ((Map<String, Object>) JSON.deserializeUntyped(text)).keySet()
      );
    }
  }

  // API-1.136, ELECT-4.1
  @IsTest
  static void anAgentChangesARowThroughTheTablesSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Test.startTest();
      // Drama starts with No limit: taking it off and setting seats and a minimum go together.
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentChangeOffering(),
        rowChange(
          menu,
          new Map<String, Object>{
            'no_seat_limit' => 'no',
            'seats' => '12',
            'minimum_to_run' => '3'
          },
          new Map<String, Object>{
            'no_seat_limit' => 'yes',
            'seats' => '(blank)',
            'minimum_to_run' => '(blank)'
          }
        )
      );
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Offering__c row = dramaRow(menu);
      Assert.areEqual(12, row.Seats__c);
      Assert.isFalse(row.NoSeatLimit__c);
      Assert.areEqual(3, row.MinimumToRun__c);
      // Blank and 0 keep their meaning: saved, for the seat run to place with no limit.
      for (String seats : new List<String>{ '0', '(blank)' }) {
        String before = String.valueOf(dramaRow(menu).Seats__c ?? null);
        answer = LinkedChoicesMenu.sent(
          new AgentChangeOffering(),
          rowChange(
            menu,
            new Map<String, Object>{ 'seats' => seats },
            new Map<String, Object>{ 'seats' => before ?? '(blank)' }
          )
        );
        Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
        if (seats == '0') {
          Assert.areEqual(0, dramaRow(menu).Seats__c);
        }
      }
      Test.stopTest();
      Assert.isNull(dramaRow(menu).Seats__c);
    }
  }

  // API-1.136
  @IsTest
  static void anAgentIsRefusedWhatTheRowRefuses() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Test.startTest();
      // Drama has No limit: its seats can't be typed.
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentChangeOffering(),
        rowChange(
          menu,
          new Map<String, Object>{ 'seats' => '5' },
          new Map<String, Object>{ 'seats' => '(blank)' }
        )
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('has No limit'));
      Assert.areEqual(
        400,
        LinkedChoicesMenu.sent(
          new AgentChangeOffering(),
          rowChange(
            menu,
            new Map<String, Object>{ 'no_seat_limit' => 'no', 'seats' => '-1' },
            new Map<String, Object>{
              'no_seat_limit' => 'yes',
              'seats' => '(blank)'
            }
          )
        )[0]
      );
      // The object's own rule, said in its words; and nothing asked.
      answer = LinkedChoicesMenu.sent(
        new AgentChangeOffering(),
        rowChange(
          menu,
          new Map<String, Object>{ 'minimum_to_run' => '0' },
          new Map<String, Object>{ 'minimum_to_run' => '(blank)' }
        )
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(
        String.valueOf(answer[1]).contains('Must be 1 or more'),
        String.valueOf(answer[1])
      );
      answer = LinkedChoicesMenu.sent(
        new AgentChangeOffering(),
        rowChange(menu, new Map<String, Object>(), new Map<String, Object>())
      );
      Assert.areEqual(400, answer[0]);
      // Someone else changed it since: a conflict, nothing saved.
      answer = LinkedChoicesMenu.sent(
        new AgentChangeOffering(),
        rowChange(
          menu,
          new Map<String, Object>{ 'minimum_to_run' => '4' },
          new Map<String, Object>{ 'minimum_to_run' => '9' }
        )
      );
      Test.stopTest();
      Assert.areEqual(409, answer[0], String.valueOf(answer[1]));
      Assert.isNull(dramaRow(menu).MinimumToRun__c);
    }
  }

  // API-1.137
  @IsTest
  static void anAgentsDeleteOfARowAsksTheScreensQuestionAndKeepsTheActivity() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      made(menu);
      Map<String, Object> asked = menu.at(
        new Map<String, Object>{ 'activity' => 'Drama' }
      );
      Test.startTest();
      String question = 'Take "Drama" off "Chugim"? The activity is kept.';
      Assert.areEqual(question, SetupDelete.preview(menu.dramaId).message);
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(asked));
      Assert.areEqual(question, new AgentDeleteOffering().preview());
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentDeleteOffering(),
        asked
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Offering__c WHERE Id = :menu.dramaId]
      );
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoice__c]);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Drama']
      );
    }
  }

  // API-1.136, ELECT-4.5, API-1.137
  @IsTest
  static void fewerSeatsThanCampersIsSavedAndADeleteIsRefusedWhileSeatsUseIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Offering__c row = [SELECT Id FROM Offering__c WHERE Id = :menu.dramaId];
      update as system new Offering__c(
        Id = row.Id,
        NoSeatLimit__c = false,
        Seats__c = 2
      );
      menu.seatTaken();
      Test.startTest();
      List<Object> lower = LinkedChoicesMenu.sent(
        new AgentChangeOffering(),
        rowChange(
          menu,
          new Map<String, Object>{ 'seats' => '0' },
          new Map<String, Object>{ 'seats' => '2' }
        )
      );
      Assert.areEqual(200, lower[0], String.valueOf(lower[1]));
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(
        JSON.serialize(
          menu.at(new Map<String, Object>{ 'activity' => 'Drama' })
        )
      );
      RestContext.response = new RestResponse();
      AgentWeeks.answer(new AgentDeleteOffering());
      Test.stopTest();
      String refused = RestContext.response.responseBody.toString();
      Assert.areEqual(400, RestContext.response.statusCode, refused);
      Assert.isTrue(refused.contains('Nothing was removed'), refused);
      Assert.areEqual(1, [SELECT COUNT() FROM Offering__c WHERE Id = :row.Id]);
    }
  }
}
