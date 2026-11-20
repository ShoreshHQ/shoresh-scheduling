/**
 * The import log (Import__c.Changed__c) keeps its stored shape: a log saved before the log became
 * one module still undoes, and an import writes the same log byte for byte. LOG is one entry of
 * each kind, in the exact shape ImportWriter writes (whatAnImportWritesIsTheSameLog, written first
 * against the writer as it was before the log became one module), with the test's own records'
 * Ids put in. Tests with records act as a scheduler. Made-up camp only.
 */
@IsTest
private class ImportLogEntriesTest {
  private static final String GRID_BEFORE = '{"b":[],"g":[],"i":[["A","","Canoe"]],"r":[]}';
  private static final String GRID_AFTER = '{"b":[],"g":[],"i":[],"r":[]}';
  // A record's values, a who list, a week off, a camp word, a removed record, cells taken out,
  // each with its keys in the order the platform writes them (CI, today's writer, 2026-11-19).
  private static final String LOG =
    '[{"after":{"Notes__c":"Bring a hat"},"before":{"Notes__c":"Sunscreen"},' +
    '"name":"Archery","type":"Activity__c","id":"{archery}"},' +
    '{"after":["{seniors}"],"before":["{juniors}"],"name":"Archery",' +
    '"type":"ActivityEligibility__c","who":"{archery}"},' +
    '{"item":"Archery","name":"Week 1","target":"{archery}",' +
    '"field":"Activity__c","week":"{week}","weekOn":"{weekOff}"},' +
    '{"plural":"Bunks","singular":"Bunk","term":"Group","wordOff":"{word}"},' +
    '{"name":"Canoe","type":"Activity__c","removed":"{canoe}"},' +
    '{"after":"{\\"b\\":[],\\"g\\":[],\\"i\\":[],\\"r\\":[]}",' +
    '"before":"{\\"b\\":[],\\"g\\":[],\\"i\\":[[\\"A\\",\\"\\",\\"Canoe\\"]],\\"r\\":[]}",' +
    '"name":"Week 1 saved","cellsOut":"{day}"}]';

  private class Camp {
    Id campId;
    Id seasonId;
    Id juniors;
    Id seniors;
    Id week;
    Activity__c archery;
    Activity__c canoe;
    WeekException__c weekOff;
    CampLabel__c word;
    ScheduleDay__c day;
  }

  /** The camp as it was before the import. */
  private static Camp camp() {
    Camp c = new Camp();
    c.campId = ShoreshTestData.camp('Pine Hollow (made up)').Id;
    c.seasonId = ShoreshTestData.season(c.campId, 'Summer 2027').Id;
    Program__c program = ShoreshTestData.program(c.seasonId, 'Main');
    c.juniors = ShoreshTestData.division(program.Id, 'Juniors').Id;
    c.seniors = ShoreshTestData.division(program.Id, 'Seniors').Id;
    c.week = ShoreshTestData.weeks(c.seasonId, 1)[0].Id;
    c.archery = ShoreshTestData.activity(c.seasonId, 'Archery', null);
    c.archery.Notes__c = 'Sunscreen';
    c.canoe = ShoreshTestData.activity(c.seasonId, 'Canoe', null);
    insert as user new List<Activity__c>{ c.archery, c.canoe };
    insert as user new ActivityEligibility__c(
      Activity__c = c.archery.Id,
      Division__c = c.juniors
    );
    c.weekOff = new WeekException__c(
      Week__c = c.week,
      Activity__c = c.archery.Id
    );
    ShoreshTestData.saveWeekExceptions(
      new List<WeekException__c>{ c.weekOff },
      new List<Id>()
    );
    // Saved as a copy: read back for its Id.
    c.weekOff = [
      SELECT Id
      FROM WeekException__c
      WHERE Week__c = :c.week AND Activity__c = :c.archery.Id
    ];
    c.word = new CampLabel__c(
      Camp__c = c.campId,
      ModelTerm__c = 'Group',
      Singular__c = 'Bunk',
      Plural__c = 'Bunks'
    );
    insert as user c.word;
    Schedule__c version = ShoreshTestData.savedVersion(
      program.Id,
      c.week,
      'Week 1 saved'
    );
    c.day = new ScheduleDay__c(
      Schedule__c = version.Id,
      Date__c = Date.newInstance(2026, 6, 29),
      Grid__c = GRID_BEFORE,
      GridFormatVersion__c = 1,
      Revision__c = 1,
      Part__c = 1
    );
    Database.insert(c.day, AccessLevel.SYSTEM_MODE);
    return c;
  }

