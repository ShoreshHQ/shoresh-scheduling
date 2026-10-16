import { errorMessage } from "c/shoreshErrors";

describe("errorMessage", () => {
  it("reads the message wherever Salesforce puts it", () => {
    expect(errorMessage({ body: { message: "From Apex" } })).toBe("From Apex");
    expect(
      errorMessage({ body: [{ message: "One." }, { message: "Two." }] })
    ).toBe("One. Two.");
    expect(errorMessage(new Error("Plain"))).toBe("Plain");
    expect(errorMessage("Text")).toBe("Text");
    expect(errorMessage(null)).toBe("Something went wrong.");
    expect(errorMessage({})).toBe("Something went wrong.");
  });
});
