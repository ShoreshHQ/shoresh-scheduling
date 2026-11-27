/**
 * What staff does with each record (IncomingStaff; docs/protocol/api/outside-systems.md):
 *
 * - API-2.7: a staff member is found only by the system and its ID (StaffMemberTriggerHandler's
 *   key), never by name: a name Shoresh has, sent with an ID it doesn't, is another person and is
 *   added. One it has gets the name sent; the same record again changes nothing (API-2.5).
 *
 * Keys are hidden fields, so they are matched in system mode inside the one season the sender was
 * already checked to see; the staff themselves are then read in user mode.
 */
public with sharing class IncomingStaffPlan {
  public static final String SAY_WHO = 'Say which staff member this is: their ID in the sending system (staff_id).';

  private IncomingBatch batch;
  private String word;
  // The season's staff (user mode), and those an outside key finds, by that key exactly.
  private Map<Id, StaffMember__c> current;
  private Map<String, StaffMember__c> byOutside = new Map<String, StaffMember__c>();
  private Integer count;
  private Set<String> seen = new Set<String>();

  public IncomingStaffPlan(IncomingBatch batch) {
    this.batch = batch;
    word = batch.labels.singularInSentence('StaffMember');
  }

  /** Each record as sent, as a staff member: season, system, ID and name (blanks as none). */
  public void plan(List<StaffMember__c> sent) {
    read(sent);
    for (Integer i = 0; i < sent.size(); i++) {
      if (batch.open(i)) {
        planOne(i, sent[i]);
      }
    }
  }

  private void read(List<StaffMember__c> sent) {
    Id seasonId = batch.season.Id;
    current = new Map<Id, StaffMember__c>(
      [
        SELECT Id, Name
        FROM StaffMember__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
      ]
    );
    count = current.size();
    Set<String> keys = new Set<String>();
    for (StaffMember__c person : sent) {
      String key = StaffMemberTriggerHandler.outsideKey(person);
      if (key != null) {
        keys.add(key);
      }
    }
    if (keys.isEmpty()) {
      return;
    }
    for (StaffMember__c hidden : [
      SELECT Id, OutsideMatch__c
      FROM StaffMember__c
      WHERE Season__c = :seasonId AND OutsideMatch__c IN :keys
      WITH SYSTEM_MODE
    ]) {
      // Only one the sender can see; the key itself stays off the record (ImportFields.WRITTEN).
      if (current.containsKey(hidden.Id)) {
        byOutside.put(hidden.OutsideMatch__c, current.get(hidden.Id));
      }
    }
  }

  private void planOne(Integer i, StaffMember__c sent) {
    String key = StaffMemberTriggerHandler.outsideKey(sent);
    if (key == null) {
      batch.problem(i, SAY_WHO);
    } else if (!seen.add(key)) {
      batch.problem(
        i,
        'This ' +
          word +
          ' is in the batch more than once. Only the first was used.'
      );
    } else if (byOutside.containsKey(key)) {
      change(i, sent, byOutside.get(key));
    } else if (sent.Name == null) {
      batch.problem(
        i,
        'Shoresh has no ' +
          word +
          ' with this ID yet. Send their name (staff_name) to add them.'
      );
    } else {
      count++;
      StaffMember__c fresh = sent.clone(false, true);
      fresh.SortOrder__c = count;
      batch.save(i, fresh, 'Added this ' + word + '.');
    }
  }

  private void change(Integer i, StaffMember__c sent, StaffMember__c saved) {
    if (sent.Name == null || sent.Name.equals(saved.Name)) {
      batch.unchanged(i, 'Already up to date.');
      return;
    }
    batch.save(
      i,
      new StaffMember__c(Id = saved.Id, Name = sent.Name),
      'Updated: name.'
    );
  }
}
