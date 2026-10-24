// Elective rosters on paper (electives slice E10; ADR 0018 choice 52): a page per offering, its
// times side by side with who is there, and each page's foot. Made-up names.
import { createElement } from "lwc";
import ShoreshRosterPrint from "c/shoreshRosterPrint";

const PAGES = [
  {
    key: "o1",
    title: "Archery",
    columns: [
      {
        key: "t1",
        label: "Tue 12:30",
        count: "2 of 12",
        people: [
          { key: "x1", name: "Maya Fernwood", bunk: "Aspen" },
          { key: "x2", name: "Eli Marblecrest", bunk: "Willow" }
        ]
      }
    ]
  },
  { key: "o2", title: "Drama", columns: [] }
];

describe("c-shoresh-roster-print", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("prints a page per offering with its times, names and bunks, and a numbered foot", async () => {
    const element = createElement("c-shoresh-roster-print", {
      is: ShoreshRosterPrint
    });
    element.pages = PAGES;
    element.header = "Chugim · Week 3 · Final 14 Oct";
    element.file = "Chugim Week 3 rosters";
    document.body.appendChild(element);
    await Promise.resolve();
    const pages = [
      ...element.shadowRoot.querySelectorAll("section.roster-page")
    ];
    expect(pages.map((p) => p.querySelector(".title").textContent)).toEqual([
      "Archery",
      "Drama"
    ]);
    expect(pages[0].querySelector(".sub").textContent).toBe(
      "Chugim · Week 3 · Final 14 Oct"
    );
    expect(
      [...pages[0].querySelectorAll(".name")].map((n) =>
        [...n.querySelectorAll("span")].map((s) => s.textContent)
      )
    ).toEqual([
      ["Maya Fernwood", "Aspen"],
      ["Eli Marblecrest", "Willow"]
    ]);
    expect(pages[1].querySelector(".foot").textContent).toBe(
      "Chugim Week 3 rosters · page 2 of 2"
    );
    await expect(element).toBeAccessible();
  });
});
