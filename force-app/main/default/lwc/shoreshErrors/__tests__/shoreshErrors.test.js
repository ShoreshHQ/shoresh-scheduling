import {
  closeRefusal,
  errorMessage,
  floatRefusal,
  failed,
  refusedBecause,
  reasonOf,
  refusal,
  SUPPORT_EMAIL
} from "c/shoreshErrors";
import keepFromScreen from "@salesforce/apex/ErrorCodes.keepFromScreen";

jest.mock(
  "@salesforce/apex/ErrorCodes.keepFromScreen",
  () => ({ default: jest.fn(() => Promise.resolve()) }),
  { virtual: true }
);

// CORE-6.15: a support code, letters that can't be read as another, as ErrorCodes.cls makes them.
const CODE =
  / For support: ([ACDEFGHJKMNPQRTUVWXY34679]{3}-[ACDEFGHJKMNPQRTUVWXY34679]{3})\.$/;
/** The words without their support code; fails when there is none. */
function withoutCode(text) {
  expect(text).toMatch(CODE);
  return text.replace(CODE, "");
}
const flush = () =>
  [...Array(8)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

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
  keepFromScreen.mockClear();
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
    // A camp's file name in an import's refusal (ImportRemovals) is its own words.
    expect(
      reasonOf(
        ours(
          "Swim is on Imported from MapleGrove.xlsx, so it can't be removed."
        )
      )
    ).toBe("Swim is on Imported from MapleGrove.xlsx, so it can't be removed.");
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
      // Seen in the test org: an Apex method the page asked for that isn't there.
      {
        body: {
          message:
            "No apex action available for GeneratedScheduleController.getInputs"
        }
      },
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
      expect(withoutCode(reasonOf(error))).toBe("Try again.");
    });
    expect(consoleError).toHaveBeenCalledTimes(raw.length);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), uncaught);
  });

  it("a camp too big for one request says so, and that trying again won't help", () => {
    const tooBig = [
      {
        body: {
          exceptionType: "System.LimitException",
          message: "Too many SOQL queries: 101"
        }
      },
      { body: { message: "Apex CPU time limit exceeded" } },
      { body: [{ message: "Too many DML rows: 10001" }] }
    ];
    tooBig.forEach((error) => {
      expect(
        withoutCode(failed("That import could not be undone.", error))
      ).toBe(
        `That import could not be undone. This camp is bigger than Salesforce lets Shoresh handle in one go, so trying again won't help. Open Help in Settings, or write to ${SUPPORT_EMAIL}.`
      );
    });
    expect(consoleError).toHaveBeenCalledTimes(tooBig.length);
  });

  it("names in quotes are the camp's own words, whatever they hold", () => {
    expect(reasonOf(ours('"BUNK_A" isn\'t at camp then.'))).toBe(
      '"BUNK_A" isn\'t at camp then.'
    );
  });
});

// Word walk W4: one clause naming what failed, never "Not saved. Nothing was saved. Your
// changes are still here."
describe("failed", () => {
  it("says what didn't happen in its first sentence, then why", () => {
    expect(
      failed(
        "Bunks not saved. Your changes are still here.",
        ours('"Bunk 3": That name is already used. Pick another.')
      )
    ).toBe(
      'Bunks not saved. "Bunk 3": That name is already used. Pick another.'
    );
  });

  it("when the reason isn't ours, says what didn't happen and to try again", () => {
    expect(withoutCode(failed("Swim wasn't saved.", uncaught))).toBe(
      "Swim wasn't saved. Try again."
    );
    expect(withoutCode(failed("Week 1 couldn't be opened.", null))).toBe(
      "Week 1 couldn't be opened. Try again."
    );
    // A name in quotes may hold a full stop.
    expect(
      withoutCode(
        failed('"Week 1." not deleted. Nothing was removed.', uncaught)
      )
    ).toBe('"Week 1." not deleted. Try again.');
  });

  it("a change made but not shown yet keeps saying it was done", () => {
    expect(
      failed(
        "Done, but the screen couldn't show it yet. Reload the page.",
        ours("That is no longer there.")
      )
    ).toBe(
      "Done, but the screen couldn't show it yet. Reload the page. That is no longer there."
    );
  });

  it("a fallback passed along from errorMessage isn't said twice", () => {
    const said = errorMessage(uncaught);
    const shown = failed("Swim wasn't saved.", refusal(said));
    expect(withoutCode(shown)).toBe("Swim wasn't saved. Try again.");
    expect(shown.match(CODE)[1]).toBe(said.match(CODE)[1]);
  });
});

