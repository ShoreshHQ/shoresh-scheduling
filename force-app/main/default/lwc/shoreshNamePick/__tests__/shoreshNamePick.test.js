// A picklist you type into (UX pass 2026-11-10): typing "Drama" into the offering's picklist
// picked Art. Nothing is picked unless the person picks it; a new name is offered as Add.
import { createElement } from "lwc";
import ShoreshNamePick from "c/shoreshNamePick";

const OPTIONS = [
  { label: "Archery", value: "a1" },
  { label: "Art", value: "a2" },
  { label: "Swim", value: "a3" }
];
const flush = () => Promise.resolve().then(() => Promise.resolve());

async function render(props = {}) {
  const element = createElement("c-shoresh-name-pick", { is: ShoreshNamePick });
  Object.assign(element, {
    label: "Offering",
    options: OPTIONS,
    addTo: "activities",
    ...props
  });
  document.body.appendChild(element);
  await flush();
  return element;
}
const input = (element) =>
  element.shadowRoot.querySelector('[data-id="name-input"]');
const lines = (element) =>
  [...element.shadowRoot.querySelectorAll('[role="option"]')].map((li) =>
    li.textContent.trim()
  );
const highlighted = (element) => {
  const on = element.shadowRoot.querySelector('[aria-selected="true"]');
  return on ? on.textContent.trim() : null;
};
async function type(element, text) {
  const field = input(element);
  field.dispatchEvent(new FocusEvent("focus"));
  field.value = text;
  field.dispatchEvent(new Event("input"));
  await flush();
}
async function key(element, name) {
  input(element).dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true })
  );
  await flush();
}

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
});

describe("c-shoresh-name-pick", () => {
  it("a name the list doesn't have is offered as Add, and Enter adds it, never another name", async () => {
    const element = await render();
    const change = jest.fn();
    const add = jest.fn();
    element.addEventListener("change", change);
    element.addEventListener("addname", add);
    await type(element, "Drama");
    expect(lines(element)).toEqual(['Add "Drama" to activities']);
    expect(highlighted(element)).toBe('Add "Drama" to activities');
    await key(element, "Enter");
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0].detail).toEqual({ name: "Drama" });
    expect(change).not.toHaveBeenCalled();
  });

  it("the names holding what is typed are listed; Enter takes the name typed exactly", async () => {
    const element = await render();
    const change = jest.fn();
    element.addEventListener("change", change);
    await type(element, "ar");
    expect(lines(element)).toEqual([
      "Archery",
      "Art",
      'Add "ar" to activities'
    ]);
    // Two names start so: nothing is guessed, Enter would add what is typed.
    expect(highlighted(element)).toBe('Add "ar" to activities');
    await type(element, "art");
    expect(highlighted(element)).toBe("Art");
    await key(element, "Enter");
    expect(change.mock.calls[0][0].detail).toEqual({ value: "a2" });
    expect(input(element).value).toBe("Art");
  });

  it("leaving with a name not in the list picks nothing and puts back what was there", async () => {
    const element = await render({ value: "a3" });
    const change = jest.fn();
    element.addEventListener("change", change);
    await type(element, "Dra");
    element.shadowRoot
      .querySelector(".pick")
      .dispatchEvent(new FocusEvent("focusout", { relatedTarget: null }));
    await flush();
    expect(change).not.toHaveBeenCalled();
    expect(input(element).value).toBe("Swim");
  });

  it("without addTo nothing new is offered", async () => {
    const element = await render({ addTo: undefined });
    await type(element, "Drama");
    expect(lines(element)).toEqual([]);
  });
});
