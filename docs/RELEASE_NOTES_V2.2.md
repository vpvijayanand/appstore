# WL BizStore — Release Notes V2.2

**Branch:** `remote_connect`
**Date:** November 18, 2026

## Summary

Remote screen sharing is now initiated by the device user and approved by an admin,
instead of being startable by an admin at any time.

## What's New

### Device-initiated Remote Access Requests
- **Android:** new **Request Remote Support** button in the catalog screen. Repeated taps
  return the existing pending request.
- **Admin Portal:** new **Remote Access Requests** page (sidebar, and a "Remote Queue"
  button on the Terminals page) listing requests with Serial No, TID, customer and site.
  Admins can **Approve + Connect** or **Reject** (optional reason).
- **Approval gate:** `POST /terminals/:id/screen-share/sessions` now requires an approved
  `remoteAccessRequestId`. Each approval is consumed once and opens one session.
  `RemoteScreenPage` expects `?requestId=`.
- Pending requests expire after 15 minutes. Only one pending request per terminal.
- Approve/reject actions are written to the admin audit log.

### New API
- Terminal: `POST /api/terminal/remote-access/request`, `GET /api/terminal/remote-access/latest`
- Admin: `GET /api/remote-access-requests`, `POST /api/remote-access-requests/:id/approve`,
  `POST /api/remote-access-requests/:id/reject`

### Deployment / Infrastructure
- `minio/Dockerfile` now installs a pinned official MinIO release binary
  (`RELEASE.2025-09-07T16-13-09Z`) with SHA-256 verification; the previous
  `go install` build no longer works.

## Deployment Notes
- No new environment variables.
- Requires `prisma migrate deploy` (migrations `20261117120000_add_remote_access_requests`
  and `20261117124000_remote_access_enforcement_and_expiry`).
- Rebuild only `backend` and `admin-portal`; MinIO does not need rebuilding.
- Android client requires a new APK; older APKs have no Request Remote Support button.
