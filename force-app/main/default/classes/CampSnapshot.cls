/**
 * Every camp record in the test's org, every field, as text: two snapshots are equal only when
 * the camp is exactly as it was (docs/import/review.md INGEST-5.10). When each record was last
 * saved is left out (a record put back was saved again), and so are import logs, which record
 * what happened rather than the camp; everything else, Ids included, counts.
 * A few queries in all, with each kind's records inside their parent's.
 */
@IsTest
public class CampSnapshot {
  // When and by whom a record was last saved or looked at: not what it holds.
  private static final Set<String> NOT_HELD = new Set<String>{
    'LastModifiedDate',
    'LastModifiedById',
    'SystemModstamp',
    'LastViewedDate',
    'LastReferencedDate'
  };

  public static String of() {
    List<String> parts = new List<String>{
      read(
        Season__c.SObjectType,
        new List<Child>{
          child(Week__c.SObjectType, Week__c.Season__c),
          child(Program__c.SObjectType, Program__c.Season__c),
          child(LocationType__c.SObjectType, LocationType__c.Season__c),
          child(Location__c.SObjectType, Location__c.Season__c),
          child(Activity__c.SObjectType, Activity__c.Season__c),
          child(Coverage__c.SObjectType, Coverage__c.Season__c),
          child(ElectiveSet__c.SObjectType, ElectiveSet__c.Season__c),
          child(SpecialDay__c.SObjectType, SpecialDay__c.Season__c),
          child(SpecialDate__c.SObjectType, SpecialDate__c.Season__c),
          child(SpecialEvent__c.SObjectType, SpecialEvent__c.Season__c),
          child(PlanPart__c.SObjectType, PlanPart__c.Season__c),
          child(Camper__c.SObjectType, Camper__c.Season__c),
          child(ElectiveRun__c.SObjectType, ElectiveRun__c.Season__c)
        }
      ),
      read(
        Program__c.SObjectType,
        new List<Child>{
          child(Division__c.SObjectType, Division__c.Program__c),
          child(TimeBlock__c.SObjectType, TimeBlock__c.Program__c),
          child(FixedActivity__c.SObjectType, FixedActivity__c.Program__c),
          child(
            RecurringActivity__c.SObjectType,
            RecurringActivity__c.Program__c
          ),
          child(Schedule__c.SObjectType, Schedule__c.Program__c)
        }
      ),
      read(
        Division__c.SObjectType,
        new List<Child>{ child(Group__c.SObjectType, Group__c.Division__c) }
      ),
      read(
        Activity__c.SObjectType,
        new List<Child>{
          child(
            ActivityEligibility__c.SObjectType,
            ActivityEligibility__c.Activity__c
          )
        }
      ),
      read(
        Week__c.SObjectType,
        new List<Child>{
          child(WeekException__c.SObjectType, WeekException__c.Week__c)
        }
      ),
      read(
        ElectiveSet__c.SObjectType,
        new List<Child>{
          child(Offering__c.SObjectType, Offering__c.ElectiveSet__c),
          child(LinkedChoice__c.SObjectType, LinkedChoice__c.ElectiveSet__c)
        }
      ),
      read(
        LinkedChoice__c.SObjectType,
        new List<Child>{
          child(
            LinkedChoiceTime__c.SObjectType,
            LinkedChoiceTime__c.LinkedChoice__c
          )
        }
      ),
      read(
        Schedule__c.SObjectType,
        new List<Child>{
          child(ScheduleDay__c.SObjectType, ScheduleDay__c.Schedule__c)
        }
      ),
      read(
        Camp__c.SObjectType,
        new List<Child>{ child(CampLabel__c.SObjectType, CampLabel__c.Camp__c) }
      )
    };
    return String.join(parts, '\n');
  }

  /** Every record of a kind, every field, with its children of each kind given, by Id. */
  private static String read(Schema.SObjectType kind, List<Child> children) {
    List<String> columns = new List<String>{ columnsOf(kind) };
    for (Child child : children) {
      columns.add(
        '(SELECT ' +
          columnsOf(child.kind) +
          ' FROM ' +
          ShoreshSchema.childRelationship(kind, child.parent) +
          ' ORDER BY Id)'
      );
    }
    return JSON.serialize(
      Database.query(
        'SELECT ' +
          String.join(columns, ', ') +
          ' FROM ' +
          ShoreshSchema.queryName(kind) +
          ' ORDER BY Id',
        AccessLevel.SYSTEM_MODE
      )
    );
  }

  /** A kind of record inside another, by its field pointing at the parent. */
  private class Child {
    Schema.SObjectType kind;
    Schema.SObjectField parent;
  }

  private static Child child(
    Schema.SObjectType kind,
    Schema.SObjectField parent
  ) {
    Child result = new Child();
    result.kind = kind;
    result.parent = parent;
    return result;
  }

  private static String columnsOf(Schema.SObjectType kind) {
    List<String> names = new List<String>();
    for (
      Schema.SObjectField field : kind.getDescribe().fields.getMap().values()
    ) {
      String name = field.getDescribe().getName();
      if (!NOT_HELD.contains(name)) {
        names.add(name);
      }
    }
    names.sort();
    return String.join(names, ', ');
  }
}
