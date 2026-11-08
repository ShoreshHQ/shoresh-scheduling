// jest/no-finalizers.js: the stand-in is in place, and LWC, loaded after the setup file, uses it.
import { createElement } from "lwc";
import ShoreshSavedMark from "c/shoreshSavedMark";

it("gives LWC a stand-in for FinalizationRegistry, in time for LWC to use it", () => {
  expect(FinalizationRegistry.toString()).not.toContain("[native code]");
  const register = jest.spyOn(FinalizationRegistry.prototype, "register");
  const element = createElement("c-shoresh-saved-mark", {
    is: ShoreshSavedMark
  });
  document.body.appendChild(element);
  expect(element.shadowRoot.querySelector('[data-id="saved"]')).not.toBeNull();
  expect(register).toHaveBeenCalled();
  document.body.removeChild(element);
  register.mockRestore();
});
