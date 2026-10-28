# WL BizStore — Release Notes V2

**Branch:** `V2`
**Date:** October 28, 2026

## Summary

This release introduces device-level (Serial No / TID) app provisioning, replacing the
previous customer-only entitlement model, along with an Android client experience that
automatically installs required apps on first run while still allowing users to browse
and install any additional app from the full store.

## What's New

### 1. Device Master — Serial No / TID mapped to Customer
- New **Device Master** admin page for pre-registering terminals by **Serial No** and
  **TID** (TID optional, can be mapped later when the physical device enrolls).
- Each Device Master record is linked to a **Customer**, independent of whether the
  device has been enrolled yet.
- Supports single-record creation and **bulk import** (CSV) with a per-row success/failure
  report.
- When a physical device enrolls with a matching TID, it automatically links to its
  pre-registered Device Master and inherits the customer from that record — the device can
  no longer self-declare an arbitrary customer at enrollment.

### 2. Apps can be assigned to a specific device (Serial No/TID), not just a Customer
- New **App Assignment** model supports two scopes:
  - **Customer** scope — applies to every device under that customer (previous behavior).
  - **Terminal** scope — applies to one specific Serial No/TID only.
- A device-level assignment always overrides a customer-level assignment for the same app.
- New **Assignments** admin page with a guided wizard: pick targets (customers or
  devices) → pick apps → pick mode → review a plain-English summary before confirming.

### 3. Default vs. On-Request install mode
- Every assignment (customer or device level) is tagged as:
  - **Default** — installs automatically on the device.
  - **On Request** — visible in the store, installed only when the user taps Install.

### 4. Android — automatic install of Default apps + full store browsing
- On first run after enrollment, the app checks for any **Default**-assigned apps and
  installs them automatically and sequentially, showing a live **"Installing 1 of 3…"**
  progress screen with a per-app status row (queued → downloading → installing → done/failed).
- The regular catalog is now split into two tabs:
  - **For You** — apps assigned to this device/customer.
  - **All Apps** — the entire published store, browsable regardless of assignment.
- If a Default app hasn't been installed yet (e.g., setup was skipped or a new Default
  app was assigned afterwards), the catalog shows a banner letting the user re-run the
  install for just the missing apps.
- Each app card and detail screen shows live installed state (Installed / Update
  available / Not installed) using on-device package checks.

## Also Included in This Branch
- Fix: Android telemetry reporting (network type + GPS) is now resilient to GPS/Play
  Services failures — a location error no longer blocks network/status reporting for a
  download event.
- Fix: production backend image now correctly resolves `src/` imports for the database
  seed script.
- Demo data: a real, installable demo APK is now seeded for the "WL Pay Terminal" app so
  install/update states can be demonstrated end-to-end on a real device.

## Verification Performed
- Backend: confirmed schema (`TerminalMaster`, `AppAssignment`, enums), enrollment logic
  (TID-based customer resolution), catalog resolution (terminal-over-customer precedence,
  `PUBLIC`/assigned union), and `/catalog/default-apps` endpoint.
- Admin Portal: confirmed Device Master CRUD + bulk import, and the Assignments wizard
  (targets → apps → mode → review) wired to the bulk-assign API.
- Android: confirmed first-run sequential auto-install screen, pending-defaults banner,
  and the For You / All Apps tab split in the catalog.

## Deployment Notes
- No new environment variables required. `TERMINAL_ENROLLMENT_MODE=strict` can optionally
  be set in production once all devices are pre-provisioned via Device Master, to reject
  enrollment from any device without a matching TID record (recommended hardening, not
  required for this release).
- Requires a Prisma migration deploy on the production database (adds `TerminalMaster`
  and `AppAssignment` tables/enums) before the backend image is restarted.
- Android client requires a new APK build/install; no Play Store listing involved for
  this internal demo app.
