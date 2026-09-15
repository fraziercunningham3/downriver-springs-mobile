---
name: Expo patch release age guard
description: Expo dependency checks can request freshly published patch versions before the workspace release-age window allows installation.
---

When Expo Doctor reports a newer patch release immediately after publication, preserve the workspace minimum-release-age safeguard rather than bypassing it just to clear a patch warning. The existing frozen lockfile remains usable while the release matures.

**Why:** The workspace intentionally delays newly published npm packages for supply-chain protection, so Expo's compatibility recommendation can temporarily be newer than the allowed install set.

**How to apply:** Re-run the alignment check after the release-age window; only add a narrowly scoped trusted-package exclusion for an urgent, explicitly justified build requirement.