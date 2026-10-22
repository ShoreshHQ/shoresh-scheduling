import { LightningElement, api } from "lwc";
import putOnDay from "@salesforce/apex/SpecialPlacingController.putOnDay";
import { failed } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";

const DAY = FIELD.SpecialDay;
const EVENT = FIELD.SpecialEvent;
const WEEK = FIELD.Week;
// The weekdays a special day can be put on (SpecialDate__c.Day__c).
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** The weekdays a week has, from its dates ("2026-06-29" to "2026-07-03"), Monday to Friday. */
export function weekdaysOf(week) {
  const start = week && week[WEEK.StartDate];
  const end = week && week[WEEK.EndDate];
  if (!start || !end) {
    return [];
  }
  const has = new Set();
  const [y, m, d] = start.split("-").map(Number);
  const last = end;
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    const text = date.toISOString().slice(0, 10);
    if (text > last) {
      break;
    }
    has.add(WEEKDAYS[(date.getUTCDay() + 6) % 7]);
  }
  return WEEKDAYS.filter((day) => has.has(day));
}
// Short day names, as the mock-up writes them ("Wk 5 Thu").
const SHORT_DAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri"
};

/** The season's special items (SpecialItems.Setup), or an empty one. */
export function specialOf(setup) {
  const special = (setup && setup.special) || {};
  return {
    specialDays: special.specialDays || [],
    specialEvents: special.specialEvents || [],
    briefs: special.briefs || []
  };
}

/** One item's brief (its plan in brief and its days), or an empty one. */
export function briefOf(setup, itemId) {
  return (
    specialOf(setup).briefs.find((b) => b.itemId === itemId) || {
      itemId,
      planned: false,
      rows: 0,
      periods: [],
      days: []
    }
  );
}

/**
 * The days an item is on, in the camp's words for weeks, numbered by the week's place in the
 * season ("Wk 5 Thu, Wk 6 Tue"; a camp with its own word, "Session 5 Thu"); "" when on none.
 */
export function placedOnText(brief, weeks, weekWords) {
  const one = (weekWords && weekWords.one) || "Wk";
  return (brief.days || [])
    .map((onDay) => {
      const at = (weeks || []).findIndex((w) => w.Id === onDay.weekId);
      return at < 0
        ? null
        : `${one} ${at + 1} ${SHORT_DAYS[onDay.day] || onDay.day}`;
    })
    .filter((text) => text)
    .join(", ");
}

/**
 * A special day's schedule in brief: its time blocks ("7 time blocks", in the camp's word), or
 * an event's rows ("4 stations"); "" when it has none yet.
 */
export function scheduleText(brief, isEvent, t) {
  if (!brief.planned) {
    return "";
  }
  if (brief.problem) {
    return "Can't be read";
  }
  if (isEvent) {
    return `${brief.rows} ${brief.rows === 1 ? "station" : "stations"}`;
  }
  const n = brief.periods.length;
  return `${n} ${n === 1 ? t.sIn("TimeBlock") : t.pIn("TimeBlock")}`;
}

