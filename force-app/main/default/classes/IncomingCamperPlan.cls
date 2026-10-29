/**
 * What camper does with each record (IncomingCamper; docs/protocol/api.md):
 *
 * - API-2.1, 2.2: found by the system and its ID, else as the import finds them (IncomingCampers);
 *   a doubt is a question for a person, never a guess.
 * - API-2.4: a name fixed in the other system updates the same camper; Shoresh's IDs never change.
 * - API-4.3: withdrawn keeps the camper, left out of seats; nothing is deleted.
 * - API-2.5: the same record again changes nothing; changed_at older than the last taken for that
 *   camper is ignored, and said in the answer (the sender's log of what was ignored).
 */
public with sharing class IncomingCamperPlan {
  private IncomingBatch batch;
  private IncomingCampers campers;
  private Map<Id, Camper__c> current;
  private Set<Id> seen = new Set<Id>();

  public IncomingCamperPlan(IncomingBatch batch) {
    this.batch = batch;
  }

  public void plan(List<Object> sent) {
    List<IncomingCamper.Record> records = new List<IncomingCamper.Record>();
    List<Camper__c> asSent = new List<Camper__c>();
    for (Object item : sent) {
      IncomingCamper.Record record = item == null
        ? new IncomingCamper.Record()
        : (IncomingCamper.Record) item;
      records.add(record);
      Camper__c camper = IncomingCampers.asSent(
        record.source_system,
        record.camper_id,
        record.camper_name
      );
      camper.CamperNumber__c = String.isBlank(record.camper_number)
        ? null
        : record.camper_number.trim();
      asSent.add(camper);
    }
    campers = new IncomingCampers(batch.season.Id, asSent);
    current = readCurrent(records.size());
    for (Integer i = 0; i < records.size(); i++) {
      if (batch.open(i)) {
        planOne(i, records[i]);
      }
    }
  }

  private void planOne(Integer i, IncomingCamper.Record record) {
    Camper__c found = campers.at(i);
    if (
      String.isBlank(record.camper_id) && String.isBlank(record.camper_name)
    ) {
      batch.problem(i, IncomingCampers.sayWho());
    } else if (campers.doubt(i)) {
      batch.problem(i, IncomingCampers.DOUBT);
      batch.ask('camper|' + campers.likely(i).Id, doubtQuestion(i));
    } else if (found == null) {
      add(i, record);
    } else if (found.Id == null || !seen.add(found.Id)) {
      batch.problem(
        i,
        'This camper is in the batch more than once. Only the first was used.'
      );
    } else {
      change(i, record, current.get(found.Id));
    }
  }

  /** The fields this capability may change, by Id, in user mode. */
  private Map<Id, Camper__c> readCurrent(Integer size) {
    Set<Id> ids = new Set<Id>();
    for (Integer i = 0; i < size; i++) {
      if (campers.at(i) != null) {
        ids.add(campers.at(i).Id);
      }
    }
    return new Map<Id, Camper__c>(
      [
        SELECT Id, Name, CamperNumber__c, Withdrawn__c, OutsideChangedAt__c
        FROM Camper__c
        WHERE Id IN :ids
        WITH USER_MODE
      ]
    );
  }

  /** For a person on Roots (who may see campers' names): what to settle, and how. */
  private String doubtQuestion(Integer i) {
    Camper__c sent = campers.sent(i);
    String likely = campers.likely(i).Name;
    return sent.SourceSystem__c.normalizeSpace() +
      ' sent a camper with ID ' +
      sent.OutsideId__c +
      ' who looks like ' +
      likely +
      ', already in Shoresh. If they are the same child, give ' +
      likely +
      ' that ID; if not, give one of them a camper number. Then send again.';
  }

  private void add(Integer i, IncomingCamper.Record record) {
    if (String.isBlank(record.camper_name)) {
      batch.problem(
        i,
        'Shoresh has no camper with this ID yet. Send their name (camper_name) to add them.'
      );
      return;
    }
    Camper__c fresh = campers.sent(i).clone(false, true);
    fresh.Withdrawn__c = record.withdrawn == true;
    fresh.OutsideChangedAt__c = record.changed_at;
    campers.adding(i, fresh);
    batch.save(i, fresh, 'Added this camper.');
  }

  private void change(
    Integer i,
    IncomingCamper.Record record,
    Camper__c saved
  ) {
    if (isOlder(record.changed_at, saved.OutsideChangedAt__c)) {
      batch.unchanged(
        i,
        'Ignored: Shoresh already has a later change to this camper.'
      );
      return;
    }
    Camper__c row = new Camper__c(Id = saved.Id);
    List<String> what = changes(record, saved, row);
    if (what.isEmpty()) {
      batch.unchanged(i, 'Already up to date.');
      return;
    }
    row.OutsideChangedAt__c = record.changed_at == null
      ? saved.OutsideChangedAt__c
      : record.changed_at;
    batch.save(i, row, 'Updated: ' + String.join(what, ', ') + '.');
  }

  /** What differs, put on row, and named for the answer. */
  private static List<String> changes(
    IncomingCamper.Record record,
    Camper__c saved,
    Camper__c row
  ) {
    List<String> what = new List<String>();
    // API-2.4: a name changes only for a camper known by the system's ID; found by name, the
    // name is what found them.
    if (
      String.isNotBlank(record.camper_id) &&
      differs(record.camper_name, saved.Name)
    ) {
      row.Name = record.camper_name.trim();
      what.add('name');
    }
    if (differs(record.camper_number, saved.CamperNumber__c)) {
      row.CamperNumber__c = record.camper_number.trim();
      what.add('camper number');
    }
    if (record.withdrawn != null && record.withdrawn != saved.Withdrawn__c) {
      row.Withdrawn__c = record.withdrawn;
      what.add(record.withdrawn ? 'withdrawn' : 'back from withdrawn');
    }
    return what;
  }

  /** A value sent (not blank) that is not exactly what is saved. */
  private static Boolean differs(String sent, String saved) {
    return String.isNotBlank(sent) && !sent.trim().equals(saved);
  }

  /** Sent with a time older than the last one taken. */
  public static Boolean isOlder(Datetime sent, Datetime taken) {
    return sent != null && taken != null && sent < taken;
  }
}
