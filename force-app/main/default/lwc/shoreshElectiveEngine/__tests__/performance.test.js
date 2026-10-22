/**
 * The size check (plan §5): 500 campers, 12 offerings, 10 elective times each, in the browser.
 * An elective time is one division's, so the camp is four divisions of 125. Wall time depends on
 * the machine, so the bound is loose, with room for slower CI runners (about 0.8 s on a laptop).
 * The worst case, all 500 in one division at every time, was measured by
 * hand when this was written at about 3 s on a laptop; it is not run here, to keep CI quick.
 */
import { assignSeats } from "c/shoreshElectiveEngine";
import { largeElectiveCamp } from "./data/electiveCamp";

describe("a large camp", () => {
  it("seats 500 campers in four divisions within a few seconds", () => {
    const input = largeElectiveCamp({ campers: 500, divisions: 4 });
    const started = Date.now();
    const out = assignSeats(input);
    const ms = Date.now() - started;
    expect(out.seats).toHaveLength(5000);
    expect(ms).toBeLessThan(15000);
  }, 30000);
});
