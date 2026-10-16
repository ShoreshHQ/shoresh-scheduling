# Platform checks (throwaway prototype)

Not part of the app. A separate SFDX project with just enough objects to test four Salesforce
behaviours the data model depends on. Results are recorded in the wiki
(`projects/shoresh-scheduling-data-model.md`, "Platform checks", and decision 0007).

Historical: these checks ran 2026-10-15, before the two-org rule (exactly two Salesforce orgs,
the Dev Hub and one test org; see [docs/ci-setup.md](../../docs/ci-setup.md)). Never create an
org to re-run them. Deploy to the one test org instead, and renew it afterwards
(`scripts/renew-test-org.sh`) so the prototype objects do not linger there:

```bash
sf project deploy start -o shoresh-test -d src
```

```bash
sf org assign permset -n Prototype_Scheduler -o shoresh-test
```

Then run each script in `scripts/` with `sf apex run -o shoresh-test -f <script>` and read
the `RESULT` lines. `gen.py` regenerated the object metadata. Check (b) also needs three users
(`usera`, `userb`, `usernone`) and a `Camp B` record whose Id goes in the `CampB_by_lookup`
rule; see the scripts' comments.
