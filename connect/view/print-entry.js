// The printout's one entry (scripts/build-connect.js, API-1.86, API-1.88): the screens' own
// printout components, unchanged, made into a page the connector saves with the pages to print.
import { createElement } from "lwc";
import SchedulePrint from "c/shoreshSchedulePrint";
import RosterPrint from "c/shoreshRosterPrint";

window.ShoreshPrintout = {
  create: (kind) =>
    kind === "rosters"
      ? createElement("c-shoresh-roster-print", { is: RosterPrint })
      : createElement("c-shoresh-schedule-print", { is: SchedulePrint })
};
