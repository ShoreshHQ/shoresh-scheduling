/**
 * What division, group and activity do with each record (IncomingDivision, IncomingGroup,
 * IncomingActivity; docs/protocol/api.md). Each is found by its name (as an import finds them:
 * spacing, capitals and punctuation aside) inside what it belongs to (a division in its program,
 * a group in its division, an activity in the season). One Shoresh doesn't have is added; one it
 * has is left as it is (API-2.3: a camp's own setup is never changed from outside). One the other
 * system puts somewhere else than Shoresh has it is a question for a person (API-4.1, 6.1),
 * never moved. Nothing is deleted.
 */
public with sharing class IncomingNamedPlan {
  private IncomingBatch batch;
  private Kind kind;
  private Set<String> seen = new Set<String>();

  /** One kind: its term, what it belongs to, and what the season has (all read in user mode). */
  public class Kind {
    public String term;
    public String nameField;
    // What it belongs to (null for an activity, which belongs to the season).
    public String parentTerm;
    public String parentField;
    public Schema.SObjectField parentLink;
    // Where a new one goes in its list (none for an activity), and the season's field (activity).
    public Schema.SObjectField sortField;
    public Schema.SObjectField seasonField;
    // The parents by folded name; a name two share is there as null (asked, not guessed).
    public Map<String, Id> parents = new Map<String, Id>();
    // What the season has: folded name -> [record], and each record's parent.
    public Map<String, List<SObject>> existing = new Map<String, List<SObject>>();
    public Map<Id, Integer> siblings = new Map<Id, Integer>();
  }

  /** One record as sent: its name and the name of what it belongs to. */
  public class Named {
    public String name;
    public String parent;
  }

  public IncomingNamedPlan(IncomingBatch batch, Kind kind) {
    this.batch = batch;
    this.kind = kind;
  }

  /** Adds what each holds; parent of each existing record by its link field. */
  public static void have(Kind kind, List<SObject> records) {
    for (SObject record : records) {
      String key = IncomingBatch.fold((String) record.get('Name'));
      if (!kind.existing.containsKey(key)) {
        kind.existing.put(key, new List<SObject>());
      }
      kind.existing.get(key).add(record);
      Id parent = kind.parentLink == null
        ? null
        : (Id) record.get(kind.parentLink);
      Integer count = kind.siblings.get(parent);
      kind.siblings.put(parent, count == null ? 1 : count + 1);
    }
  }

  public static void parent(Kind kind, Id parentId, String name) {
    String key = IncomingBatch.fold(name);
    kind.parents.put(key, kind.parents.containsKey(key) ? null : parentId);
  }

  public void plan(List<Named> records) {
    for (Integer i = 0; i < records.size(); i++) {
      if (batch.open(i)) {
        planOne(i, records[i]);
      }
    }
  }

  private void planOne(Integer i, Named record) {
    if (String.isBlank(record.name)) {
      batch.problem(i, 'Say its name (' + kind.nameField + ').');
      return;
    }
    Id parentId = parentOf(i, record);
    if (kind.parentLink != null && parentId == null) {
      return;
    }
    String key = IncomingBatch.fold(record.name);
    List<SObject> named = kind.existing.get(key);
    if (named == null && !seen.add(key + '|' + parentId)) {
      batch.unchanged(i, 'Already earlier in this batch.');
    } else if (named == null) {
      add(i, record, parentId);
    } else if (inParent(named, parentId)) {
      batch.unchanged(i, 'Already in Shoresh.');
    } else {
      elsewhere(i, record, named[0]);
    }
  }

  /** What it belongs to: the one named, or the only one; null with a problem said. */
  private Id parentOf(Integer i, Named record) {
    if (kind.parentLink == null) {
      return null;
    }
    String word = batch.labels.singularInSentence(kind.parentTerm);
    if (String.isBlank(record.parent)) {
      if (kind.parents.size() == 1 && kind.parents.values()[0] != null) {
        return kind.parents.values()[0];
      }
      batch.problem(i, 'Say which ' + word + ' (' + kind.parentField + ').');
      return null;
    }
    String key = IncomingBatch.fold(record.parent);
    if (kind.parents.get(key) == null) {
      batch.problem(
        i,
        kind.parents.containsKey(key)
          ? 'More than one ' +
            word +
            ' is called "' +
            record.parent.left(80) +
            '". Rename one in Shoresh, then send this again.'
          : 'There is no ' +
            word +
            ' called "' +
            record.parent.left(80) +
            '" in this season.'
      );
    }
    return kind.parents.get(key);
  }

  private Boolean inParent(List<SObject> named, Id parentId) {
    for (SObject record : named) {
      if (kind.parentLink == null || record.get(kind.parentLink) == parentId) {
        return true;
      }
    }
    return false;
  }

  private void add(Integer i, Named record, Id parentId) {
    Schema.SObjectType type = ImportFields.ofTerm(kind.term);
    // Defaults loaded: a new group gets the camp's usual availability, as on the setup screen.
    SObject row = type.newSObject(null, true);
    row.put('Name', record.name.trim().left(80));
    if (kind.parentLink != null) {
      row.put(kind.parentLink, parentId);
    } else {
      row.put(kind.seasonField, batch.season.Id);
    }
    if (kind.sortField != null) {
      Integer count = kind.siblings.get(parentId);
      count = (count == null ? 0 : count) + 1;
      row.put(kind.sortField, count);
      kind.siblings.put(parentId, count);
    }
    batch.save(i, row, 'Added.');
  }

  /** Shoresh has it in another place than the other system says: asked, never moved. */
  private void elsewhere(Integer i, Named record, SObject saved) {
    String word = batch.labels.singularInSentence(kind.parentTerm);
    String what = batch.labels.singular(kind.term);
    batch.unchanged(
      i,
      'Shoresh has this in another ' +
        word +
        '. It was not moved; a person is asked on Roots.'
    );
    batch.ask(
      kind.term.toLowerCase() + '|' + saved.Id,
      what +
        ' "' +
        saved.get('Name') +
        '" is in another ' +
        word +
        ' in Shoresh than in ' +
        String.join(new List<String>(batch.systems), ', ') +
        (String.isBlank(record.parent)
          ? ''
          : ' ("' + record.parent.left(80) + '")') +
        '. Move it in Shoresh or in the other system so they agree.'
    );
  }
}
