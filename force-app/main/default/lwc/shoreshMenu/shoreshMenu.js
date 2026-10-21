import { LightningElement, api } from "lwc";

/**
 * The left-hand menu (desktop-style): Roots, then sections of screens. Entries not built yet say
 * "Coming" and cannot be opened; entries that need a season are greyed out until there is one.
 * Both stay in the tab order, marked unavailable, with why read out ("Needs a Season"), so a
 * keyboard or screen-reader user learns they exist and what opens them.
 *
 * Looks like the round 13 mock-up (docs/design/manual-build.html, ADR 0015): the camp's name
 * and season at the top, the section titles small, the screen shown raised. When the schedule
 * shown no longer matches setup, its foot says so, with Update to match setup.
 *
 * sections: from shoreshScreens.menuSections. current: the screen shown. campName, seasonName:
 * the camp row. setupChanged: the schedule shown can be updated to match setup. setupBusy: that
 * schedule is busy (an edit saving, a build), so its Update waits, as the one on the screen does.
 * Fires: navigate { screen }, updatetomatch
 */
export default class ShoreshMenu extends LightningElement {
  @api sections = [];
  @api current;
  @api campName;
  @api seasonName;
  @api setupChanged = false;
  @api setupBusy = false;

  get view() {
    return (this.sections || []).map((section) => ({
      ...section,
      // Entries under a section title sit indented under it; Roots sits on its own.
      sectionClass: section.title ? "section section_titled" : "section",
      items: section.items.map((item) => {
        const active = item.key === this.current;
        return {
          ...item,
          className: active ? "menu-item slds-is-active" : "menu-item",
          // The screen shown wears the one raised treatment.
          actionClass: active ? "menu-action shoresh-raised" : "menu-action",
          ariaCurrent: active ? "page" : null,
          isRoots: item.key === "roots",
          markClass: item.mark ? `menu-mark menu-mark_${item.mark.kind}` : null,
          // The ✓ is drawn as an icon: green on white passes the 3:1 a mark needs, not the
          // 4.5:1 text would (WCAG 1.4.11).
          markIsDone: !!item.mark && item.mark.kind === "done"
        };
      })
    }));
  }

  /** An entry that can't open yet: the click does nothing (its words say why). */
  handleDisabledClick(event) {
    event.preventDefault();
  }

  /**
   * Focus on the foot's Update to match setup, when it is there and can be used (the schedule's
   * list of changes closed and gave focus back). True when it took focus.
   */
  @api
  focusUpdateToMatch() {
    const button = this.template.querySelector(
      '[data-id="menu-update-to-match"]'
    );
    if (!button || button.disabled) {
      return false;
    }
    button.focus();
    return true;
  }

  /** The foot's Update to match setup: the schedule shown opens its list of changes. */
  handleUpdateToMatch() {
    this.dispatchEvent(new CustomEvent("updatetomatch"));
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