  /** LOG with this camp's Ids. */
  private static String logFor(Camp c) {
    return LOG.replace('{archery}', c.archery.Id)
      .replace('{juniors}', c.juniors)
      .replace('{seniors}', c.seniors)
      .replace('{weekOff}', c.weekOff.Id)
      .replace('{week}', c.week)
      .replace('{word}', c.word.Id)
      .replace('{canoe}', c.canoe.Id)
      .replace('{day}', c.day.Id);
  }

  /** The camp as the import left it, made by hand: what LOG says it did. */
  private static void importedByHand(Camp c) {
    update as user new Activity__c(Id = c.archery.Id, Notes__c = 'Bring a hat');
    delete as user [
      SELECT Id
      FROM ActivityEligibility__c
      WHERE Activity__c = :c.archery.Id
    ];
    insert as user new ActivityEligibility__c(
      Activity__c = c.archery.Id,
      Division__c = c.seniors
    );
    ShoreshTestData.saveWeekExceptions(
      new List<WeekException__c>(),
      new List<Id>{ c.weekOff.Id }
    );
    delete as user new List<SObject>{ c.word, c.canoe };
    Database.update(
      new ScheduleDay__c(Id = c.day.Id, Grid__c = GRID_AFTER),
      AccessLevel.SYSTEM_MODE
    );
  }

