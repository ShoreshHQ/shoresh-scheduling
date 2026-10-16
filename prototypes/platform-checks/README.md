# Platform checks (throwaway prototype)

Not part of the app. A separate SFDX project with just enough objects to test four Salesforce
behaviours the data model depends on. Results are recorded in the wiki
(`projects/shoresh-scheduling-data-model.md`, "Platform checks", and decision 0007).

Historical: these checks ran 2026-10-15, before the two-org rule. To re-run them, deploy to
the one test org (`shoresh-test`) instead of creating the org below
([docs/ci-setup.md](../../docs/ci-setup.md)):

```bash
sf org create scratch -f config/scratch-def.json -a shoresh-checks -v shoresh-devhub -y 1
```

```bash
sf project deploy start -o shoresh-checks -d src
```

```bash
sf org assign permset -n Prototype_Scheduler -o shoresh-checks
```

Then run each script in `scripts/` with `sf apex run -o shoresh-checks -f <script>` and read
the `RESULT` lines. `gen.py` regenerated the object metadata. Check (b) also needs three users
(`usera`, `userb`, `usernone`) and a `Camp B` record whose Id goes in the `CampB_by_lookup`
rule; see the scripts' comments.
