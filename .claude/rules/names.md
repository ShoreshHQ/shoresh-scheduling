---
paths:
  - "force-app/**"
  - "scripts/**"
---

# Field and object names

- **No field or object names written as text** (`"StartDate__c"`, `record.StartDate__c`, `'Week__c'`,
  `day + '__c'`): once the package has its `shoresh` namespace they find nothing. LWC takes names
  from `c/shoreshSchema` (generated: `node scripts/generate-shoresh-schema.js`); Apex uses typed
  references and `ShoreshSchema`; stored names (import logs, answer keys) are bare local names.
  `npm run check:namespace` fails on any one, and components' tests also run namespaced
  (`npm run test:unit:namespaced`). Rules and guards: `docs/adr/0009-namespace-safe-names.md`.
