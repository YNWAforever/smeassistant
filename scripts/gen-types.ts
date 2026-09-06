/** The application now uses the authored typed Neon schema; the old REST generator is retired. */
console.error('The legacy db:types generator is retired. Application schema types are defined in lib/db/schema.ts; verify them with corepack pnpm typecheck.');
process.exitCode = 1;
export {};
