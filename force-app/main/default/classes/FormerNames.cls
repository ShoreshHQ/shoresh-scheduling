/**
 * The names an activity, division or group had before a person renamed it (INGEST-2.22): kept
 * newest first, one a line, so an import whose file still uses an old name asks "is this the
 * same?" instead of adding a second one. A change of capitals or spacing only is no new name, and
 * a name it is given back is no longer a former one.
 */
public with sharing class FormerNames {
  public static final Integer MOST = 10;

  /** From a record's trigger: on before update, each renamed record keeps its old name in field. */
  public static void noteRenames(Schema.SObjectField field) {
    if (Trigger.isBefore && Trigger.isUpdate) {
      note(Trigger.new, Trigger.oldMap, field);
    }
  }

  /** Before update: each renamed record keeps the name it had, in field (its FormerNames__c). */
  public static void note(
    List<SObject> records,
    Map<Id, SObject> before,
    Schema.SObjectField field
  ) {
    for (SObject record : records) {
      String was = (String) before.get(record.Id).get('Name');
      String now = (String) record.get('Name');
      if (String.isBlank(was) || same(was, now)) {
        continue;
      }
      List<String> kept = new List<String>{ was.trim() };
      String earlier = (String) record.get(field);
      List<String> names = String.isBlank(earlier)
        ? new List<String>()
        : earlier.split('\n');
      for (String name : names) {
        Boolean room = kept.size() < MOST;
        if (room && !same(name, now) && !has(kept, name)) {
          kept.add(name.trim());
        }
      }
      record.put(field, String.join(kept, '\n'));
    }
  }

  private static Boolean same(String a, String b) {
    return String.isNotBlank(a) &&
      String.isNotBlank(b) &&
      a.normalizeSpace().equalsIgnoreCase(b.normalizeSpace());
  }

  private static Boolean has(List<String> names, String name) {
    for (String each : names) {
      if (same(each, name)) {
        return true;
      }
    }
    return String.isBlank(name);
  }
}
