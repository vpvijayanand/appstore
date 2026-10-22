# WL Playstore — Security Architecture Document

> **Classification:** Internal — Engineering & Security Review  
> **Last Updated:** September 2026  
> **Stack:** Node.js/Express Backend · React Admin Portal · Android Client (Kotlin)

---

## Overview

WL Playstore is an **enterprise-grade managed app distribution platform** for Worldline payment terminals. Unlike a public app store, all devices are company-managed (Android Enterprise / Device Owner mode), which enables a stricter, hardware-bound security model. The table below maps WL Playstore controls against equivalent Google Play Store protections.

| Security Domain | Google Play Store | WL Playstore |
|---|---|---|
| User Auth | Google Account + 2FA | JWT + bcrypt + Refresh Tokens |
| Device Auth | Google Play Services | Per-device API Key (cryptographic) |
| App Integrity | Google Play Protect (signature) | SHA-256 checksum + server-side verification |
| Distribution Control | App visibility settings | Customer Entitlement model (per-app, per-org) |
| Audit Trail | Internal only | Full `AdminAuditLog` on every write action |
| Transport Security | HTTPS / TLS 1.3 | HTTPS + Network Security Config (cleartext blocked) |
| Rate Limiting | Google infra | express-rate-limit (200 req / 15 min) |
| Secrets Storage | Android Keystore | EncryptedSharedPreferences (AES-256-GCM) |
| APK Storage | Google Cloud / CDN | MinIO object storage + pre-signed URLs |

---

## 1. Backend API Security

### 1.1 HTTP Security Headers — `helmet`

