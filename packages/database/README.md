# `@cascade/database`

## Prisma generated client policy

`src/generated/prisma` is intentionally committed.

The application imports this generated TypeScript directly during development and typechecking. When you change `prisma/schema.prisma`:

1. Run `pnpm run db:generate`.
2. Commit every change under `src/generated/prisma`.
3. Commit the matching Prisma migration.

CI regenerates the client and fails if generated files are missing or stale.
