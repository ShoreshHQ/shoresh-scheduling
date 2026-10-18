import { errorMessage, failed } from "c/shoreshErrors";

describe("errorMessage", () => {
  it("reads the message wherever Salesforce puts it", () => {
    expect(errorMessage({ body: { message: "From Apex" } })).toBe("From Apex");
    expect(
      errorMessage({ body: [{ message: "One." }, { message: "Two." }] })
    ).toBe("One. Two.");
    expect(errorMessage(new Error("Plain"))).toBe("Plain");
    expect(errorMessage("Text")).toBe("Text");
  });

  it("with no reason to read, says so instead of a bare 'Something went wrong.'", () => {
    const unknown = "Shoresh couldn't tell why. Try again.";
    expect(errorMessage(null)).toBe(unknown);
    expect(errorMessage({})).toBe(unknown);
    expect(errorMessage({ body: [{}] })).toBe(unknown);
  });
});

describe("failed", () => {
  it("says what didn't happen and whether anything was lost, then why (desktop shape)", () => {
    expect(
      failed("Bunks not saved. Your changes are still here.", {
        body: { message: '"Bunk 3": That name is already used. Pick another.' }
      })
    ).toBe(
      'Bunks not saved. Your changes are still here. "Bunk 3": That name is already used. Pick another.'
    );
    expect(failed("Week 1 couldn't be opened.", null)).toBe(
      "Week 1 couldn't be opened. Shoresh couldn't tell why. Try again."
    );
  });
});
