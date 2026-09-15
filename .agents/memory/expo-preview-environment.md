---
name: Expo preview environment
description: Non-fatal Expo startup behavior caused by the workspace runtime image
---

Expo may report that React Native DevTools could not load because `libglib-2.0.so.0` is unavailable in the workspace runtime image. Metro can still start and serve the Expo preview normally.

**Why:** This warning can look like an app startup failure even when the actual mobile preview is healthy.

**How to apply:** Treat the warning as environmental unless Metro fails to start, the preview is blank, or browser/device logs show an application error.