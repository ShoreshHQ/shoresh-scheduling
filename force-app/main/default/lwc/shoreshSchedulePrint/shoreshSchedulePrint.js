import { LightningElement, api } from "lwc";
import { CANT_BE_SHOWN } from "c/shoreshScheduleExport";

/**
 * The printout of one opened schedule (parity item 10): one page per day, group or activity
 * (c/shoreshScheduleExport printPages), each a plain black-on-white timetable with its title, the
 * week and the version's name. Shown only on paper: on screen it takes no room. The Schedules
 * page renders it just before it asks the browser to print, and loads the ShoreshPrint style,
 * which leaves only this on the paper while it is on the page.
 *
 * A day a special day replaces prints its own schedule with its notes under it (ADR 0014 slice 5).
 *
 * pages: printPages(...). week: the week's name. version: the version's name. corner: the
 * time-block column's heading, in the camp's word.
 */
export default class ShoreshSchedulePrint extends LightningElement {
  @api pages = [];
  @api week;
  @api version;
  @api corner;

  get cantBeShown() {
    return CANT_BE_SHOWN;
  }
}
