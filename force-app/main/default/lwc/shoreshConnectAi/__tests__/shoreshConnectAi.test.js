import { createElement } from "lwc";
import ShoreshConnectAi from "c/shoreshConnectAi";
import { connectPrompt, myDomainHost } from "../prompt";
import { flush } from "shoresh-jest/flush";

const HOST = "maple-grove.my.salesforce.com";
const SERVER = "<your home folder>/.shoresh/connect/shoresh.js";

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
    expect(prompt).not.toMatch(/github|npx|npmjs/i); // the connector comes only from the camp's Salesforce
    expect(prompt).not.toMatch(
      /frontdoor|sid=|access_token|refresh_token|session|password=|pw=|00D[A-Za-z0-9]{12}|![A-Za-z0-9._]{20,}/i
    );
  });

  // API-1.15
  it("oneCopiedPromptDoesTheSetup: install, sign in in the browser, register, then a test read told in one sentence", () => {
    const prompt = connectPrompt(HOST);
    const steps = [
      "node --version",
      "sf --version",
      `sf org login web --instance-url https://${HOST} --alias shoresh`,
      "StaticResource WHERE Name = 'ShoreshConnect'",
      "/Body --target-org shoresh --stream-to-file <your home folder>/.shoresh/connect.zip",
      "unzip -o <your home folder>/.shoresh/connect.zip -d <your home folder>/.shoresh/connect",
      `node ${SERVER} check --org shoresh`,
      `claude mcp add --scope user shoresh -- node ${SERVER} --org shoresh`,
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
    expect(prompt).toContain("Never use sudo");
    // What the AI says to the person is plain: no jargon in any "tell me" sentence.
    const toldThePerson = [...prompt.matchAll(/[Tt]ell me: "([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(toldThePerson.length).toBeGreaterThanOrEqual(6);
    for (const said of toldThePerson) {
      expect(said).not.toMatch(
        /resource|payload|entity|endpoint|sobject|MCP|query|alias/i
      );
    }
  });

  // API-1.15
  it("worksOnMacWindowsAndLinux: Windows unzips with PowerShell, Linux keeps the sign-in in its keyring", () => {
    const prompt = connectPrompt(HOST);
    expect(prompt).not.toMatch(
      /works on a Mac|stop and tell me: "Shoresh's connector/
    );
    const unzip = prompt.indexOf("unzip -o");
    // PowerShell's own unzip: Claude Code on Windows runs commands in Git Bash, whose tar
    // can't open a zip file.
    const tar = prompt.indexOf(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '<your home folder>/.shoresh/connect.zip' -DestinationPath '<your home folder>/.shoresh/connect'"`
    );
    expect(tar).toBeGreaterThan(unzip);
    expect(tar).toBeLessThan(prompt.indexOf(`node ${SERVER} check`));
    // The keyring tool before the sign-in, so the sign-in never lands in a file.
    const keyring = prompt.indexOf("On Linux only, run: secret-tool --version");
    expect(keyring).toBeGreaterThan(0);
    expect(keyring).toBeLessThan(prompt.indexOf("sf org login web"));
    expect(prompt).toContain("Your computer needs its keyring tool first");
    expect(prompt).toContain('"where node" on Windows');
    expect(prompt).toContain("with forward slashes (on Windows too)");
  });

  // API-1.15
  it("copiesThePromptWithOneButton", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    const element = mount("maple-grove.lightning.force.com");
    await flush();
    const button = element.shadowRoot.querySelector('[data-id="copy-prompt"]');
    expect(button.label).toBe("Copy prompt for your AI");
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
    expect(
      element.shadowRoot.querySelector('[role="status"]').textContent
    ).toBe("Couldn't copy. The prompt is below.");
    await expect(element).toBeAccessible();
  });

  // API-1.17
  it("offersTheExtensionFromTheCampsSalesforce: Claude desktop downloads Shoresh.mcpb, the package's own static resource", async () => {
    const element = mount("maple-grove.lightning.force.com");
    await flush();
    const link = element.shadowRoot.querySelector(
      '[data-id="download-extension"]'
    );
    expect(link.getAttribute("download")).toBe("Shoresh.mcpb");
    expect(link.getAttribute("href")).toMatch(/ShoreshConnect$/);
    expect(link.textContent.trim()).toBe("Claude desktop");
    link.click();
    await flush();
    expect(
      element.shadowRoot.querySelector('[role="status"]').textContent
    ).toBe("Downloaded. Open Shoresh.mcpb.");
    await expect(element).toBeAccessible();
  });

  // API-1.162
  it("theAdminSetsHowLongAnAiStaysSignedIn: the Salesforce admin's clicks for the CLI app's Refresh Token Policy", async () => {
    const element = mount("maple-grove.lightning.force.com");
    await flush();
    const row = element.shadowRoot.querySelector('[data-id="ai-sign-in"]');
    expect(row.querySelector(".sign-in-title").textContent.trim()).toBe(
      "AI sign-in"
    );
    expect(row.querySelector(".who").textContent.trim()).toBe(
      "Salesforce admin"
    );
    expect(
      [...row.querySelectorAll("[data-click]")].map((c) => c.textContent.trim())
    ).toEqual([
      "Setup",
      "Connected Apps OAuth Usage",
      "Salesforce CLI",
      "Install",
      "Edit Policies",
      "Refresh Token Policy",
      "Save"
    ]);
    // Read aloud as "then" between clicks; the drawn chevron is hidden from screen readers.
    expect(row.querySelectorAll(".slds-assistive-text")).toHaveLength(6);
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
