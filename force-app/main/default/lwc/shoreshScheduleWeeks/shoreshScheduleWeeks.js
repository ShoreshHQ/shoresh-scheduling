import { LightningElement, api } from "lwc";
import { screenLabels } from "c/shoreshScreens";

// The two ways to build a week, in the menu's order (desktop navSections.js: by name, the order
// means nothing, and neither is the camp's real schedule).
const ROUTES = ["generatedSchedule", "manualBuild"];

/**
 * Schedules (wiki decision 61): the page the menu's Schedules title opens. The season's weeks,
 * in the order the week pickers list them, each with Generated Schedule and Manual Build, which
 * open that screen on that week. Like the desktop's neutral "schedule" entry (App.jsx), it picks
 * neither for the director. With no weeks yet, it says so and leads to the Weeks screen.
 *
 * setup: the season (SeasonSetupController.getSeasonSetup). terms: the camp's words.
 * held: screen -> { weekId, locked }, the week each schedule shows and whether its week picker
 * waits on work under way (a build, a save, a publish). Meanwhile that screen's button is held
 * on every other week, as its picker is; the week it shows stays open.
 * Fires: navigate { screen, weekId } (weekId only for a week's schedule).
 */
export default class ShoreshScheduleWeeks extends LightningElement {
  @api setup;
  @api terms;
  @api held;

  get weeks() {
    const labels = screenLabels(this.terms);
    const held = this.held || {};
    return ((this.setup && this.setup.weeks) || []).map((week) => ({
      id: week.Id,
      name: week.Name,
      routes: ROUTES.map((screen) => ({
        key: `${week.Id}-${screen}`,
        screen,
        label: labels[screen],
        disabled:
          !!held[screen] &&
          held[screen].locked &&
          held[screen].weekId !== week.Id
      }))
    }));
  }

  get hasWeeks() {
    return this.weeks.length > 0;
  }

  get noWeeks() {
    return `No ${this.terms.pIn("Week")} yet`;
  }

  get weeksLabel() {
    return `${screenLabels(this.terms).weeks} →`;
  }

  handleRoute(event) {
    const { screen, week } = event.currentTarget.dataset;
    this.dispatchEvent(
      new CustomEvent("navigate", { detail: { screen, weekId: week } })
    );
  }

  handleWeeks() {
    this.dispatchEvent(
      new CustomEvent("navigate", { detail: { screen: "weeks" } })
    );
  }
}
