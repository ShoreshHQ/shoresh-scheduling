import { LightningElement, api } from "lwc";

/**
 * Manual Build's activity list (desktop ActivityPalette.jsx): a Filter box, then the activities
 * still under their weekly minimum, then the rest, each with "N placed (needs 3–5)". An activity
 * is dragged onto a slot to place it, or picked with Enter or Space (then dropped on a slot from
 * the keyboard). A placement dragged back onto the list is taken out of the week.
 *
 * stillNeeded, placed: chips from counts.js. heading: the camp's word for activities.
 * pickedId: the activity picked from the keyboard, if any.
 */
export default class ShoreshBuildPalette extends LightningElement {
  @api stillNeeded = [];
  @api placed = [];
  @api heading;
  @api filter = "";
  @api pickedId;

  get filterLabel() {
    return `Filter ${String(this.heading || "").toLowerCase()}`;
  }

  chip(c) {
    const picked = c.id === this.pickedId;
    return {
      ...c,
      pressed: String(picked),
      className: picked ? "chip chip_picked" : "chip"
    };
  }
  get neededChips() {
    return (this.stillNeeded || []).map((c) => this.chip(c));
  }
  get placedChips() {
    return (this.placed || []).map((c) => this.chip(c));
  }
  get hasNeeded() {
    return this.neededChips.length > 0;
  }
  get hasBoth() {
    return this.hasNeeded && this.placedChips.length > 0;
  }
  get noMatches() {
    return !this.hasNeeded && this.placedChips.length === 0;
  }

  handleFilter(event) {
    this.dispatchEvent(
      new CustomEvent("filter", { detail: { value: event.target.value } })
    );
  }

  handlePick(event) {
    this.dispatchEvent(
      new CustomEvent("pickactivity", {
        detail: { id: event.currentTarget.dataset.id }
      })
    );
  }

  handleDragStart(event) {
    const { id } = event.currentTarget.dataset;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", id);
    }
    this.dispatchEvent(
      new CustomEvent("activitydragstart", { detail: { id } })
    );
  }

  handleDragOver(event) {
    event.preventDefault();
  }

  handleDrop(event) {
    event.preventDefault();
    this.dispatchEvent(new CustomEvent("removedrop"));
  }
}
