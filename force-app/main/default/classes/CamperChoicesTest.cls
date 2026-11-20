/**
 * A camper's stored choices (CamperChoices): their format, comparing and counting them, and the
 * merge both doors use (ELECT-2.6, API-4.1). Pure: no records saved. Names are made up.
 */
@IsTest
private class CamperChoicesTest {
  private static Id fakeId(Schema.SObjectType kind, Integer n) {
    return kind.getDescribe().getKeyPrefix() +
      String.valueOf(n).leftPad(12, '0');
  }

  private static ChoicesImport.SheetChoice ranked(
    String name,
    Id activityId,
    Integer rank
  ) {
    ChoicesImport.SheetChoice result = new ChoicesImport.SheetChoice();
    result.n = name;
    result.a = activityId;
    result.r = rank;
    result.k = 'ranked';
    return result;
  }

  private static List<ChoicesImport.SheetChoice> archeryThenDrama() {
    return new List<ChoicesImport.SheetChoice>{
      ranked('Archery', null, 1),
      ranked('Drama', null, 2)
    };
  }

  private static List<ChoicesImport.SheetChoice> dramaThenArchery() {
    return new List<ChoicesImport.SheetChoice>{
      ranked('Drama', null, 1),
      ranked('Archery', null, 2)
    };
  }

  /** A camper's saved row: the choices used, the last brought in, and the hand-change mark. */
  private static Preference__c saved(
    List<ChoicesImport.SheetChoice> used,
    List<ChoicesImport.SheetChoice> imported,
    Boolean marked
  ) {
    return new Preference__c(
      Id = fakeId(Preference__c.SObjectType, 1),
      Choices__c = CamperChoices.write(used),
      ImportedChoices__c = imported == null
        ? null
        : CamperChoices.write(imported),
      ManualChange__c = marked
    );
  }

  @IsTest
  static void choicesAreWrittenReadAndComparedByWhatTheyAre() {
    String stored = CamperChoices.write(archeryThenDrama());
    Assert.isFalse(stored.contains('null'), 'Blank keys are left out');
    Assert.areEqual('Drama', CamperChoices.read(stored)[1].n);
    Assert.areEqual(0, CamperChoices.read('').size());
    Assert.isNull(CamperChoices.read('not json'));

    Assert.isTrue(
      CamperChoices.same(
        '[{"n":"Archery","r":1,"k":"ranked"},{"n":"Drama","r":2,"k":"ranked"}]',
        '[{"n":"drama","r":2,"k":"ranked"},{"n":"ARCHERY","r":1,"k":"ranked"}]'
      )
    );
    Assert.isFalse(
      CamperChoices.same(
        '[{"n":"Archery","r":1,"k":"ranked"}]',
        '[{"n":"Archery","r":2,"k":"ranked"}]'
      )
    );
    Assert.isTrue(CamperChoices.same(stored, archeryThenDrama()));
    Assert.isFalse(CamperChoices.same(stored, dramaThenArchery()));
    Assert.isTrue(CamperChoices.same(null, ''), 'Blank is no choices');
    Assert.isTrue(CamperChoices.same('not json', 'not json'));
    Assert.isFalse(CamperChoices.same('not json', '[]'));
  }

  @IsTest
  static void aCountIsTheChoicesThatNameAnActivity() {
    List<ChoicesImport.SheetChoice> choices = archeryThenDrama();
    choices[0].a = fakeId(Activity__c.SObjectType, 1);
    Assert.areEqual(1, CamperChoices.count(CamperChoices.write(choices)));
    Assert.areEqual(0, CamperChoices.count(null));
    Assert.areEqual(0, CamperChoices.count('not json'));
  }

  // An "a" that isn't an Id (an edit outside Shoresh) is stored some other way, never a failure.
  @IsTest
  static void choicesWithAnActivityThatIsNotAnIdAreStoredSomeOtherWay() {
    String edited = '[{"n":"Archery","a":"archery","r":1,"k":"ranked"}]';
    Assert.isNull(CamperChoices.read(edited));
    Assert.areEqual(0, CamperChoices.count(edited));
    Assert.isTrue(CamperChoices.same(edited, edited));
    Assert.isFalse(CamperChoices.same(edited, archeryThenDrama()));
    Assert.isTrue(
      CamperChoices.handChanged(
        new Preference__c(
          Choices__c = edited,
          ImportedChoices__c = CamperChoices.write(archeryThenDrama())
        )
      )
    );
  }

