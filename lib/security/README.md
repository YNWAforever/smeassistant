# lib/security

Ported from sme-scanner (b9b4151f). The `*-contract.test.ts` and `migration-hardening-sweep.test.ts` files are static checks over
`supabase/migrations/*.sql` and form the rulebook every new migration must pass (CLAUDE.md 1.3.7).