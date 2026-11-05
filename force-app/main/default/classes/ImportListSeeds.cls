/**
 * The special days a setup list just added (ImportListSaves; docs/protocol/special.md
 * SPECIAL-2.6) start from the regular day, as one added in its blank row does
 * (SpecialDaySeed.seedAll), and the save says what they started from.
 */
public with sharing class ImportListSeeds {
  private ImportSetupSaves.Result result;

  public ImportListSeeds(ImportSetupSaves.Result result) {
    this.result = result;
  }

  /** Seeds the new special days among these rows (saved, in their season); any other kind is left as it is. */
  public void seed(
    String kind,
    List<ImportPlan.Entry> entries,
    List<SObject> rows
  ) {
    if (kind != 'SpecialDay') {
      return;
    }
    List<Id> added = new List<Id>();
    Id seasonId;
    for (Integer i = 0; i < entries.size(); i++) {
      if (entries[i].isNew()) {
        added.add(rows[i].Id);
        seasonId = (Id) rows[i].get(SpecialDay__c.Season__c);
      }
    }
    result.seeded = SpecialDaySeed.seedAll(seasonId, added);
  }
}
