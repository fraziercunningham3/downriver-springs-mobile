# Downriver Springs Mobile

A mobile vehicle inspection companion for customers and Downriver Spring Service customers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/downriver-springs-mobile/app/(tabs)/index.tsx` — customer inspection experience with native camera/library access and mechanic-ready findings.
- `artifacts/downriver-springs-mobile/app/(tabs)/shop.tsx` — shop customer portal with work-order filters, status progress, approvals, and technician notes.
- `artifacts/downriver-springs-mobile/app/(tabs)/community.tsx` — community feed and live chat with native photo/video attachment and device share actions.
- `artifacts/downriver-springs-mobile/app/(tabs)/profile.tsx` — free customer profile editing with avatar, vehicle, and bio.
- `artifacts/downriver-springs-mobile/app/(tabs)/gallery.tsx` — branded photo gallery with bundled Downriver assets, native photo/video uploads, full-screen viewing, sharing, and local removal.
- `artifacts/downriver-springs-mobile/app/admin.tsx` — master profile workspace for importing and removing community profiles.
- `artifacts/downriver-springs-mobile/context/AppContext.tsx` — offline-first inspection state plus authenticated, account-scoped shop cache persisted with AsyncStorage.
- `artifacts/downriver-springs-mobile/constants/colors.ts` — Downriver Springs color tokens.

## Architecture decisions

- Inspection capture remains offline-first so customers can work without a network connection. Shop work orders use the API as the source of truth and retain the last authenticated account view when offline.
- Native Expo media picking is used for inspection capture; the app stores the selected media URI with the saved readout.
- Diagnostic results are presented as visual clues with confidence and recommendations, not as a final mechanical diagnosis.

## Product

- Customers can select a vehicle component, scan or upload a photo/video, review an AI-assisted finding, and share a mechanic-ready summary.
- Inspection entries now require a customer vehicle and first-person observation. The app does not invent findings, confidence scores, severity labels, or diagnoses; reports are saved for technician verification.
- Shop customers can create/sign into an account, see only their vehicles and work orders, filter progress and technician notes, approve an estimate, share an update, and refresh from the API with an offline last-known view.
- Customers can customize their profile, participate in community discussions, post reviews, attach photos/videos, and share posts through the device's social share sheet.
- Customers can add multiple photos or videos to the gallery from the device library. In the offline-first build, uploaded gallery entries persist locally on the device and video uploads are represented with a video card.
- The Downriver Springs master profile can import customers from brick-and-mortar service visits and remove profiles from the local community directory.
- Public business context is aligned to Downriver Spring Service in Lincoln Park, Michigan: customer confidence, full-service repair, suspension/leaf springs, alignments, lift kits, electrical, exhaust, heating/AC, and engine/transmission support. The in-app master profile is Travis Maxon per the user's direction.

## User preferences

- Complete user-visible flows end to end before describing them as complete.

## Gotchas

- `pnpm --filter @workspace/downriver-springs-mobile run typecheck` is the reliable app check; the existing mockup-sandbox currently has unrelated React 19 ref typing errors in its calendar and spinner primitives.
- Expo Go preview is served by the managed `artifacts/downriver-springs-mobile: expo` workflow.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
