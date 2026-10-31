// The week view's one entry (scripts/build-connect.js): Shoresh's own components, made into a
// page an AI chat app shows. Nothing else.
import { createElement } from "lwc";
import WeekView from "shoresh/weekView";

window.ShoreshWeekView = {
  create: () => createElement("shoresh-week-view", { is: WeekView })
};
