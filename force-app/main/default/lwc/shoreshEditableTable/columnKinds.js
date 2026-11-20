import { numberedDay } from "c/shoreshDayNames";

/**
 * What each kind of column (col.type) means for a value, in one place: how wide it is, which
 * fields it edits, how its value is typed in, sent and read, and what its refusals say. The
 * table asks here instead of switching on col.type; a column with no type is text. Focus,
 * drafts and what the template shows stay in the table.
 */

/** Salesforce sends times as milliseconds after midnight; the time field wants "09:00:00.000". */
export function timeText(value) {
  if (typeof value !== "number") {
    return value;
  }
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor((value % 3600000) / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(value % 1000, 3)}`;
}

/** "09:00" or "09:00:00.000" -> "09:00:00.000Z". */
function apexTime(value) {
  const [hours, minutes, rest] = value.replace("Z", "").split(":");
  const [seconds, millis] = (rest || "00").split(".");
  return `${hours}:${minutes}:${seconds}.${(millis || "000").padEnd(3, "0")}Z`;
}

export function isBlank(value) {
  return value === undefined || value === null || value === "";
}

/**
 * Each kind's answers; a kind leaves out what it does as text does. width: rem; fields(col):
 * the fields it edits, each as a column of its own; typed(value): the value as its input holds
 * it; fromInput(value): what its input hands back, as the record keeps it; sent(value): as Apex
 * takes it; blankWords / words(value, col): read in words; waitsForAdd(col, values): the blank
 * row's Add waits.
 */
const KINDS = {
  text: {},
  readonly: {},
  number: {
    width: 6.5,
    // The number input hands back text; Salesforce wants a number (or nothing).
    fromInput: (value) => {
      return value === "" || value === null ? null : Number(value);
    }
  },
  picklist: {
    width: 11,
    // A choice someone else just added is named once the reload brings it; never its Id.
    words: (value, col) => {
      const option = (col.options || []).find((o) => o.value === value);
      return option ? option.label : "None";
    }
  },
  time: {
    width: 8.5,
    typed: timeText,
    sent: (value) => {
      return typeof value === "string" && value !== ""
        ? apexTime(value)
        : value;
    },
    words: (value) => {
      const [hours, minutes] = timeText(value).split(":").map(Number);
      const hour = hours % 12 || 12;
      return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
    }
  },
  date: {
    width: 10,
    // "Sat, Jul 3, 2027", as a camp director reads a date.
    words: (value) => {
      const [y, m, d] = String(value).split("-").map(Number);
      const day = numberedDay(value);
      return `${day ? `${day}, ` : ""}${new Date(
        y,
        m - 1,
        d
      ).toLocaleDateString("en-US", {
        ...(day ? {} : { weekday: "short" }),
        month: "short",
        day: "numeric",
        year: "numeric"
      })}`;
    }
  },
  checkbox: {
    width: 5,
    blankWords: "No",
    words: (value) => (value ? "Yes" : "No")
  },
  who: { width: 14 },
  // "How often" is two numbers: at least, at most.
  often: {
    width: 9,
    fields: (col) => [
      { ...col, type: "number", label: col.minLabel || col.label },
      {
        fieldName: col.maxField,
        label: col.maxLabel || col.label,
        type: "number",
        min: col.min
      }
    ]
  },
  // One tick per day; a column that needs a day (needsADay) holds the blank row's Add until one
  // is ticked, rather than refusing with "Tick at least one day." (word walk W4).
  days: {
    width: 11,
    fields: (col) =>
      (col.days || []).map((day) => ({
        fieldName: day.fieldName,
        label: day.label,
        type: "checkbox"
      })),
    waitsForAdd: (col, values) =>
      !!col.needsADay && !col.days.some((day) => !!values[day.fieldName])
  },
  // Seats: the number and its No limit tick.
  seats: {
    width: 9,
    fields: (col) => [
      { ...col, type: "number" },
      {
        fieldName: col.noLimitField,
        label: col.noLimitLabel || "No limit",
        type: "checkbox"
      }
    ]
  }
};

function kindOf(col) {
  return KINDS[(col && col.type) || "text"] || {};
}

/** The column's width in rem, or null for one that shares what is left. */
export function widthOf(col) {
  return col.width || kindOf(col).width || null;
}

/** Every field the column edits, each as a column of its own. */
export function fieldsOf(col) {
  const kind = kindOf(col);
  return kind.fields ? kind.fields(col) : [col];
}

export function isText(col) {
  return col.type === "text" || !col.type;
}

/** A value as the column's input holds it (a time as "09:00:00.000"). */
export function typedValue(col, value) {
  const kind = kindOf(col);
  return kind.typed ? kind.typed(value) : value;
}

/** A record's values as the inputs hold them; columns that keep a value as it is aren't touched. */
export function typedValues(columns, record) {
  const shown = { ...record };
  (columns || [])
    .filter((col) => kindOf(col).typed)
    .forEach((col) => {
      shown[col.fieldName] = kindOf(col).typed(shown[col.fieldName]);
    });
  return shown;
}

/** What a column's input handed back, as the record keeps it. */
export function fromInput(col, value) {
  const kind = kindOf(col);
  return kind.fromInput ? kind.fromInput(value) : value;
}

/** For each field Apex takes in its own form (a time with its zone marker), how to send it. */
export function sentForms(columns) {
  return new Map(
    (columns || [])
      .filter((col) => kindOf(col).sent)
      .map((col) => [col.fieldName, kindOf(col).sent])
  );
}

/** A value as the director reads it: a choice's name, Yes or No, a clock time, a date. */
export function valueWords(col, value) {
  const kind = kindOf(col);
  if (isBlank(value)) {
    return kind.blankWords || "None";
  }
  return kind.words ? kind.words(value, col) : String(value);
}

/** A value read in a read-only cell: a blank is left blank, except a checkbox's No. */
export function readWords(col, value) {
  return isBlank(value) && !kindOf(col).blankWords
    ? ""
    : valueWords(col, value);
}

/**
 * A field's refusals, naming the field and its limit, never Salesforce's "Complete this field."
 * or "The number is too low." (word walk W4).
 */
export function refusals(col) {
  return {
    missingText: `${col.label}: needed.`,
    tooLowText:
      col.min == null ? undefined : `${col.label}: at least ${col.min}.`,
    wholeText: `${col.label}: a whole number.`,
    badText: `${col.label}: not a ${col.type === "time" ? "time" : "date"}.`
  };
}

/** Whether the blank row's Add waits on this column (a days column with no day ticked). */
export function waitsForAdd(col, values) {
  const kind = kindOf(col);
  return kind.waitsForAdd ? kind.waitsForAdd(col, values) : false;
}