describe("refusedBecause", () => {
  it("Shoresh's own reason is said alone, where its place names what failed", () => {
    expect(
      refusedBecause(
        "Bunks not saved.",
        ours('"Bunk 3": That name is already used. Pick another.')
      )
    ).toBe('"Bunk 3": That name is already used. Pick another.');
  });

  it("otherwise says what didn't happen, as failed() does", () => {
    expect(withoutCode(refusedBecause("Bunks not saved.", uncaught))).toBe(
      "Bunks not saved. Try again."
    );
    expect(
      withoutCode(
        refusedBecause("Bunks not saved.", refusal(errorMessage(uncaught)))
      )
    ).toBe("Bunks not saved. Try again.");
    const limit = { body: { message: "Apex CPU time limit exceeded" } };
    expect(
      refusedBecause("Bunks not saved.", refusal(errorMessage(limit)))
    ).toMatch(/^Bunks not saved\. This camp is bigger than Salesforce/);
    expect(
      refusedBecause(
        "Done, but the screen couldn't show it yet. Reload the page.",
        ours("No.")
      )
    ).toBe("Done, but the screen couldn't show it yet. Reload the page. No.");
  });
});

describe("errorMessage", () => {
  it("with no subject to put in front, the fallback says nothing happened", () => {
    expect(withoutCode(errorMessage(uncaught))).toBe(
      "That didn't work. Try again."
    );
    expect(errorMessage(ours("That option can't be built."))).toBe(
      "That option can't be built."
    );
  });
});

describe("support codes (CORE-6.15)", () => {
  it("Shoresh's own words carry no code, and nothing is kept for them", async () => {
    expect(reasonOf(ours("Group A isn't at camp."))).toBe(
      "Group A isn't at camp."
    );
    await flush();
    expect(keepFromScreen).not.toHaveBeenCalled();
  });

  it("a code the server already gave is shown as it came, not given a second one", async () => {
    const fromServer = ours(
      "Shoresh couldn't tell why. Try again. For support: K7Q-4MX."
    );
    expect(failed("Swim wasn't saved.", fromServer)).toBe(
      "Swim wasn't saved. Shoresh couldn't tell why. Try again. For support: K7Q-4MX."
    );
    await flush();
    expect(keepFromScreen).not.toHaveBeenCalled();
  });

  it("a problem the screen met on its own is kept under the code it shows", async () => {
    const dropped = { body: { message: "Disconnected or Canceled" } };
    const code = reasonOf(dropped).match(CODE)[1];
    await flush();
    expect(keepFromScreen).toHaveBeenCalledTimes(1);
    const sent = keepFromScreen.mock.calls[0][0];
    expect(sent.code).toBe(code);
    expect(sent.detail).toContain("Disconnected or Canceled");
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(code),
      dropped
    );
  });

  it("one error shown twice keeps one code; two errors get two", async () => {
    const one = new Error("Plain");
    const first = reasonOf(one).match(CODE)[1];
    expect(failed("Swim wasn't saved.", one).match(CODE)[1]).toBe(first);
    expect(reasonOf(new Error("Plain")).match(CODE)[1]).not.toBe(first);
    await flush();
    expect(keepFromScreen).toHaveBeenCalledTimes(2);
  });

  it("the code is still shown when it can't be kept (no connection)", async () => {
    keepFromScreen.mockImplementationOnce(() =>
      Promise.reject(new Error("offline"))
    );
    expect(withoutCode(reasonOf(new Error("Plain")))).toBe("Try again.");
    await flush();
  });
});

// Word walk W4 review: one floating refusal at a time, and Close never loses the cursor.
describe("the floating refusal", () => {
  /** A screen with a floating refusal, as the components keep one. */
  function screen() {
    return {
      shown: null,
      get error() {
        return this.shown;
      },
      set error(message) {
        floatRefusal(this, message, this.shown);
        this.shown = message || null;
      }
    };
  }
  function button(id) {
    const el = document.createElement("button");
    el.dataset.id = id;
    document.body.appendChild(el);
    return el;
  }
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("a newer one puts the older away, so two never sit on top of each other", () => {
    const page = screen();
    const importScreen = screen();
    page.error = "Weeks not added. No dates.";
    importScreen.error = "Nothing was saved. Locked.";
    expect(page.error).toBeNull();
    expect(importScreen.error).toBe("Nothing was saved. Locked.");
    page.error = "Couldn't open the camp setup. Try again.";
    expect(importScreen.error).toBeNull();
  });

  it("Close goes back to the control that caused it", () => {
    const save = button("save");
    const owner = screen();
    save.focus();
    owner.error = "Nothing was saved. Locked.";
    button("error-close").focus();
    closeRefusal(owner, () => button("heading"));
    expect(owner.error).toBeNull();
    expect(document.activeElement).toBe(save);
  });

  it("Close goes to the heading when that control is gone", () => {
    const save = button("save");
    const owner = screen();
    save.focus();
    owner.error = "Nothing was saved. Locked.";
    button("error-close").focus();
    save.remove();
    const heading = button("heading");
    closeRefusal(owner, () => heading);
    expect(document.activeElement).toBe(heading);
  });
});
