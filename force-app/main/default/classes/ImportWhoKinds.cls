/**
 * The two kinds of who list a list import writes and Undo puts back (slice 4c): who can do an
 * activity (ActivityEligibility__c rows) and who a recurring activity covers (Coverage__c rows,
 * which also belong to the season). Object, field, and relationship names are these constants,
 * never from the screen.
 */
public with sharing class ImportWhoKinds {
  private static final Map<String, Kind> BY_OWNER = new Map<String, Kind>{
    'Activity' => new Kind(
      new List<String>{
        'Activity__c',
        'ActivityEligibility__c',
        'Activity__c',
        'Eligibilities__r',
        'ActivityEligibility'
      }
    ),
    'RecurringActivity' => new Kind(
      new List<String>{
        'RecurringActivity__c',
        'Coverage__c',
        'RecurringActivity__c',
        'Coverages__r',
        'Coverage'
      }
    )
  };

  /** One kind of who list. */
  public with sharing class Kind {
    public String ownerObject { get; private set; }
    public String childType { get; private set; }
    public String ownerField { get; private set; }
    public String relationship { get; private set; }
    /** ImportWriter's name for the created rows (Undo removes them in this order). */
    public String term { get; private set; }

    /** names: owner object, rows' object, owner field, relationship, ImportWriter term. */
    Kind(List<String> names) {
      this.ownerObject = names[0];
      this.childType = names[1];
      this.ownerField = names[2];
      this.relationship = names[3];
      this.term = names[4];
    }

    /** A row saying the owner is for a division or group. */
    public SObject row(Id ownerId, Id targetId, Id seasonId) {
      SObject row = Schema.getGlobalDescribe().get(childType).newSObject();
      row.put(ownerField, ownerId);
      row.put(ImportItemWrites.targetField(targetId), targetId);
      if (childType == 'Coverage__c') {
        row.put('Season__c', seasonId);
      }
      return row;
    }

    /** The owners, each with its who rows, read in user mode. */
    public List<SObject> ownersWithRows(Set<Id> ownerIds) {
      return Database.queryWithBinds(
        'SELECT Id, Name, (SELECT Id, Division__c, Group__c FROM ' +
          relationship +
          ') FROM ' +
          ownerObject +
          ' WHERE Id IN :ownerIds',
        new Map<String, Object>{ 'ownerIds' => ownerIds },
        AccessLevel.USER_MODE
      );
    }
  }

  /** By the owner's kind ("Activity", "RecurringActivity"). */
  public static Kind forOwner(String ownerKind) {
    return BY_OWNER.get(ownerKind);
  }

  /** By the who rows' object ("ActivityEligibility__c", "Coverage__c"), as Undo's log has it. */
  public static Kind forChild(String childType) {
    for (Kind kind : BY_OWNER.values()) {
      if (kind.childType == childType) {
        return kind;
      }
    }
    return null;
  }

  /** The division or group a who row names. */
  public static String targetOf(SObject row) {
    Object division = row.get('Division__c');
    return division != null ? (String) division : (String) row.get('Group__c');
  }
}
