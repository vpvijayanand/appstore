# POS Terminal Support — Castles SATURN Series (CTOS)

Notes from `support_doc/` (Castles Android API Reference Manual v4.9, Jan 2025,
doc `MAN-S1-00-04-V4.9`, 399 pages; and `CTOS.CtSystem_0.0.79.jar`).

## Device identification

The physical terminal used for testing (adb model `SATURN1000`,
`msm8937_32`) is a **Castles Technology SATURN Series EFT-POS Terminal**
running their custom Android build ("CTOS"). Castles Technology Co., Ltd.,
Taiwan — http://www.castech.com.tw.

## SDK jar in `support_doc/`

`CTOS.CtSystem_0.0.79 (2)/CTOS.CtSystem_0.0.79.jar` contains only the
**System** API surface (11 classes):

- `CTOS.CtSystem` — public wrapper class apps call directly.
- `CTOS.CtSystemBinder`, `CTOS.CtSystemException` — plumbing/error type.
- `android.binder.aidl.ISystemAPI` / `ISystemAPI2` (+ `$Stub`/`$Proxy`) —
  AIDL interfaces backing two system services the device boots with. `CtSystem`
  binds to both (`initService`/`initService2`) and dispatches each public
  method to whichever backing service implements it.

This jar only covers **System** (power/reboot, serial, device model, backlight,
LED, SIM, device-owner, etc.) — the manual documents many more hardware
classes (printer, card readers, barcode scanner, etc.) whose SDK jars are
**not** present in `support_doc/`; only the manual describes them.

### `CTOS.CtSystem` — key methods relevant to this app

| Method | Relevance |
|---|---|
| `shutdown(byte)` with `d_PWR_REBOOT` / `d_PWR_POWER_OFF` constants | Vendor reboot/power-off, alternative to standard Android reboot |
| `securityReboot()` | Vendor-specific secure reboot path |
| `gotoSleep()` | Put device to sleep |
| `getSerialNumber(byte[])`, `getFactorySN()`, `getFactorySNEx()`, `getCompactFactorySN()` | Device serial — candidate source for terminal enrollment Serial No instead of manual entry |
| `getDeviceModel()`, `getModelName()` | Model identification |
| `setDeviceOwner(String)` | Vendor-level Device Owner assignment helper |
| `setDefaultApp(String)` / `getDefaultApp()`, `setDefaultLauncher(String)` | Kiosk launcher configuration |
| `killAPP(String)`, `killBackgroundProcesses(String)`, `clearApplicationUserData(String)`, `deleteApplicationCacheFiles(String)` | App lifecycle control — candidates for remote-command features |
| `setBackLight(...)`, `cl_led(int)`, `sc_led(int)`, `setLED(int,int)`, `beep()` | Peripheral feedback (contactless LED, smart-card LED, buzzer) |
| `setNavigationbar(boolean)`, `setNavBarIcon(...)`, `setStatusBar(int)` | Kiosk UI lock-down (hide nav/status bar) |
| `setAutoRebootTime(...)`, `updateNTPSetting(...)`, `setTimeZone(String)`, `setSystemTime(...)` | Scheduled reboot / time sync |
| `clearDnsCache()` | Useful if the app ever needs to force-refresh DNS after a network change |
| `getBatteryCycleCount()`, `getCoinBatteryADC()`, `getCPUUsage()`, `getStorageDeviceStatus()` | Telemetry candidates for device health reporting |
| `simSelect(int)`, `selectSimCardBySlot(int)`, `setExternalUsbHost(int)`, `setOtgOn(int)` | Dual-SIM / USB host mode control |

### Current app usage vs. CTOS SDK

[RemoteCommandExecutor.kt](android/app/src/main/java/com/worldline/wlstore/service/RemoteCommandExecutor.kt#L99-L119)'s `RESTART_DEVICE` handler uses the
**standard Android** `DevicePolicyManager.reboot()` (Device Owner API) — it
does **not** use this CTOS SDK at all. That's fine as the primary path, but
worth knowing: if a terminal is ever *not* provisioned as Device Owner (the
current code explicitly fails in that case, per
[RemoteCommandExecutor.kt](android/app/src/main/java/com/worldline/wlstore/service/RemoteCommandExecutor.kt#L109-L110)),
`CTOS.CtSystem.shutdown(d_PWR_REBOOT)` / `securityReboot()` would be a
vendor-level fallback that doesn't require Device Owner — only relevant if we
decide to add that resilience later; not implemented currently.

## Full class list per the API manual (Table of Contents)

**1. System** (pg. 23): `CtSystem`, `CtPrint` (pg. 35), `CtSC` — smart card
(pg. 49), `CtExtraStorage` (pg. 61), `CtBarcodeReader` (pg. 63), `CtLoader`
(pg. 79), `CtMDB` (pg. 87), `CtCL` — contactless/EMV (pg. 97), `CtMSR` —
magstripe reader (pg. 156), `CtSettings` (pg. 161), `CtCradle` (pg. 179),
`CtDEX` (pg. 181), `CtCertificate` (pg. 185).

**2. KMS** (pg. 188): Key Management Specifications — key injection methods,
Key Block Header format, MAC, Castles proprietary key binding — relevant only
if/when payment key provisioning is in scope (not used by this app today).

If a future feature needs printing, card read (EMV/contactless/magstripe),
or barcode scanning, the corresponding SDK jar (`CtPrint.jar`, `CtCL.jar`,
etc.) will need to be obtained separately — only `CtSystem` is in
`support_doc/` right now.