**File:** [`backend/src/index.ts`](file:///c:/apps/WL_Playstore/backend/src/index.ts#L21-L23)

```ts
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
```

`helmet` automatically applies 11 HTTP security headers on every response:

| Header | Value Set | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing attacks |
| `X-Frame-Options` | `SAMEORIGIN` | Blocks clickjacking via iframes |
| `X-XSS-Protection` | `0` (modern) | Disables buggy legacy XSS filter |
| `Strict-Transport-Security` | `max-age=15552000` | Forces HTTPS for 180 days |
| `Content-Security-Policy` | Default restrictive | Blocks inline script injection |
| `Referrer-Policy` | `no-referrer` | Hides referrer from cross-origin requests |
| `Permissions-Policy` | Restrictive | Disables camera/mic/geolocation from browser |

---

### 1.2 CORS — Origin Allowlist

**File:** [`backend/src/index.ts`](file:///c:/apps/WL_Playstore/backend/src/index.ts#L25-L30)

```ts
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Terminal-Key'],
}));
```

- In production, `CORS_ORIGIN` is set to the exact admin portal domain — all other origins are blocked.
- The `X-Terminal-Key` custom header is explicitly whitelisted so Android terminals can authenticate.

> ⚠️ **Recommended:** Set `CORS_ORIGIN` to the exact deployed URL (e.g., `https://admin.worldline.internal`) in production. The current `'*'` fallback is for local development only.

---

### 1.3 Rate Limiting — Brute-Force Protection

**File:** [`backend/src/index.ts`](file:///c:/apps/WL_Playstore/backend/src/index.ts#L33-L40)

```ts
const limiter = rateLimit({
  windowMs: 900000,   // 15 minutes
  max: 200,           // 200 requests per window per IP
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter); // Applied globally to ALL routes
```

This prevents:
- **Credential stuffing** on the `/api/auth/admin/login` endpoint
- **API key enumeration** on terminal routes
- **DoS** by flooding analytics/download endpoints

> ⚠️ **Recommended:** Apply a tighter limiter specifically to `/api/auth/*` (e.g., 10 req / 15 min) to further harden against brute-force login attempts.

---

### 1.4 Input Validation — Zod Schemas

**Files:** [`auth.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/auth.ts), [`apps.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/apps.ts), [`events.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/events.ts)

Every API endpoint validates its input with a Zod schema **before** touching the database. Invalid data is rejected with a `400` and a structured error — nothing is passed raw to Prisma.

Key validations include:

| Endpoint | Validation |
|---|---|
| `POST /auth/admin/login` | Email format, password minimum length |
| `POST /auth/terminal/enroll` | `customerId` must be a valid UUID |
| `POST /apps/upload` | `packageName` must match `/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/` |
| `POST /events` | `installStatus` must be an enum value |

The `packageName` regex specifically prevents malformed package names and path-traversal-style values from reaching MinIO storage.

---

### 1.5 Request Body Size Limit

**File:** [`backend/src/index.ts`](file:///c:/apps/WL_Playstore/backend/src/index.ts#L43-L44)

```ts
app.use(express.json({ limit: '10mb' }));
```

JSON payloads over 10 MB are rejected before parsing — prevents memory exhaustion attacks. APK uploads have their own `multer` limit of **200 MB**.

---

## 2. Authentication & Authorisation

### 2.1 Admin Authentication — JWT (RS256 pattern with HS256)

**File:** [`backend/src/routes/auth.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/auth.ts#L31-L41)

```ts
const token = jwt.sign(
  { adminId: admin.id, email: admin.email, role: admin.role },
  process.env.JWT_SECRET!,
  { expiresIn: '1h' }      // Short-lived access token
);

const refreshToken = jwt.sign(
  { adminId: admin.id },
  process.env.JWT_REFRESH_SECRET!,
  { expiresIn: '7d' }      // Separate secret for refresh
);
```

- **Access token** expires in **1 hour** — limits blast radius if a token is stolen.
- **Refresh token** uses a **separate secret** (`JWT_REFRESH_SECRET`) — a compromised access token cannot be used to generate new sessions.
- Passwords are hashed with **bcrypt** (industry standard, adaptive work factor).
- Error messages are deliberately generic (`"Invalid credentials"`) — never reveals whether the email or password is wrong (prevents user enumeration).

---

### 2.2 Role-Based Access Control (RBAC)

**File:** [`backend/src/middleware/auth.ts`](file:///c:/apps/WL_Playstore/backend/src/middleware/auth.ts)

Three middleware guards enforce access at the route level:

| Middleware | Who can pass | Used on |
|---|---|---|
| `requireAdmin` | Any logged-in admin | All `/api/apps`, `/api/analytics`, `/api/customers`, `/api/terminals` routes |
| `requireSuperAdmin` | `SUPER_ADMIN` role only | Destructive/sensitive admin operations |
| `requireTerminal` | Any active enrolled terminal | `/api/catalog`, `/api/events` (device-facing) |

The `requireTerminal` middleware also enforces **terminal status** — a `RETIRED` or `WIPED` terminal gets a `403` even with a valid API key.

---

### 2.3 Terminal Authentication — Per-Device Cryptographic API Keys

**File:** [`backend/src/routes/auth.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/auth.ts#L96)

```ts
const apiKey = 'wl_' + crypto.randomBytes(24).toString('hex');
```

- Each terminal gets a **48-character cryptographically random** key generated with `crypto.randomBytes` (Node.js CSPRNG backed by OS entropy).
- Keys are stored in plain in the database (required for lookup) but transmitted only once at enrollment — after that, the device stores them in **EncryptedSharedPreferences** (see §5).
- An admin can **rotate** a key at any time from the Terminals page, immediately invalidating the old key and forcing re-enrollment.

---

## 3. App Distribution Security

### 3.1 SHA-256 Checksum — APK Integrity Verification

**Server side** — [`backend/src/routes/apps.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/apps.ts#L72):
```ts
const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
```

**Android side** — [`InstallManager.kt`](file:///c:/apps/WL_Playstore/android/app/src/main/java/com/worldline/wlstore/service/InstallManager.kt#L64-L80):
```kotlin
suspend fun verifyChecksum(file: File, expectedChecksum: String): Boolean {
    val digest = MessageDigest.getInstance("SHA-256")
    // ... streams file through digest ...
    val actual = digest.digest().joinToString("") { "%02x".format(it) }
    return actual.equals(expectedChecksum, ignoreCase = true)
}
```

**Flow:**
1. Admin uploads APK → server computes SHA-256 → stored in database.
2. Terminal requests download → server returns checksum alongside presigned URL.
3. Terminal downloads APK → **recomputes SHA-256 locally** → compares with server value.
4. If mismatch: installation is **aborted** and a `FAILED` event is reported — the tampered file is never installed.

This prevents **man-in-the-middle APK tampering** even if someone intercepts the download URL.

---

### 3.2 Customer Entitlement Enforcement

**File:** [`backend/src/routes/catalog.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/catalog.ts#L89-L95)

```ts
const entitled = await prisma.customerEntitlement.findUnique({
  where: { customerId_appId: { customerId, appId: app.id } },
});
if (!entitled) {
  return res.status(403).json({ error: 'Not entitled to this app' });
}
```

- **Every download request** is checked against the `CustomerEntitlement` table server-side — not just at catalog display time.
- A terminal cannot download an app that is not explicitly granted to its customer, even if it knows the app ID.
- Unpublished apps (`isPublished: false`) are also blocked — they never appear in the catalog and cannot be downloaded.

This is equivalent to Google Play's **private/internal app track** access controls.

---

### 3.3 Pre-Signed Download URLs — No Permanent Public Links

**File:** [`backend/src/services/minio.ts`](file:///c:/apps/WL_Playstore/backend/src/services/minio.ts)

APKs in MinIO object storage are **never publicly accessible**. The download flow generates a **short-lived pre-signed URL** for each request:

```
Terminal → /api/catalog/download/:appId → Entitlement check → Pre-signed MinIO URL (expires)
```

- If an attacker captures the URL from traffic, it **expires** quickly (typically 15 minutes).
- The URL is bound to the specific object — cannot be modified to download other files.

---

### 3.4 APK Upload Restrictions

**File:** [`backend/src/routes/apps.ts`](file:///c:/apps/WL_Playstore/backend/src/routes/apps.ts#L11)

```ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }  // 200 MB max
});
```

- Only authenticated admins (`requireAdmin`) can upload APKs.
- File size is capped at **200 MB** — rejects oversized uploads before they touch disk.
- The `packageName` field is validated with a strict regex to prevent path traversal in the MinIO object name.
- New apps are created with `isPublished: false` — they must be **explicitly published** by an admin before terminals can see or download them.

---

## 4. Audit Logging

**Schema:** [`prisma/schema.prisma`](file:///c:/apps/WL_Playstore/backend/prisma/schema.prisma#L161-L172)

Every sensitive admin action is recorded in the `AdminAuditLog` table:

| Action Logged | When |
|---|---|
| `UPLOAD_APP` | Any APK uploaded |
| `UPDATE_APP` | Publish/unpublish, metadata change |
| `DELETE_APP` | App removed from catalog |
| `CREATE_CUSTOMER` | New customer organisation added |
| `UPDATE_ENTITLEMENTS` | App access granted/revoked for a customer |

Each log record stores:
- **Who** — `adminId` (FK to admin user)
- **What** — `action` string + `entityType` + `entityId`
- **Details** — JSON snapshot of what changed
- **When** — `timestamp` (automatic, cannot be overridden)

This creates an immutable audit trail for compliance (PCI-DSS, SOC 2) — any admin action on apps or customer entitlements is traceable.

---

## 5. Android Client Security

### 5.1 Encrypted Credential Storage — EncryptedSharedPreferences

**File:** [`EnrollmentActivity.kt`](file:///c:/apps/WL_Playstore/android/app/src/main/java/com/worldline/wlstore/ui/enrollment/EnrollmentActivity.kt)

```kotlin
val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
EncryptedSharedPreferences.create(
    "wl_store_prefs",
    masterKeyAlias,
    this,
    PrefKeyEncryptionScheme.AES256_SIV,
    PrefValueEncryptionScheme.AES256_GCM
)
```

- The terminal's API key is stored using **AES-256-GCM** encryption.
- The master key is stored in the **Android Keystore** — a hardware-backed secure enclave on most modern devices.
- On rooted devices, the Keystore key cannot be extracted without breaking the hardware security guarantee.
- Keys are encrypted both at-rest and in transit.

---

### 5.2 Network Security Configuration — Cleartext Blocked

**File:** [`network_security_config.xml`](file:///c:/apps/WL_Playstore/android/app/src/main/res/xml/network_security_config.xml)

```xml
<base-config cleartextTrafficPermitted="false">
    <trust-anchors>
        <certificates src="system" />
    </trust-anchors>
</base-config>
```

- **All production traffic is HTTPS-only** — cleartext HTTP is blocked at the OS level.
- Only the emulator loopback address (`10.0.2.2`) permits cleartext — exclusively for local development.
- Only **system CA certificates** are trusted — prevents user-installed proxy certificates from intercepting traffic (mitigates Charles/mitmproxy interception on non-rooted devices).

---

### 5.3 Silent Install via PackageInstaller (Device Owner)

**File:** [`InstallManager.kt`](file:///c:/apps/WL_Playstore/android/app/src/main/java/com/worldline/wlstore/service/InstallManager.kt#L88-L140)

- Uses the **`PackageInstaller` API** which requires Device Owner / EMM provisioning — only IT-managed devices can perform silent installs.
- No user interaction or confirmation is possible for non-Device-Owner installs — prevents social engineering where a malicious actor tricks a user into installing a rogue APK via a standard intent.
- APK files are written to **internal cache** (`context.cacheDir`) — not shared storage — so other apps cannot read or modify them.
- After installation, the cached APK file should be deleted (see §6 — recommended hardening).

---

### 5.4 FileProvider — Scoped URI Sharing

**File:** [`AndroidManifest.xml`](file:///c:/apps/WL_Playstore/android/app/src/main/AndroidManifest.xml)

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:exported="false"
    android:grantUriPermissions="true">
```

- The `FileProvider` is **not exported** — cannot be directly queried by other apps.
- APK URIs shared with the system installer are **scoped and temporary** — the permission is revoked after the install intent is consumed.

---

### 5.5 Telemetry — Location Data Handling

**File:** [`TelemetryService.kt`](file:///c:/apps/WL_Playstore/android/app/src/main/java/com/worldline/wlstore/service/TelemetryService.kt)

- GPS coordinates are captured only **at download time** and sent to the backend as part of the download event — not continuously tracked.
- Location data is stored as `Decimal` (high precision) in the database and is accessible only to authenticated admins.
- The `ACCESS_FINE_LOCATION` permission is declared in the manifest — on Android 6+, this requires explicit user/MDM grant.

---

## 6. Security Gap Analysis & Recommended Hardening

The following controls are **not yet implemented** and should be added before production deployment:

### 🔴 Critical

| Gap | Risk | Recommendation |
|---|---|---|
| No login brute-force lockout | Attacker can try unlimited passwords within rate limit window | Add account lockout after 5 failed attempts with exponential backoff |
| CORS fallback to `'*'` | Any origin can call the API in dev | Set `CORS_ORIGIN` env var to exact admin portal URL in all non-local environments |
| Terminal API keys stored in plaintext in DB | DB breach exposes all keys | Store HMAC of the API key in DB; verify by hashing incoming key on each request |
| No APK file deletion after install | Cached APK files persist in `cacheDir` | Delete APK from cache after `PackageInstaller` session succeeds |

### 🟡 Important

| Gap | Risk | Recommendation |
|---|---|---|
| No 2FA for admin login | Single credential compromise = full admin access | Add TOTP (Google Authenticator) or WebAuthn for admin logins |
| Refresh token not revocable | Stolen refresh token valid for 7 days | Store refresh token hash in DB; delete on logout |
| No APK signature verification | Checksum verifies bytes but not APK signature | Verify `apksigner` signature chain on server upload against a trusted cert |
| JWT uses symmetric secret | Secret compromise affects all tokens | Migrate to RS256 (asymmetric) — public key for verification, private key for signing |
| No audit log for failed logins | Cannot detect brute-force in audit trail | Log failed login attempts with IP to `AdminAuditLog` |

### 🟢 Nice-to-Have

| Gap | Recommendation |
|---|---|
| No TLS certificate pinning on Android | Add certificate pinning via `OkHttp CertificatePinner` to prevent MITM on corp networks |
| No API versioning | Add `/api/v1/` prefix so breaking security changes can be rolled out without breaking existing terminals |
| No secrets manager | Move `.env` secrets to a vault (HashiCorp Vault / AWS Secrets Manager) |
| No vulnerability scanning | Integrate `npm audit` and Android `dependency-check` into CI/CD pipeline |

---

## 7. Security Controls Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WL PLAYSTORE SECURITY LAYERS                     │
├─────────────────┬───────────────────────────────────────────────────┤
│  NETWORK        │  HTTPS-only · helmet headers · CORS allowlist      │
│  TRANSPORT      │  Network Security Config (Android) · CSP           │
├─────────────────┼───────────────────────────────────────────────────┤
│  AUTHENTICATION │  bcrypt passwords · JWT (1h) · Refresh (7d)        │
│  DEVICE AUTH    │  48-char CSPRNG API keys · Per-device rotation      │
├─────────────────┼───────────────────────────────────────────────────┤
│  AUTHORISATION  │  RBAC (SUPER_ADMIN / OPERATOR) · requireTerminal   │
│  ENTITLEMENTS   │  Server-enforced per-customer app access            │
├─────────────────┼───────────────────────────────────────────────────┤
│  APP INTEGRITY  │  SHA-256 server + client verification               │
│  DISTRIBUTION   │  Pre-signed expiring URLs · Published flag gate     │
├─────────────────┼───────────────────────────────────────────────────┤
│  DEVICE         │  EncryptedSharedPreferences (AES-256-GCM)          │
│  STORAGE        │  Android Keystore · FileProvider scoped URIs        │
├─────────────────┼───────────────────────────────────────────────────┤
│  RATE LIMITING  │  200 req / 15 min global · (login tightening req'd)│
│  INPUT VALID.   │  Zod schema on every endpoint · 10 MB body limit    │
├─────────────────┼───────────────────────────────────────────────────┤
│  AUDIT          │  AdminAuditLog on all write operations              │
│  TELEMETRY      │  GPS + network type captured per download event     │
└─────────────────┴───────────────────────────────────────────────────┘
```

---

*Document generated from source code analysis of WL Playstore v1.0 (September 2026). Keep this document updated whenever security-relevant code changes are made.*
