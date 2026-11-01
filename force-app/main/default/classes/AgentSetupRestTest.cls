/**
 * The rest of Camp Setup through an agent or the command line (docs/protocol/api.md API-1.51,
 * API-1.52, and API-1.49/API-1.50's notes and groups that fit), on GeneratedTestData's synthetic
 * camp: each the screen's own save, refused with nothing saved when what the AI saw has changed.
 */
@IsTest
private class AgentSetupRestTest {
  /** One request to a door in the season named; answers [status, sentence]. */
  private static List<Object> ask(
    AgentWeeks.Action door,
    String method,
    String season,
    Map<String, Object> fields
  ) {
    Map<String, Object> body = new Map<String, Object>{ 'season' => season };
    body.putAll(fields);
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    AgentWeeks.answer(door);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static String seasonName() {
    return [
      SELECT Name
      FROM Season__c
      WHERE Id = :GeneratedTestData.ids.get('Season')
      WITH SYSTEM_MODE
    ]
    .Name;
  }

  @IsTest
  static void activityRulesAreTheDetailsPanelsSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      String season = seasonName();
      Id swim = GeneratedTestData.ids.get('Swim');
      Test.startTest();
      List<Object> read = ask(
        new AgentReadActivityRules(),
        'GET',
        season,
        new Map<String, Object>{ 'name' => 'swim' }
      );
      List<Object> changed = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{
            'who_can_do_it' => 'Group B, juniors',
            'same_division_only' => 'yes',
            'notes' => 'Bring towels\nand goggles'
          },
          'seen' => new Map<String, Object>{
            'who_can_do_it' => 'Group A',
            'same_division_only' => 'No',
            'notes' => '(blank)'
          }
        }
      );
      // Read back as one line; sent back so, it is what was seen (line breaks and all).
      List<Object> again = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{
            'early_week_count' => '1',
            'early_week_by_day' => 'Wednesday'
          },
          'seen' => new Map<String, Object>{
            'early_week_count' => '(blank)',
            'early_week_by_day' => '(blank)'
          }
        }
      );
      List<Object> notesAgain = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'notes' => 'Towels' },
          'seen' => new Map<String, Object>{
            'notes' => 'Bring towels and goggles'
          }
        }
      );
      // The director changed who can do it on the panel since the AI read it.
      update as user new Activity__c(Id = swim, SameDivisionOnly__c = false);
      List<Object> stale = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'same_division_only' => 'yes' },
          'seen' => new Map<String, Object>{ 'same_division_only' => 'yes' }
        }
      );
      List<Object> casing = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'notes' => 'x' },
          'seen' => new Map<String, Object>{ 'notes' => 'towels' }
        }
      );
      List<Object> unseen = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'notes' => 'x' }
        }
      );
      List<Object> nobody = ask(
        new AgentChangeActivityRules(),
        'POST',
        season,
        new Map<String, Object>{
          'name' => 'Swim',
          'fields' => new Map<String, Object>{ 'who_can_do_it' => 'Lake' },
          'seen' => new Map<String, Object>{
            'who_can_do_it' => 'Group B, Juniors'
          }
        }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.areEqual(
        'The activity "Swim" details hold who_can_do_it: Group A; same_division_only: no; early_week_count: (blank); early_week_by_day: (blank); notes: (blank). Send these back as seen when changing them.',
        read[1]
      );
      Assert.areEqual(200, changed[0], String.valueOf(changed[1]));
      Assert.areEqual(
        'Changed the activity "Swim": who can do it Group B, juniors, same division only yes, notes Bring towels and goggles.',
        changed[1]
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c = :swim
          WITH SYSTEM_MODE
        ]
      );
      Assert.areEqual(200, again[0], String.valueOf(again[1]));
      Assert.areEqual(200, notesAgain[0], String.valueOf(notesAgain[1]));
      Activity__c now = [
        SELECT Notes__c, EarlyWeekCount__c, EarlyWeekByDay__c
        FROM Activity__c
        WHERE Id = :swim
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Towels', now.Notes__c);
      Assert.areEqual(1, now.EarlyWeekCount__c);
      Assert.areEqual('Wednesday', now.EarlyWeekByDay__c);
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c = :swim
          WITH SYSTEM_MODE
        ],
        'Who can do it stays when only rules change.'
      );
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        'Someone else changed "Swim" since, so nothing was saved. Read it again in Shoresh.',
        stale[1]
      );
      Assert.areEqual(
        409,
        casing[0],
        'Notes are compared with their capitals.'
      );
      Assert.areEqual(400, unseen[0]);
      Assert.isTrue(
        String.valueOf(unseen[1])
          .startsWith(
            'Say what each field held when you read it (seen: notes)'
          ),
        String.valueOf(unseen[1])
      );
      Assert.areEqual(400, nobody[0]);
      Assert.isTrue(
        String.valueOf(nobody[1])
          .startsWith(
            'There is no division or group called "Lake" that this user can see.'
          ),
        String.valueOf(nobody[1])
      );
    }
  }

  @IsTest
  static void fillInWeeksIsCampSetupsWithTheDatesSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id campId = [
        SELECT Camp__c
        FROM Season__c
        WHERE Id = :GeneratedTestData.ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Camp__c;
      Season__c empty = ShoreshTestData.season(campId, 'Fill test summer');
      Test.startTest();
      List<Object> stale = ask(
        new AgentFillWeeks(),
        'POST',
        empty.Name,
        new Map<String, Object>{
          'seen' => new Map<String, Object>{
            'start_date' => '2026-06-22',
            'end_date' => '2026-08-07'
          }
        }
      );
      Integer afterStale = [
        SELECT COUNT()
        FROM Week__c
        WHERE Season__c = :empty.Id
        WITH SYSTEM_MODE
      ];
      List<Object> filled = ask(
        new AgentFillWeeks(),
        'POST',
        empty.Name,
        new Map<String, Object>{
          'seen' => new Map<String, Object>{
            'start_date' => '2026-06-29',
            'end_date' => '2026-08-07'
          }
        }
      );
      List<Object> twice = ask(
        new AgentFillWeeks(),
        'POST',
        empty.Name,
        new Map<String, Object>{
          'seen' => new Map<String, Object>{
            'start_date' => '2026-06-29',
            'end_date' => '2026-08-07'
          }
        }
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(0, afterStale);
      Assert.areEqual(200, filled[0], String.valueOf(filled[1]));
      Assert.isTrue(
        String.valueOf(filled[1])
          .startsWith(
            'Added 6 weeks from the dates of "Fill test summer": Week 1 (2026-06-29 to 2026-07-03), '
          ),
        String.valueOf(filled[1])
      );
      Assert.areEqual(400, twice[0]);
      Assert.areEqual(
        'No weeks added. This season already has weeks. Add more one at a time.',
        twice[1]
      );
    }
  }

  @IsTest
  static void notesWithLineBreaksAndGroupsThatFitAsTheTableHasThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      String season = seasonName();
      Id pool = GeneratedTestData.ids.get('Pool');
      update as user new Location__c(
        Id = pool,
        Notes__c = 'Deep end\nShallow end'
      );
      Test.startTest();
      List<Object> read = ask(
        new AgentReadSetup(),
        'GET',
        season,
        new Map<String, Object>{ 'kind' => 'location', 'name' => 'Pool' }
      );
      String notes = String.valueOf(read[1])
        .substringAfter('notes: ')
        .substringBefore('. Send');
      List<Object> changed = ask(
        new AgentChangeSetup(),
        'POST',
        season,
        new Map<String, Object>{
          'kind' => 'location',
          'name' => 'Pool',
          'fields' => new Map<String, Object>{ 'notes' => 'Deep end only' },
          'seen' => new Map<String, Object>{ 'notes' => notes }
        }
      );
      List<Object> none = ask(
        new AgentAddSetup(),
        'POST',
        season,
        new Map<String, Object>{
          'kind' => 'location',
          'name' => 'Lake',
          'fields' => new Map<String, Object>{ 'groups_that_fit' => '0' }
        }
      );
      Test.stopTest();
      Assert.areEqual('Deep end Shallow end', notes);
      Assert.areEqual(200, changed[0], String.valueOf(changed[1]));
      Assert.areEqual(
        'Deep end only',
        [SELECT Notes__c FROM Location__c WHERE Id = :pool WITH SYSTEM_MODE]
        .Notes__c
      );
      Assert.areEqual(400, none[0]);
      Assert.areEqual(
        'Give the groups that fit as a whole number, 1 or more.',
        none[1]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Location__c WHERE Name = 'Lake' WITH SYSTEM_MODE]
      );
    }
  }
}
