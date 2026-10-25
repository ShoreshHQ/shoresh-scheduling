// The desktop differential's report (force-app/.../shoreshEngine/__tests__/desktopDifferential.test.js):
// written only when DESKTOP_DIFF_REPORT names a file. Here, outside force-app, because LWC code
// may not read process.env.
const fs = require("fs");

function writeDesktopReport(summary, full) {
  const file = process.env.DESKTOP_DIFF_REPORT;
  if (!file) {
    return;
  }
  console.log(summary);
  fs.writeFileSync(file, JSON.stringify(full, null, 2));
}

module.exports = { writeDesktopReport };
