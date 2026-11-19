const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.join(__dirname, "..", "renew-test-org.sh");

// A stand-in sf whose Dev Hub lists the orgs in $STATE/active. Deleting removes the org from
// the Dev Hub and then fails, as sf did on 2026-11-18 over a stored sign-in it no longer had.
const FAKE_SF = `#!/usr/bin/env bash
case "$1 $2" in
  "org display") echo '{"result":{"username":"old@example.com"}}' ;;
  "data query")
    jq -cn --rawfile a "$STATE/active" '{status:0,result:{records:($a|split("\\n")|map(select(.!=""))|map({SignupUsername:.}))}}' ;;
  "limits api") echo '{"result":[{"name":"DailyScratchOrgs","remaining":5}]}' ;;
  "org delete")
    if [ "$DELETE_REMOVES" = 1 ]; then : > "$STATE/active"; fi
    echo "Error (NamedOrgNotFoundError): No authorization information found" >&2; exit 1 ;;
  "org create") echo new@example.com > "$STATE/active"; echo created >> "$STATE/log" ;;
  "org auth") echo '{"result":{"sfdxAuthUrl":"force://fake"}}' ;;
  "org list") echo '{"result":{"scratchOrgs":[{"alias":"shoresh-test","expirationDate":"2026-12-19"}]}}' ;;
  *) echo "unexpected sf $*" >&2; exit 1 ;;
esac
`;
const FAKE_GH = `#!/usr/bin/env bash
cat > /dev/null; echo secret >> "$STATE/log"
`;

function renew({ deleteRemoves }) {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "renew-"));
  const bin = path.join(state, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "sf"), FAKE_SF, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "gh"), FAKE_GH, { mode: 0o755 });
  fs.writeFileSync(path.join(state, "active"), "old@example.com\n");
  fs.writeFileSync(path.join(state, "log"), "");
  const run = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      STATE: state,
      DELETE_REMOVES: deleteRemoves ? "1" : "0"
    }
  });
  const log = fs.readFileSync(path.join(state, "log"), "utf8");
  fs.rmSync(state, { recursive: true, force: true });
  return { status: run.status, out: run.stdout, log };
}

describe("renew-test-org.sh", () => {
  it("goes on to make the new org when sf fails but the Dev Hub shows the old one gone", () => {
    const r = renew({ deleteRemoves: true });
    expect(r.status).toBe(0);
    expect(r.log).toBe("created\nsecret\n");
    expect(r.out).toContain("expires on 2026-12-19");
  });

  it("stops without making a second org when the old one is still there", () => {
    const r = renew({ deleteRemoves: false });
    expect(r.status).toBe(1);
    expect(r.log).toBe("");
    expect(r.out).toContain("still there after deleting it");
  });
});
