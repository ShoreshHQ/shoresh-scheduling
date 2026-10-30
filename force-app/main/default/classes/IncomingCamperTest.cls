/**
 * camper, coming in (IncomingCamper; docs/protocol/api.md). Every batch is sent as a user holding
 * only "Send campers"; Undo is a director's (Shoresh Scheduler). Synthetic data only.
 */
@IsTest
private class IncomingCamperTest {
  private static String body(List<Map<String, Object>> records) {
    for (Map<String, Object> record : records) {
      if (!record.containsKey('season')) {
        record.put('season', 'Summer 2026');
      }
      if (!record.containsKey('source_system')) {
        record.put('source_system', IncomingTestData.SYSTEM_NAME);
      }
    }
    return JSON.serialize(new Map<String, Object>{ 'records' => records });
  }

  private static Map<String, Object> send(List<Map<String, Object>> records) {
    return IncomingTestData.post('camper', body(records));
  }

  private static List<Camper__c> campers(Id seasonId) {
    return [
      SELECT Id, Name, OutsideId__c, Withdrawn__c
      FROM Camper__c
      WHERE Season__c = :seasonId
      WITH SYSTEM_MODE
      ORDER BY Name
    ];
  }

  // API-2.3, 2.5, 6.3: a new camper is added and said so; the same batch again changes nothing,
  // records no second import, and says so.
  @IsTest
  static void aBatchAddsCampersAndTheSameBatchAgainChangesNothing() {
    IncomingTestData camp = new IncomingTestData();
    List<Map<String, Object>> records = new List<Map<String, Object>>{
      new Map<String, Object>{
        'camper_id' => 'SYN-1',
        'camper_name' => 'Maya Cohen'
      },
      new Map<String, Object>{
        'camper_id' => 'SYN-2',
        'camper_name' => 'Eli Stone'
      }
    };
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> first = send(records);
      Assert.areEqual(200, first.get('status'));
      Assert.areEqual(
        'saved: Added this camper.',
        IncomingTestData.said(first, 1)
      );
      Assert.areEqual(2, first.get('saved'));
      Map<String, Object> again = send(records);
      Assert.areEqual(
        'unchanged: Already up to date.',
        IncomingTestData.said(again, 1)
      );
      Assert.areEqual(2, again.get('unchanged'));
    }
    Assert.areEqual(2, campers(camp.season.Id).size());
    List<Import__c> imports = camp.imports();
    Assert.areEqual(1, imports.size(), 'The second batch recorded nothing');
    Assert.areEqual('Campers from Sign-up Form', imports[0].Files__c);
  }

  // API-1.3: a Flow action and the web address give the same result for the same record.
  @IsTest
  static void aFlowActionAndTheWebAddressGiveTheSameResult() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Campers')) {
      IncomingCamper.Record byFlow = new IncomingCamper.Record();
      byFlow.season = 'Summer 2026';
      byFlow.source_system = IncomingTestData.SYSTEM_NAME;
      byFlow.camper_id = 'SYN-1';
      byFlow.camper_name = 'Maya Cohen';
      String flowSaid = IncomingTestData.said(
        IncomingCamper.camper(new List<IncomingCamper.Record>{ byFlow }),
        1
      );
      String webSaid = IncomingTestData.said(
        send(
          new List<Map<String, Object>>{
            new Map<String, Object>{
              'camper_id' => 'SYN-2',
              'camper_name' => 'Eli Stone'
            }
          }
        ),
        1
      );
      Assert.areEqual(flowSaid, webSaid);
      // And each door sees what the other saved.
      Assert.areEqual(
        'unchanged: Already up to date.',
        IncomingTestData.said(
          send(
            new List<Map<String, Object>>{
              new Map<String, Object>{
                'camper_id' => 'SYN-1',
                'camper_name' => 'Maya Cohen'
              }
            }
          ),
          1
        )
      );
    }
  }

  // API-2.1, 2.4: a name fixed in the other system updates the same camper, matched only by the
  // system and its ID; Shoresh's ID stays, and the name is still not editable in Shoresh after.
  @IsTest
  static void aNameFixedOutsideUpdatesTheSameCamper() {
    IncomingTestData camp = new IncomingTestData();
    Camper__c maya = camp.camper('Maya Cohen', 'SYN-1');
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Kohen'
          }
        }
      );
      Assert.areEqual(
        'saved: Updated: name.',
        IncomingTestData.said(answer, 1)
      );
      Database.SaveResult byHand = Database.update(
        new Camper__c(Id = maya.Id, Name = 'Maya K.'),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(
        byHand.isSuccess(),
        'The lock is lifted only in the batch'
      );
      Assert.areEqual(
        OutsideOwned.NAME_REFUSAL,
        byHand.getErrors()[0].getMessage()
      );
    }
    List<Camper__c> after = campers(camp.season.Id);
    Assert.areEqual(1, after.size());
    Assert.areEqual(maya.Id, after[0].Id);
    Assert.areEqual('Maya Kohen', after[0].Name);
  }

  // API-2.2: with no ID, a camper is matched as the import matches; an ID no camper has, for a
  // camper the import would match, is a question for a person, never a guess.
  @IsTest
  static void noIdMatchesAsTheImportAndADoubtIsAsked() {
    IncomingTestData camp = new IncomingTestData();
    Camper__c eli = camp.camper('Eli Stone', null);
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{
          new Map<String, Object>{ 'camper_name' => 'eli  stone' },
          new Map<String, Object>{
            'camper_id' => 'SYN-9',
            'camper_name' => 'Eli Stone'
          }
        }
      );
      Assert.areEqual(
        'unchanged: Already up to date.',
        IncomingTestData.said(answer, 1)
      );
      Assert.areEqual(
        'problem: ' + IncomingCampers.DOUBT,
        IncomingTestData.said(answer, 2)
      );
    }
    List<Camper__c> after = campers(camp.season.Id);
    Assert.areEqual(1, after.size(), 'No second camper was guessed');
    Assert.isNull(after[0].OutsideId__c, 'Nor was the ID given to Eli');
    List<Object> asked = (List<Object>) JSON.deserializeUntyped(
      camp.imports()[0].Open__c
    );
    Map<String, Object> question = (Map<String, Object>) asked[0];
    Assert.areEqual('incoming|camper|' + eli.Id, question.get('key'));
    Assert.isTrue(((String) question.get('title')).contains('Eli Stone'));
  }

  // API-2.2, 2.3: a batch that only asks adds its question to the last batch's import, so a
  // question alone never takes Undo away from what came before.
  @IsTest
  static void aQuestionAloneJoinsTheLastBatch() {
    IncomingTestData camp = new IncomingTestData();
    Camper__c eli = camp.camper('Eli Stone', null);
    System.runAs(camp.sender('Send_Campers')) {
      send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Cohen'
          }
        }
      );
      send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-9',
            'camper_name' => 'Eli Stone'
          }
        }
      );
    }
    List<Import__c> imports = camp.imports();
    Assert.areEqual(1, imports.size());
    Assert.isTrue(imports[0].Open__c.contains('incoming|camper|' + eli.Id));
  }

  // API-2.5: a time still to come is refused, or every real change after it would look older.
  @IsTest
  static void aChangeTimeStillToComeIsAProblem() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Campers')) {
      Assert.areEqual(
        'problem: ' + IncomingCamperPlan.FUTURE,
        IncomingTestData.said(
          send(
            new List<Map<String, Object>>{
              new Map<String, Object>{
                'camper_id' => 'SYN-1',
                'camper_name' => 'Maya Cohen',
                'changed_at' => '2099-01-01T00:00:00Z'
              }
            }
          ),
          1
        )
      );
    }
    Assert.areEqual(0, campers(camp.season.Id).size());
  }

  // API-2.5: a change older than the last one taken for that camper is ignored, and said.
  @IsTest
  static void anOlderChangeIsIgnored() {
    IncomingTestData camp = new IncomingTestData();
    camp.camper('Maya Cohen', 'SYN-1');
    System.runAs(camp.sender('Send_Campers')) {
      send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Kohen',
            'changed_at' => '2026-06-02T10:00:00Z'
          }
        }
      );
      Map<String, Object> older = send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Cohen',
            'changed_at' => '2026-06-01T10:00:00Z'
          }
        }
      );
      Assert.areEqual(
        'unchanged: Ignored: Shoresh already has a later change to this camper.',
        IncomingTestData.said(older, 1)
      );
    }
    Assert.areEqual('Maya Kohen', campers(camp.season.Id)[0].Name);
  }

  // API-4.3: nothing is deleted from outside: a withdrawn camper is kept, with their choices,
  // and left out of elective seats.
  @IsTest
  static void aWithdrawnCamperIsKeptButLeftOutOfSeats() {
    IncomingTestData camp = new IncomingTestData().withElectives();
    Camper__c maya = camp.camper('Maya Cohen', 'SYN-1');
    Database.insert(
      new Preference__c(
        ElectiveRun__c = camp.run.Id,
        Camper__c = maya.Id,
        Choices__c = '[]'
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(camp.sender('Send_Campers')) {
      Assert.areEqual(
        'saved: Updated: withdrawn.',
        IncomingTestData.said(
          send(
            new List<Map<String, Object>>{
              new Map<String, Object>{
                'camper_id' => 'SYN-1',
                'withdrawn' => true
              }
            }
          ),
          1
        )
      );
    }
    List<Camper__c> after = campers(camp.season.Id);
    Assert.areEqual(1, after.size());
    Assert.isTrue(after[0].Withdrawn__c);
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM Preference__c
        WHERE Camper__c = :maya.Id
        WITH SYSTEM_MODE
      ],
      'Their choices are kept'
    );
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Assert.isFalse(
        new ElectiveRunState(camp.run.Id).byCamper.containsKey(maya.Id),
        'Left out of seats'
      );
    }
  }

  // API-2.3: a batch is undone like any import: what it added goes, what it changed comes back.
  @IsTest
  static void undoTakesABatchBack() {
    IncomingTestData camp = new IncomingTestData();
    Camper__c maya = camp.camper('Maya Cohen', 'SYN-1');
    System.runAs(camp.sender('Send_Campers')) {
      send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Kohen'
          },
          new Map<String, Object>{
            'camper_id' => 'SYN-2',
            'camper_name' => 'Eli Stone'
          }
        }
      );
    }
    Id importId = camp.imports()[0].Id;
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      ImportUndo.Result undone = ImportUndo.undo(importId);
      Assert.areEqual(1, undone.removed);
      Assert.areEqual(1, undone.restored);
    }
    List<Camper__c> after = campers(camp.season.Id);
    Assert.areEqual(1, after.size());
    Assert.areEqual(maya.Id, after[0].Id);
    Assert.areEqual('Maya Cohen', after[0].Name);
  }

  // API-2.6: a batch from another system has its own Undo: the director's earlier import stays
  // undoable beside it, Roots shows each, and either is undone without the other.
  @IsTest
  static void aBatchKeepsItsOwnUndoBesideTheDirectors() {
    IncomingTestData camp = new IncomingTestData();
    Import__c directors = new Import__c(
      Season__c = camp.season.Id,
      Files__c = 'maple-grove.xlsx',
      Created__c = '{}',
      Changed__c = '[]'
    );
    Database.insert(directors, AccessLevel.SYSTEM_MODE);
    System.runAs(camp.sender('Send_Campers')) {
      send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Cohen'
          }
        }
      );
    }
    Id batchId = camp.imports()[0].Id;
    Assert.areNotEqual(directors.Id, batchId);
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      Test.startTest();
      SeasonSetupReader.SeasonSetup setup = SeasonSetupReader.read(
        camp.season.Id
      );
      Assert.areEqual(directors.Id, setup.lastImport.Id);
      Assert.areEqual(1, setup.lastFromOutside.size());
      Assert.areEqual(batchId, setup.lastFromOutside[0].Id);
      Assert.areEqual(
        IncomingTestData.SYSTEM_NAME,
        setup.lastFromOutside[0].Source__c
      );
      // Either order: the director's Undo first, then the batch's, each still offered.
      ImportUndo.undo(directors.Id);
      ImportUndo.undo(batchId);
      Test.stopTest();
    }
    Assert.isTrue(campers(camp.season.Id).isEmpty());
  }

  // API-2.6: undoing a batch keeps what it made that a later import of the director's changed.
  @IsTest
  static void undoingABatchKeepsWhatTheDirectorChangedSince() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Campers')) {
      send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Cohen'
          }
        }
      );
    }
    Id batchId = camp.imports()[0].Id;
    Camper__c maya = campers(camp.season.Id)[0];
    Database.insert(
      new Import__c(
        Season__c = camp.season.Id,
        Files__c = 'maple-grove.xlsx',
        Created__c = '{}',
        Changed__c = JSON.serialize(
          new List<Object>{ new Map<String, Object>{ 'id' => maya.Id } }
        )
      ),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(camp.sender('Shoresh_Scheduler')) {
      ImportUndo.Result undone = ImportUndo.undo(batchId);
      Assert.areEqual(0, undone.removed);
      Assert.areEqual(1, undone.keptEdited.size());
    }
    Assert.areEqual(1, campers(camp.season.Id).size());
  }

  // API-4.4: a key reaches only what its permission sets allow; another piece is refused whole.
  @IsTest
  static void aKeyWithoutThisPermissionSetIsRefused() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Elective_Choices')) {
      Map<String, Object> answer = send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'camper_id' => 'SYN-1',
            'camper_name' => 'Maya Cohen'
          }
        }
      );
      Assert.areEqual(403, answer.get('status'));
      Assert.areEqual(
        'This user can\'t send campers. A Salesforce admin can give it the "Send campers" permission set.',
        answer.get('message')
      );
    }
    Assert.areEqual(0, campers(camp.season.Id).size());
  }

  // API-6.3, 1.5: each record is answered on its own, in plain words: a field Shoresh doesn't
  // know, no system named, a season that isn't there; the good record still saves.
  @IsTest
  static void eachRecordIsAnsweredInPlainWords() {
    IncomingTestData camp = new IncomingTestData();
    System.runAs(camp.sender('Send_Campers')) {
      Map<String, Object> answer = IncomingTestData.post(
        'camper',
        JSON.serialize(
          new Map<String, Object>{
            'records' => new List<Object>{
              new Map<String, Object>{
                'season' => 'Summer 2026',
                'source_system' => 'Sign-up Form',
                'camper_id' => 'SYN-1',
                'camper_name' => 'Maya Cohen'
              },
              new Map<String, Object>{
                'season' => 'Summer 2026',
                'source_system' => 'Sign-up Form',
                'entity_id' => 'SYN-2'
              },
              new Map<String, Object>{
                'season' => 'Summer 2026',
                'camper_name' => 'Eli Stone'
              }
            }
          }
        )
      );
      Assert.areEqual(
        'saved: Added this camper.',
        IncomingTestData.said(answer, 1)
      );
      Assert.isTrue(
        IncomingTestData.said(answer, 2)
          .startsWith('problem: Shoresh doesn\'t know the field "entity_id".')
      );
      Assert.areEqual(
        'problem: Say which system this comes from (source_system), as the camp calls it.',
        IncomingTestData.said(answer, 3)
      );
      Map<String, Object> noSeason = send(
        new List<Map<String, Object>>{
          new Map<String, Object>{
            'season' => 'Summer 2031',
            'camper_name' => 'Eli Stone'
          }
        }
      );
      Assert.areEqual(
        'problem: There is no season called "Summer 2031" that this user can see.',
        IncomingTestData.said(noSeason, 1)
      );
      Map<String, Object> notJson = IncomingTestData.post('camper', 'campers');
      Assert.areEqual(400, notJson.get('status'));
      Assert.areEqual(
        'Send JSON like {"records": [ { ... }, { ... } ]}.',
        notJson.get('message')
      );
    }
  }
}
