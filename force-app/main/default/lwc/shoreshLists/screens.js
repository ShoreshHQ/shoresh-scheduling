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
import { NONE } from "./cells";
import { whoNames } from "./who";
import {
  divisionsScreen,
  fixedScreen,
  groupsScreen,
  programsScreen,
  recurringScreen,
  timeBlocksScreen
} from "./programScreens";

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

function notesColumn() {
  return {
    key: "notes",
    heading: "Notes",
    words: ["note", "comments", "comment"],
    type: "text",
    fromRecord: (r) => r.Notes__c || null,
    write: (v) => ({ Notes__c: v || null })
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
          nameOf(setup.locationTypes, r.LocationType__c),
        refField: "LocationType__c"
      },
      {
        key: "fit",
        heading: t.s("GroupsThatFit"),
        words: ["groups that fit", "capacity", "fits"],
        type: "whole",
        min: 1,
        requiredValue: true,
        newValue: 1,
        fromRecord: (r) => r.GroupsThatFit__c,
        write: (v) => ({ GroupsThatFit__c: v })
      },
      notesColumn()
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
        fromRecord: (r, setup) => nameOf(setup.locations, r.Location__c),
        refField: "Location__c"
      },
      {
        key: "length",
        heading: t.s("Length"),
        words: ["length", "length (blocks)", "blocks", "how long"],
        type: "whole",
        min: 1,
        requiredValue: true,
        newValue: 1,
        fromRecord: (r) => r.Length__c,
        write: (v) => ({ Length__c: v })
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
        fromRecord: (r) => r.TimesPerWeekMin__c,
        write: (v) => ({ TimesPerWeekMin__c: v })
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
        fromRecord: (r) => (r.NoWeeklyMax__c ? NONE : r.TimesPerWeekMax__c),
        write: (v) => {
          return v === NONE
            ? { NoWeeklyMax__c: true, TimesPerWeekMax__c: null }
            : { NoWeeklyMax__c: false, TimesPerWeekMax__c: v };
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
        fromRecord: (r) => r.Priority__c || "Low",
        write: (v) => ({ Priority__c: v })
      },
      {
        key: "outdoors",
        heading: "Outdoors",
        words: ["outdoor", "outside", "is_outdoor"],
        type: "yesNo",
        fromRecord: (r) => !!r.Outdoor__c,
        write: (v) => ({ Outdoor__c: v })
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
        fromRecord: (r, setup) => nameOf(setup.activities, r.RainPlan__c),
        refField: "RainPlan__c"
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
        fromRecord: (r) => (r.NoGroupLimit__c ? NONE : r.GroupsAtOnce__c),
        write: (v) => {
          return v === NONE
            ? { NoGroupLimit__c: true, GroupsAtOnce__c: null }
            : { NoGroupLimit__c: false, GroupsAtOnce__c: v };
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
        fromRecord: (r) => !!r.SameDivisionOnly__c,
        write: (v) => ({ SameDivisionOnly__c: v })
      },
      {
        key: "early",
        heading: "Early in the week",
        words: ["early", "early in week", "prefer before day"],
        type: "early",
        fromRecord: (r) => {
          return r.EarlyWeekCount__c && r.EarlyWeekByDay__c
            ? { count: r.EarlyWeekCount__c, day: r.EarlyWeekByDay__c }
            : null;
        },
        write: (v) => ({
          EarlyWeekCount__c: v ? v.count : null,
          EarlyWeekByDay__c: v ? v.day : null
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
          (r.Eligibilities__r || [])
            .map((row) => row.Division__c || row.Group__c)
            .sort()
      },
      notesColumn()
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

/** One screen's list layout, in the camp's words. */
export function listScreen(key, t) {
  const screen = BUILDERS[key](t);
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
      return value.length ? whoNames(value, targets).join(", ") : "Everyone";
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