/** "Lunch, Rest and Flag". */
function listed(names) {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What a special day just added started from (SpecialDaySeed.Seed), in a few lines: whose time
 * blocks, what was brought in, and what was left out and why (desktop SpecialEventsScreen.jsx's
 * note after "Copy time blocks"). Nothing is left out quietly.
 */
export function seededLines(seed, name, t) {
  if (!seed) {
    return [];
  }
  if (!seed.program) {
    return [
      `"${name}" has no ${t.pIn("TimeBlock")} yet: there were none to start from.`
    ];
  }
  const blocks = `${seed.timeBlocks} ${seed.timeBlocks === 1 ? t.sIn("TimeBlock") : t.pIn("TimeBlock")}`;
  const brought = seed.broughtIn || [];
  const lines = [
    `"${name}" starts from ${seed.program}'s ${blocks}${
      brought.length ? `, with ${listed(brought)} brought in` : ""
    }.`
  ];
  const left = (names, why) => {
    if (names && names.length) {
      lines.push(`Not brought in, since ${why}: ${listed(names)}.`);
    }
  };
  left(seed.notEveryDay, "they don't run every day");
  left(seed.notEveryWeek, "they don't run every week");
  left(seed.otherTimes, `they are in other ${t.pIn("TimeBlock")}`);
  left(seed.slotTaken, "the time was already taken");
  return lines;
}

/** "09:00" -> "9:00". */
function clock(value) {
  return (value || "").replace(/^0(\d)/, "$1");
}

/**
 * One special day's or event's details, beside the Special events list (decision 47.1: clicking
 * an item opens its details in the row panel first, with "Open schedule" there). Opened from the
 * item's row (open(id)); it shows where it is, the days it is on, its notes, and, for a special
 * day, its own time blocks with what is in each. Its fields are edited in the row; nothing here
 * saves. "Open schedule" opens the schedule inside it (c/shoreshSpecialSchedule).
 *
 * A special day is put on a day here (ADR 0014 slice 4; desktop "+ Place on a day"): "Put on a
 * day" picks the week and the weekday; one that already has another special day asks first
 * ("Use this one instead? … stays saved"), as the desktop does. Its days then show it on Manual
 * Build and Generated Schedule. (Taking one off a day comes later, slice 6.)
 *
 * Fires: close { itemId } (Close pressed: the page puts the cursor back on the row's chevron),
 * openschedule { itemId } (Open schedule pressed), placed { itemId } (it was put on a day: the
 * page reads the season again).
 */
export default class ShoreshSpecialDetails extends LightningElement {
  @api terms;
  @api weekWords;

  itemId = null;
  _setup;
  focusHeadingNext = false;
  // Putting the special day on a day: { weekId, day, asks, replaces, working }, or null.
  placing = null;
  // What the last put said (role=status), until the details close or another item opens.
  placedSaid = null;

  /** The season setup from SeasonSetupController (special, weeks, locations). */
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    if (this.itemId && !this.item) {
      // Gone (deleted, or another season): its details close.
      this.itemId = null;
    }
  }

  /** The item shown, or null when the details are closed. */
  @api
  get openItemId() {
    return this.itemId;
  }

  /** Opens this item's details, the cursor on their heading. Resolves whether it is shown. */
  @api
  open(itemId) {
    const special = specialOf(this._setup);
    const known = [...special.specialDays, ...special.specialEvents].some(
      (item) => item.Id === itemId
    );
    if (!known) {
      return false;
    }
    if (this.itemId !== itemId) {
      this.placing = null;
      this.placedSaid = null;
    }
    this.itemId = itemId;
    this.focusHeadingNext = true;
    this.focusHeading();
    return true;
  }

  renderedCallback() {
    this.focusHeading();
  }

  focusHeading() {
    const heading =
      this.focusHeadingNext && this.template.querySelector("[data-heading]");
    if (heading) {
      this.focusHeadingNext = false;
      heading.focus();
    }
  }

  handleOpenSchedule() {
    this.dispatchEvent(
      new CustomEvent("openschedule", { detail: { itemId: this.itemId } })
    );
  }

  /** Back from the schedule: the cursor on Open schedule again. */
  @api
  focusOpenSchedule() {
    const door = this.template.querySelector('[data-id="open-schedule"]');
    if (door) {
      door.focus();
    }
  }

  handleClose() {
    const itemId = this.itemId;
    this.itemId = null;
    this.placing = null;
    this.placedSaid = null;
    this.dispatchEvent(new CustomEvent("close", { detail: { itemId } }));
  }

  get item() {
    const special = specialOf(this._setup);
    return (
      special.specialDays.find((d) => d.Id === this.itemId) ||
      special.specialEvents.find((e) => e.Id === this.itemId) ||
      null
    );
  }

  get isEvent() {
    return specialOf(this._setup).specialEvents.some(
      (e) => e.Id === this.itemId
    );
  }

  get brief() {
    return briefOf(this._setup, this.itemId);
  }

  get name() {
    return (this.item && this.item.Name) || "";
  }

  get closeLabel() {
    return `Close ${this.name} details`;
  }

  /** Where: the whole camp for a special day; an event's place, or none. */
  get where() {
    if (!this.isEvent) {
      return "Whole camp";
    }
    const id = this.item[EVENT.Location];
    const place = ((this._setup && this._setup.locations) || []).find(
      (l) => l.Id === id
    );
    return place ? place.Name : "None";
  }

  get whereClass() {
    return this.isEvent && this.where !== "None" ? "value" : "value quiet";
  }

  get placedOn() {
    return (
      placedOnText(
        this.brief,
        (this._setup && this._setup.weeks) || [],
        this.weekWords
      ) || "Not placed"
    );
  }

  get placedOnClass() {
    return this.brief.days.length ? "value" : "value quiet";
  }

  get notes() {
    const item = this.item;
    return item ? item[this.isEvent ? EVENT.Notes : DAY.Notes] || "" : "";
  }

  get hasNotes() {
    return !!this.notes;
  }

  get labels() {
    const t = this.terms;
    return {
      timeBlocks: t ? t.p("TimeBlock") : "Time blocks",
      noTimeBlocks: t ? `No ${t.pIn("TimeBlock")} yet` : "No time blocks yet"
    };
  }

  get isSpecialDay() {
    return !this.isEvent;
  }

  get problem() {
    return this.brief.problem
      ? `This schedule could not be read: ${this.brief.problem}`
      : null;
  }

  /** A special day's own time blocks: when, its name, and what is in it. */
  get periods() {
    return (this.brief.periods || []).map((period, index) => ({
      key: `period-${index}`,
      when: `${clock(period.startTime)}–${clock(period.endTime)}`,
      name: period.name,
      items: (period.items || []).join(", "),
      hasItems: (period.items || []).length > 0
    }));
  }

  get hasPeriods() {
    return this.periods.length > 0 && !this.problem;
  }

  // ---------- put on a day (special days) ----------

  get weeks() {
    return (this._setup && this._setup.weeks) || [];
  }

  /** The camp's word for a week, over its picker. */
  get weekLabel() {
    return this.terms ? this.terms.s("Week") : "Week";
  }

  get canPlace() {
    return this.isSpecialDay && this.weeks.length > 0;
  }

  get weekOptions() {
    const chosen = this.placing && this.placing.weekId;
    return this.weeks.map((week) => ({
      value: week.Id,
      label: week.Name,
      selected: week.Id === chosen
    }));
  }

  get dayOptions() {
    const week = this.weeks.find(
      (w) => this.placing && w.Id === this.placing.weekId
    );
    const chosen = this.placing && this.placing.day;
    return weekdaysOf(week).map((day) => ({
      value: day,
      label: day,
      selected: day === chosen
    }));
  }

  get cannotPut() {
    return !this.placing || !this.placing.day || this.placing.working;
  }

  get useLabel() {
    return `Use ${this.name}`;
  }

  handleStartPlacing() {
    const week = this.weeks[0];
    const days = weekdaysOf(week);
    this.placedSaid = null;
    this.placing = {
      weekId: week ? week.Id : null,
      day: days.length ? days[0] : null,
      asks: null,
      working: false
    };
    Promise.resolve().then(() => {
      const select = this.template.querySelector('[data-id="place-week"]');
      if (select) {
        select.focus();
      }
    });
  }

  handlePlaceWeek(event) {
    const days = weekdaysOf(
      this.weeks.find((w) => w.Id === event.target.value)
    );
    const day = days.includes(this.placing.day) ? this.placing.day : days[0];
    this.placing = {
      ...this.placing,
      weekId: event.target.value,
      day: day || null,
      asks: null
    };
  }

  handlePlaceDay(event) {
    this.placing = { ...this.placing, day: event.target.value, asks: null };
  }

  handleCancelPlacing() {
    this.placing = null;
    Promise.resolve().then(() => {
      const button = this.template.querySelector('[data-id="put-on-day"]');
      if (button) {
        button.focus();
      }
    });
  }

  handlePut() {
    this.put(false);
  }

  handleUse() {
    this.put(true);
  }

  async put(replace) {
    if (this.cannotPut) {
      return;
    }
    const itemId = this.itemId;
    const asked = this.placing;
    this.placing = { ...asked, working: true };
    try {
      const result = await putOnDay({
        specialDayId: itemId,
        weekId: asked.weekId,
        day: asked.day,
        replace
      });
      if (this.itemId !== itemId) {
        return;
      }
      if (result.asks) {
        this.placing = {
          ...asked,
          asks: result.asks,
          replaces: result.replaces,
          working: false
        };
        Promise.resolve().then(() => {
          const use = this.template.querySelector('[data-id="use-instead"]');
          if (use) {
            use.focus();
          }
        });
        return;
      }
      this.placing = null;
      this.placedSaid = result.said;
      this.dispatchEvent(new CustomEvent("placed", { detail: { itemId } }));
      Promise.resolve().then(() => {
        const button = this.template.querySelector('[data-id="put-on-day"]');
        if (button) {
          button.focus();
        }
      });
    } catch (e) {
      this.placing = { ...asked, working: false };
      this.placedSaid = failed(
        `${this.name} wasn't put on a day. Nothing was changed.`,
        e
      );
    }
  }

  /** An event's schedule in brief, or none yet. */
  get eventSchedule() {
    return scheduleText(this.brief, true, this.terms) || "None yet";
  }
}
