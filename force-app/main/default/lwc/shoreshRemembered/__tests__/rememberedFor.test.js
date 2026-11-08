import { FIELD } from "c/shoreshSchema";
import { rememberedFor } from "c/shoreshRemembered";

const setup = { season: { [FIELD.Season.Camp]: "camp1" } };
const row = {
  key: "kind|Main|Lunch",
  answer: "fixed",
  byYou: true,
  answeredOn: "2026-07-03"
};

describe("rememberedFor", () => {
  // MEMO-6.1
  it("reads the camp's answers, with who gave them and when", async () => {
    const read = jest.fn().mockResolvedValue([row]);
    await expect(rememberedFor(setup, read)).resolves.toEqual({
      answers: { "kind|Main|Lunch": "fixed" },
      notes: { "kind|Main|Lunch": "Remembered from your answer on Jul 3" },
      rows: [row]
    });
    expect(read).toHaveBeenCalledWith({ campId: "camp1" });
  });

  it("without them everything is asked: no camp, or a read that fails", async () => {
    const empty = { answers: {}, notes: {}, rows: [] };
    const read = jest.fn();
    await expect(rememberedFor({}, read)).resolves.toEqual(empty);
    await expect(rememberedFor(null, read)).resolves.toEqual(empty);
    expect(read).not.toHaveBeenCalled();
    await expect(
      rememberedFor(setup, jest.fn().mockRejectedValue(new Error("no")))
    ).resolves.toEqual(empty);
  });
});
