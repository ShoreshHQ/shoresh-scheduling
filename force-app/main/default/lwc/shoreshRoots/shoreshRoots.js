import { LightningElement, api } from "lwc";
import { campWorkbookSheets } from "c/shoreshLists";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { reasonOf } from "c/shoreshErrors";
import { screenLabels } from "c/shoreshScreens";
import { FIELD } from "c/shoreshSchema";

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
 * Roots, the home screen: a door to the schedules (Generated Schedule and Manual Build side by
 * side, by name: the two are equal, desktop navSections.js), "What has taken root" (one card per area, with
 * how many there are), and "Needs your attention". Every card and every attention item opens the
 * screen where it is fixed. Areas not built yet show as coming.
 *
 * Fires: navigate { screen }; imported (a camp workbook was imported or undone)
 */
export default class ShoreshRoots extends LightningElement {
  downloading = false;
  /** The season setup from SeasonSetupController. */
  @api setup;
  @api terms;
  /** From shoreshSetupRules.setupProblems: [{ key, screen, name, why }]. */
  @api problems = [];

  /** The screen's heading takes the cursor (the page calls this when Roots opens). */
  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) {
      heading.focus();
    }
  }

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

  /**
   * Whether the camp has any setup yet: divisions, groups or time blocks (desktop
   * campHasSetupData, the required areas). An empty camp sees "Import last year" as the first
   * thing to do (desktop SeedScreen.jsx); once it has data the import recedes to a quiet
   * "Re-import last year", still reachable (desktop navSections.js ADMIN_MENU_ITEMS).
   */
  get campHasData() {
    return ["divisions", "groups", "timeBlocks"].some(
      (key) => this.rowsFor(key).length > 0
    );
  }

  get campIsEmpty() {
    return !this.campHasData;
  }

  get hasAttention() {
    return (this.problems || []).length > 0;
  }

  /** The season's last import that stands: "Last import: <files>, <when>". */
  get lastImport() {
    const last = this.setup && this.setup.lastImport;
    if (!last) {
      return null;
    }
    const when = new Date(last.CreatedDate).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
    return {
      id: last.Id,
      files: last[FIELD.Import.Files],
      line: `Last import: ${last[FIELD.Import.Files] || "a file"}, ${when}`
    };
  }

  handleUndoImport() {
    this.dispatchEvent(
      new CustomEvent("undoimport", {
        detail: { importId: this.lastImport.id, files: this.lastImport.files }
      })
    );
  }

  /** The two schedules, in the menu's order (by name). */
  get scheduleDoors() {
    const labels = screenLabels(this.terms);
    return ["generatedSchedule", "manualBuild"].map((screen) => ({
      screen,
      label: labels[screen]
    }));
  }

  handleOpen(event) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }

  /** A camp workbook was imported or undone: the page reloads the season. */
  handleImported() {
    this.dispatchEvent(new CustomEvent("imported"));
  }

  /**
   * The whole camp in one workbook (slice 4c part C): a sheet per setup list, in the layout each
   * screen imports, plus location types, camp words, weeks, and the weeks each item runs in.
   */
  async handleDownloadWorkbook() {
    if (this.downloading) {
      return;
    }
    this.downloading = true;
    try {
      await downloadWorkbook(
        this,
        campWorkbookSheets(this.setup, this.terms),
        fileNameOf(`${this.setup.season.Name} - worksheet`)
      );
    } catch (e) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: "The worksheet could not be downloaded",
          message: reasonOf(e),
          variant: "error"
        })
      );
    } finally {
      this.downloading = false;
    }
  }
}
