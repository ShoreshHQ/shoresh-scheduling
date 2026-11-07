/**
 * The name an outside system first sent for a record a person has since renamed (API-4.1): what
 * it sent is recognised by the import log, which keeps a digest of what each batch wrote, so the
 * system's old name isn't taken for a new record. Only that system's batches still standing, and
 * only records changed since. Reads once per batch, when a name isn't found. The log is read in
 * system mode, as IncomingQuestions reads it: a key has no access to import logs, and only this
 * season's batches from the system named are read, for the records the key can see.
 */
public with sharing class IncomingRenamed {
  private static final Integer BATCH_LIMIT = 50;

  private List<Written> changedSince;
  private IncomingBatch batch;
  private String term;
  private Schema.SObjectField link;
  private Set<String> fields = new Set<String>();
  private Set<Id> ids = new Set<Id>();

  private class Written {
    Id recordId;
    SObject record;
    List<String> fields;
    String digest;
  }

  /** link: the field holding what the kind belongs to (null for an activity). */
  public IncomingRenamed(
    IncomingBatch batch,
    String term,
    Schema.SObjectField link
  ) {
    this.batch = batch;
    this.term = term;
    this.link = link;
  }

  /** Whether this name is one a person renamed since: if so nothing is added, and it is said. */
  public Boolean stopped(Integer index, String name, Id parentId) {
    SObject person = renamedFrom(name, link, parentId);
    if (person == null) {
      return false;
    }
    batch.unchanged(
      index,
      'A person renamed "' +
        name.left(80) +
        '" to "' +
        person.get('Name') +
        '" in Shoresh. It was not added again; a person is asked on Roots.'
    );
    batch.ask(
      term.toLowerCase() + '|renamed|' + person.Id,
      batch.labels.singular(term) +
        ' "' +
        person.get('Name') +
        '" is still called "' +
        name.left(80) +
        '" in ' +
        String.join(new List<String>(batch.systems), ', ') +
        '. Use one name in both so they agree.'
    );
    return true;
  }

  private SObject renamedFrom(
    String name,
    Schema.SObjectField link,
    Id parentId
  ) {
    if (changedSince == null) {
      changedSince = read();
    }
    for (Written each : changedSince) {
      // As this record would be sent now: its name, and what it's said to belong to.
      SObject asSent = each.record.clone(true, true);
      asSent.put('Name', name.trim().left(80));
      if (link != null) {
        asSent.put(link, parentId);
      }
      if (ImportUndoValues.digest(asSent, each.fields) == each.digest) {
        return each.record;
      }
    }
    return null;
  }

  /** What this system's batches still standing made of this kind and someone has changed since. */
  private List<Written> read() {
    Id seasonId = batch.season.Id;
    String source = IncomingSave.sourceOf(batch);
    List<Written> written = new List<Written>();
    for (Import__c done : [
      SELECT Created__c
      FROM Import__c
      WHERE Season__c = :seasonId AND Source__c = :source AND UndoneAt__c = NULL
      WITH SYSTEM_MODE
      ORDER BY CreatedDate DESC
      LIMIT :BATCH_LIMIT
    ]) {
      if (String.isNotBlank(done.Created__c)) {
        addFrom(
          (Map<String, Object>) JSON.deserializeUntyped(done.Created__c),
          written
        );
      }
    }
    return changedOf(written);
  }

  private void addFrom(Map<String, Object> created, List<Written> written) {
    Map<String, Object> kind = (Map<String, Object>) created.get(term);
    if (kind == null) {
      return;
    }
    List<List<String>> named = new List<List<String>>();
    for (Object fieldset : (List<Object>) kind.get('fieldsets')) {
      List<String> names = new List<String>();
      for (Object name : (List<Object>) fieldset) {
        names.add((String) name);
      }
      named.add(names);
      fields.addAll(names);
    }
    for (Object row : (List<Object>) kind.get('rows')) {
      List<Object> cells = (List<Object>) row;
      Written each = new Written();
      each.recordId = (Id) (String) cells[0];
      each.fields = named[(Integer) cells[1]];
      each.digest = (String) cells[2];
      ids.add(each.recordId);
      written.add(each);
    }
  }

  private List<Written> changedOf(List<Written> written) {
    List<Written> result = new List<Written>();
    if (ids.isEmpty()) {
      return result;
    }
    Map<Id, SObject> now = ImportUndoValues.read(
      ImportFields.ofTerm(term),
      fields,
      ids
    );
    for (Written each : written) {
      each.record = now.get(each.recordId);
      if (
        each.record != null &&
        ImportUndoValues.digest(each.record, each.fields) != each.digest
      ) {
        result.add(each);
      }
    }
    return result;
  }
}
