/**
 * Undo last import, kind by kind (docs/import/review.md INGEST-5.10): Salesforce refuses one save
 * whose rows switch kind more than ten times, counted 200 rows at a time (#465), so what an import
 * changed is put back one kind of record at a time. Acts as a scheduler, on GeneratedTestData's
 * made-up camp with a special day and a kind of place added.
 */
@IsTest
private class ImportUndoKindsTest {
  /** The sort order (a special day's notes) each record goes back to. */
  private static final Integer BEFORE = 99;

  private static Map<String, Object> plan(Id seasonId, List<Object> records) {
    return new Map<String, Object>{
      'seasonId' => seasonId,
      'screen' => 'activities',
      'files' => 'activities.csv (Activities)',
      'records' => records,
      'remember' => new List<Object>(),
      'forget' => new List<Object>()
    };
  }

  /** The entry an import logs for one field of a record it changed, as it is now. */
  private static Map<String, Object> entry(
    SObject record,
    Schema.SObjectField field,
    Object before
  ) {
    String name = ShoreshSchema.localName(field);
    ImportLogEntries.Values values = new ImportLogEntries.Values(
      record,
      new Map<String, Object>{ name => before }
    );
    values.setAfter(new Map<String, Object>{ name => record.get(field) });
    return values.toLog();
  }

  // INGEST-5.10
  @IsTest
  static void ingest510AnImportThatChangedElevenKindsIsAllPutBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id seasonId = ids.get('Season');
      Database.insert(
        new List<SObject>{
          new LocationType__c(Season__c = seasonId, Name = 'Court'),
          new SpecialDay__c(Season__c = seasonId, Name = 'Color War')
        },
        AccessLevel.USER_MODE
      );
      // A list import, for the record Undo reads.
      Id importId = ImportController.saveList(
          JSON.serialize(
            plan(
              seasonId,
              new List<Object>{
                new Map<String, Object>{
                  'kind' => 'Activity',
                  'id' => ids.get('Swim'),
                  'fields' => new Map<String, Object>(),
                  'refs' => new Map<String, Object>(),
                  'who' => new List<Object>{ ids.get('Juniors') }
                }
              }
            )
          )
        )
        .importId;
      // As a workbook import that changed one record of each of eleven kinds leaves its record.
      List<Object> changed = new List<Object>();
      List<SObject> records = new List<SObject>();
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM Week__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          LIMIT 1
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM Program__c
          WHERE Id = :ids.get('Main')
          WITH USER_MODE
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM Division__c
          WHERE Program__c = :ids.get('Main')
          WITH USER_MODE
          LIMIT 1
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM Group__c
          WHERE Division__r.Program__c = :ids.get('Main')
          WITH USER_MODE
          LIMIT 1
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM TimeBlock__c
          WHERE Program__c = :ids.get('Main')
          WITH USER_MODE
          LIMIT 1
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM LocationType__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          LIMIT 1
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM Location__c
          WHERE Season__c = :seasonId
          WITH USER_MODE
          LIMIT 1
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM Activity__c
          WHERE Id = :ids.get('Gym games')
          WITH USER_MODE
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM FixedActivity__c
          WHERE Id = :ids.get('Flagpole')
          WITH USER_MODE
        ]
      );
      records.add(
        [
          SELECT Id, Name, SortOrder__c
          FROM RecurringActivity__c
          WHERE Id = :ids.get('Rest')
          WITH USER_MODE
        ]
      );
      for (SObject record : records) {
        changed.add(
          entry(
            record,
            ShoreshSchema.field(
              record.getSObjectType(),
              ShoreshSchema.localName(Activity__c.SortOrder__c)
            ),
            BEFORE
          )
        );
      }
      SpecialDay__c colorWar = [
        SELECT Id, Name, Notes__c
        FROM SpecialDay__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ];
      changed.add(
        entry(colorWar, SpecialDay__c.Notes__c, 'Bring white shirts')
      );
      Database.update(
        new Import__c(Id = importId, Changed__c = JSON.serialize(changed)),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      ImportUndo.Result result = ImportController.undoImport(importId);
      Test.stopTest();
      Assert.areEqual(11, result.restored, 'every kind put back');
      for (SObject record : records) {
        Schema.SObjectType kind = record.getSObjectType();
        Id recordId = record.Id;
        SObject now = Database.query(
          'SELECT ' +
            ShoreshSchema.field(
              kind,
              ShoreshSchema.localName(Activity__c.SortOrder__c)
            ) +
            ' FROM ' +
            kind +
            ' WHERE Id = :recordId',
          AccessLevel.USER_MODE
        );
        Assert.areEqual(
          BEFORE,
          now.get(
            ShoreshSchema.field(
              kind,
              ShoreshSchema.localName(Activity__c.SortOrder__c)
            )
          ),
          String.valueOf(kind)
        );
      }
      Assert.areEqual(
        'Bring white shirts',
        [
          SELECT Notes__c
          FROM SpecialDay__c
          WHERE Id = :colorWar.Id
          WITH USER_MODE
        ]
        .Notes__c
      );
    }
  }
}
