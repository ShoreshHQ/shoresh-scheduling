/*
 * The Special events screen's list (ADR 0014; docs/protocol/special.md SPECIAL-2.3 to 2.7): its
 * special days and events in one list, one row each, as the desktop's one table of both kinds
 * (SpecialEventsScreen.jsx: Name, Type) with what an item has there besides (EventDetail: notes,
 * and an event's place). A row's Type says which kind it is, and a row is matched only with the
 * season's items of that kind (a special day and an event may share a name, ADR 0014 choice 7):
 * the list is scoped by kind as a program's lists are by program (scope.js resolveKinds).
 *
 * Not on the list: an item's schedule and the days it is on (worked out, never typed; putting
 * one on a day stays on the grid), and a special day's time blocks, which a new one takes from
 * the camp's regular day as one added by hand does (ImportListSaves, SpecialDaySeed).
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";

const EVENT = FIELD.SpecialEvent;

/**
 * The word for events on the Special events screen: the camp's own word when it has one, else
 * "Event", as the approved mock-up and the desktop say it (the screen's name already says
 * "Special").
 */
export function eventWords(t) {
  if (t.s("SpecialEvent") === "Special event") {
    return { s: "Event", p: "Events", sIn: "event", pIn: "events" };
  }
  return {
    s: t.s("SpecialEvent"),
    p: t.p("SpecialEvent"),
    sIn: t.sIn("SpecialEvent"),
    pIn: t.pIn("SpecialEvent")
  };
}

function locationName(setup, id) {
  const found = ((setup && setup.locations) || []).find((l) => l.Id === id);
  return found ? found.Name : null;
}

export function specialEventsScreen(t) {
  const events = eventWords(t);
  const kinds = [
    {
      value: "SpecialDay",
      label: t.s("SpecialDay"),
      plural: t.p("SpecialDay"),
      words: ["special day", "day"]
    },
    {
      value: "SpecialEvent",
      label: events.s,
      plural: events.p,
      words: ["event", "special event", t.s("SpecialEvent")]
    }
  ];
  const special = (setup) => (setup && setup.special) || {};
  const asItems = (rows, kind) =>
    (rows || []).map((r) => ({
      ...r,
      _programId: kind.value,
      _programName: kind.label
    }));
  return {
    key: "specialEvents",
    // Each row's own kind is its Type (scope.js resolveKinds): a special day or an event.
    kind: "SpecialItem",
    term: "SpecialEvent",
    scope: "kind",
    kinds,
    // The screen's two sections, as it heads them.
    sectionOf: (label) => {
      const kind = kinds.find((k) => k.label === label);
      return kind ? kind.plural : label;
    },
    columns: [
      {
        key: "name",
        heading: "Name",
        words: ["name", "special event", "event name", "special day"],
        type: "text",
        required: true,
        fromRecord: (r) => r.Name,
        write: (v) => ({ Name: v })
      },
      {
        key: "type",
        heading: "Type",
        words: ["kind", "special day or event"],
        type: "choice",
        options: kinds,
        required: true,
        requiredValue: true,
        scope: true,
        fromRecord: (r) => r._programId
      },
      {
        // An event's place; a special day is the whole camp (scope.js resolveKinds).
        key: "where",
        heading: "Where",
        words: ["location", "place", "room"],
        type: "ref",
        ref: "location",
        onlyKind: "SpecialEvent",
        refField: EVENT.Location,
        fromRecord: (r, setup) => {
          return r._programId === "SpecialEvent"
            ? locationName(setup, r[EVENT.Location])
            : null;
        }
      },
      {
        key: "notes",
        heading: "Notes",
        words: ["note", "comments", "comment"],
        type: "text",
        keepSpacing: true,
        // As a list reads them back: one kind of line break, and spaces alone are no notes.
        fromRecord: (r) => {
          const notes = String(r[FIELD[r._programId].Notes] || "").replace(
            /\r\n?/g,
            "\n"
          );
          return notes.trim() ? notes : null;
        },
        write: (v, kind) => ({ [FIELD[kind].Notes]: v || null })
      }
    ],
    // Special days, then events, each in the screen's order.
    records: (setup) => [
      ...asItems(special(setup).specialDays, kinds[0]),
      ...asItems(special(setup).specialEvents, kinds[1])
    ]
  };
}
