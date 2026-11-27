import { LightningElement, api } from "lwc";
import { loadStyle } from "lightning/platformResourceLoader";
import PRINT_STYLE from "@salesforce/resourceUrl/ShoreshPrint";
import { failed } from "c/shoreshErrors";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { offeringNames } from "c/shoreshElectiveDetails";
import { withDivisionNames } from "c/shoreshScheduleViews";
import {
  fileTitle,
  pagesFor,
  printChoices,
  sheetsFor
} from "c/shoreshScheduleExport";

/**
 * Getting a week out, the same on the Schedules page, Generated Schedule and Manual Build
 * (PUB-6.6 to PUB-6.11): Excel and Print, each a menu of the whole week, a day, a bunk, an
 * activity, a location or a division (c-shoresh-print-menu). Excel saves the file at once; Print
 * puts the printout on the page (c-shoresh-schedule-print, on paper only), opens the browser's
 * print, and takes the printout away after (ADR 0005 choice 13). Salesforce's header and menu stay
 * off the paper through ShoreshPrint, loaded the first time Print is chosen.
 *
 * view: the week as the screen shows it (withSpecials; the Schedules page adds its raindrops).
 * setup: the season. terms: the camp's words (c/shoreshTerms buildTerms). weekName, versionName: said on each page and in
 * the file's name. disabled: nothing to take out (no week, or the screen busy). primary: Print is
 * the screen's main button (the Schedules page).
 * Fires: failed { message } when a file wasn't made.
 */
export default class ShoreshScheduleOut extends LightningElement {
  @api view;
  @api setup;
  @api terms;
  @api weekName;
  @api versionName;
  @api disabled = false;
  @api primary = false;

  exporting = false;
  // The printout's pages while it is being printed, else null.
  printout = null;
  printPending = false;
  printStyleLoaded = false;
  afterPrint = null;
  choicesMemo = {};

  get t() {
    return this.terms;
  }
  get catalogue() {
    return (this.setup && this.setup.activities) || [];
  }
  get corner() {
    return this.t.s("TimeBlock");
  }

  /** DIV-1.4: the week as printed and exported, two groups of one name with their divisions. */
  get shownView() {
    if (
      this.shownMemo.view !== this.view ||
      this.shownMemo.setup !== this.setup
    ) {
      this.shownMemo = {
        view: this.view,
        setup: this.setup,
        shown: withDivisionNames(this.view, this.setup)
      };
    }
    return this.shownMemo.shown;
  }
  shownMemo = {};

  /** What the menus offer for the week shown, worked out once per week and setup. */
  get choices() {
    const memo = this.choicesMemo;
    if (
      memo.view !== this.view ||
      memo.setup !== this.setup ||
      memo.terms !== this.terms
    ) {
      this.choicesMemo = {
        view: this.view,
        setup: this.setup,
        terms: this.terms,
        list: printChoices(this.shownView, this.catalogue, this.setup, this.t)
      };
    }
    return this.choicesMemo.list;
  }

  get printing() {
    return !!this.printout;
  }

  /** The Excel file for the choice (PUB-6.10, c/shoreshScheduleExport sheetsFor). */
  async handleExport(event) {
    if (this.disabled || this.exporting) {
      return;
    }
    const choice = event.detail;
    const { catalogue, setup, t } = this;
    const view = this.shownView;
    this.exporting = true;
    try {
      await downloadWorkbook(
        this,
        sheetsFor(view, choice, catalogue, setup, t, offeringNames(setup)),
        fileNameOf(
          fileTitle(this.choices, choice, this.weekName, this.versionName)
        )
      );
    } catch (e) {
      this.dispatchEvent(
        new CustomEvent("failed", {
          detail: { message: failed("The schedule wasn't downloaded.", e) }
        })
      );
    } finally {
      this.exporting = false;
    }
  }

  /** The printout for the choice (PUB-6.6 to PUB-6.9), then the browser's print. */
  async handlePrint(event) {
    if (this.disabled || this.printout) {
      return;
    }
    if (!this.printStyleLoaded) {
      try {
        await loadStyle(this, PRINT_STYLE);
        this.printStyleLoaded = true;
      } catch {
        // Without it the paper also shows the page around the printout; it still prints.
      }
    }
    const pages = pagesFor(
      this.shownView,
      event.detail,
      this.catalogue,
      this.setup,
      this.t
    );
    if (!pages.length) {
      return;
    }
    this.printout = pages;
    this.printPending = true;
  }

  renderedCallback() {
    if (
      this.printPending &&
      this.template.querySelector("c-shoresh-schedule-print")
    ) {
      this.printPending = false;
      this.afterPrint = () => this.endPrint();
      window.addEventListener("afterprint", this.afterPrint);
      window.print();
    }
  }

  endPrint() {
    if (this.afterPrint) {
      window.removeEventListener("afterprint", this.afterPrint);
      this.afterPrint = null;
    }
    this.printout = null;
  }

  disconnectedCallback() {
    this.endPrint();
  }
}
