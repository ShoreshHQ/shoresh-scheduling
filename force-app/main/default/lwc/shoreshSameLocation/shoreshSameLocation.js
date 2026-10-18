import { LightningElement, api } from "lwc";

/**
 * "Same location?" (desktop src/screens/LocationsScreen.jsx, NearDuplicateGate): places whose
 * names differ only in capitals and spacing, one to keep. Each shows how many groups fit there at
 * once and how many activities happen there. The kept place starts as the one with the most
 * activities, then the one that fits the most (desktop locationMigrationReview.js
 * defaultWinner); groups that fit start at the most any of them fits. Merge moves everything to
 * the kept place and removes the others; Keep separate (or Escape) leaves them as they are.
 *
 * places: [{ id, name, fits, activities }]; terms: the camp's words; error: a refused merge.
 * Fires merge { keepId, otherIds, groupsThatFit } and close.
 */
export default class ShoreshSameLocation extends LightningElement {
  @api terms;
  @api busy = false;
  /** Why the last Merge was refused, shown in the question (the page behind is covered). */
  @api error;
  chosen;
  fits;
  _places = [];
  focused = false;

  @api
  get places() {
    return this._places;
  }
  set places(value) {
    this._places = value || [];
    // Most activities first, then the most that fit (desktop defaultWinner).
    const better = (a, b) =>
      b.activities > a.activities ||
      (b.activities === a.activities && b.fits > a.fits);
    const best = this._places.reduce((a, b) => {
      return !a || better(a, b) ? b : a;
    }, null);
    this.chosen = best ? best.id : null;
    this.fits = Math.max(1, ...this._places.map((p) => p.fits || 0));
  }

  get options() {
    const t = this.terms;
    const word = (n, term) => (n === 1 ? t.sIn(term) : t.pIn(term));
    return this._places.map((place) => ({
      value: place.id,
      label: `${place.name} · ${place.fits} ${word(place.fits, "Group")} at once · ${place.activities} ${word(place.activities, "Activity")} here`
    }));
  }

  get fitsLabel() {
    return this.terms.s("GroupsThatFit");
  }

  renderedCallback() {
    if (!this.focused) {
      const first = this.template.querySelector('[data-id="keep"]');
      if (first) {
        first.focus();
        this.focused = true;
      }
    }
  }

  handleChoose(event) {
    this.chosen = event.detail.value;
  }

  handleFits(event) {
    const value = event.detail.value;
    this.fits = value === "" || value === null ? null : Number(value);
  }

  handleMerge() {
    const input = this.template.querySelector('[data-id="fits"]');
    if (input && !input.reportValidity()) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("merge", {
        detail: {
          keepId: this.chosen,
          otherIds: this._places
            .map((p) => p.id)
            .filter((id) => id !== this.chosen),
          groupsThatFit: this.fits
        }
      })
    );
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  /** Escape leaves the places as they are; Tab stays inside the question. */
  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.handleClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const stops = [
      ...this.template.querySelectorAll(
        "lightning-radio-group, lightning-input, button"
      )
    ];
    const at = stops.indexOf(this.template.activeElement);
    const next = event.shiftKey
      ? (at - 1 + stops.length) % stops.length
      : (at + 1) % stops.length;
    event.preventDefault();
    stops[next].focus();
  }
}
