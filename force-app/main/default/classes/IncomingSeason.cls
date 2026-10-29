/**
 * The one season an incoming batch is for (IncomingBatch), found by its name in user mode, so a
 * key reaches only seasons shared with it. Each record must name its system and the season; a
 * record naming another season is a problem (a batch is one import of one season).
 */
public with sharing class IncomingSeason {
  private IncomingBatch batch;
  private String name;

  public IncomingSeason(IncomingBatch batch) {
    this.batch = batch;
  }

  /** The season, or null when there is none to use (every open record then says why). */
  public Season__c read(List<Object> records) {
    for (Integer i = 0; i < records.size(); i++) {
      if (records[i] != null) {
        checkRecord(i, records[i]);
      }
    }
    if (name == null) {
      return null;
    }
    List<Season__c> found = [
      SELECT Id, Name
      FROM Season__c
      WHERE Name = :name
      WITH USER_MODE
      LIMIT 2
    ];
    if (found.size() == 1) {
      return found[0];
    }
    String why = found.isEmpty()
      ? 'There is no season called "' +
        name.left(80) +
        '" that this user can see.'
      : 'More than one season is called "' +
        name.left(80) +
        '". Rename one in Shoresh, then send this again.';
    for (Integer i = 0; i < records.size(); i++) {
      batch.problem(i, why);
    }
    return null;
  }

  private void checkRecord(Integer i, Object record) {
    String sender = batch.capability.systemOf(record);
    String given = batch.capability.seasonOf(record);
    given = given == null ? '' : given.normalizeSpace();
    if (String.isBlank(sender)) {
      batch.problem(
        i,
        'Say which system this comes from (source_system), as the camp calls it.'
      );
      return;
    }
    batch.systems.add(sender.normalizeSpace().left(40));
    if (given == '') {
      batch.problem(i, 'Say which season this is for (season).');
    } else if (name == null) {
      name = given;
    } else if (!name.equalsIgnoreCase(given)) {
      batch.problem(
        i,
        'A batch is for one season. Send the records for "' +
          given.left(80) +
          '" in a batch of their own.'
      );
    }
  }

  /** The camp's own words. Only which camp is read in system mode: a key need not read camps. */
  public static CampLabels labelsOf(Id seasonId) {
    return CampLabels.forCamp(
      [SELECT Camp__c FROM Season__c WHERE Id = :seasonId WITH SYSTEM_MODE]
      .Camp__c
    );
  }
}
