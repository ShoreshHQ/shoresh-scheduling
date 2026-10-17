/**
 * The two kinds of who list a list import writes and Undo puts back (slice 4c): who can do an
 * activity (ActivityEligibility__c rows) and who a recurring activity covers (Coverage__c rows,
 * which also belong to the season). Objects, fields, and relationships are the platform's own
 * references here, never names from the screen or a log.
 */
public with sharing class ImportWhoKinds {
  // Built on first use: each kind reads its relationship from describe.
  private static Map<String, Kind> byOwner;

  private static Map<String, Kind> kinds() {
    if (byOwner == null) {
      byOwner = new Map<String, Kind>{
        'Activity' => new Kind(
          'ActivityEligibility',
          new List<Schema.SObjectField>{
            ActivityEligibility__c.Activity__c,
            ActivityEligibility__c.Division__c,
            ActivityEligibility__c.Group__c
          }
        ),
        'RecurringActivity' => new Kind(
          'Coverage',
          new List<Schema.SObjectField>{
            Coverage__c.RecurringActivity__c,
            Coverage__c.Division__c,
            Coverage__c.Group__c
          }
        )
      };
    }
    return byOwner;
  }

  /** One kind of who list. */
  public with sharing class Kind {
    public Schema.SObjectType ownerObject { get; private set; }
    /** The rows' object. Logs name it by its local name ("Coverage__c"). */
    public Schema.SObjectType childType { get; private set; }
    public Schema.SObjectField ownerField { get; private set; }
    public Schema.SObjectField divisionField { get; private set; }
    public Schema.SObjectField groupField { get; private set; }
    /** The owner's list of rows, for a subquery and getSObjects ("Coverages__r"). */
    public String relationship { get; private set; }
    /** ImportWriter's name for the created rows (Undo removes them in this order). */
    public String term { get; private set; }

    /** fields: the rows' fields naming the owner, a division, and a group. */
    Kind(String term, List<Schema.SObjectField> fields) {
      this.term = term;
      this.ownerField = fields[0];
      this.divisionField = fields[1];
      this.groupField = fields[2];
      this.childType = ImportFields.ofTerm(term);
      this.ownerObject = ownerField.getDescribe().getReferenceTo()[0];
      this.relationship = ShoreshSchema.childRelationship(
        ownerObject,
        ownerField
      );
    }

    /** A row saying the owner is for a division or group. */
    public SObject row(Id ownerId, Id targetId, Id seasonId) {
      SObject row = childType.newSObject();
      row.put(ownerField, ownerId);
      row.put(targetField(targetId), targetId);
      if (childType == Coverage__c.SObjectType) {
        row.put(Coverage__c.Season__c, seasonId);
      }
      return row;
    }

    /** The field a row names this division or group in. */
    public Schema.SObjectField targetField(Id targetId) {
      return targetId.getSObjectType() == Division__c.SObjectType
        ? divisionField
        : groupField;
    }

    /** The owners, each with its who rows, read in user mode. */
    public List<SObject> ownersWithRows(Set<Id> ownerIds) {
      return Database.queryWithBinds(
        'SELECT Id, Name, (SELECT Id, ' +
          ShoreshSchema.queryName(divisionField) +
          ', ' +
          ShoreshSchema.queryName(groupField) +
          ' FROM ' +
          relationship +
          ') FROM ' +
          ShoreshSchema.queryName(ownerObject) +
          ' WHERE Id IN :ownerIds',
        new Map<String, Object>{ 'ownerIds' => ownerIds },
        AccessLevel.USER_MODE
      );
    }
  }

  /** By the owner's kind ("Activity", "RecurringActivity"). */
  public static Kind forOwner(String ownerKind) {
    return kinds().get(ownerKind);
  }

  /**
   * By the who rows' object as Undo's log names it: "ActivityEligibility__c" or "Coverage__c"
   * (with the package's prefix too, which logs never write but are read the same).
   */
  public static Kind forChild(Object childType) {
    String name = childType instanceof String
      ? ShoreshSchema.withoutPrefix((String) childType)
      : null;
    for (Kind kind : kinds().values()) {
      if (
        name != null &&
        name.equalsIgnoreCase(ShoreshSchema.localName(kind.childType))
      ) {
        return kind;
      }
    }
    // From an import's record: only the two kinds of who rows an import writes.
    throw ImportFields.unreadableLog();
  }

  /** The division or group a who row names. */
  public static String targetOf(SObject row) {
    Kind kind = row.getSObjectType() == Coverage__c.SObjectType
      ? kinds().get('RecurringActivity')
      : kinds().get('Activity');
    Object division = row.get(kind.divisionField);
    return division != null
      ? (String) division
      : (String) row.get(kind.groupField);
  }
}
