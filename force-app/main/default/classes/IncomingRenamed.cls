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

  private class Written {
    SObject record;
    List<String> fields;
    String digest;
  }

  public IncomingRenamed(IncomingBatch batch, String term) {
    this.batch = batch;
    this.term = term;
  }

  /** Whether this name is one a person renamed since: if so nothing is added, and it is said. */
  public Boolean stopped(Integer index, String name) {
    SObject person = renamedFrom(name);
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

  private SObject renamedFrom(String name) {
    if (changedSince == null) {
      changedSince = read();
    }
    for (Written each : changedSince) {
      SObject asSent = each.record.clone(true, true);
      asSent.put('Name', name);
      if (ImportUndoValues.digest(asSent, each.fields) == each.digest) {
        return each.record;
      }
    }
    return null;
  }

  private List<Written> read() {
    List<Written> result = new List<Written>();
    Id seasonId = batch.season.Id;
    String source = IncomingSave.sourceOf(batch);
    for (Import__c batch : [
      SELECT Created__c
      FROM Import__c
      WHERE Season__c = :seasonId AND Source__c = :source AND UndoneAt__c = NULL
      WITH SYSTEM_MODE
      ORDER BY CreatedDate DESC
      LIMIT :BATCH_LIMIT
    ]) {
      if (String.isNotBlank(batch.Created__c)) {
        addFrom(
          (Map<String, Object>) JSON.deserializeUntyped(batch.Created__c),
          result
        );
      }
    }
    return result;
  }

  private void addFrom(Map<String, Object> created, List<Written> result) {
    Map<String, Object> kind = (Map<String, Object>) created.get(term);
    if (kind == null) {
      return;
    }
    List<Object> fieldsets = (List<Object>) kind.get('fieldsets');
    Set<String> fields = new Set<String>();
    List<List<String>> named = new List<List<String>>();
    for (Object fieldset : fieldsets) {
      List<String> names = new List<String>();
      for (Object name : (List<Object>) fieldset) {
        names.add((String) name);
      }
      named.add(names);
      fields.addAll(names);
    }
    Set<Id> ids = new Set<Id>();
    for (Object row : (List<Object>) kind.get('rows')) {
      ids.add((Id) (String) ((List<Object>) row)[0]);
    }
    Map<Id, SObject> now = ImportUndoValues.read(
      ImportFields.ofTerm(term),
      fields,
      ids
    );
    for (Object row : (List<Object>) kind.get('rows')) {
      List<Object> cells = (List<Object>) row;
      SObject record = now.get((Id) (String) cells[0]);
      if (record == null) {
        continue;
      }
      Written each = new Written();
      each.record = record;
      each.fields = named[(Integer) cells[1]];
      each.digest = (String) cells[2];
      if (ImportUndoValues.digest(record, each.fields) != each.digest) {
        result.add(each);
      }
    }
  }
}
