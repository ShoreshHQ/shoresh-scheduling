/**
 * Linked choices through an AI (docs/protocol/api.md API-1.131 to API-1.134): the read, each change
 * through the editor's own save and the delete's question. Every test acts as a scheduler with only
 * the Shoresh Scheduler permission set. Names are made up.
 */
@IsTest
private class AgentLinkedChoicesTest {
  private static Id save(LinkedChoiceSaves.Edit edit) {
    return LinkedChoicesController.saveLinkedChoice(JSON.serialize(edit));
  }

  private static LinkedChoice__c saved(Id choiceId) {
    return [
      SELECT
        Name,
        AppliesTo__c,
        (SELECT Weekday__c, TimeBlock__c FROM Times__r ORDER BY Weekday__c),
        (SELECT Division__c FROM Coverages__r)
      FROM LinkedChoice__c
      WHERE Id = :choiceId
    ];
  }

  /** "Drama" through the AI's own make, on Monday's Period 1. */
  private static Id made(LinkedChoicesMenu menu) {
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
    return [SELECT Id FROM LinkedChoice__c WHERE Name = 'Drama' LIMIT 1].Id;
  }

  // API-1.131
  @IsTest
  static void anAgentReadsWhatTheEditorReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.params.put('elective_set', 'chugim');
      RestContext.request.params.put(
        'season',
        (String) menu.at(new Map<String, Object>()).get('season')
      );
      RestContext.response = new RestResponse();
      AgentLinkedChoices.get();
      Test.stopTest();
      String text = RestContext.response.responseBody.toString();
      Assert.areEqual(200, RestContext.response.statusCode, text);
      Map<String, Object> read = (Map<String, Object>) JSON.deserializeUntyped(
        text
      );
      Assert.areEqual(
        new Set<String>{
          'elective_set',
          'set_id',
          'setup',
          'labels',
          'places',
          'season'
        },
        read.keySet()
      );
      Assert.areEqual(menu.setId, read.get('set_id'));
      Assert.areEqual(
        3,
        ((List<Object>) ((Map<String, Object>) read.get('places')).get('cells'))
          .size()
      );
    }
  }

  // API-1.132
  @IsTest
  static void anAgentMakesOneThroughTheEditorsSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Test.startTest();
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentMakeLinkedChoice(),
        menu.at(
          new Map<String, Object>{
            'activity' => 'drama',
            'name' => 'Drama double',
            'periods' => LinkedChoicesMenu.periods('Monday', 'Period 1'),
            'applies_to' => 'only these',
            'divisions' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Made the linked choice "Drama double".', answer[1]);
      LinkedChoice__c choice = saved(
        [SELECT Id FROM LinkedChoice__c WHERE Name = 'Drama double'].Id
      );
      Assert.areEqual('OnlyThese', choice.AppliesTo__c);
      Assert.areEqual(1, choice.Times__r.size());
      Assert.areEqual(
        menu.ids.get('Period 1'),
        choice.Times__r[0].TimeBlock__c
      );
      Assert.areEqual(
        menu.ids.get('Juniors'),
        choice.Coverages__r[0].Division__c
      );
    }
  }

  // API-1.132
  @IsTest
  static void anAgentIsRefusedWhatTheEditorDoesntOffer() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Test.startTest();
      Map<String, Object> notThere = new Map<String, Object>{
        'activity' => 'Drama',
        'name' => 'Drama',
        'periods' => LinkedChoicesMenu.periods('Friday', 'Period 1')
      };
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentMakeLinkedChoice(),
        menu.at(notThere)
      );
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'Chugim isn\'t at Friday Period 1 on any schedule. Nothing was changed.',
        answer[1]
      );
      Map<String, Object> none = new Map<String, Object>{
        'activity' => 'Drama',
        'name' => 'Drama'
      };
      Assert.areEqual(
        400,
        LinkedChoicesMenu.sent(new AgentMakeLinkedChoice(), menu.at(none))[0]
      );
      Map<String, Object> notOffered = new Map<String, Object>{
        'activity' => 'Archery',
        'name' => 'Archery',
        'periods' => LinkedChoicesMenu.periods('Monday', 'Period 1')
      };
      answer = LinkedChoicesMenu.sent(
        new AgentMakeLinkedChoice(),
        menu.at(notOffered)
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('It offers: Drama'));
      // Divisions while it applies to All, one not there, nothing a name, and a name too long.
      for (
        Map<String, Object> more : new List<Map<String, Object>>{
          new Map<String, Object>{
            'divisions' => new List<Object>{ 'Juniors' }
          },
          new Map<String, Object>{
            'applies_to' => 'Only these',
            'divisions' => new List<Object>{ 'Nobody' }
          },
          new Map<String, Object>{
            'applies_to' => 'Only these',
            'divisions' => new List<Object>{ null }
          },
          new Map<String, Object>{ 'name' => 'x'.repeat(81) }
        }
      ) {
        Map<String, Object> refused = new Map<String, Object>{
          'activity' => 'Drama',
          'name' => 'Drama',
          'periods' => LinkedChoicesMenu.periods('Monday', 'Period 1')
        };
        refused.putAll(more);
        answer = LinkedChoicesMenu.sent(
          new AgentMakeLinkedChoice(),
          menu.at(refused)
        );
        Assert.areEqual(400, answer[0], String.valueOf(answer[1]));
      }
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoice__c]);
    }
  }

  // API-1.132
  @IsTest
  static void aSetOnNoScheduleHasNothingToMakeOneOn() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Database.delete(
        [SELECT Id FROM Schedule__c WHERE Origin__c = 'Manual'],
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentMakeLinkedChoice(),
        menu.at(
          new Map<String, Object>{
            'activity' => 'Drama',
            'name' => 'Drama',
            'periods' => LinkedChoicesMenu.periods('Monday', 'Period 1')
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'Chugim isn\'t on any schedule, so no linked choice can be made for it. Nothing was changed.',
        answer[1]
      );
    }
  }

  // API-1.133
  @IsTest
  static void anAgentChangesOneThroughTheEditorsSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Id choiceId = made(menu);
      Test.startTest();
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentChangeLinkedChoice(),
        menu.at(
          new Map<String, Object>{
            'name' => 'drama',
            'new_name' => 'Drama double',
            'applies_to' => 'All except',
            'periods_on' => LinkedChoicesMenu.periods('Tuesday', 'Lunch'),
            'periods_off' => LinkedChoicesMenu.periods('Monday', 'Period 1'),
            'divisions_on' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Changed the linked choice "Drama double".', answer[1]);
      LinkedChoice__c choice = saved(choiceId);
      Assert.areEqual('Drama double', choice.Name);
      Assert.areEqual('AllExcept', choice.AppliesTo__c);
      Assert.areEqual(1, choice.Times__r.size());
      Assert.areEqual('Tuesday', choice.Times__r[0].Weekday__c);
      Assert.areEqual(1, choice.Coverages__r.size());
      // A later change of one that names a division the set also sits in.
      Assert.areEqual(
        200,
        LinkedChoicesMenu.sent(
          new AgentChangeLinkedChoice(),
          menu.at(
            new Map<String, Object>{
              'name' => 'Drama double',
              'new_name' => 'Drama twice',
              'divisions_off' => new List<Object>{ 'Juniors' }
            }
          )
        )[0]
      );
      Test.stopTest();
      Assert.areEqual(0, saved(choiceId).Coverages__r.size());
    }
  }

  // API-1.132
  @IsTest
  static void whatTwoProgramsShareIsAskedAboutNeverPicked() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Program__c teen = new Program__c(
        Season__c = menu.ids.get('Season'),
        Name = 'Teen'
      );
      Database.insert(teen, AccessLevel.USER_MODE);
      Division__c juniors = new Division__c(
        Program__c = teen.Id,
        Name = 'Juniors'
      );
      TimeBlock__c period = [
        SELECT StartTime__c, EndTime__c
        FROM TimeBlock__c
        WHERE Id = :menu.ids.get('Period 1')
      ];
      TimeBlock__c block = new TimeBlock__c(
        Program__c = teen.Id,
        Name = 'Period 1',
        StartTime__c = period.StartTime__c,
        EndTime__c = period.EndTime__c
      );
      Database.insert(
        new List<SObject>{ juniors, block },
        AccessLevel.USER_MODE
      );
      Test.startTest();
      AgentLinkedChoiceRefs refs = new AgentLinkedChoiceRefs(
        menu.at(new Map<String, Object>())
      );

      AgentLinkedDivisions divisions = new AgentLinkedDivisions(refs);
      List<Division__c> both = [
        SELECT Id, Name, Program__r.Name
        FROM Division__c
        WHERE Name = 'Juniors'
      ];
      Assert.areEqual(2, both.size());
      List<Division__c> reversed = new List<Division__c>{ both[1], both[0] };
      for (
        List<Division__c> offered : new List<List<Division__c>>{
          both,
          reversed
        }
      ) {
        try {
          divisions.idsOf(new List<Object>{ 'Juniors' }, offered);
          Assert.fail('A division two programs share was picked');
        } catch (ShoreshException e) {
          // The same words whichever order they come in.
          Assert.isTrue(
            e.getMessage().contains(' and Teen both have'),
            e.getMessage()
          );
        }
      }
      Assert.areEqual(
        juniors.Id,
        divisions.idsOf(
          new List<Object>{
            new Map<String, Object>{ 'name' => 'Juniors', 'program' => 'Teen' }
          },
          both
        )[0]
      );

      Set<String> offered = new Set<String>{
        'Monday|' + block.Id,
        'Monday|' + menu.ids.get('Period 1')
      };
      AgentLinkedPeriods periods = new AgentLinkedPeriods(refs);
      List<Object> asked = LinkedChoicesMenu.periods('Monday', 'Period 1');
      try {
        periods.of(asked, offered);
        Assert.fail('A time block two programs share was picked');
      } catch (ShoreshException e) {
        // In a fixed order, so the same ask gets the same words.
        Assert.isTrue(
          e.getMessage().startsWith('Main and Teen both have'),
          e.getMessage()
        );
      }
      // Its own period settles it, when unticking.
      periods.held = new Set<String>{ 'Monday|' + block.Id };
      Assert.areEqual(block.Id, periods.of(asked, offered)[0].blockId);
      Test.stopTest();
    }
  }

  // API-1.133: asked through the tool itself; what it holds settles it, so nothing is asked.
  @IsTest
  static void unTickingAPeriodItHoldsAsksNothingWhenTwoProgramsShareTheName() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Program__c teen = new Program__c(
        Season__c = menu.ids.get('Season'),
        Name = 'Teen'
      );
      Database.insert(teen, AccessLevel.USER_MODE);
      TimeBlock__c period = [
        SELECT StartTime__c, EndTime__c
        FROM TimeBlock__c
        WHERE Id = :menu.ids.get('Period 1')
      ];
      TimeBlock__c block = new TimeBlock__c(
        Program__c = teen.Id,
        Name = 'Period 1',
        StartTime__c = period.StartTime__c,
        EndTime__c = period.EndTime__c
      );
      Database.insert(block, AccessLevel.USER_MODE);
      LinkedChoiceSaves.Period teens = new LinkedChoiceSaves.Period();
      teens.weekday = 'Monday';
      teens.blockId = block.Id;
      LinkedChoiceSaves.Edit first = new LinkedChoiceSaves.Edit();
      first.offeringId = menu.dramaId;
      first.name = 'Drama';
      first.periodsOn.add(teens);
      first.periodsOn.add(menu.period('Tuesday', 'Period 1'));
      Id choiceId = save(first);
      Test.startTest();
      // Main's Period 1 sits on Monday too, so the name alone is two places.
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentChangeLinkedChoice(),
        menu.at(
          new Map<String, Object>{
            'name' => 'Drama',
            'periods_off' => LinkedChoicesMenu.periods('Monday', 'Period 1')
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      List<LinkedChoiceTime__c> left = saved(choiceId).Times__r;
      Assert.areEqual(1, left.size());
      Assert.areEqual('Tuesday', left[0].Weekday__c);
    }
  }

  // API-1.133: asked through the tool itself, as for a period.
  @IsTest
  static void unTickingADivisionItNamesAsksNothingWhenTwoProgramsShareTheName() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Id choiceId = made(menu);
      Program__c teen = new Program__c(
        Season__c = menu.ids.get('Season'),
        Name = 'Teen'
      );
      Database.insert(teen, AccessLevel.USER_MODE);
      Division__c juniors = new Division__c(
        Program__c = teen.Id,
        Name = 'Juniors'
      );
      Database.insert(juniors, AccessLevel.USER_MODE);
      LinkedChoiceSaves.Edit named = new LinkedChoiceSaves.Edit();
      named.id = choiceId;
      named.appliesTo = 'OnlyThese';
      named.divisionsOn.add(menu.ids.get('Juniors'));
      save(named);
      Test.startTest();
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentChangeLinkedChoice(),
        menu.at(
          new Map<String, Object>{
            'name' => 'Drama',
            'divisions_off' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual(0, saved(choiceId).Coverages__r.size());
    }
  }

  // API-1.133
  @IsTest
  static void anAgentsTickTwiceIsOneTick() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Id choiceId = made(menu);
      Test.startTest();
      for (Integer i = 0; i < 2; i++) {
        Assert.areEqual(
          200,
          LinkedChoicesMenu.sent(
            new AgentChangeLinkedChoice(),
            menu.at(
              new Map<String, Object>{
                'name' => 'Drama',
                'periods_on' => LinkedChoicesMenu.periods('Tuesday', 'Period 1')
              }
            )
          )[0]
        );
      }
      // Unticking what is already off is the same as once.
      for (Integer i = 0; i < 2; i++) {
        Assert.areEqual(
          200,
          LinkedChoicesMenu.sent(
            new AgentChangeLinkedChoice(),
            menu.at(
              new Map<String, Object>{
                'name' => 'Drama',
                'periods_off' => LinkedChoicesMenu.periods('Tuesday', 'Lunch')
              }
            )
          )[0]
        );
      }
      Test.stopTest();
      Assert.areEqual(2, saved(choiceId).Times__r.size());
    }
  }

  // API-1.133
  @IsTest
  static void aNameTwoShareIsAskedAboutAndDivisionsNeedOnlyThese() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      made(menu);
      Test.startTest();
      // The editor shows no divisions to tick while it applies to All; a blank name is its words.
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentChangeLinkedChoice(),
        menu.at(
          new Map<String, Object>{
            'name' => 'Drama',
            'divisions_on' => new List<Object>{ 'Juniors' }
          }
        )
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('applies to All'));
      answer = LinkedChoicesMenu.sent(
        new AgentChangeLinkedChoice(),
        menu.at(new Map<String, Object>{ 'name' => 'Drama', 'new_name' => ' ' })
      );
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(
        String.valueOf(answer[1]).startsWith('Give the linked choice a name')
      );
      // A second of one name is saved, as the editor saves it; then which one is asked.
      Assert.areEqual(
        200,
        LinkedChoicesMenu.sent(
          new AgentMakeLinkedChoice(),
          menu.at(
            new Map<String, Object>{
              'activity' => 'Drama',
              'name' => 'Drama',
              'periods' => LinkedChoicesMenu.periods('Tuesday', 'Period 1')
            }
          )
        )[0]
      );
      answer = LinkedChoicesMenu.sent(
        new AgentDeleteLinkedChoice(),
        menu.at(new Map<String, Object>{ 'name' => 'Drama' })
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.isTrue(String.valueOf(answer[1]).contains('can\'t tell which'));
      Assert.areEqual(2, [SELECT COUNT() FROM LinkedChoice__c]);
    }
  }

  // API-1.134
  @IsTest
  static void anAgentsDeleteAsksTheScreensQuestionAndTakesItsRows() {
    System.runAs(ShoreshTestData.scheduler()) {
      LinkedChoicesMenu menu = new LinkedChoicesMenu();
      Id choiceId = made(menu);
      Map<String, Object> asked = menu.at(
        new Map<String, Object>{ 'name' => 'Drama' }
      );
      Test.startTest();
      // The helper refuses a delete that doesn't ask; what it asks is the screen's own.
      Assert.areEqual(
        'Delete "Drama"? A sheet that names it then counts as Drama.',
        SetupDelete.preview(choiceId).message
      );
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(asked));
      Assert.areEqual(
        'Delete "Drama"? A sheet that names it then counts as Drama.',
        new AgentDeleteLinkedChoice().preview()
      );
      List<Object> answer = LinkedChoicesMenu.sent(
        new AgentDeleteLinkedChoice(),
        asked
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Deleted "Drama".', answer[1]);
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoice__c]);
      Assert.areEqual(0, [SELECT COUNT() FROM LinkedChoiceTime__c]);
    }
  }
}
