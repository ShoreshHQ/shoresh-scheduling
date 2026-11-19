/**
 * The import log (Import__c.Changed__c) keeps its stored shape: a log saved before the log became
 * one module still undoes, and an import writes the same log byte for byte. LOG is one entry of
 * each kind, in the exact shape ImportWriter wrote before the change (checked against that writer
 * by whatAnImportWritesIsTheSameLog, run on the code before the change), with the test's own
 * records' Ids put in. Every test acts as a scheduler. Made-up camp only.
 */
@IsTest
private class ImportLogEntriesTest {
  private static final String GRID_BEFORE = '{"b":[],"g":[],"i":[["A","","Canoe"]],"r":[]}';
  private static final String GRID_AFTER = '{"b":[],"g":[],"i":[],"r":[]}';
  // A record's values, a who list, a week off, a camp word, a removed record, cells taken out.
  private static final String LOG =
    '[{"id":"{archery}","type":"Activity__c","name":"Archery",' +
    '"before":{"Notes__c":"Sunscreen"},"after":{"Notes__c":"Bring a hat"}},' +
    '{"who":"{archery}","type":"ActivityEligibility__c","name":"Archery",' +
    '"before":["{juniors}"],"after":["{seniors}"]},' +
    '{"weekOn":"{weekOff}","week":"{week}","field":"Activity__c",' +
    '"target":"{archery}","name":"Week 1","item":"Archery"},' +
    '{"wordOff":"{word}","term":"Group","singular":"Bunk","plural":"Bunks"},' +
    '{"removed":"{canoe}","type":"Activity__c","name":"Canoe"},' +
    '{"cellsOut":"{day}","name":"Week 1 saved",' +
    '"before":"{\\"b\\":[],\\"g\\":[],\\"i\\":[[\\"A\\",\\"\\",\\"Canoe\\"]],\\"r\\":[]}",' +
    '"after":"{\\"b\\":[],\\"g\\":[],\\"i\\":[],\\"r\\":[]}"}]';

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
      ImportWriter.WhoChange change = new ImportWriter.WhoChange();
      change.owner = [
        SELECT Id, Name
        FROM Activity__c
        WHERE Id = :c.archery.Id
      ];
      change.type = 'ActivityEligibility__c';
      change.before = new List<String>{ c.juniors };
      change.after = new List<String>{ c.seniors };
      writer.logWho(change);
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
}
