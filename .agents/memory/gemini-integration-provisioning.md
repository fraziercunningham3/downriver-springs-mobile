---
name: Managed Gemini provisioning
description: The API server's Gemini-backed features depend on Replit-managed Gemini environment variables being provisioned before workflow startup.
---

Provision the managed Gemini integration before validating Gemini-backed API routes, then restart the API workflow so the server receives the new environment.

**Why:** The app can compile and the route can return a safe configuration error while the provider variables are absent; a restarted server is required after provisioning.

**How to apply:** For future Gemini feature work, check whether the managed integration is already provisioned, restart the API workflow after setup, and verify a protected request end to end.