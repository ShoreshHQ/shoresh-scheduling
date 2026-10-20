import { errorMessage, failed, reasonOf, refusal } from "c/shoreshErrors";

// Shapes as Lightning delivers them to a screen: an AuraHandledException (our own words), an
// exception our Apex didn't catch, and the platform's or the browser's own failures.
const ours = (message) => ({
  status: 500,
  body: { message, exceptionType: "System.AuraHandledException" }
});
const uncaught = {
  status: 500,
  body: {
    exceptionType: "System.DmlException",
    isUserDefinedException: false,
    message:
      "Insert failed. First exception on row 0; first error: FIELD_CUSTOM_VALIDATION_EXCEPTION, Ends before it starts: []",
    stackTrace: "Class.SetupSaves.save: line 41, column 1"
  }
};

let consoleError;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("reasonOf", () => {
  it("shows Shoresh's own words as they are, wherever Salesforce puts them", () => {
    expect(
      reasonOf(ours('"Bunk 3": That name is already used. Pick another.'))
    ).toBe('"Bunk 3": That name is already used. Pick another.');
    expect(reasonOf({ body: { message: "Group A isn't at camp." } })).toBe(
      "Group A isn't at camp."
    );
    expect(reasonOf({ body: [{ message: "One." }, { message: "Two." }] })).toBe(
      "One. Two."
    );
    expect(reasonOf(refusal("Notes for “Swim” is too long."))).toBe(
      "Notes for “Swim” is too long."
    );
    expect(reasonOf("Not allowed.")).toBe("Not allowed.");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("never shows Salesforce or code text: the why is 'Try again.' and the detail goes to the console", () => {
    const raw = [
      uncaught,
      // An uncaught type, even with plain-looking text.
      {
        body: {
          exceptionType: "System.NullPointerException",
          message: "Attempt to de-reference a null object"
        }
      },
      // Platform words that arrive without a type.
      { body: { message: "FIELD_CUSTOM_VALIDATION_EXCEPTION, Ends early" } },
      { body: { message: "Week__c: bad value" } },
      { body: { message: "Script-thrown exception" } },
      { body: { message: "An internal server error has occurred" } },
      { body: { message: "Disconnected or Canceled" } },
      { body: [{ message: "One." }, { message: "UNKNOWN_EXCEPTION" }] },
      // The browser's own errors.
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      new Error("Plain"),
      // Nothing to read.
      null,
      {},
      { body: [{}] },
      { body: [] },
      ""
    ];
    raw.forEach((error) => {
      expect(reasonOf(error)).toBe("Try again.");
    });
    expect(consoleError).toHaveBeenCalledTimes(raw.length);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), uncaught);
  });

  it("names in quotes are the camp's own words, whatever they hold", () => {
    expect(reasonOf(ours('"BUNK_A" isn\'t at camp then.'))).toBe(
      '"BUNK_A" isn\'t at camp then.'
    );
  });
});

describe("failed", () => {
  it("says what didn't happen and whether anything was lost, then why (desktop shape)", () => {
    expect(
      failed(
        "Bunks not saved. Your changes are still here.",
        ours('"Bunk 3": That name is already used. Pick another.')
      )
    ).toBe(
      'Bunks not saved. Your changes are still here. "Bunk 3": That name is already used. Pick another.'
    );
  });

  it("when the reason isn't ours, says what didn't happen and to try again", () => {
    expect(failed("Swim wasn't saved.", uncaught)).toBe(
      "Swim wasn't saved. Try again."
    );
    expect(failed("Week 1 couldn't be opened.", null)).toBe(
      "Week 1 couldn't be opened. Try again."
    );
  });

  it("a fallback passed along from errorMessage isn't said twice", () => {
    expect(failed("Swim wasn't saved.", refusal(errorMessage(uncaught)))).toBe(
      "Swim wasn't saved. Try again."
    );
  });
});

describe("errorMessage", () => {
  it("with no subject to put in front, the fallback says nothing happened", () => {
    expect(errorMessage(uncaught)).toBe("That didn't work. Try again.");
    expect(errorMessage(ours("That option can't be built."))).toBe(
      "That option can't be built."
    );
  });
});
