// The accessibility matcher's setup (jest/sa11y-setup.js): a check left running by one test
// doesn't fail the next, and remembering selector answers during a check hides nothing.
const axe = require("axe-core");

function buttons(count, named = true) {
  const root = document.createElement("div");
  for (let i = 0; i < count; i++) {
    const button = document.createElement("button");
    if (named) button.textContent = `Bunk ${i}`;
    root.appendChild(button);
  }
  document.body.appendChild(root);
  return root;
}

const nwsapi = () => {
  const impl = Object.getOwnPropertySymbols(document).find(
    (symbol) => symbol.description === "impl"
  );
  return document[impl]._nwsapiDontThrow;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a check left running", () => {
  let abandoned;

  it("starts a check and doesn't wait for it, as a test that times out leaves one", () => {
    abandoned = expect(buttons(300)).toBeAccessible();
    expect(axe._running).toBe(true);
  });

  it("is finished before the next test starts, so its check runs", async () => {
    expect(axe._running).toBeFalsy();
    await expect(buttons(3)).toBeAccessible();
    await abandoned;
  });
});

describe("during a check", () => {
  it("still finds a problem: a button with no name", async () => {
    await expect(expect(buttons(3, false)).toBeAccessible()).rejects.toThrow(
      /button-name/
    );
  });

  it("puts jsdom's selector matching back afterwards", async () => {
    const before = nwsapi().match;
    await expect(buttons(3)).toBeAccessible();
    expect(nwsapi().match).toBe(before);
  });
});
