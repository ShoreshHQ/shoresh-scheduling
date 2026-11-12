/**
 * The question on screen (c-shoresh-ask), found inside any shadow root under element, and
 * answered as the director would: yes (its named button) or no (Cancel). Resolves with what it
 * asked ({ heading, lines, confirmLabel, tone }), or null when no question is open. Word walk
 * W4: every question is c-shoresh-ask, its button naming the action, never Salesforce's "OK".
 */
export function openQuestion(element) {
  const search = (root) => {
    if (!root) return null;
    const found = root.querySelector("c-shoresh-ask");
    if (found) return found;
    for (const child of root.querySelectorAll("*")) {
      const inner = child.shadowRoot && search(child.shadowRoot);
      if (inner) return inner;
    }
    return null;
  };
  return search(element.shadowRoot || element);
}

export async function answerAsk(element, yes) {
  const ask = openQuestion(element);
  if (!ask) {
    return null;
  }
  const asked = {
    heading: ask.heading,
    lines: ask.lines,
    confirmLabel: ask.confirmLabel,
    tone: ask.tone
  };
  ask.dispatchEvent(new CustomEvent("answer", { detail: { yes } }));
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  return asked;
}
