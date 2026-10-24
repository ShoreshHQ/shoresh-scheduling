import { LightningElement, api } from "lwc";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import saveCampLabels from "@salesforce/apex/SeasonSetupController.saveCampLabels";
import campWordsBlockedReason from "@salesforce/apex/SeasonSetupController.campWordsBlockedReason";
import { failed } from "c/shoreshErrors";
import { leftField } from "c/shoreshSavedMark";
import { guessPlural } from "c/shoreshTerms";

const NOT_SAVED = "Camp words not saved. Your changes are still here.";

// The words in sections, as the menu groups the screens (camp-words-b): each standard word's
// term, in the server's glossary order inside its section. A term not listed goes in the last.
const SECTIONS = [
  {
    key: "camp",
    title: "Camp",
    terms: [
      "Season",
      "Week",
      "WeekException",
      "Program",
      "Division",
      "Group",
      "Availability",
      "TimeBlock",
      "Location",
      "LocationType",
      "Camper",
      "Scheduler"
    ]
  },
  {
    key: "activities",
    title: "Activities",
    terms: [
      "Activity",
      "Length",
      "TimesPerWeek",
      "GroupsThatFit",
      "GroupsAtOnce",
      "FixedActivity",
      "RecurringActivity",
      "SpecialDay",
      "SpecialEvent",
      "Team",
      "Trip",
      "RainyDay",
      "RainPlan"
    ]
  },
  {
    key: "electives",
    title: "Electives",
    terms: [
      "Elective",
      "ElectiveSet",
      "Offering",
      "Seats",
      "MinimumToRun",
      "Preference",
      "LinkedChoice",
      "Assignment"
    ]
  },
  { key: "schedules", title: "Schedules", terms: [] }
];
const SECTION_OF = new Map(
  SECTIONS.flatMap((section) => section.terms.map((term) => [term, section]))
);
const LAST = SECTIONS[SECTIONS.length - 1];

/** "TimeBlock" -> "Time block". */
function standardWord(term) {
  const words = (term || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0) + words.slice(1).toLowerCase();
}

/**
 * The camp's own words for each term (decision 0006), one box per word (wiki decision 56,
 * camp-words-b): the standard word quiet in the box until the camp types its own; beside a word
 * of the camp's own, its plural, guessed (Bunk -> Bunks) and typed over where the guess is wrong
 * (Chug -> Chugim). A plural typed stays, even when the word changes after.
 *
 * Saved as you go, like the setup tables (ADR 0011, decision 26 (4)): a word is saved when the
 * director leaves its box (or presses Enter), one save at a time, each with every word as it is
 * on screen then, a guessed plural sent as guessed. The rail says how many words are the camp's
 * own and shows "Saved" quietly; a refusal shows under the box that was left, with the typing
 * kept. There is no Save button.
 *
 * Fires: saved (after each save); failed { message } (a save refused).
 * @api focusHeading(): the cursor to the screen's heading.
 */
export default class ShoreshCampLabels extends LightningElement {
  @api campId;
  @api campName;

  // Each term: { term, modelSingular, modelPlural, labelId, singular (the camp's word, "" for the
  // standard one), plural (typed, "" for the guess) }.
  rows = [];
  error;
  blockedReason;
  loaded = false;
  // Something typed and not sent yet.
  dirty = false;
  // Saves go one at a time, in order.
  saves = Promise.resolve();
  // Why the last save was refused, under the box that was left: { term, field, message }.
  fieldError = null;

  connectedCallback() {
    this.load();
  }

  async load() {
    try {
      const [labels, blockedReason] = await Promise.all([
        getLabels({ campId: this.campId }),
        campWordsBlockedReason({ campId: this.campId })
      ]);
      this.blockedReason = blockedReason;
      this.loaded = true;
      this.rows = labels.map((row) => {
        const singular = row.isCustom ? row.singular || "" : "";
        // A saved plural the guess would give is shown as the guess, so it follows the word.
        const guessed = guessPlural(
          singular,
          row.modelSingular,
          row.modelPlural
        );
        const plural =
          row.isCustom && row.plural && row.plural !== guessed
            ? row.plural
            : "";
        return {
          term: row.term,
          // The server always names the standard words; the term itself only stands in.
          modelSingular: row.modelSingular || standardWord(row.term),
          modelPlural: row.modelPlural || "",
          labelId: row.labelId,
          singular,
          plural
        };
      });
    } catch (e) {
      this.error = failed(
        "Couldn't open the camp words. Nothing was changed.",
        e
      );
    }
  }

  get readOnly() {
    return this.loaded && !!this.blockedReason;
  }

