---
name: Expo sharing links
description: Distinguishes private workspace phone previews from the public Expo manifest served by the published mobile artifact.
---

Share the published mobile artifact URL with customers, never the QR or `exp://` address from the workspace’s “Preview on your phone” panel.

**Why:** The development preview is tied to the Expo CLI account for the current Replit session, so another Expo Go account receives a project-owner mismatch. The published landing page serves a public `exps://` manifest instead.

**How to apply:** Verify the published URL returns the landing page normally and returns an Expo manifest when requested with an `expo-platform` header, then provide that HTTPS URL for sharing.