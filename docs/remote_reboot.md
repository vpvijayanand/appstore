# Remote Device Reboot — Release Notes

## Summary

Adds a second remote command, **`RESTART_DEVICE`**, alongside the existing app-only
`RESTART_APP` ("Force Restart"). Where Force Restart only relaunches the WL
BizStore app process, `RESTART_DEVICE` reboots the entire physical Android
device's OS, triggered from the admin portal.

## What's New

- **Admin portal** — Terminals page now has a **"Restart Device"** button next
  to the existing "Force Restart" button, with its own confirmation dialog.
- **Backend** — new `DeviceCommandType.RESTART_DEVICE` enum value (Prisma
  migration `20261028224058_add_restart_device_command`). No new routes were
  needed — the existing `POST /terminals/:id/commands` endpoint already
  accepts any `DeviceCommandType`.
- **Android** — `RemoteCommandExecutor` now handles `RESTART_DEVICE` by calling
  `DevicePolicyManager.reboot()`. A new `WLDeviceAdminReceiver` (Device Admin
  receiver) was added and registered in the manifest, since Device Owner
  status is required for that API to succeed.

## How It Works

1. Admin clicks **Restart Device** for a terminal → confirms the warning
   dialog → backend queues a `DeviceCommand` with `type: RESTART_DEVICE`,
   `status: PENDING`.
2. The Android app picks it up the same way as Force Restart — either
   immediately (if the app is in the foreground, via `CatalogActivity.onResume()`)
   or within 15 minutes (via the background `CommandPollWorker`).
3. `RemoteCommandExecutor` checks `DevicePolicyManager.isDeviceOwnerApp(...)`:
   - **If Device Owner**: reports the command `COMPLETED`, then calls
     `dpm.reboot(WLDeviceAdminReceiver.componentName(...))` — the device goes
     down and reboots.
   - **If not Device Owner**: reports the command `FAILED` with the message
     *"Device is not provisioned as Device Owner; cannot reboot OS"* — visible
     in the admin portal's command history — and does nothing further (no
     crash).

## Requirement: Android Device Owner Provisioning

This is the critical prerequisite — **without it, the button will always
fail** for a given terminal. Device Owner is a special Android management
role that only one app on a device can hold, and it can only be granted while
the device has **no accounts configured** (i.e. a fresh or factory-reset
device, before handing it to a store).

### Prerequisites
- Device has zero accounts added (Settings → Accounts is empty). If accounts
  already exist, remove them or factory reset the device first.
- USB debugging enabled: Settings → About phone → tap "Build number" 7 times
  → Developer options → enable "USB debugging".
- `adb` installed on the provisioning machine, device connected (USB or
  network adb).
- The WL BizStore APK (containing `WLDeviceAdminReceiver`) is installed on
  the device — can be installed before or after this step.

### Steps

1. Confirm the device is visible to adb:
   ```powershell
   adb devices
   ```
   Should list the device as `device` (accept the on-screen RSA key prompt if
   it shows `unauthorized`).

2. Confirm the app package is installed:
   ```powershell
   adb shell pm list packages | findstr wlstore
   ```

3. Set Device Owner:
   ```powershell
   adb shell dpm set-device-owner com.worldline.wlstore/.service.WLDeviceAdminReceiver
   ```
   Success looks like:
   ```
   Success: Device owner set to package com.worldline.wlstore
   Active admin set to component {com.worldline.wlstore/com.worldline.wlstore.service.WLDeviceAdminReceiver}
   ```

4. Verify:
   ```powershell
   adb shell dumpsys device_policy | findstr "Device Owner"
   ```

### Common Failure

```
Fail: java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device
```
Means an account still exists on the device — remove all accounts (or
factory reset) and retry.

### Important Caveat

Once Device Owner is set, it **cannot be removed without a factory reset**
(Android restricts `dpm remove-active-admin` for device owners). This is a
permanent, deliberate per-terminal decision — not something to run casually
on a device already in active use with other apps/accounts that matter.
Existing already-deployed terminals cannot get this retroactively without
wiping them first; only newly provisioned (or deliberately re-provisioned)
terminals will support the "Restart Device" button. Terminals without it
keep working fine with the existing app-level "Force Restart".

## Deployment Status

- ✅ Merged into `V2` (commit `cc17a6d`) and pushed to `origin/V2`.
- ✅ Deployed to production (`backend` + `admin-portal` containers rebuilt
  and recreated).
- ✅ Migration `20261028224058_add_restart_device_command` applied to the
  production database.
- ⬜ No physical terminals have been Device Owner-provisioned yet — this must
  be done per device using the steps above before "Restart Device" will
  succeed on it.
