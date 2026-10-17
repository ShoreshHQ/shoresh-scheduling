/*
 * The setup lists a screen can import and download (slice 4c), one layout per screen: the same
 * columns for the empty list, "Download this list", and the screen's sheet in the camp
 * workbook, so whatever Shoresh writes reads back with no changes. Headings are in the camp's
 * own words; each column also answers to the usual other headings (Shoresh desktop's
 * src/ingest/entityColumnMapping.js synonyms among them, Apache-2.0, see NOTICE).
 *
 * A column: key; heading (the camp's words); words (other headings it answers to); type (see
 * cells.js); required (the heading must be in the file); requiredValue (a blank cell can't be
 * read: the item can't be without it); blankMeans (what a blank cell clears it to); newValue
 * (what a new item starts with when the file has no such column); ref (a name of another
 * record: location, locationType, activity); fromRecord (the value a saved record has, as a
 * cell would give it).
 */
import { CHILDREN, FIELD } from "c/shoreshSchema";
import { NONE, listName } from "./cells";
import { whoNames } from "./who";
import {
  divisionsScreen,
  fixedScreen,
  groupsScreen,
  programsScreen,
  recurringScreen,
  timeBlocksScreen
} from "./programScreens";

// Each screen's fields, as the package names them (c/shoreshSchema).
const LOCATION = FIELD.Location;
const ACTIVITY = FIELD.Activity;
const WHO = FIELD.ActivityEligibility;

const PRIORITIES = [
  { value: "High", label: "High" },
  { value: "Low", label: "Low" }
];

function nameColumn(heading, words) {
  return {
    key: "name",
    heading,
    words: ["name", ...words],
    type: "text",
    required: true,
    fromRecord: (r) => r.Name,
    write: (v) => ({ Name: v })
  };
}

/** fields: the object's own fields (its Notes). */
function notesColumn(fields) {
  return {
    key: "notes",
    heading: "Notes",
    words: ["note", "comments", "comment"],
    type: "text",
    keepSpacing: true,
    // As a list reads them back: one kind of line break, and spaces alone are no notes.
    fromRecord: (r) => {
      const notes = String(r[fields.Notes] || "").replace(/\r\n?/g, "\n");
      return notes.trim() ? notes : null;
    },
    write: (v) => ({ [fields.Notes]: v || null })
  };
}

function nameOf(list, id) {
  const found = (list || []).find((r) => r.Id === id);
  return found ? found.Name : null;
}

function locationsScreen(t) {
  return {
    key: "locations",
    kind: "Location",
    term: "Location",
    columns: [
      nameColumn(t.s("Location"), [
        "location",
        "location name",
        "place",
        "room"
      ]),
      {
        key: "type",
        heading: t.s("LocationType"),
        words: ["type", "kind", "location type", "category"],
        type: "ref",
        ref: "locationType",
        fromRecord: (r, setup) =>
          nameOf(setup.locationTypes, r[LOCATION.LocationType]),
        refField: LOCATION.LocationType
      },
      {
        key: "fit",
        heading: t.s("GroupsThatFit"),
        words: ["groups that fit", "capacity", "fits"],
        type: "whole",
        min: 1,
        requiredValue: true,
        newValue: 1,
        fromRecord: (r) => r[LOCATION.GroupsThatFit],
        write: (v) => ({ [LOCATION.GroupsThatFit]: v })
      },
      notesColumn(LOCATION)
    ],
    records: (setup) => setup.locations || []
  };
}

