/**
 * camper_group, coming in (IncomingCamperGroup; docs/protocol/api.md). Every batch is sent as a
 * user holding only "Send camper groups". Synthetic data only.
 */
@IsTest
private class IncomingCamperGroupTest {
  private class Camp {
    IncomingTestData data = new IncomingTestData().withElectives();
    Camper__c maya = data.camper('Maya Cohen', 'SYN-1');
    Preference__c choices;

    Camp() {
      choices = new Preference__c(
        ElectiveRun__c = data.run.Id,
        Camper__c = maya.Id,
        Group__c = data.ids.get('Group A'),
        Choices__c = '[]'
      );
      Database.insert(choices, AccessLevel.SYSTEM_MODE);
    }

    Id bunk() {
      return [
        SELECT Group__c
        FROM Preference__c
        WHERE Id = :choices.Id
        WITH SYSTEM_MODE
      ]
      .Group__c;
    }
  }

  private static Map<String, Object> send(String bunk, String week) {
    Map<String, Object> record = new Map<String, Object>{
      'season' => 'Summer 2026',
      'source_system' => IncomingTestData.SYSTEM_NAME,
      'camper_id' => 'SYN-1',
      'bunk' => bunk
    };
    if (week != null) {
      record.put('week', week);
    }
    return IncomingTestData.post(
      'camper_group',
      JSON.serialize(
        new Map<String, Object>{ 'records' => new List<Object>{ record } }
      )
    );
  }

  // API-2.4, 4.2, 2.5: a bunk move from outside moves the same camper, only inside the save; the
  // same move again changes nothing.
  @IsTest
  static void aBunkMoveFromOutsideMovesTheSameCamper() {
    Camp camp = new Camp();
    System.runAs(camp.data.sender('Send_Camper_Groups')) {
      Assert.areEqual(
        'saved: Saved.',
        IncomingTestData.said(send('group b', 'Week 1'), 1)
      );
      Assert.areEqual(
        'unchanged: Already in that group.',
        IncomingTestData.said(send('Group B', null), 1)
      );
      Database.SaveResult byHand = Database.update(
        new Preference__c(
          Id = camp.choices.Id,
          Group__c = camp.data.ids.get('Group A')
        ),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(
        byHand.isSuccess(),
        'The lock is lifted only in the batch'
      );
    }
    Assert.areEqual(camp.data.ids.get('Group B'), camp.bunk());
    Assert.areEqual(1, camp.data.imports().size());
  }

  // API-1.5: the refusal of a bunk changed in Shoresh uses the camp's own word for groups.
  @IsTest
  static void aBunkChangedInShoreshIsRefusedInTheCampsWord() {
    Camp camp = new Camp();
    Database.insert(
      new CampLabel__c(
        Camp__c = [
          SELECT Camp__c
          FROM Season__c
          WHERE Id = :camp.data.season.Id
          WITH SYSTEM_MODE
        ]
        .Camp__c,
        ModelTerm__c = 'Group',
        Singular__c = 'Bunk',
        Plural__c = 'Bunks'
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(camp.data.sender('Shoresh_Scheduler')) {
      Database.SaveResult byHand = Database.update(
        new Preference__c(
          Id = camp.choices.Id,
          Group__c = camp.data.ids.get('Group B')
        ),
        false,
        AccessLevel.USER_MODE
      );
      Assert.areEqual(
        'Bunks come from the camp\'s sign-up list or other system. Change it there and bring it in again.',
        byHand.getErrors()[0].getMessage()
      );
    }
  }

  // API-6.3, 6.4: a bunk Shoresh doesn't have, or a week with no electives, is a problem, said plainly.
  @IsTest
  static void anUnknownBunkOrWeekIsAProblem() {
    Camp camp = new Camp();
    System.runAs(camp.data.sender('Send_Camper_Groups')) {
      Assert.areEqual(
        'problem: There is no group called "Cabin 9" in this season, or more than one.',
        IncomingTestData.said(send('Cabin 9', null), 1)
      );
      Assert.areEqual(
        'problem: There are no electives in "Week 9" in this season.',
        IncomingTestData.said(send('Group B', 'Week 9'), 1)
      );
      // API-6.4: a week of the season with no choices yet says what to send first.
      Assert.areEqual(
        'problem: There are no elective choices in "Week 6" yet, and Shoresh keeps a camper\'s group with their choices. Send their elective choices first, then this again.',
        IncomingTestData.said(send('Group B', 'Week 6'), 1)
      );
    }
    Assert.areEqual(camp.data.ids.get('Group A'), camp.bunk());
  }

  // API-2.3: Undo last import puts the bunk back.
  @IsTest
  static void undoPutsTheBunkBack() {
    Camp camp = new Camp();
    System.runAs(camp.data.sender('Send_Camper_Groups')) {
      send('Group B', null);
    }
    System.runAs(camp.data.sender('Shoresh_Scheduler')) {
      ImportUndo.undo(camp.data.imports()[0].Id);
    }
    Assert.areEqual(camp.data.ids.get('Group A'), camp.bunk());
  }

  // API-4.4: only "Send camper groups" moves a bunk.
  @IsTest
  static void anotherPieceCannotMoveABunk() {
    Camp camp = new Camp();
    System.runAs(camp.data.sender('Send_Campers')) {
      Assert.areEqual(403, send('Group B', null).get('status'));
    }
    Assert.areEqual(camp.data.ids.get('Group A'), camp.bunk());
  }
}