  /** How many words are the camp's own, for the rail ("4 changed"). */
  get changedCount() {
    return this.rows.filter((row) => row.singular.trim()).length;
  }

  /** The rows as shown, in sections, each with its guess and any refusal under its boxes. */
  get sections() {
    const at = this.fieldError;
    const errorFor = (row, field) => {
      const here = !!at && at.term === row.term && at.field === field;
      return here ? at.message : null;
    };
    const bySection = new Map(SECTIONS.map((section) => [section.key, []]));
    this.rows.forEach((row) => {
      const own = !!row.singular.trim();
      const guess = guessPlural(
        row.singular,
        row.modelSingular,
        row.modelPlural
      );
      const section = SECTION_OF.get(row.term) || LAST;
      bySection.get(section.key).push({
        ...row,
        own,
        guess,
        singularClass: own ? "word-box word-box_own" : "word-box",
        pluralClass: row.plural.trim()
          ? "plural-box plural-box_typed"
          : "plural-box",
        pluralLabel: `${row.modelSingular}, more than one`,
        singularError: errorFor(row, "singular"),
        pluralError: errorFor(row, "plural")
      });
    });
    return SECTIONS.map((section) => ({
      key: section.key,
      title: section.title,
      rows: bySection.get(section.key)
    })).filter((section) => section.rows.length > 0);
  }

  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) {
      heading.focus();
    }
  }

  handleChange(event) {
    const { term, field } = event.target.dataset;
    const value = event.target.value;
    this.rows = this.rows.map((row) => {
      if (row.term !== term) {
        return row;
      }
      // Back to the standard word: its plural goes with it.
      return field === "singular" && !value.trim()
        ? { ...row, singular: value, plural: "" }
        : { ...row, [field]: value };
    });
    this.dirty = true;
    if (
      this.fieldError &&
      this.fieldError.term === term &&
      this.fieldError.field === field
    ) {
      this.fieldError = null;
    }
    const mark = this.template.querySelector("c-shoresh-saved-mark");
    if (mark) {
      mark.clear();
    }
  }

  handleLeave(event) {
    if (leftField(event)) {
      this.save(event.currentTarget.dataset);
    }
  }

  handleKey(event) {
    if (event.key === "Enter") {
      this.save(event.currentTarget.dataset);
    }
  }

  /** Every word as the server takes it: a plural not typed is the guess; the standard word is blank. */
  sent() {
    return this.rows.map((row) => {
      const singular = row.singular.trim();
      return {
        term: row.term,
        modelSingular: row.modelSingular,
        modelPlural: row.modelPlural,
        labelId: row.labelId,
        singular,
        plural: singular
          ? row.plural.trim() ||
            guessPlural(singular, row.modelSingular, row.modelPlural)
          : ""
      };
    });
  }

  /**
   * After a save, which word has a saved record of its own: a word typed for the first time
   * gets one, a word put back loses it. Without this, putting back a word just typed would send
   * no record to remove, and the camp's word would stay. Only the records are read: what is on
   * screen stays as typed. If they can't be read, the next save still sends every word.
   */
  async readIds() {
    try {
      const saved = await getLabels({ campId: this.campId });
      const ids = new Map(
        (saved || []).map((row) => [row.term, row.labelId || null])
      );
      this.rows = this.rows.map((row) => ({
        ...row,
        labelId: ids.has(row.term) ? ids.get(row.term) : row.labelId
      }));
    } catch {
      // Kept as they were; the words themselves were saved.
    }
  }

  /** Sends every word as it is now, after any save still under way. */
  save({ term, field }) {
    if (!this.dirty || this.readOnly || !this.loaded) {
      return this.saves;
    }
    this.dirty = false;
    const words = this.sent();
    this.saves = this.saves.then(async () => {
      try {
        // The words as they were when the box was left; each word's saved record as it is now
        // (a save before this one may have made it).
        const ids = new Map(this.rows.map((row) => [row.term, row.labelId]));
        const labels = words.map((word) => ({
          ...word,
          labelId: ids.get(word.term) || null
        }));
        await saveCampLabels({ campId: this.campId, labels });
        // Every word went, so an earlier refusal no longer stands.
        this.fieldError = null;
        await this.readIds();
        const mark = this.template.querySelector("c-shoresh-saved-mark");
        if (mark) {
          mark.saved();
        }
        this.dispatchEvent(new CustomEvent("saved"));
      } catch (e) {
        // Still to save: the next box left sends it again.
        this.dirty = true;
        const message = failed(NOT_SAVED, e);
        this.fieldError = { term, field, message };
        // The setup page says it at the top too if this screen is no longer showing.
        this.dispatchEvent(new CustomEvent("failed", { detail: { message } }));
      }
    });
    return this.saves;
  }
}
