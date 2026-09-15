---
name: EAS pnpm lockfile compatibility
description: EAS builders may use pnpm 12 and require workspace-level override settings.
---

Keep pnpm override rules in `pnpm-workspace.yaml`, not `package.json.pnpm.overrides`, for EAS builds. Newer pnpm builders ignore the package.json field and then fail frozen installs with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. The workspace override map must match the lockfile exactly.

**Why:** The GitHub-triggered EAS builder currently behaves like pnpm 12, while the Replit workspace may use pnpm 10; pnpm 12 no longer reads package.json override settings.

**How to apply:** After changing overrides, compare the workspace override map to the lockfile and validate frozen installs with both the EAS-like pnpm version and the local pnpm before retrying the build.