  @IsTest
  static void whatAnImportWritesIsTheSameLog() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Test.startTest();
      ImportWriter writer = new ImportWriter(
        new ImportKeys(c.seasonId, CampLabels.forCamp(c.campId))
      );
      writer.amend(
        new List<SObject>{
          new Activity__c(Id = c.archery.Id, Notes__c = 'Bring a hat')
        }
      );
      writer.logWho(
        new ImportLogEntries.Who(
            [SELECT Id, Name FROM Activity__c WHERE Id = :c.archery.Id],
            'ActivityEligibility__c'
          )
          .lists(new List<String>{ c.juniors }, new List<String>{ c.seniors })
      );
      new ImportWorkbookExtras(writer, c.seasonId, c.campId)
        .weeksBackOn(
          new List<ImportPlan.Entry>{
            new ImportPlan.Entry(
              new Map<String, Object>{ 'id' => c.weekOff.Id }
            )
          }
        );
      writer.logWordOff(c.word);
      writer.logRemoved(new List<SObject>{ c.canoe });
      writer.logCellsOut(
        [
          SELECT Id, Grid__c, Schedule__r.Name
          FROM ScheduleDay__c
          WHERE Id = :c.day.Id
        ],
        GRID_AFTER
      );
      Test.stopTest();
      Assert.areEqual(logFor(c), JSON.serialize(writer.changed));
    }
  }

  @IsTest
  static void aLogInTodaysShapeIsUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      importedByHand(c);
      Import__c done = new Import__c(
        Season__c = c.seasonId,
        Files__c = 'maple-grove.xlsx',
        Created__c = '{}',
        Changed__c = logFor(c)
      );
      Database.insert(done, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      ImportUndo.Result undone = ImportUndo.undo(done.Id);
      Test.stopTest();
      Assert.areEqual(6, undone.restored, JSON.serialize(undone));
      Assert.isTrue(undone.keptEdited.isEmpty(), JSON.serialize(undone));
      Assert.isTrue(undone.gone.isEmpty(), JSON.serialize(undone));
      Assert.areEqual(
        'Sunscreen',
        [SELECT Notes__c FROM Activity__c WHERE Id = :c.archery.Id].Notes__c
      );
      List<ActivityEligibility__c> who = [
        SELECT Division__c
        FROM ActivityEligibility__c
        WHERE Activity__c = :c.archery.Id
      ];
      Assert.areEqual(1, who.size());
      Assert.areEqual(c.juniors, who[0].Division__c);
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM WeekException__c
          WHERE Week__c = :c.week AND Activity__c = :c.archery.Id
        ]
      );
      Assert.areEqual(
        'Bunk',
        [
          SELECT Singular__c
          FROM CampLabel__c
          WHERE Camp__c = :c.campId AND ModelTerm__c = 'Group'
        ]
        .Singular__c
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Id = :c.canoe.Id]
      );
      Assert.areEqual(
        GRID_BEFORE,
        [SELECT Grid__c FROM ScheduleDay__c WHERE Id = :c.day.Id].Grid__c
      );
    }
  }

  /**
   * INGEST-5.7: what earlier imports brought in is read from their logs whatever else they
   * logged: a who list one replaced, or cells one took out, never stops a second import, and an
   * item an import created is still counted as its.
   */
  @IsTest
  static void ingest57EveryKindOfEntryLeavesWhatImportsBroughtInReadable() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Activity__c swim = ShoreshTestData.activity(c.seasonId, 'Swim', null);
      insert as user swim;
      List<String> fields = new List<String>{ 'Name', 'Season__c' };
      Database.insert(
        new Import__c(
          Season__c = c.seasonId,
          Files__c = 'maple-grove.xlsx',
          Created__c = JSON.serialize(
            new Map<String, Object>{
              'Activity' => new Map<String, Object>{
                'fieldsets' => new List<Object>{ fields },
                'rows' => new List<Object>{
                  new List<Object>{
                    swim.Id,
                    0,
                    ImportUndoValues.digest(swim, fields)
                  }
                }
              }
            }
          ),
          Changed__c = logFor(c)
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      Set<Id> untouched = ImportProvenance.untouched(c.seasonId);
      Test.stopTest();
      Assert.areEqual(new Set<Id>{ swim.Id }, untouched);
    }
  }

  /** Each kind of entry reads back what an import wrote, with no records needed. */
  @IsTest
  static void eachKindReadsBackWhatWasWritten() {
    Id archery = fakeId(Activity__c.SObjectType, 1);
    Id juniors = fakeId(Division__c.SObjectType, 2);
    Id seniors = fakeId(Division__c.SObjectType, 3);
    Id week = fakeId(Week__c.SObjectType, 4);
    Id campId = fakeId(Camp__c.SObjectType, 5);
    WeekException__c off = new WeekException__c(
      Id = fakeId(WeekException__c.SObjectType, 6),
      Week__c = week,
      Activity__c = archery
    );
    off.Week__r = new Week__c(Id = week, Name = 'Week 1');
    off.Activity__r = new Activity__c(Id = archery, Name = 'Archery');
    ScheduleDay__c day = new ScheduleDay__c(
      Id = fakeId(ScheduleDay__c.SObjectType, 7),
      Grid__c = GRID_BEFORE,
      Schedule__r = new Schedule__c(Name = 'Week 1 saved')
    );
    List<Object> log = new List<Object>{
      new ImportLogEntries.Who(
          new Activity__c(Id = archery, Name = 'Archery'),
          'ActivityEligibility__c'
        )
        .lists(new List<String>{ juniors }, new List<String>{ seniors })
        .toLog(),
      new ImportLogEntries.WeekOn(off, WeekException__c.Activity__c).toLog(),
      new ImportLogEntries.WordOff(
          new CampLabel__c(
            Id = fakeId(CampLabel__c.SObjectType, 8),
            ModelTerm__c = 'Group',
            Singular__c = 'Bunk',
            Plural__c = 'Bunks'
          )
        )
        .toLog(),
      new ImportLogEntries.Removed(
          new Activity__c(Id = archery, Name = 'Canoe')
        )
        .toLog(),
      new ImportLogEntries.CellsOut(day, GRID_AFTER).toLog()
    };

    ImportLogEntries.Changes back = ImportLogEntries.read(JSON.serialize(log));

    Assert.isFalse(back.unreadable);
    Assert.isTrue(back.recordValues.isEmpty());
    ImportLogEntries.Who listed = back.whoLists[0];
    Assert.areEqual(archery, listed.ownerId());
    Assert.areEqual(Activity__c.SObjectType, listed.kind().ownerObject);
    Assert.areEqual('Archery', listed.name());
    Assert.areEqual(new List<Id>{ juniors }, listed.before());
    Assert.areEqual(new List<String>{ seniors }, listed.after());
    WeekException__c weekOff = back.weeksOn[0].weekOff();
    Assert.areEqual(week, weekOff.Week__c);
    Assert.areEqual(archery, weekOff.Activity__c);
    Assert.areEqual('Archery (Week 1)', back.weeksOn[0].label());
    CampLabel__c word = back.wordsOff[0]
      .label(campId, new Set<String>{ 'Group' });
    Assert.areEqual(campId, word.Camp__c);
    Assert.areEqual('Group', word.ModelTerm__c);
    Assert.areEqual('Bunk', word.Singular__c);
    Assert.areEqual('Bunks', word.Plural__c);
    Assert.areEqual(archery, back.removals[0].row().Id);
    Assert.areEqual('Canoe', back.removals[0].name());
    Assert.areEqual(day.Id, back.cellsTakenOut[0].dayId());
    Assert.areEqual('Week 1 saved', back.cellsTakenOut[0].name());
    Assert.areEqual(GRID_BEFORE, back.cellsTakenOut[0].before());
    Assert.areEqual(GRID_AFTER, back.cellsTakenOut[0].after());
  }

  /** Anything in the log that isn't an entry: Undo refuses the log. */
  @IsTest
  static void somethingThatIsNotAnEntryMakesTheLogUnreadable() {
    Assert.isTrue(ImportLogEntries.read('[5]').unreadable);
    Assert.isFalse(ImportLogEntries.read('[]').unreadable);
  }

  private static Id fakeId(Schema.SObjectType type, Integer n) {
    return (Id) (type.getDescribe().getKeyPrefix() +
    String.valueOf(n).leftPad(12, '0'));
  }
}
