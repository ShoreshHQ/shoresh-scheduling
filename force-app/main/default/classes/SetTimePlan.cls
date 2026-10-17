/**
 * One season's set-time items (fixed and recurring activities) worked out cell by cell: which
 * groups each one takes, in which time blocks, on which days, in which weeks. Built by
 * SetTimePlanReader and read by the clash finders. A fixed activity takes every group in its
 * program on every day the program runs; a recurring activity takes the groups it covers
 * (every group in the program when it names none) on the days ticked. Either way, a group that is
 * not at camp in a time block (morning only, afternoon only) is left out of that block, and a group
 * away for a week (or a location closed for a week) is not there that week, so it cannot clash.
 */
public with sharing class SetTimePlan {
  public static final List<String> WEEKDAYS = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  };
  // The field for each day, on the objects that have days (a program, a recurring activity).
  private static final Map<Schema.SObjectType, Map<String, Schema.SObjectField>> DAY_FIELDS = new Map<Schema.SObjectType, Map<String, Schema.SObjectField>>{
    Program__c.SObjectType => new Map<String, Schema.SObjectField>{
      'Monday' => Program__c.Monday__c,
      'Tuesday' => Program__c.Tuesday__c,
      'Wednesday' => Program__c.Wednesday__c,
      'Thursday' => Program__c.Thursday__c,
      'Friday' => Program__c.Friday__c
    },
    RecurringActivity__c.SObjectType => new Map<String, Schema.SObjectField>{
      'Monday' => RecurringActivity__c.Monday__c,
      'Tuesday' => RecurringActivity__c.Tuesday__c,
      'Wednesday' => RecurringActivity__c.Wednesday__c,
      'Thursday' => RecurringActivity__c.Thursday__c,
      'Friday' => RecurringActivity__c.Friday__c
    }
  };
  private static Map<Schema.SObjectType, ItemFields> itemFields;

  public Id campId;
  // In date order. A season with no weeks yet has one stand-in week (the season's own Id, with
  // no name): every item runs in it.
  public List<Id> weekIds = new List<Id>();
  public Map<Id, String> weekNames = new Map<Id, String>();
  public Map<Id, Location__c> locations = new Map<Id, Location__c>();
  // A group's or location's unticked weeks: a bunk away, or a location closed, that week.
  public Map<Id, Set<Id>> weeksOff = new Map<Id, Set<Id>>();
  public List<Item> items = new List<Item>();

  /** One program: its time blocks in the order of the day, its groups, and the days it runs. */
  public class ProgramPlan {
    public Program__c program;
    public List<TimeBlock__c> blocks = new List<TimeBlock__c>();
    public Map<Id, Integer> blockIndex = new Map<Id, Integer>();
    public List<Group__c> groups = new List<Group__c>();
    public Set<String> days = new Set<String>();

    public ProgramPlan(Program__c program) {
      this.program = program;
      for (String day : WEEKDAYS) {
        if (
          (Boolean) program.get(dayField(Program__c.SObjectType, day)) == true
        ) {
          days.add(day);
        }
      }
    }

    public void addBlock(TimeBlock__c block) {
      blockIndex.put(block.Id, blocks.size());
      blocks.add(block);
    }
  }

  /** One fixed or recurring activity, as the cells it takes. */
  public class Item {
    public SObject record;
    // The camp-words term: 'FixedActivity' or 'RecurringActivity'.
    public String term;
    public String name;
    public ProgramPlan program;
    public Integer start;
    public Integer length;
    public Id locationId;
    // Days ticked (recurring) or the program's days (fixed).
    public List<String> days = new List<String>();
    public Set<Id> groupIds = new Set<Id>();
    public Set<Id> weekIds = new Set<Id>();

    /** The days it really happens: ticked, and the program runs then. */
    public List<String> runDays() {
      List<String> result = new List<String>();
      for (String day : days) {
        if (program.days.contains(day)) {
          result.add(day);
        }
      }
      return result;
    }

    /** The time blocks it takes, cut short at the end of the day. */
    public List<Integer> span() {
      List<Integer> result = new List<Integer>();
      for (
        Integer i = start;
        i < Math.min(start + length, program.blocks.size());
        i++
      ) {
        result.add(i);
      }
      return result;
    }

    /** The groups it takes in a time block: those it covers that are at camp then. */
    public List<Group__c> groupsIn(Integer blockIndex) {
      TimeBlock__c block = program.blocks[blockIndex];
      List<Group__c> result = new List<Group__c>();
      for (Group__c grp : program.groups) {
        if (groupIds.contains(grp.Id) && atCamp(grp, block)) {
          result.add(grp);
        }
      }
      return result;
    }
  }

  /** Whether a group is at camp in a time block: all day, or the part of day it comes for. */
  public static Boolean atCamp(Group__c grp, TimeBlock__c block) {
    return grp.Availability__c == 'MorningOnly'
      ? block.PartOfDay__c == 'Morning'
      : grp.Availability__c != 'AfternoonOnly' ||
        block.PartOfDay__c == 'Afternoon';
  }

  /** Whether a group is away, or a location closed, in a week. */
  public Boolean isOff(Id target, Id weekId) {
    return weeksOff.containsKey(target) &&
      weeksOff.get(target).contains(weekId);
  }

  /** The first week both items run in with the group there, or null when there is none. */
  public Id firstSharedWeek(Item a, Item b, Id groupId) {
    for (Id weekId : weekIds) {
      if (
        a.weekIds.contains(weekId) &&
        b.weekIds.contains(weekId) &&
        !isOff(groupId, weekId)
      ) {
        return weekId;
      }
    }
    return null;
  }

  /** Whether a record ticks a day ("Monday"): a program or a recurring activity. */
  public static Schema.SObjectField dayField(
    Schema.SObjectType type,
    String day
  ) {
    return DAY_FIELDS.get(type).get(day);
  }

  /**
   * The fields a fixed or a recurring activity shares (same names, different objects), so the
   * set-time code reads either through the platform's own references.
   */
  public class ItemFields {
    public Schema.SObjectField program;
    public Schema.SObjectField timeBlock;
    public Schema.SObjectField length;
    public Schema.SObjectField location;
    public Schema.SObjectField lastTimeBlock;
    public Schema.SObjectField copiedFrom;
    // The week exception field pointing at this kind of item.
    public Schema.SObjectField weekOffField;
    private String weeksOff;

    /**
     * The item's list of weeks it is off (week exceptions), for getSObjects. Read from describe
     * on first use: only SetTimePlanReader needs it, and never in a trigger.
     */
    public String weeksOff() {
      if (weeksOff == null) {
        weeksOff = ShoreshSchema.childRelationship(
          weekOffField.getDescribe().getReferenceTo()[0],
          weekOffField
        );
      }
      return weeksOff;
    }
  }

  /** A fixed or recurring activity's shared fields. */
  public static ItemFields fieldsOf(Schema.SObjectType type) {
    if (itemFields == null) {
      itemFields = new Map<Schema.SObjectType, ItemFields>();
      ItemFields fixed = new ItemFields();
      fixed.program = FixedActivity__c.Program__c;
      fixed.timeBlock = FixedActivity__c.TimeBlock__c;
      fixed.length = FixedActivity__c.Length__c;
      fixed.location = FixedActivity__c.Location__c;
      fixed.lastTimeBlock = FixedActivity__c.LastTimeBlock__c;
      fixed.copiedFrom = FixedActivity__c.CopiedFrom__c;
      fixed.weekOffField = WeekException__c.FixedActivity__c;
      itemFields.put(FixedActivity__c.SObjectType, fixed);
      ItemFields recurring = new ItemFields();
      recurring.program = RecurringActivity__c.Program__c;
      recurring.timeBlock = RecurringActivity__c.TimeBlock__c;
      recurring.length = RecurringActivity__c.Length__c;
      recurring.location = RecurringActivity__c.Location__c;
      recurring.lastTimeBlock = RecurringActivity__c.LastTimeBlock__c;
      recurring.copiedFrom = RecurringActivity__c.CopiedFrom__c;
      recurring.weekOffField = WeekException__c.RecurringActivity__c;
      itemFields.put(RecurringActivity__c.SObjectType, recurring);
    }
    return itemFields.get(type);
  }
}
