# Biome And GitHub Actions Learnings

This summary covers the tooling setup work after Step 06: replacing ESLint with Biome, configuring GitHub Actions, fixing `pnpm check`, and choosing a branch name that fits Conventional Commits.

## What Changed

The project was updated to use:

- Biome for linting, formatting, import organization, and checks.
- GitHub Actions for running checks on pushes and pull requests.
- `pnpm check` as the main local and CI quality command.
- `pnpm exec tsc --noEmit` for TypeScript verification.

The old ESLint setup was removed from active use.

## Main Concept: Biome Replaces Multiple Tools

Biome can handle several jobs that are often split across separate tools:

- Linting.
- Formatting.
- Import organization.
- Project checks.

That is why scripts like this are useful:

```json
"lint": "biome lint app components lib",
"format": "biome format --write app components lib",
"check": "biome check app components lib",
"check:fix": "biome check --write app components lib"
```

`biome check` is broader than `biome lint`. It can run formatting checks, lint checks, and assists such as import organization.

## Main Concept: Target Real Project Folders

The first problem was that the scripts targeted:

```text
./src
```

But this project does not use a `src/` directory. It uses:

```text
app/
components/
lib/
```

So this failed:

```json
"check": "biome check ./src"
```

The corrected version targets the real folders:

```json
"check": "biome check app components lib"
```

The lesson:

```text
Tooling scripts must match the actual project structure.
```

## Main Concept: Tailwind CSS Directives

The app uses Tailwind CSS 4 syntax in `app/globals.css`, including:

```css
@theme inline {
}
```

Biome initially failed because Tailwind-specific CSS syntax was not enabled.

The fix was to add this to `biome.json`:

```json
"css": {
  "parser": {
    "tailwindDirectives": true
  }
}
```

This tells Biome's CSS parser to understand Tailwind-specific directives.

## Main Concept: Formatting Style

Biome can format files using tabs or spaces.

For this project, spaces are the better default because:

- Most JavaScript, TypeScript, React, and Next.js examples use spaces.
- The project already mostly used spaces.
- GitHub and editors display spaces consistently.
- It matches common frontend conventions.

The recommended config is:

```json
"formatter": {
  "enabled": true,
  "indentStyle": "space",
  "indentWidth": 2
}
```

The most important rule is consistency.

## Main Concept: `check` vs `check:fix`

`pnpm check` verifies the code.

It should be used in CI because it fails if something is wrong:

```bash
pnpm check
```

`pnpm check:fix` changes files to satisfy Biome where possible:

```bash
pnpm check:fix
```

Use `check:fix` locally, then review the changes.

Use `check` in GitHub Actions.

## Main Concept: GitHub Actions Workflow

The workflow file lives at:

```text
.github/workflows/check.yml
```

The workflow runs on:

- Pull requests.
- Pushes to `main`.

The job does these steps:

```text
Checkout code
Set up pnpm
Set up Node
Install dependencies
Run Biome check
Run TypeScript check
```

The key CI commands are:

```bash
pnpm check
pnpm exec tsc --noEmit
```

That means CI checks both code style/tooling rules and TypeScript correctness.

## Main Concept: Frozen Lockfile

The workflow uses:

```bash
pnpm install --frozen-lockfile
```

This means CI installs exactly what the lockfile says.

If `package.json` and `pnpm-lock.yaml` do not agree, CI fails.

This is good because it prevents CI from silently generating a different dependency tree than local development.

The local verification used:

```bash
pnpm install --frozen-lockfile --offline
```

That confirmed the lockfile was in sync.

## Main Concept: Pinning Tool Versions

The workflow used:

```yaml
version: latest
```

for pnpm.

That works, but it is less reproducible because `latest` can change over time.

A more stable option is to pin the version:

```yaml
version: 11.1.2
```

The lesson:

```text
CI should be predictable. Pin versions when practical.
```

## Main Concept: Removing Stale ESLint Setup

After switching to Biome, `eslint.config.mjs` became stale.

Keeping unused config files can confuse future readers because they may wonder:

```text
Is this project using ESLint or Biome?
```

If the project is fully migrated to Biome, removing the old ESLint config is reasonable.

The important point is consistency:

```text
Use one primary lint/check system unless there is a clear reason to keep both.
```

## Main Concept: Local Verification Before CI

The setup was verified locally with:

```bash
pnpm install --frozen-lockfile --offline
pnpm check
pnpm lint
pnpm exec tsc --noEmit
pnpm exec biome --version
```

The final results:

- Frozen lockfile install passed.
- `pnpm check` passed.
- `pnpm lint` passed.
- TypeScript passed.
- Biome version was `2.4.16`.

If these pass locally, the GitHub Action is much more likely to pass.

## Main Concept: Branch Names And Conventional Commits

A branch name should be short, descriptive, and aligned with the type of work.

For this work, a good branch name is:

```text
chore/setup-biome-ci
```

It matches a Conventional Commit style commit message:

```text
chore: setup Biome and CI checks
```

Other acceptable branch names:

```text
ci/add-biome-checks
chore/migrate-to-biome
ci/setup-github-actions
```

Use `ci/` when the change is mostly workflow automation.

Use `chore/` when the change is general tooling or maintenance.

## What Was Verified

The final setup was checked with:

```bash
pnpm check
pnpm lint
pnpm exec tsc --noEmit
```

All passed.

The GitHub Actions workflow was also checked for the correct command flow:

```text
pnpm install --frozen-lockfile
pnpm check
pnpm exec tsc --noEmit
```

## Mental Model To Keep

Local scripts and CI should agree.

If GitHub Actions runs:

```bash
pnpm check
```

then running this locally should tell you whether CI is likely to pass:

```bash
pnpm check
```

The workflow should not contain mysterious commands that developers do not run locally.

## Key Takeaways

- Biome can replace ESLint and formatting tooling for this project.
- Package scripts must target real folders, not nonexistent `src`.
- Tailwind CSS 4 directives require `tailwindDirectives` in Biome CSS parser config.
- Spaces are the pragmatic default for this Next.js project.
- `check:fix` changes files; `check` verifies files.
- CI should run the same checks that developers can run locally.
- `--frozen-lockfile` protects dependency reproducibility.
- Pinning pnpm is better than using `latest` for long-term CI stability.
- Removing stale ESLint config avoids tooling confusion.
- `chore/setup-biome-ci` is a good branch name for this work.
