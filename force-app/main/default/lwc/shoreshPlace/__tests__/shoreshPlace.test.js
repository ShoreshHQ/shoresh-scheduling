import { rememberedPlace, rememberPlace } from "c/shoreshPlace";

describe("c/shoreshPlace", () => {
  it("keeps the place for this tab and gives it back", () => {
    expect(rememberedPlace()).toBeNull();
    rememberPlace({ campId: "c1", seasonId: "s1", screen: "manualBuild" });
    expect(rememberedPlace()).toEqual({
      campId: "c1",
      seasonId: "s1",
      screen: "manualBuild"
    });
  });

  it("works without storage: nothing kept, nothing thrown", () => {
    const spy = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const set = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => rememberPlace({ screen: "roots" })).not.toThrow();
    expect(rememberedPlace()).toBeNull();
    spy.mockRestore();
    set.mockRestore();
  });

  it("ignores what isn't a place", () => {
    window.sessionStorage.setItem("shoresh.place", "not json");
    expect(rememberedPlace()).toBeNull();
  });
});
