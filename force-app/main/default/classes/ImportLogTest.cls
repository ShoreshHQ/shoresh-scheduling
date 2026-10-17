/**
 * Import security hardening: what Undo last import trusts (an import's record) is the server's
 * to write, not the scheduler's; and weeks added between a workbook's preview and its save are
 * said plainly. Made-up camp only.
 */
@IsTest
private class ImportLogTest {
  private static Season__c season() {
    Camp__c camp = ShoreshTestData.camp('Birch Hollow (made up)');
    return ShoreshTestData.season(camp.Id, 'Summer 2026');
  }

  /** A workbook that only adds a week (Jun 29 2026, in the season). */
  private static ImportSetupSaves.Result importAWeek(Id seasonId) {
    return ImportController.saveWorkbook(
      JSON.serialize(
        new Map<String, Object>{
          'seasonId' => seasonId,
          'files' => 'camp.xlsx',
          'records' => new List<Object>{
            new Map<String, Object>{
              'kind' => 'Week',
              'key' => 'Week:2026-06-29',
              'fields' => new Map<String, Object>{
                'Name' => 'Week 1',
                'StartDate__c' => '2026-06-29',
                'EndDate__c' => '2026-07-03'
              },
              'refs' => new Map<String, Object>()
            }
          },
          'campWords' => new List<Object>(),
          'remember' => new List<Object>(),
          'forget' => new List<Object>()
        }
      )
    );
  }

  private static void expectRefused(Import__c edit) {
    try {
      Database.update(edit, AccessLevel.USER_MODE);
      Assert.fail('an import\'s record is not the scheduler\'s to edit');
    } catch (TypeException e) {
      expectNoAccess(e, 'UPDATE');
    }
  }

  /** The platform's refusal for an object the person has no permission on, nothing else. */
  private static void expectNoAccess(TypeException e, String operation) {
    Assert.areEqual(
      'DML operation ' + operation + ' not allowed on Import__c',
      e.getMessage()
    );
  }

