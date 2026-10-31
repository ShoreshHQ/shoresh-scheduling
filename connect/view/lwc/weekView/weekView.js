import { LightningElement, api } from "lwc";
import {
  dailyGrid,
  days,
  withRaindrops,
  withSpecials
} from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";

// Salesforce's .slds-assistive-text, as SLDS has it.
const ASSISTIVE =
  ".slds-assistive-text{position:absolute!important;margin:-1px!important;border:0!important;padding:0!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;text-transform:none!important;white-space:nowrap!important}";

/**
 * Shoresh's own view of a published week in an AI chat (docs/protocol/api.md API-1.26): each day's
 * Daily View, drawn by the Schedules screen's own grid (c/shoreshScheduleGrid) from the Schedules
 * screen's own view module (c/shoreshScheduleViews), on what /v1/week_view answers: the same
 * days the screen opens, with the camp's words. Nothing here works anything out of its own.
 *
 * week: { season, week, labels, programs: [{ program, view }] }.
 */
export default class WeekView extends LightningElement {
  @api week;

  /**
   * The grid's words for screen readers use Salesforce's own hidden-text class, which a page
   * outside Salesforce doesn't have: given here, the same rule, inside each grid.
   */
  renderedCallback() {
    this.template
      .querySelectorAll("c-shoresh-schedule-grid")
      .forEach((grid) => {
        const root = grid.shadowRoot;
        if (root && !root.querySelector("style[data-assistive]")) {
          const style = document.createElement("style");
          style.dataset.assistive = "";
          style.textContent = ASSISTIVE;
          root.appendChild(style);
        }
      });
  }

  get title() {
    return this.week ? `${this.week.week} · ${this.week.season}` : "";
  }

  get programs() {
    if (!this.week) {
      return [];
    }
    const t = buildTerms(this.week.labels);
    const many = this.week.programs.length > 1;
    return this.week.programs.map((p, i) => {
      // As the Schedules page shows a published week (shoreshSchedules: shown).
      const shown = withRaindrops(withSpecials(p.view));
      return {
        key: String(i),
        name: many ? p.program : null,
        days: days(shown).map((d) => ({
          key: d.key,
          heading: `${d.label} · ${d.sub}${d.special ? ` · ${d.special}` : ""}`,
          problem: d.problem,
          grid: d.problem ? null : dailyGrid(shown, d.index, t),
          corner: t.s("TimeBlock")
        }))
      };
    });
  }
}
