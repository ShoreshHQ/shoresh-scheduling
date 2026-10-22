/**
 * The size check (plan §5): 500 campers, 12 offerings, 10 elective times, in the browser.
 * Wall time depends on the machine, so the bounds are loose, with room for slower CI runners.
 * Measured on a laptop when written: about 3 s with all 500 at every time (one division of 500,
 * the worst case), under 1 s for the same camp in four divisions of 125.
 */
import { assignSeats } from "c/shoreshElectiveEngine";
import { largeElectiveCamp } from "./data/electiveCamp";

function timed(input) {
  const started = Date.now();
  const out = assignSeats(input);
  return { out, ms: Date.now() - started };
}

describe("a large camp", () => {
  it("seats four divisions of 125 quickly", () => {
    const { out, ms } = timed(
      largeElectiveCamp({ campers: 500, divisions: 4 })
    );
    expect(out.seats).toHaveLength(5000);
    expect(ms).toBeLessThan(5000);
  });

  it("seats one division of 500 within a few seconds", () => {
    const { out, ms } = timed(
      largeElectiveCamp({ campers: 500, divisions: 1 })
    );
    expect(out.seats).toHaveLength(5000);
    expect(ms).toBeLessThan(20000);
  }, 30000);
});