  /**
   * A scheduler can't edit an import's log or when it was undone, nor delete an import; import
   * and Undo still work (the server writes those fields).
   */
  @IsTest
  static void aSchedulerCantEditOrDeleteAnImportsRecordButImportAndUndoWork() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c s = season();
      ImportSetupSaves.Result result = importAWeek(s.Id);
      expectRefused(new Import__c(Id = result.importId, Created__c = '{}'));
      expectRefused(new Import__c(Id = result.importId, Changed__c = '[]'));
      expectRefused(
        new Import__c(Id = result.importId, UndoneAt__c = Datetime.now())
      );
      try {
        Database.delete(result.importId, AccessLevel.USER_MODE);
        Assert.fail('an import is not the scheduler\'s to delete');
      } catch (TypeException e) {
        expectNoAccess(e, 'DELETE');
      }
      Import__c kept = [
        SELECT Created__c, UndoneAt__c
        FROM Import__c
        WHERE Id = :result.importId
      ];
      Assert.isTrue(kept.Created__c.contains('Week'));
      Assert.isNull(kept.UndoneAt__c);

      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isNotNull(
        [SELECT UndoneAt__c FROM Import__c WHERE Id = :result.importId]
        .UndoneAt__c
      );
      Assert.areEqual(0, [SELECT COUNT() FROM Week__c WHERE Season__c = :s.Id]);
    }
  }

  /** Weeks added between the preview and the save: said plainly, not "add one at a time". */
  @IsTest
  static void weeksAddedSinceThePreviewAreSaidPlainly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c s = season();
      ShoreshTestData.weeks(s.Id, 1);
      try {
        ImportController.saveWorkbook(
          JSON.serialize(
            new Map<String, Object>{
              'seasonId' => s.Id,
              'files' => 'camp.xlsx',
              'records' => new List<Object>(),
              'campWords' => new List<Object>(),
              'fillWeeks' => new List<Object>{
                new Map<String, Object>{
                  'start' => '2026-06-29',
                  'name' => 'Week 1'
                }
              }
            }
          )
        );
        Assert.fail('weeks added since the preview must be refused');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'The weeks changed since you chose the file. Choose it again.',
          e.getMessage()
        );
      }
    }
  }

  /** No one adds an import by hand: a blank one would become "the last import". */
  @IsTest
  static void aSchedulerCantAddAnImportByHand() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c s = season();
      try {
        Database.insert(new Import__c(Season__c = s.Id), AccessLevel.USER_MODE);
        Assert.fail('an import is not the scheduler\'s to add');
      } catch (TypeException e) {
        expectNoAccess(e, 'INSERT');
      }
      Assert.areEqual(0, [SELECT COUNT() FROM Import__c]);
    }
  }

  /**
   * Someone who can only read the season can't mark its import undone, even when everything
   * Undo puts back (a camp word) is theirs to change: nothing is undone.
   */
  @IsTest
  static void someoneWhoCanOnlyReadTheSeasonCantUndoItsImport() {
    User owner = ShoreshTestData.scheduler();
    User reader = ShoreshTestData.scheduler();
    Camp__c camp;
    ImportSetupSaves.Result result;
    System.runAs(owner) {
      camp = ShoreshTestData.camp('Birch Hollow (made up)');
      Season__c s = ShoreshTestData.season(camp.Id, 'Summer 2026');
      result = ImportController.saveWorkbook(
        JSON.serialize(
          new Map<String, Object>{
            'seasonId' => s.Id,
            'files' => 'camp.xlsx',
            'records' => new List<Object>(),
            'campWords' => new List<Object>{
              new Map<String, Object>{
                'kind' => 'CampLabel',
                'term' => 'Group',
                'fields' => new Map<String, Object>{
                  'Singular__c' => 'Cabin',
                  'Plural__c' => 'Cabins'
                }
              }
            }
          }
        )
      );
      Database.insert(
        new Season__Share(
          ParentId = s.Id,
          UserOrGroupId = reader.Id,
          AccessLevel = 'Read',
          RowCause = Schema.Season__Share.RowCause.Manual
        ),
        AccessLevel.SYSTEM_MODE
      );
    }
    System.runAs(reader) {
      try {
        ImportController.undoImport(result.importId);
        Assert.fail('read access to the season is not enough to undo');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('edit access'), e.getMessage());
      }
    }
    Assert.areEqual('Cabin', CampLabels.forCamp(camp.Id).singular('Group'));
    Assert.isNull(
      [SELECT UndoneAt__c FROM Import__c WHERE Id = :result.importId]
      .UndoneAt__c
    );
  }

  /**
   * An import that added weeks: someone who can only read the season is told plainly that they
   * need edit access, before anything is touched; the weeks stay.
   */
  @IsTest
  static void undoTellsAReaderTheyNeedEditAccessBeforeTouchingAnything() {
    User owner = ShoreshTestData.scheduler();
    User reader = ShoreshTestData.scheduler();
    Season__c s;
    ImportSetupSaves.Result result;
    System.runAs(owner) {
      s = season();
      result = importAWeek(s.Id);
      shareToRead(s.Id, reader.Id);
    }
    System.runAs(reader) {
      try {
        ImportController.undoImport(result.importId);
        Assert.fail('read access to the season is not enough to undo');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'You don\'t have edit access to this season. Ask the person who set it up, or a Salesforce admin.',
          e.getMessage()
        );
      }
    }
    Assert.areEqual(1, [SELECT COUNT() FROM Week__c WHERE Season__c = :s.Id]);
  }

  private static void shareToRead(Id seasonId, Id userId) {
    Database.insert(
      new Season__Share(
        ParentId = seasonId,
        UserOrGroupId = userId,
        AccessLevel = 'Read',
        RowCause = Schema.Season__Share.RowCause.Manual
      ),
      AccessLevel.SYSTEM_MODE
    );
  }

  /** Deleting a season still works with imports in it: they go with it (master-detail). */
  @IsTest
  static void aSchedulerDeletingASeasonDeletesItsImportsToo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c s = season();
      importAWeek(s.Id);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Import__c WHERE Season__c = :s.Id]
      );
      Database.delete(s, AccessLevel.USER_MODE);
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c WHERE Id = :s.Id]);
      Assert.areEqual(0, [SELECT COUNT() FROM Import__c]);
    }
  }
}
