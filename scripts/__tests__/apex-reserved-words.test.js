const { scan, scanApex, RESERVED } = require("../apex-reserved-words");

const found = (source, isTrigger) =>
  scanApex(source, isTrigger).map((h) => `${h.kind} ${h.name} @${h.line}`);

describe("Apex reserved-word check", () => {
  it("finds a local named number (#46, GeneratedTestData)", () => {
    expect(
      found(`@IsTest
      public class GeneratedTestData {
        public static void place(ScheduleGrid.Day day, String placed) {
          Integer number = day.items.size() + 1;
          setCell(day, cell, String.valueOf(number));
        }
      }`)
    ).toEqual(["local number @4"]);
  });

  it("finds a parameter named into (ImportUndoDeletes)", () => {
    expect(
      found(`public with sharing class ImportUndoDeletes {
        private void keep(SObject record, List<String> into) {
          into.add((String) record.get('Name'));
        }
      }`)
    ).toEqual(["parameter into @2"]);
  });

  it("finds fields, for-loop variables, inner classes and enums, ignoring case", () => {
    expect(
      found(`public class X {
        private static Map<Id, Integer> Group;
        public Integer limit { get; set; }
        void run(List<String> names) {
          for (String Object : names) {}
        }
        private class Transaction {}
        public enum Sort { A, B }
      }`)
    ).toEqual([
      "field Group @2",
      "field limit @3",
      "local Object @5",
      "class Transaction @7",
      "enum Sort @8"
    ]);
  });

  it("finds a reserved word declared after a comma, or bound in a switch-when", () => {
    expect(
      found(`public class X {
        private Integer total = 0, number = 1;
        static void run(Object record) {
          Integer a, into;
          switch on record {
            when Account group { System.debug(group); }
          }
        }
      }`)
    ).toEqual(["field number @2", "local into @4", "local group @6"]);
  });

  it("does not flag keywords used as keywords, comments, strings, queries or allowed words", () => {
    expect(
      found(`public with sharing class SetupReads {
        // Integer number; List<String> into;
        public static List<Week__c> weeks(Id seasonId, Integer count) {
          Boolean first = true;
          String order = 'Integer number = 1;';
          List<Week__c> rows = [SELECT Id FROM Week__c WHERE Season__c = :seasonId ORDER BY StartDate__c LIMIT 10];
          insert as user rows;
          if (rows.isEmpty()) return null;
          switch on order { when 'a' { return rows; } when else { return null; } }
          for (Week__c week : rows) { if (week == null) continue; else break; }
          return first ? rows : new List<Week__c>();
        }
      }`)
    ).toEqual([]);
    expect(
      found(
        `trigger WeekTrigger on Week__c (before insert, after update) {
          WeekTriggerHandler.check(Trigger.new);
        }`,
        true
      )
    ).toEqual([]);
  });

  it("uses Salesforce's list, without the special keywords that can be names", () => {
    expect(RESERVED.size).toBe(121);
    for (const word of ["number", "into", "object", "group", "limit", "void"]) {
      expect(RESERVED.has(word)).toBe(true);
    }
    for (const word of [
      "after",
      "before",
      "count",
      "first",
      "last",
      "order",
      "sharing",
      "with"
    ]) {
      expect(RESERVED.has(word)).toBe(false);
    }
  });

  it("passes on this repository", () => {
    expect(scan()).toEqual({});
  });
});
