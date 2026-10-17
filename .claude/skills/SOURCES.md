# Where these skills come from

- **Upstream:** https://github.com/forcedotcom/sf-skills
- **Commit:** `625863fbdee9cf4647cc964ccf6ea99b71373a83` (2026-10-16)
- **License:** Apache License 2.0, Copyright (c) 2026 Salesforce, Inc. Full text:
  [LICENSE.txt](LICENSE.txt). Upstream has no NOTICE file and the skills carry no per-file
  license headers; attribution is in the repo's `NOTICE`.
- **Vetting:** wiki `salesforce/sf-skills-vetting.md` (verdicts per skill, what was checked).
  Approved by Greg 2026-10-17.

Copied as loose folders from upstream `skills/`. **None of upstream's plugins is installed**: they
add hooks that send telemetry, auto-deploy on save, and bundle skills that create or delete orgs.

## Copied

Kept as they are (plus the shared override lines): platform-validation-rule-generate,
platform-custom-tab-generate, experience-lds-best-practices-apply.

Kept with Shoresh overrides: platform-apex-generate, platform-apex-test-generate,
platform-apex-logs-debug, platform-soql-query, platform-custom-object-generate,
platform-custom-field-generate, platform-permission-set-generate, platform-docs-get,
experience-lwc-generate, experience-lwc-security-validate, experience-accessibility-validate,
experience-lwc-base-components-integrate, design-systems-slds-apply, dx-code-analyzer-run.

Review-only (descriptions shortened so they don't load on every LWC edit; preloaded by
`.claude/agents/salesforce-reviewer.md`): experience-lwc-security-validate,
experience-accessibility-validate, dx-code-analyzer-run. experience-lds-best-practices-apply's
description is shortened the same way.

## Changed from upstream

- Every `SKILL.md` starts with a **"Shoresh overrides (these win)"** section. Policy: project
  `CLAUDE.md` and those lines beat the skill text below them. They cover: one test org, never
  create or delete orgs; synchronous one-class Apex test runs, never `RunLocalTests` or queued
  runs; user-mode data access, system mode only per ADR 0001; no View All / Modify All; no
  ApexGuru or other cloud scans without Greg; no unpinned npm/pip/plugin installs; scratch
  output to the scratchpad, not the repo; technical choices made by the agent, not asked of Greg.
- Removed (downloaded tools, installed browsers, wrote files, or taught system-mode DML):
  - `platform-docs-get/scripts/` (playwright and playwright-stealth)
  - `experience-lwc-generate/scripts/` (npx slds-linter, `sf lightning dev`, writes under `~/.claude`)
  - `experience-lwc-generate/assets/apex-controller/LwcController.cls` (`SECURITY_ENFORCED` + plain DML)
  - `platform-soql-query/scripts/` (post-write hook that runs live query plans)
  - `dx-code-analyzer-run/scripts/apply-fixes.js` (rewrites repo files)
- Scripts left in place, local only, no network: `design-systems-slds-apply/scripts/search-*.cjs`
  (JSON lookups), `experience-lwc-base-components-integrate/scripts/extract-component-docs.sh`
  (awk), `experience-lwc-security-validate/scripts/*.sh` (local parse, jq),
  `dx-code-analyzer-run/scripts/*` (read Code Analyzer results; `list-rules.js` and
  `describe-rule.js` call `sf code-analyzer rules`).

## Not copied

- Skipped by the vetting: platform-apex-test-run (says "synchronous is the default", which is
  false), platform-flexipage-generate, platform-metadata-deploy, experience-lwc-accessibility-jest-run,
  design-systems-slds-validate, dx-code-analyzer-configure, dx-pkg-post-install-configure,
  dx-apexguru-scan (uploads code), platform-sharing-*, platform-agentexchange-partner-offers-configure.
- Never: org lifecycle and packaging skills (dx-org-manage, dx-org-snapshot-manage,
  dx-org-shape-manage, platform-trial-org-create, platform-sandbox-configure,
  dx-org-devhub-configure, experience-ui-bundle-2gp-deploy), platform-destructive-deploy,
  platform-apex-anonymous-run.

## Updating

Re-vet before moving to a newer commit: diff upstream between the two commits for these folders,
re-apply the removals above, keep the override sections, update the commit here and in the wiki.
