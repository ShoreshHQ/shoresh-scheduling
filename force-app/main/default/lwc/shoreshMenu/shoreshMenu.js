import { LightningElement, api } from "lwc";

/**
 * The left-hand menu (desktop-style): Roots, then sections of screens. Entries not built yet say
 * "Coming" and cannot be opened; entries that need a season are greyed out until there is one.
 *
 * sections: from shoreshScreens.menuSections. current: the screen shown.
 * Fires: navigate { screen }
 */
export default class ShoreshMenu extends LightningElement {
  @api sections = [];
  @api current;

  get view() {
    return (this.sections || []).map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const active = item.key === this.current;
        return {
          ...item,
          className: active
            ? "slds-nav-vertical__item slds-is-active"
            : "slds-nav-vertical__item",
          ariaCurrent: active ? "page" : null,
          markClass: item.mark ? `menu-mark menu-mark_${item.mark.kind}` : null
        };
      })
    }));
  }

  handleClick(event) {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }
}
