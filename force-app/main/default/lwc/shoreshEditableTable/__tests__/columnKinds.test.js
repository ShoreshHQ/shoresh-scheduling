import {
  fieldsOf,
  fromInput,
  isText,
  readWords,
  refusals,
  sentForms,
  timeText,
  typedValue,
  typedValues,
  valueWords,
  waitsForAdd,
  widthOf
} from "../columnKinds";

// Each column kind's answers, asked without the table (columnKinds.js).

describe("text (no type)", () => {
  const col = { fieldName: "Name", label: "Name" };
  it("is text, shares the width, edits one field, keeps values as they are", () => {
    expect(isText(col)).toBe(true);
    expect(isText({ ...col, type: "text" })).toBe(true);
    expect(widthOf(col)).toBeNull();
    expect(widthOf({ ...col, width: 7 })).toBe(7);
    expect(fieldsOf(col)).toEqual([col]);
    expect(typedValue(col, "Bunk 1")).toBe("Bunk 1");
    expect(fromInput(col, "")).toBe("");
    expect(waitsForAdd(col, {})).toBe(false);
  });
  it("reads a blank as None, or nothing in a read-only cell", () => {
    expect(valueWords(col, "Bunk 1")).toBe("Bunk 1");
    expect(valueWords(col, null)).toBe("None");
    expect(readWords(col, "")).toBe("");
    expect(readWords(col, "Bunk 1")).toBe("Bunk 1");
  });
});

describe("number", () => {
  const col = { fieldName: "N", label: "Periods", type: "number", min: 1 };
  it("is 6.5rem and takes its input's text as a number or nothing", () => {
    expect(isText(col)).toBe(false);
    expect(widthOf(col)).toBe(6.5);
    expect(fromInput(col, "3")).toBe(3);
    expect(fromInput(col, "")).toBeNull();
    expect(fromInput(col, null)).toBeNull();
    expect(valueWords(col, 0)).toBe("0");
  });
  it("names the field and its limit in its refusals", () => {
    expect(refusals(col)).toEqual({
      missingText: "Periods: needed.",
      tooLowText: "Periods: at least 1.",
      wholeText: "Periods: a whole number.",
      badText: "Periods: not a date."
    });
    expect(refusals({ ...col, min: undefined }).tooLowText).toBeUndefined();
  });
});

describe("picklist", () => {
  const col = {
    fieldName: "P",
    label: "Spot",
    type: "picklist",
    options: [{ value: "a1", label: "Lake" }]
  };
  it("reads a choice by its name, never its Id", () => {
    expect(widthOf(col)).toBe(11);
    expect(valueWords(col, "a1")).toBe("Lake");
    expect(valueWords(col, "unknown")).toBe("None");
    expect(valueWords(col, "")).toBe("None");
  });
});

describe("time", () => {
  const col = { fieldName: "T", label: "Starts", type: "time" };
  it("types Salesforce's milliseconds as the field's text", () => {
    expect(widthOf(col)).toBe(8.5);
    expect(timeText(32400000)).toBe("09:00:00.000");
    expect(typedValue(col, 45900000)).toBe("12:45:00.000");
    expect(typedValue(col, "09:00")).toBe("09:00");
  });
  it("sends a typed time with Apex's zone marker, and a blank as it is", () => {
    const send = sentForms([col, { fieldName: "Name" }]);
    expect([...send.keys()]).toEqual(["T"]);
    expect(send.get("T")("09:00")).toBe("09:00:00.000Z");
    expect(send.get("T")("13:30:00.000Z")).toBe("13:30:00.000Z");
    expect(send.get("T")("")).toBe("");
    expect(send.get("T")(null)).toBeNull();
  });
  it("reads as a clock time and refuses as a time", () => {
    expect(valueWords(col, "13:05:00.000")).toBe("1:05 PM");
    expect(valueWords(col, 0)).toBe("12:00 AM");
    expect(refusals(col).badText).toBe("Starts: not a time.");
  });
});

describe("date", () => {
  const col = { fieldName: "D", label: "Starts", type: "date" };
  it("reads as a camp director reads a date", () => {
    expect(widthOf(col)).toBe(10);
    expect(valueWords(col, "2027-07-03")).toBe("Sat, Jul 3, 2027");
    expect(refusals(col).badText).toBe("Starts: not a date.");
  });
});

describe("checkbox", () => {
  const col = { fieldName: "C", label: "Outdoor", type: "checkbox" };
  it("reads Yes or No, a blank as No even read only", () => {
    expect(widthOf(col)).toBe(5);
    expect(valueWords(col, true)).toBe("Yes");
    expect(valueWords(col, false)).toBe("No");
    expect(valueWords(col, null)).toBe("No");
    expect(readWords(col, undefined)).toBe("No");
  });
});

describe("who", () => {
  it("is 14rem and edits its one field", () => {
    const col = { fieldName: "W", type: "who" };
    expect(widthOf(col)).toBe(14);
    expect(fieldsOf(col)).toEqual([col]);
  });
});

describe("often", () => {
  it("edits two numbers: at least and at most", () => {
    const col = {
      fieldName: "Min",
      maxField: "Max",
      label: "How often",
      minLabel: "At least",
      type: "often",
      min: 0
    };
    expect(widthOf(col)).toBe(9);
    expect(fieldsOf(col)).toEqual([
      { ...col, type: "number", label: "At least" },
      { fieldName: "Max", label: "How often", type: "number", min: 0 }
    ]);
  });
});

describe("days", () => {
  const col = {
    fieldName: "Days",
    label: "Days",
    type: "days",
    days: [
      { fieldName: "Mon", label: "Monday" },
      { fieldName: "Tue", label: "Tuesday" }
    ]
  };
  it("edits one tick per day", () => {
    expect(widthOf(col)).toBe(11);
    expect(fieldsOf(col)).toEqual([
      { fieldName: "Mon", label: "Monday", type: "checkbox" },
      { fieldName: "Tue", label: "Tuesday", type: "checkbox" }
    ]);
    expect(fieldsOf({ ...col, days: undefined })).toEqual([]);
  });
  it("holds the blank row's Add until a day is ticked, when it needs one", () => {
    expect(waitsForAdd(col, {})).toBe(false);
    const needs = { ...col, needsADay: true };
    expect(waitsForAdd(needs, {})).toBe(true);
    expect(waitsForAdd(needs, { Tue: true })).toBe(false);
  });
});

describe("seats", () => {
  it("edits the number and its No limit tick", () => {
    const col = {
      fieldName: "Seats",
      noLimitField: "NoLimit",
      label: "Seats",
      type: "seats"
    };
    expect(widthOf(col)).toBe(9);
    expect(fieldsOf(col)).toEqual([
      { ...col, type: "number" },
      { fieldName: "NoLimit", label: "No limit", type: "checkbox" }
    ]);
  });
});

describe("typedValues", () => {
  it("types only the columns that hold a value their own way", () => {
    const columns = [
      { fieldName: "T", type: "time" },
      { fieldName: "Name" },
      { fieldName: "Gone", type: "time" }
    ];
    const shown = typedValues(columns, { T: 32400000, Name: "Lake" });
    expect(shown).toEqual({ T: "09:00:00.000", Name: "Lake", Gone: undefined });
    expect(Object.keys(shown)).toEqual(["T", "Name", "Gone"]);
    expect(typedValues(undefined, { Name: "Lake" })).toEqual({ Name: "Lake" });
  });
});
