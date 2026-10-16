import { LightningElement, api } from "lwc";
import { screenLabels } from "c/shoreshScreens";

// Shoresh desktop's Roots home (RootsHomeScreen.jsx): the same cards, sizes, and places, plus
// Weeks in the spot the desktop leaves empty (Greg, 2026-10-16). Large and wide cards name what
// they hold (up to 4 or 6 names, then "+N more"); small cards only count.
const CARDS = [
  { key: "activities", size: "large", chips: 4 },
  { key: "groups", size: "large", chips: 4 },
  { key: "divisions", size: "small" },
  { key: "locations", size: "small" },
  { key: "timeBlocks", size: "small" },
  { key: "weeks", size: "small" },
  { key: "fixedActivities", size: "wide", chips: 6 }
];

/**
 * Roots, the home screen: a door to the schedule, "What has taken root" (one card per area, with
 * how many there are), and "Needs your attention". Every card and every attention item opens the
 * screen where it is fixed. Areas not built yet show as coming.
 *
 * Fires: navigate { screen }
 */
export default class ShoreshRoots extends LightningElement {
  /** The season setup from SeasonSetupController. */
  @api setup;
  @api terms;
  /** From shoreshSetupRules.setupProblems: [{ key, screen, name, why }]. */
  @api problems = [];

  /** What each card counts: the rows of the screen it opens. */
  rowsFor(key) {
    const setup = this.setup || {};
    const programs = setup.programs || [];
    const divisions = programs.flatMap((entry) => entry.divisions || []);
    switch (key) {
      case "activities":
        return setup.activities || [];
      case "groups":
        return divisions.flatMap((d) => d.groups || []);
      case "divisions":
        return divisions.map((d) => d.division);
      case "locations":
        return setup.locations || [];
      case "timeBlocks":
        return programs.flatMap((entry) => entry.timeBlocks || []);
      case "weeks":
        return setup.weeks || [];
      case "fixedActivities":
        return programs.flatMap((entry) => entry.fixedActivities || []);
      default:
        return [];
    }
  }

  get cards() {
    const labels = screenLabels(this.terms);
    return CARDS.map((card) => {
      const rows = card.coming ? [] : this.rowsFor(card.key);
      const names = [...new Set(rows.map((row) => row.Name))];
      const shown = card.chips ? names.slice(0, card.chips) : [];
      const more = card.chips ? names.length - shown.length : 0;
      return {
        key: card.key,
        label: labels[card.key],
        coming: !!card.coming,
        className: `roots-card roots-card_${card.size} roots-card_${card.key}`,
        count: rows.length,
        countClass:
          rows.length > 0 ? "roots-count roots-count_rooted" : "roots-count",
        chips: shown.map((name) => ({ key: `${card.key}-${name}`, name })),
        hasChips: shown.length > 0,
        more: more > 0 ? `+${more} more` : null
      };
    });
  }

  /** Alphabetical by name, as on the desktop: a stable order that makes no claim about priority. */
  get attention() {
    const labels = screenLabels(this.terms);
    return [...(this.problems || [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((problem) => ({
        ...problem,
        tag: labels[problem.screen],
        ariaLabel: `${problem.name}: ${problem.why}`
      }));
  }

  get hasAttention() {
    return (this.problems || []).length > 0;
  }

  handleOpen(event) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }
}
