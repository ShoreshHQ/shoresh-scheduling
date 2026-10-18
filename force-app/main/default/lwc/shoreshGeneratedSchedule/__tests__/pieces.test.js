import { generateWeek } from "c/shoreshEngine";
import { loadWeek } from "c/shoreshGeneratedWeek";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import { buildTerms } from "c/shoreshTerms";
import { buildInPieces, nextTurn } from "../pieces";
import { BIG, PROGRAM, WEEK, camp } from "./data/camp";

jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const terms = buildTerms([]);

async function bigInput() {
  getInputs.mockResolvedValue(camp(BIG));
  const loaded = await loadWeek(PROGRAM, WEEK);
  return { ...loaded.input, terms, option: 1 };
}

describe("buildInPieces", () => {
  afterEach(() => {
    delete global.MessageChannel;
  });

  it("resolves to the week generateWeek builds, telling how far it has got on the way", async () => {
    const input = await bigInput();
    const seen = [];
    const result = await buildInPieces(input, (f) => seen.push(f));
    expect(result).toEqual(generateWeek(input));
    expect(seen.length).toBeGreaterThan(1);
    seen.forEach((f, i) => {
      expect(f).toBeGreaterThanOrEqual(i ? seen[i - 1] : 0);
      expect(f).toBeLessThanOrEqual(1);
    });
  });

  it("stops, resolving to nothing, once the week is no longer wanted", async () => {
    const input = await bigInput();
    let pieces = 0;
    const result = await buildInPieces(
      input,
      () => {
        pieces += 1;
      },
      () => pieces < 2
    );
    expect(result).toBeNull();
    expect(pieces).toBe(2);
  });

  it("gives the browser its turn with a message to itself, closing the channel after", async () => {
    const closed = jest.fn();
    // A browser's MessageChannel: the message arrives later, as a task of its own.
    global.MessageChannel = class {
      constructor() {
        this.port1 = { onmessage: null, close: closed };
        this.port2 = {
          postMessage: () =>
            Promise.resolve().then(() => this.port1.onmessage({}))
        };
      }
    };
    await nextTurn();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("finishes without the turns where a page may not message itself", async () => {
    global.MessageChannel = class {
      constructor() {
        throw new Error("not allowed");
      }
    };
    await expect(nextTurn()).resolves.toBeUndefined();
  });
});
