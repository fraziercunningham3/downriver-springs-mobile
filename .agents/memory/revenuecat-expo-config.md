---
name: RevenueCat Expo configuration
description: Expo subscription previews depend on public RevenueCat env values being present when Metro starts.
---

RevenueCat’s Expo provider must tolerate an unavailable native billing configuration and disable queries until initialization succeeds; otherwise a missing public key can blank the entire preview instead of leaving account onboarding usable.

**Why:** Expo evaluates EXPO_PUBLIC_* values while Metro bundles the app, and a failed RevenueCat initialization still leaves React Query hooks mounted.

**How to apply:** Restart the mobile workflow after changing RevenueCat public env values, and keep subscription queries gated by an initialization-ready flag.