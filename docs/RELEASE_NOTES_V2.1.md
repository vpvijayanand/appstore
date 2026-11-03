# WL BizStore — Release Notes V2.1

**Branch:** `V2`
**Date:** October 28, 2026

## Summary

This release adds a remote command channel between the Admin Portal and the Android
app, starting with the ability to force-restart the WL BizStore app on a specific
terminal without needing physical access to the device.

## What's New

### Remote Command Channel — Force Restart the Android app from the Admin Portal
- New **Force Restart** action on the Terminals admin page lets an admin remotely
  restart the WL BizStore app on a specific device.
- Built as a generic remote-command channel (not a single-purpose button), so future
  command types can be added later without new plumbing.
- Delivery is poll-based: the device checks in for pending commands every 15 minutes
  in the background, and immediately whenever the app is opened/resumed in the
  foreground — no push notification infrastructure required.
- Each command is tracked end-to-end (`PENDING` → `ACKNOWLEDGED` → `COMPLETED`/`FAILED`)
  so a restart can be confirmed as delivered, not just requested.

## How It Works
- **Backend:** new `DeviceCommand` model (type `RESTART_APP`, status
  `PENDING`/`ACKNOWLEDGED`/`COMPLETED`/`FAILED`). Admin-facing
  `POST/GET /terminals/:id/commands` queue and view commands; terminal-facing
  `GET /terminal/commands/pending` and `POST /terminal/commands/:id/complete` let the
  device poll and report outcomes.
- **Admin Portal:** "Force Restart" button on the Terminals page, with a confirmation
  prompt before queuing the command.
- **Android:** a WorkManager periodic worker polls every 15 minutes in the background;
  the catalog screen also checks immediately on resume for a faster response while the
  app is in active use. On receiving a restart command, the app reports completion
  first, then relaunches its own launcher activity and terminates the current process.

## Verification Performed
- Backend: confirmed queue/poll/complete endpoints and audit logging.
- Admin Portal: confirmed Force Restart button and confirmation flow.
- Android: confirmed background poll worker and immediate on-resume check.
- Validated clean builds across backend (`tsc`), admin portal (`vite build`), and
  Android (`gradlew assembleDebug`).

## Deployment Notes
- No new environment variables required.
- Requires a Prisma migration deploy on the production database (adds the
  `DeviceCommand` table and its enums) before the backend image is restarted.
- Android client requires a new APK build/install; devices still running a pre-V2.1
  APK are unaffected — they simply won't support Force Restart until updated.
