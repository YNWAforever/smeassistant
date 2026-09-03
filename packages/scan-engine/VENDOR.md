# VENDOR.md - @sme-scanner/scan-engine

- Source: https://github.com/YNWAforever/sme-scanner, path packages/scan-engine
- Commit: b9b4151fb89217a926e38f187873b5ff9f10f90f (origin/main, 2026-08-27)
- Vendored: 2026-09-03 (src, tests, package.json, tsconfig.json, vitest.config.ts); 63 files

## Local changes

1. Type-only reach-backs into apps/web/lib/{types,evidence/types,scanner/ig-search/types} rewritten to @sme-scanner/contracts
   (this repo is a root app; those five type files live in packages/contracts). Files: collect-providers.ts evidence-normalize.test.ts evidence-normalize.ts execution.ts gbp-collector.ts ig-confidence.ts persist-aeo-snapshots.test.ts persist-aeo-snapshots.ts processor.test.ts processor.ts provider-result.ts 
   Runtime behaviour unchanged (type imports are erased).
2. package.json: added dependency @sme-scanner/contracts (workspace:*).

Re-pin: copy upstream again, re-apply the specifier rewrite (../../../apps/web/lib/(types|evidence/types|scanner/ig-search/types) -> @sme-scanner/contracts), update the commit above.
