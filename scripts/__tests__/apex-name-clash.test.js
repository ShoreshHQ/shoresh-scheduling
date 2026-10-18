const { scan, scanApex } = require("../apex-name-clash");

const CLASSES = ["CampLabels", "ScheduleUses", "InUse", "GeneratedSetup"];
const names = (source) =>
  scanApex(source, CLASSES).map((h) => `${h.kind} ${h.name}`);

describe("Apex name-clash check", () => {
  it("finds a field named like a class the same class uses (#46, GeneratedSetup)", () => {
    const hits = scanApex(
      `public with sharing class GeneratedSetup {
        private CampLabels campLabels;
        public CampLabels labels() {
          if (campLabels == null) {
            campLabels = CampLabels.forCamp(program.Season__r.Camp__c);
          }
          return campLabels;
        }
      }`,
      CLASSES
    );
    expect(hits).toEqual([
      {
        line: 2,
        name: "campLabels",
        kind: "field",
        usedAs: "CampLabels",
        usedOn: 5,
        clashesWith: "class CampLabels"
      }
    ]);
  });

  it("finds a parameter named like a system class it uses (#46, GeneratedFrames)", () => {
    expect(
      names(`public class GeneratedFrames {
        private static String fullId(String id) {
          return String.valueOf(Id.valueOf(id));
        }
      }`)
    ).toEqual(["parameter id"]);
  });

  it("finds a local that takes over the class's static (#48, ActivityTriggerHandler)", () => {
    const hits = scanApex(
      `public with sharing class ActivityTriggerHandler {
        private static final Map<Schema.SObjectField, String> TARGETS = new Map<Schema.SObjectField, String>{
          Activity__c.Location__c => 'location'
        };
        public static void checkSeasons(List<Activity__c> activities, Map<Id, Activity__c> before) {
          Targets targets = new Targets(activities);
          Map<Id, Id> seasonByTarget = targets.seasons;
          for (Activity__c activity : activities) {
            for (Schema.SObjectField field : TARGETS.keySet()) {
              activity.addError(TARGETS.get(field));
            }
          }
        }
        private with sharing class Targets {
          Map<Id, Id> seasons = new Map<Id, Id>();
          Targets(List<Activity__c> activities) {}
        }
      }`,
      CLASSES
    );
    expect(hits).toEqual([
      expect.objectContaining({
        line: 6,
        name: "targets",
        kind: "local",
        usedAs: "TARGETS",
        usedOn: 9
      })
    ]);
  });

  it("finds a local named like a class used later in its block, in a trigger too", () => {
    expect(
      names(`public class SetupTablesTest {
        static void counts() {
          Integer scheduleUses = 2;
          ScheduleUses.Count count = SetupTablesController.scheduleUses(null);
        }
      }`)
    ).toEqual(["local scheduleUses"]);
    expect(
      scanApex(
        `trigger WeekTrigger on Week__c (before insert, before update) {
          CampLabels campLabels = null;
          String word = CampLabels.forCamp(null).word('Week');
        }`,
        CLASSES,
        true
      ).map((h) => h.name)
    ).toEqual(["campLabels"]);
  });

  it("finds a name declared after a comma, and a switch-when binding", () => {
    expect(
      names(`public class X {
        private Integer n = 1, campLabels = 2;
        static void run(Object record) {
          Integer a, scheduleUses;
          switch on record {
            when Account inUse {
              InUse.reason(inUse.Id);
            }
          }
          ScheduleUses.Count c = null;
          CampLabels.forCamp(null);
        }
      }`)
    ).toEqual(["field campLabels", "local scheduleUses", "local inUse"]);
  });

  it("finds a name declared after a comma in a for loop's start", () => {
    expect(
      names(`public class X {
        static void run() {
          for (Integer i = 0, campLabels = 1; i < 2; i++) {
            CampLabels.forCamp(null);
          }
        }
      }`)
    ).toEqual(["local campLabels"]);
  });

  it("keeps a switch-when binding to its own block, and commas in initializers out", () => {
    expect(
      names(`public class X {
        static void run(Object record) {
          switch on record {
            when Account inUse { System.debug(inUse); }
          }
          InUse.reason(null);
          Map<Id, Id> seen = new Map<Id, Id>(), other = new Map<Id, CampLabels>();
          List<String> words = new List<String>{ 'a', campLabels };
          CampLabels.forCamp(null);
        }
      }`)
    ).toEqual([]);
  });

  it("does not flag what compiles in the org", () => {
    expect(
      names(`public with sharing class SeasonSetupController {
        // A local's own initializer comes before its scope (SeasonSetupController.cls).
        public static void remove(Id recordId) {
          String inUse = InUse.reason(recordId);
          if (inUse != null) { throw ScreenErrors.of(inUse); }
        }
        // A class and a static of the same class (SetTimePlan.cls, PublishedHistory.cls).
        private static Map<Schema.SObjectType, ItemFields> itemFields;
        public class ItemFields {}
        public static ItemFields fieldsOf(Schema.SObjectType type) {
          if (itemFields == null) {
            itemFields = new Map<Schema.SObjectType, ItemFields>();
            ItemFields fixed = new ItemFields();
            itemFields.put(FixedActivity__c.SObjectType, fixed);
          }
          return itemFields.get(type);
        }
        public interface Finder {}
        private static Finder finder = null;
        // Same spelling, and a use without a dot.
        static void same(CampLabels CampLabels) { Object o = CampLabels.labels; }
        static void noDot() { Object campLabels = new CampLabels(); }
        // Methods are not variables.
        public static ScheduleUses.Count scheduleUses(Id recordId) {
          return ScheduleUses.count(recordId);
        }
        // Scopes end: the local is gone before the class is used.
        static void scoped() {
          if (true) { Object campLabels = null; }
          CampLabels.forCamp(null);
        }
      }`)
    ).toEqual([]);
  });

  it("ignores comments, strings and queries", () => {
    expect(
      names(`public class X {
        // CampLabels campLabels; CampLabels.forCamp(null);
        /* String inUse; InUse.reason(null); */
        static void run(Id seasonId) {
          String campLabels = 'CampLabels.forCamp(campLabels)';
          List<Week__c> weeks = [SELECT Id FROM Week__c WHERE Season__c = :seasonId];
          insert as user weeks;
        }
      }`)
    ).toEqual([]);
  });

  it("allows an opt-out on the declaration's line only with a reason", () => {
    const source = (comment) => `public class X {
      private CampLabels campLabels; ${comment}
      void a() { CampLabels.forCamp(null); }
    }`;
    expect(
      names(source("// apex-name-clash-ok: kept for the old screen"))
    ).toEqual([]);
    expect(names(source("// apex-name-clash-ok:"))).toEqual([
      "field campLabels"
    ]);
  });

  it("passes on this repository", () => {
    expect(scan()).toEqual({});
  });
});
