import { createElement } from "lwc";
import ShoreshConnectAi from "c/shoreshConnectAi";
import { connectPrompt, myDomainHost } from "../prompt";

const HOST = "maple-grove.my.salesforce.com";

const flush = () => Promise.resolve().then(() => Promise.resolve());

function mount(pageHost) {
  delete window.location;
  window.location = { hostname: pageHost };
  const element = createElement("c-shoresh-connect-ai", {
    is: ShoreshConnectAi
  });
  document.body.appendChild(element);
  return element;
}

const realLocation = window.location;

describe("Connect your AI", () => {
  afterEach(() => {
    while (document.body.firstChild) document.body.firstChild.remove();
    window.location = realLocation;
  });

  // API-1.16
  it("namesTheCampByHostOnly: the camp's Salesforce is its My Domain host, from the page's own host", () => {
    expect(myDomainHost("maple-grove.lightning.force.com")).toBe(HOST);
    expect(myDomainHost("Maple-Grove.my.salesforce.com")).toBe(HOST);
    expect(myDomainHost("camp--uat.sandbox.lightning.force.com")).toBe(
      "camp--uat.sandbox.my.salesforce.com"
    );
    expect(
      myDomainHost("fun-java-9274-dev-ed.scratch.lightning.force.com")
    ).toBe("fun-java-9274-dev-ed.scratch.my.salesforce.com");
    expect(myDomainHost("evil.example.com")).toBeNull();
    expect(myDomainHost("a.b.c.lightning.force.com")).toBeNull();
    expect(myDomainHost("")).toBeNull();
  });

  // API-1.16
  it("neverASignInLinkOrToken: the prompt holds the host and no sign-in link, code or token", () => {
    const prompt = connectPrompt(HOST);
    expect(prompt).toContain(`--instance-url https://${HOST} `);
    const links = prompt.match(/https?:\/\/[^\s"]+/g);
    expect(links).toEqual([
      "https://nodejs.org,",
      "https://developer.salesforce.com/tools/salesforcecli,",
      `https://${HOST}`
    ]);
    expect(prompt).not.toMatch(
      /frontdoor|sid=|access_token|refresh_token|session|password|00D[A-Za-z0-9]{12}|![A-Za-z0-9._]{20,}/i
    );
  });

  // API-1.15
  it("oneCopiedPromptDoesTheSetup: install, sign in in the browser, register, then a test read told in one sentence", () => {
    const prompt = connectPrompt(HOST);
    const steps = [
      "node --version",
      "sf --version",
      `sf org login web --instance-url https://${HOST} --alias shoresh`,
      "claude mcp add --scope user shoresh -- npx -y github:ShoreshHQ/shoresh-scheduling --org shoresh",
      "npx -y github:ShoreshHQ/shoresh-scheduling check --org shoresh",
      "Finish with one plain sentence"
    ].map((s) => prompt.indexOf(s));
    expect(steps.every((i) => i > 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    // What to tell the person when something is missing, in plain words.
    expect(prompt).toContain("Your computer needs Node.js first.");
    expect(prompt).toContain(
      "Your computer needs the Salesforce command line."
    );
    expect(prompt).toContain("permission set");
    expect(prompt).toContain("can't run Shoresh's connector yet");
    expect(prompt).not.toMatch(/resource|payload|entity|endpoint|sobject/i);
  });

  // API-1.15
  it("copiesThePromptWithOneButton", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    const element = mount("maple-grove.lightning.force.com");
    await flush();
    const button = element.shadowRoot.querySelector('[data-id="copy-prompt"]');
    expect(button.label).toBe("Copy");
    expect(element.shadowRoot.querySelector(".rail-title").textContent).toBe(
      "Connect your AI"
    );
    button.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(connectPrompt(HOST));
    expect(button.label).toBe("Copied");
    expect(
      element.shadowRoot.querySelector('[role="status"]').textContent
    ).toBe("Copied. Paste it into your AI app.");
    await expect(element).toBeAccessible();
  });

  it("shows the prompt to copy by hand when copying isn't allowed", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error("no")) }
    });
    const element = mount("maple-grove.lightning.force.com");
    await flush();
    element.shadowRoot.querySelector('[data-id="copy-prompt"]').click();
    await flush();
    const text = element.shadowRoot.querySelector('[data-id="prompt-text"]');
    expect(text.textContent).toBe(connectPrompt(HOST));
    await expect(element).toBeAccessible();
  });

  it("shows nothing on a page whose host isn't a Salesforce one", async () => {
    const element = mount("localhost");
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="connect-ai"]')
    ).toBeNull();
  });
});
