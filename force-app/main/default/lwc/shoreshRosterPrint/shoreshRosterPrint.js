import { LightningElement, api } from "lwc";

/**
 * Elective rosters on paper (electives slice E10; repo ADR 0018 choice 52; Greg's decision 53.4,
 * design-research/electives-r1 rosters-a): one page per offering, its whole week, each elective
 * time a column with "12 of 12" and who is there, sorted by bunk with the bunk beside each name.
 * What a counsellor running the activity carries. Shown only on paper: on screen it takes no
 * room. The seats screen renders it just before it asks the browser to print, with the
 * ShoreshPrint style, which leaves only a printout on the paper (.shoresh-print).
 *
 * pages: rosterPages(...) from the seats screen's downloads. header: "Chugim · Week 3 · Final 14
 * Oct". file: the roster file's name, in each page's foot.
 */
export default class ShoreshRosterPrint extends LightningElement {
  @api pages = [];
  @api header;
  @api file;

  get shown() {
    const total = (this.pages || []).length;
    return (this.pages || []).map((page, i) => ({
      ...page,
      foot: `${this.file || ""} · page ${i + 1} of ${total}`
    }));
  }
}
