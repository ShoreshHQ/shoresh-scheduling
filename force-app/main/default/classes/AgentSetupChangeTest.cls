/**
 * Changing setup fields and adding setup records through an agent or the command line
 * (docs/protocol/api.md API-1.49, API-1.50), on GeneratedTestData's synthetic camp: the setup
 * table's own row save and Add, with the table's new-row defaults and required fields, refused in
 * plain words naming what would do.
 */
@IsTest
private class AgentSetupChangeTest {
  /** POST to change or add in the camp's season; answers [status, sentence]. */
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
    RestContext.request.httpMethod = action == 'read' ? 'GET' : 'POST';
    if (action == 'read') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    AgentWeeks.Action door = action == 'change'
      ? (AgentWeeks.Action) new AgentChangeSetup()
      : action == 'read'
          ? (AgentWeeks.Action) new AgentReadSetup()
          : new AgentAddSetup();
    AgentWeeks.answer(door);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  @IsTest
  static void changingFieldsIsTheSetupTablesRowSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> read = post(
        'read',
        new Map<String, Object>{ 'kind' => 'time block', 'name' => 'Lunch' }
      );
      String lunchStart = String.valueOf(read[1])
        .substringAfter('start_time: ')
        .substringBefore(';');
      List<Object> swim = post(
        'change',
        new Map<String, Object>{
          'kind' => 'activity',
          'name' => 'swim',
          'fields' => new Map<String, Object>{
            'length' => 2,
            'location' => 'gym',
            'priority' => 'high',
            'outdoor' => 'yes'
          },
          'seen' => new Map<String, Object>{
            'length' => '1',
            'location' => 'Pool',
            'priority' => 'Low',
            'outdoor' => 'no'
          }
        }
      );
      List<Object> lunch = post(
        'change',
        new Map<String, Object>{
          'kind' => 'time block',
          'name' => 'Lunch',
          'fields' => new Map<String, Object>{ 'start_time' => '12:30 pm' },
          'seen' => new Map<String, Object>{ 'start_time' => lunchStart }
        }
      );
      List<Object> moved = post(
        'change',
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'Group A',
          'fields' => new Map<String, Object>{ 'division' => 'Seniors' },
          'seen' => new Map<String, Object>{ 'division' => 'Juniors' }
        }
      );
      List<Object> noField = post(
        'change',
        new Map<String, Object>{
          'kind' => 'location',
          'name' => 'Pool',
          'fields' => new Map<String, Object>{ 'capacity' => '4' }
        }
      );
      List<Object> noPlace = post(
        'change',
        new Map<String, Object>{
          'kind' => 'activity',
          'name' => 'Soccer',
          'fields' => new Map<String, Object>{ 'location' => 'Lake' }
        }
      );
      List<Object> badTime = post(
        'change',
        new Map<String, Object>{
          'kind' => 'time block',
          'name' => 'Lunch',
          'fields' => new Map<String, Object>{ 'end_time' => 'noonish' }
        }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(
        String.valueOf(read[1])
          .startsWith('The time block "Lunch" holds start_time: '),
        String.valueOf(read[1])
      );
      Assert.areEqual(200, swim[0], String.valueOf(swim[1]));
      Assert.areEqual(
        'Changed the activity "Swim": location gym, length 2, priority high, outdoor yes.',
        swim[1]
      );
      Activity__c activity = [
        SELECT Length__c, Location__c, Priority__c, Outdoor__c
        FROM Activity__c
        WHERE Id = :GeneratedTestData.ids.get('Swim')
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(2, activity.Length__c);
      Assert.areEqual(GeneratedTestData.ids.get('Gym'), activity.Location__c);
      Assert.areEqual('High', activity.Priority__c);
      Assert.isTrue(activity.Outdoor__c);
      Assert.areEqual(200, lunch[0], String.valueOf(lunch[1]));
      Assert.areEqual(
        Time.newInstance(12, 30, 0, 0),
        [
          SELECT StartTime__c
          FROM TimeBlock__c
          WHERE Id = :GeneratedTestData.ids.get('Lunch')
          WITH SYSTEM_MODE
        ]
        .StartTime__c
      );
      Assert.areEqual(200, moved[0], String.valueOf(moved[1]));
      Assert.areEqual(
        GeneratedTestData.ids.get('Seniors'),
        [
          SELECT Division__c
          FROM Group__c
          WHERE Id = :GeneratedTestData.ids.get('Group A')
          WITH SYSTEM_MODE
        ]
        .Division__c
      );
      Assert.areEqual(400, noField[0]);
      Assert.areEqual(
        'A location has no field "capacity". Its fields: location_type, groups_that_fit, notes.',
        noField[1]
      );
      Assert.areEqual('An activity', AgentSetupFields.aOrAn('activity'));
      Assert.areEqual(
        Time.newInstance(12, 0, 0, 0),
        AgentSetupTimes.timeOf('start_time', '12 PM')
      );
      Assert.areEqual(
        Time.newInstance(0, 15, 0, 0),
        AgentSetupTimes.timeOf('start_time', '12:15am')
      );
      Assert.areEqual(
        Time.newInstance(14, 30, 0, 0),
        AgentSetupTimes.timeOf('start_time', '14:30')
      );
      Assert.areEqual(400, noPlace[0]);
      Assert.isTrue(
        String.valueOf(noPlace[1])
          .startsWith(
            'There is no location called "Lake" that this user can see. The locations: '
          ),
        String.valueOf(noPlace[1])
      );
      Assert.areEqual(400, badTime[0]);
      Assert.areEqual('Give the end time as a time like 9:00 AM.', badTime[1]);
    }
  }

  @IsTest
  static void addingIsTheSetupTablesAdd() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> archery = post(
        'add',
        new Map<String, Object>{
          'kind' => 'activity',
          'name' => 'Archery',
          'fields' => new Map<String, Object>{ 'location' => 'Field A' }
        }
      );
      List<Object> groupD = post(
        'add',
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'Group D',
          'fields' => new Map<String, Object>{ 'division' => 'Juniors' }
        }
      );
      List<Object> cit = post(
        'add',
        new Map<String, Object>{
          'kind' => 'group',
          'name' => 'CIT',
          'program' => 'Main',
          'fields' => new Map<String, Object>{ 'division' => 'none' }
        }
      );
      List<Object> noEnd = post(
        'add',
        new Map<String, Object>{
          'kind' => 'time block',
          'name' => 'Period 3',
          'fields' => new Map<String, Object>{ 'start_time' => '2:00 PM' }
        }
      );
      List<Object> noProgram = post(
        'add',
        new Map<String, Object>{
          'kind' => 'division',
          'name' => 'Teens',
          'program' => 'Day camp'
        }
      );
      Test.stopTest();
      Assert.areEqual(200, archery[0], String.valueOf(archery[1]));
      Assert.areEqual(
        'Added the activity "Archery": location Field A.',
        archery[1]
      );
      Activity__c added = [
        SELECT Length__c, Priority__c, Location__c, SortOrder__c
        FROM Activity__c
        WHERE Name = 'Archery'
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, added.Length__c);
      Assert.areEqual('Low', added.Priority__c);
      Assert.areEqual(GeneratedTestData.ids.get('Field A'), added.Location__c);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Activity__c
          WHERE SortOrder__c >= :added.SortOrder__c AND Id != :added.Id
          WITH SYSTEM_MODE
        ],
        'A new row goes last.'
      );
      Assert.areEqual(200, groupD[0], String.valueOf(groupD[1]));
      Group__c d = [
        SELECT Division__c, Availability__c
        FROM Group__c
        WHERE Name = 'Group D'
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(GeneratedTestData.ids.get('Juniors'), d.Division__c);
      Assert.areEqual('AllDay', d.Availability__c);
      Assert.areEqual(200, cit[0], String.valueOf(cit[1]));
      Assert.isTrue(
        [
          SELECT Division__r.NoDivision__c
          FROM Group__c
          WHERE Name = 'CIT'
          WITH SYSTEM_MODE
        ]
        .Division__r.NoDivision__c
      );
      Assert.areEqual(400, noEnd[0]);
      Assert.areEqual(
        'A new time block needs these fields too: end_time.',
        noEnd[1]
      );
      Assert.areEqual(400, noProgram[0]);
      Assert.areEqual(
        'There is no program called "Day camp" that this user can see. The programs: Main.',
        noProgram[1]
      );
    }
  }

  @IsTest
  static void aChangeSomeoneMadeSinceTheReadIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id swim = GeneratedTestData.ids.get('Swim');
      Test.startTest();
      // The AI read length 1; then the director made it 3 on Camp Setup.
      update as user new Activity__c(Id = swim, Length__c = 3);
      List<Object> stale = post(
        'change',
        new Map<String, Object>{
          'kind' => 'activity',
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'length' => '2' },
          'seen' => new Map<String, Object>{ 'length' => '1' }
        }
      );
      List<Object> unseen = post(
        'change',
        new Map<String, Object>{
          'kind' => 'activity',
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'length' => '2' }
        }
      );
      List<Object> fraction = post(
        'change',
        new Map<String, Object>{
          'kind' => 'activity',
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'length' => '1.5' },
          'seen' => new Map<String, Object>{ 'length' => '3' }
        }
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        'Someone else changed "Swim" since, so nothing was saved. Read it again in Shoresh.',
        stale[1]
      );
      Assert.areEqual(
        3,
        [SELECT Length__c FROM Activity__c WHERE Id = :swim WITH SYSTEM_MODE]
        .Length__c
      );
      Assert.areEqual(400, unseen[0]);
      Assert.isTrue(
        String.valueOf(unseen[1])
          .startsWith(
            'Say what each field held when you read it (seen: length)'
          ),
        String.valueOf(unseen[1])
      );
      Assert.areEqual(400, fraction[0]);
      Assert.areEqual(
        'Give the length as a whole number, like 2.',
        fraction[1]
      );
    }
  }
}
