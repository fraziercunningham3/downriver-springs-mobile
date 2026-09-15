---
name: Development schema sync
description: Development integration tests can expose database schema lag after schema-only feature work.
---

Keep the development database schema synchronized with the committed Drizzle schema before exercising authenticated integration routes.

**Why:** Application builds and typechecks can pass while a newly required table is absent from the provisioned development database, causing route tests to fail with generic server errors.

**How to apply:** When an integration test reaches a database-backed route that recently gained persistence, check the development schema first and apply the existing schema definition before diagnosing route logic.