  // ELECT-2.6: changed by a person when marked so, or no longer what was last brought in.
  @IsTest
  static void choicesAreHandChangedWhenMarkedOrNoLongerWhatCameIn() {
    Assert.isFalse(
      CamperChoices.handChanged(
        saved(archeryThenDrama(), archeryThenDrama(), false)
      )
    );
    Assert.isTrue(
      CamperChoices.handChanged(
        saved(archeryThenDrama(), archeryThenDrama(), true)
      ),
      'Marked'
    );
    Assert.isTrue(
      CamperChoices.handChanged(
        saved(dramaThenArchery(), archeryThenDrama(), false)
      ),
      'No longer what came in'
    );
    Assert.isFalse(
      CamperChoices.handChanged(saved(dramaThenArchery(), null, false)),
      'Nothing came in to compare with'
    );
  }

  @IsTest
  static void aNewCampersChoicesAreAddedAsUsedAndAsImported() {
    CamperChoices.Merged merged = CamperChoices.mergeIn(
      null,
      archeryThenDrama()
    );
    Assert.areEqual(CamperChoices.Outcome.ADDED, merged.outcome);
    Assert.isFalse(merged.unchanged);
    Assert.isNull(merged.row.Id);
    Assert.areEqual(merged.row.ImportedChoices__c, merged.row.Choices__c);
    Assert.isTrue(
      CamperChoices.same(merged.row.Choices__c, archeryThenDrama())
    );
  }

  @IsTest
  static void choicesNobodyChangedAreTaken() {
    Preference__c had = saved(archeryThenDrama(), archeryThenDrama(), false);
    CamperChoices.Merged merged = CamperChoices.mergeIn(
      had,
      dramaThenArchery()
    );
    Assert.areEqual(CamperChoices.Outcome.TAKEN, merged.outcome);
    Assert.isFalse(merged.unchanged);
    Assert.areEqual(had.Id, merged.row.Id);
    Assert.isTrue(
      CamperChoices.same(merged.row.Choices__c, dramaThenArchery())
    );
    Assert.isTrue(
      CamperChoices.same(merged.row.ImportedChoices__c, dramaThenArchery())
    );

    CamperChoices.Merged again = CamperChoices.mergeIn(had, archeryThenDrama());
    Assert.isTrue(again.unchanged, 'The same choices again change nothing');
  }

  // ELECT-2.6, API-4.1: a person's choices are kept, marked or not; the incoming kept beside them.
  @IsTest
  static void aPersonsChoicesAreKeptAndTheIncomingKeptBeside() {
    for (
      Preference__c had : new List<Preference__c>{
        saved(dramaThenArchery(), archeryThenDrama(), true),
        saved(dramaThenArchery(), archeryThenDrama(), false)
      }
    ) {
      List<ChoicesImport.SheetChoice> incoming = new List<ChoicesImport.SheetChoice>{
        ranked('Pottery', null, 1)
      };
      CamperChoices.Merged merged = CamperChoices.mergeIn(had, incoming);
      Assert.areEqual(CamperChoices.Outcome.KEPT, merged.outcome);
      Assert.isFalse(merged.unchanged);
      Assert.isFalse(
        merged.row.isSet(Preference__c.Choices__c),
        'The person\'s choices are not written over'
      );
      Assert.isTrue(
        CamperChoices.same(merged.row.ImportedChoices__c, incoming)
      );

      CamperChoices.Merged again = CamperChoices.mergeIn(
        had,
        archeryThenDrama()
      );
      Assert.areEqual(CamperChoices.Outcome.KEPT, again.outcome);
      Assert.isTrue(again.unchanged, 'What came in last, again: nothing new');
    }
  }
}