function activitiesScreen(t) {
  return {
    key: "activities",
    kind: "Activity",
    term: "Activity",
    columns: [
      nameColumn(t.s("Activity"), ["activity", "activity name"]),
      {
        key: "location",
        heading: t.s("Location"),
        words: ["location", "place", "where", "room"],
        type: "ref",
        ref: "location",
        fromRecord: (r, setup) => nameOf(setup.locations, r[ACTIVITY.Location]),
        refField: ACTIVITY.Location
      },
      {
        key: "length",
        heading: t.s("Length"),
        words: ["length", "length (blocks)", "blocks", "how long"],
        type: "whole",
        min: 1,
        requiredValue: true,
        newValue: 1,
        fromRecord: (r) => r[ACTIVITY.Length],
        write: (v) => ({ [ACTIVITY.Length]: v })
      },
      {
        key: "min",
        heading: `${t.s("TimesPerWeek")}: at least`,
        words: [
          "times a week: at least",
          "at least",
          "min",
          "minimum",
          "min per week",
          "min sessions/week",
          "min_per_week"
        ],
        type: "whole",
        min: 0,
        requiredValue: true,
        newValue: 1,
        fromRecord: (r) => r[ACTIVITY.TimesPerWeekMin],
        write: (v) => ({ [ACTIVITY.TimesPerWeekMin]: v })
      },
      {
        key: "max",
        heading: `${t.s("TimesPerWeek")}: at most`,
        words: [
          "times a week: at most",
          "at most",
          "max",
          "maximum",
          "max per week",
          "max sessions/week",
          "max_per_week"
        ],
        type: "wholeOrNone",
        none: "No maximum",
        min: 0,
        // A blank cell clears it on an item set up: no maximum. A new one starts as by hand.
        blankMeans: NONE,
        // A new activity done at least 3 times a week is done at most 3 times, not 1.
        newValue: (values) => Math.max(1, values.min || 0),
        fromRecord: (r) => {
          return r[ACTIVITY.NoWeeklyMax] ? NONE : r[ACTIVITY.TimesPerWeekMax];
        },
        write: (v) => {
          return v === NONE
            ? { [ACTIVITY.NoWeeklyMax]: true, [ACTIVITY.TimesPerWeekMax]: null }
            : { [ACTIVITY.NoWeeklyMax]: false, [ACTIVITY.TimesPerWeekMax]: v };
        }
      },
      {
        key: "priority",
        heading: "Priority",
        words: [],
        type: "choice",
        options: PRIORITIES,
        requiredValue: true,
        newValue: "Low",
        fromRecord: (r) => r[ACTIVITY.Priority] || "Low",
        write: (v) => ({ [ACTIVITY.Priority]: v })
      },
      {
        key: "outdoors",
        heading: "Outdoors",
        words: ["outdoor", "outside", "is_outdoor"],
        type: "yesNo",
        fromRecord: (r) => !!r[ACTIVITY.Outdoor],
        write: (v) => ({ [ACTIVITY.Outdoor]: v })
      },
      {
        key: "rainPlan",
        heading: t.s("RainPlan"),
        words: [
          "rain plan",
          "if it rains",
          "weather alternative",
          "weather_alternative"
        ],
        type: "ref",
        ref: "activity",
        fromRecord: (r, setup) =>
          nameOf(setup.activities, r[ACTIVITY.RainPlan]),
        refField: ACTIVITY.RainPlan
      },
      {
        key: "groupsAtOnce",
        heading: t.s("GroupsAtOnce"),
        words: [
          "groups at once",
          "groups at a time",
          "max groups per slot",
          "max_groups_per_slot"
        ],
        type: "wholeOrNone",
        none: "No limit",
        min: 1,
        // A blank cell clears it on an item set up: no limit. A new one starts as by hand.
        blankMeans: NONE,
        newValue: 1,
        fromRecord: (r) => {
          return r[ACTIVITY.NoGroupLimit] ? NONE : r[ACTIVITY.GroupsAtOnce];
        },
        write: (v) => {
          return v === NONE
            ? { [ACTIVITY.NoGroupLimit]: true, [ACTIVITY.GroupsAtOnce]: null }
            : { [ACTIVITY.NoGroupLimit]: false, [ACTIVITY.GroupsAtOnce]: v };
        }
      },
      {
        key: "sameDivision",
        heading: `Same ${t.sIn("Division")} only`,
        words: [
          "same division only",
          "same unit only",
          "same age division only",
          "same_tier_only"
        ],
        type: "yesNo",
        fromRecord: (r) => !!r[ACTIVITY.SameDivisionOnly],
        write: (v) => ({ [ACTIVITY.SameDivisionOnly]: v })
      },
      {
        key: "early",
        heading: "Early in the week",
        words: ["early", "early in week", "prefer before day"],
        type: "early",
        fromRecord: (r) => {
          const count = r[ACTIVITY.EarlyWeekCount];
          const day = r[ACTIVITY.EarlyWeekByDay];
          return count && day ? { count, day } : null;
        },
        write: (v) => ({
          [ACTIVITY.EarlyWeekCount]: v ? v.count : null,
          [ACTIVITY.EarlyWeekByDay]: v ? v.day : null
        })
      },
      {
        key: "who",
        heading: "Who can do it",
        words: [
          "who",
          "who can do it",
          "eligible",
          "eligible groups",
          "age divisions",
          "eligible_tiers"
        ],
        type: "list",
        fromRecord: (r) =>
          (r[CHILDREN.Activity.Eligibilities] || [])
            .map((row) => row[WHO.Division] || row[WHO.Group])
            .sort()
      },
      notesColumn(ACTIVITY)
    ],
    records: (setup) => setup.activities || []
  };
}

// In menu order (c/shoreshScreens): Camp, then Activities.
const BUILDERS = {
  programs: programsScreen,
  divisions: divisionsScreen,
  groups: groupsScreen,
  timeBlocks: timeBlocksScreen,
  locations: locationsScreen,
  activities: activitiesScreen,
  fixedActivities: fixedScreen,
  recurringActivities: recurringScreen
};

/** The screens that have a list to import, in menu order. */
export const LIST_SCREENS = Object.keys(BUILDERS);

/**
 * Location types: no screen of their own, but a sheet of the camp workbook (part D), read the
 * way a screen's list is (names only; a type is only ever added).
 */
function locationTypesScreen(t) {
  return {
    key: "locationTypes",
    kind: "LocationType",
    term: "LocationType",
    columns: [nameColumn(t.s("LocationType"), ["location type", "type"])],
    records: (setup) => setup.locationTypes || []
  };
}

const WORKBOOK_ONLY = { locationTypes: locationTypesScreen };

/** One screen's list layout, in the camp's words. */
export function listScreen(key, t) {
  const screen = (BUILDERS[key] || WORKBOOK_ONLY[key])(t);
  // The heading itself always counts, in the camp's words and Shoresh's.
  screen.columns.forEach((column) => {
    column.words = [column.heading, ...column.words];
  });
  return screen;
}

/** How a value is written in a cell (and shown on the screen). */
export function cellText(column, value, targets) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  switch (column.type) {
    case "yesNo":
      return value ? "Yes" : "No";
    case "wholeOrNone":
      return value === NONE ? column.none : value;
    case "choice": {
      const option = column.options.find((o) => o.value === value);
      return option ? option.label : value;
    }
    case "list":
      return value.length
        ? whoNames(value, targets).map(listName).join(", ")
        : "Everyone";
    case "early":
      return `${value.count} by ${value.day}`;
    case "days":
      return value.join(", ");
    case "time": {
      // 12-hour with AM or PM, so it reads back the same.
      const hours = Math.floor(value / 60);
      const minutes = String(value % 60).padStart(2, "0");
      return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
    }
    default:
      return value;
  }
}
