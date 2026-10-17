# SheetJS: known vulnerabilities (for the AppExchange security review)

Shoresh ships SheetJS Community Edition **0.20.3** unchanged as the static resource
`force-app/main/default/staticresources/SheetJS.js` (version string inside the file:
`0.20.3`). It is used only to read a spreadsheet the scheduler picks, in the browser.

Checked 2026-10-17 against the vendor's advisories:

| Advisory | Issue | Affected | Fixed in | Applies to 0.20.3? |
|---|---|---|---|---|
| [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533) | Prototype pollution when reading crafted files | through 0.19.2 | 0.19.3 | No |
| [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363) | Regular-expression denial of service (ReDoS) | through 0.20.1 | 0.20.2 | No |

Older ones (for example CVE-2021-32014, through 0.16.9) are long fixed. The vendor's advisory
list (https://cdn.sheetjs.com/advisories/) has no advisory after these two, and a web search found
none affecting 0.20.3.

**Why a scanner may still flag it:** the npm package `xlsx` stops at 0.18.5 (SheetJS moved
releases to its own CDN), so tools that match by npm package name can report the npm advisories
as unfixed. Our copy comes from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (see
`package.json` and `NOTICE`), which includes both fixes. Answer for a false-positive report:
"SheetJS CE 0.20.3 from the vendor CDN; CVE-2023-30533 fixed in 0.19.3 and CVE-2024-22363 fixed
in 0.20.2 per the vendor advisories above."

Re-check this page whenever the static resource changes, and before each security review
submission.
