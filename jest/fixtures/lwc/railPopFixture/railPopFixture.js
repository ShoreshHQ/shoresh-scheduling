import { LightningElement } from "lwc";

/** A page with one rail menu, for c-shoresh-rail-pop's tests. */
export default class RailPopFixture extends LightningElement {
  chosen = [];
  ones = 0;
  more = false;

  get chosenText() {
    return this.chosen.join(",");
  }
  get moreText() {
    return String(this.more);
  }
  handleSelect(event) {
    this.chosen = [...this.chosen, event.detail.value];
  }
  handleOne() {
    this.ones += 1;
  }
  handleMore() {
    this.more = !this.more;
  }
}
