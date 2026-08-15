# Changesets

This repo uses Changesets only for publishable packages.

Currently versioned packages:

- `@cascade/core`
- `@cascade/sdk`

Private apps, docs, test packages, and infrastructure packages are ignored in
`.changeset/config.json`. Changes to those packages do not need a changeset.

Add a changeset only when a change affects a published package API, runtime
behavior, or package metadata:

```bash
pnpm changeset
```

Use an empty changeset only for release-check bookkeeping when no package should
be versioned:

```bash
pnpm changeset --empty
```
