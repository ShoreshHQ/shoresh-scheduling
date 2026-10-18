import { LightningElement, api } from "lwc";

/**
 * "Same location?" (desktop src/screens/LocationsScreen.jsx, NearDuplicateGate): places whose
 * names differ only in capitals and spacing, one to keep. Each shows how many groups fit there
 * and how many activities happen there. The kept place starts as the one with the most
 * activities, then the one that fits the most (desktop locationMigrationReview.js
 * defaultWinner); groups that fit start at the most any of them fits. Merge moves everything to
 * the kept place and removes the others; Keep separate (or Escape) leaves them as they are.
 *
 * places: [{ id, name, fits, activities }]; terms: the camp's words; title: "Same location?" in
 * the camp's word; busy: a merge is being made; error: why the last Merge was refused.
 * Fires merge { keepId, otherIds, groupsThatFit } and close.
 */
export default class ShoreshSameLocation extends LightningElement {
  @api terms;
  @api title = "Same location?";
  @api busy = false;
  chosen;
  fits;
  _places = [];
  _error;
  focused = false;
  focusRefusal = false;

  @api
  get places() {
    return this._places;
  }
  set places(value) {
    const first = this._places.length === 0;
    this._places = value || [];
    // Shown again after a refusal: the director's choice and number stay if they still can.
    if (!this._places.some((place) => place.id === this.chosen)) {
      // Most activities first, then the most that fit (desktop defaultWinner).
      const better = (a, b) =>
        b.activities > a.activities ||
        (b.activities === a.activities && (b.fits || 0) > (a.fits || 0));
      const best = this._places.reduce((a, b) => {
        return !a || better(a, b) ? b : a;
      }, null);
      this.chosen = best ? best.id : null;
    }
    if (first) {
      this.fits = Math.max(1, ...this._places.map((p) => p.fits || 0));
    }
  }

  /** Why the last Merge was refused; the focus goes to it, inside the question. */
  @api
  get error() {
    return this._error;
  }
  set error(value) {
    this._error = value;
    this.focusRefusal = !!value;
  }

  get options() {
    const t = this.terms;
    const fits = this.fitsLabel;
    const activities = (n) => (n === 1 ? t.sIn("Activity") : t.pIn("Activity"));
    return this._places.map((place) => {
      const fit = place.fits || place.fits === 0 ? place.fits : "—";
      return {
        value: place.id,
        label: `${place.name} · ${fits}: ${fit} · ${place.activities} ${activities(place.activities)} here`
      };
    });
  }

  /** One word for the idea: the camp's "Groups that fit", in the list and on the number. */
  get fitsLabel() {
    return this.terms.s("GroupsThatFit");
  }

  get mergeDisabled() {
    return this.busy ? "true" : "false";
  }

  renderedCallback() {
    if (!this.focused) {
      const first = this.template.querySelector('[data-id="keep"]');
      if (first) {
        first.focus();
        this.focused = true;
      }
    }
    if (this.focusRefusal) {
      const refusal = this.template.querySelector('[data-id="refusal"]');
      if (refusal) {
        this.focusRefusal = false;
        refusal.focus();
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
    // The buttons stay focusable while merging (aria-disabled), so focus never leaves the
    // question; a click then does nothing.
    if (this.busy) {
      return;
    }
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
    if (this.busy) {
      return;
    }
    this.dispatchEvent(new CustomEvent("close"));
  }

  /** Escape leaves the places as they are; Tab and Shift+Tab stay inside the question. */
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
        '[data-id="refusal"], lightning-radio-group, lightning-input, button'
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
