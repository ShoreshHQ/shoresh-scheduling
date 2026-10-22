import { LightningElement, api } from "lwc";

/**
 * Manual Build's drawer under the grid (docs/design/manual-build.html, wiki decisions 38 and 41,
 * ADR 0008 part 8), in place of the desktop's activity list on the left (ActivityPalette.jsx). In
 * the time column: "N under" (the week's measure, the counter's number) and the Filter box. On
 * the grid's columns: one tile per activity, its name only, so each tile sits under a bunk; more
 * activities than columns wrap onto more rows of the same columns (every activity stays in view
 * and in the Tab order; nothing hides off to the side). An activity over its weekly limit carries
 * the needs-a-look corner. Under the pointer, with keyboard focus or held, a tile shows "placed
 * of goal" in the counter's words; a screen reader hears them on the tile always.
 *
 * A tile is dragged onto a slot to place it, or picked (a click, Enter or Space) and then put
 * down on a slot (a click, Space, or Enter from the keyboard). A placement dragged back onto the
 * drawer is taken out of the week.
 *
 * tiles: from the week editor's counts.js ({ id, name, over, words, said }). under: the "N
 * under" number. columns: how many columns the grid above has. heading: the camp's word for
 * activities. pickedId: the activity held (picked up or being dragged), if any.
 *
 * The season's special events have their own section at the end (decision 47.2; mockup
 * design-research/special-r1): "Events" in the time column, then a tile per event with its quiet
 * flag before the name (decision 47.3). An event tile is picked or dragged as an activity's is,
 * and put down on a cell or the cells chosen together. events: [{ id, name, said }];
 * eventsHeading: the section's word; pickedEventId: the event held.
 *
 * Events: filter { value }, pickactivity { id }, activitydragstart { id }, pickevent { id },
 * eventdragstart { id }, tilehover { id } (null when the pointer or focus leaves the tile),
 * removedrop { data }.
 */
export default class ShoreshBuildPalette extends LightningElement {
  @api tiles = [];
  @api under = 0;
  @api columns = 1;
  @api heading;
  @api filter = "";
  @api pickedId;
  @api events = [];
  @api eventsHeading = "Events";
  @api pickedEventId;

  // The tile under the pointer or with keyboard focus: its numbers show.
  hoverId = null;

  get filterLabel() {
    return `Filter ${String(this.heading || "").toLowerCase()}`;
  }

  /** The tiles on the grid's columns, after the time column and its gap. */
  get tilesStyle() {
    return `grid-template-columns: repeat(${Math.max(1, this.columns || 1)}, minmax(0, 1fr));`;
  }

  get shownTiles() {
    return (this.tiles || []).map((tile) => {
      const held = tile.id === this.pickedId;
      let className = "tile";
      if (tile.over) {
        className += " tile_over";
      }
      if (held) {
        className += " tile_held";
      }
      return {
        ...tile,
        pressed: String(held),
        className,
        showWords: !!tile.words && (held || tile.id === this.hoverId)
      };
    });
  }

  get shownEvents() {
    return (this.events || []).map((event) => {
      const held = event.id === this.pickedEventId;
      return {
        ...event,
        pressed: String(held),
        className: held ? "tile tile_event tile_held" : "tile tile_event"
      };
    });
  }

  get hasEvents() {
    return (this.events || []).length > 0;
  }

  handlePickEvent(event) {
    this.dispatchEvent(
      new CustomEvent("pickevent", {
        detail: { id: event.currentTarget.dataset.id }
      })
    );
  }

  handleEventDragStart(event) {
    const { id } = event.currentTarget.dataset;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copy";
      const tile = (this.events || []).find((t) => t.id === id);
      event.dataTransfer.setData("text/plain", tile ? tile.name : "");
    }
    this.dispatchEvent(new CustomEvent("eventdragstart", { detail: { id } }));
  }

  get noMatches() {
    return (
      !!this.filter && !(this.tiles || []).length && !(this.events || []).length
    );
  }

  handleFilter(event) {
    this.dispatchEvent(
      new CustomEvent("filter", { detail: { value: event.target.value } })
    );
  }

  /**
   * Ctrl or Cmd with Z or Y in the box is the box's own Undo: it goes no further, so the week
   * editor (which can't see into this drawer) doesn't undo a schedule change as well.
   */
  handleFilterKey(event) {
    const key = String(event.key).toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
      event.stopPropagation();
    }
  }

  handleEnter(event) {
    const { id } = event.currentTarget.dataset;
    if (this.hoverId !== id) {
      this.hoverId = id;
      this.dispatchEvent(new CustomEvent("tilehover", { detail: { id } }));
    }
  }

  handleLeave(event) {
    if (this.hoverId === event.currentTarget.dataset.id) {
      this.hoverId = null;
      this.dispatchEvent(
        new CustomEvent("tilehover", { detail: { id: null } })
      );
    }
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
      // The name shown, so a drop somewhere else (a text box) writes a word, not a record Id.
      const tile = (this.tiles || []).find((t) => t.id === id);
      event.dataTransfer.setData("text/plain", tile ? tile.name : "");
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
    const data = event.dataTransfer
      ? event.dataTransfer.getData("text/plain")
      : "";
    this.dispatchEvent(new CustomEvent("removedrop", { detail: { data } }));
  }
}
