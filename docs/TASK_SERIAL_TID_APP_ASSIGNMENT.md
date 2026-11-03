# Task Plan — Serial No / TID Master, App Assignment & Android Store UX Overhaul

> Status: **DRAFT FOR JOINT REVIEW** — nothing in this document has been implemented yet.
> Purpose: capture the full design so we agree on data model, APIs, admin UX and Android UX
> before writing code. Please leave comments inline or flag the numbered "Open Questions".

---

## 1. Goals (from your request, restated)

1. Add a new **master** — Serial No + TID — that is mapped to a **Customer**, independent of
   (and created *before*) a physical device enrolling.
2. Apps must be **assignable directly to a Serial No/TID**, not only to a Customer.
3. Assignment must support **bulk operations** (many apps × many devices/customers in one action).
4. Each assignment has a **mode**: `DEFAULT` (auto-installed) or `ON_REQUEST` (user downloads manually).
5. Android client, on **first run after enrollment**, must **auto-download+install every `DEFAULT`
   app**, with a visible **"Installing 1/3, 2/3…"** progress experience.
6. Android client must let the user **browse the entire store** (not just apps assigned to the
   device), see a **description** per app, and a **download** action.
7. Android client must clearly show whether an app is **already installed** vs not.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **TID** | Terminal ID — the durable ID already stored today as `Terminal.terminalId` (e.g. `WL-TRM-xxxx`). |
| **Serial No** | Hardware serial number of the physical device. |
| **Terminal Master** *(new)* | The new master record pairing **Serial No ↔ TID ↔ Customer**, pre-provisioned by an admin, usually *before* the device is ever powered on. |
| **Terminal** *(existing)* | The live/runtime record created when a device actually enrolls (API key, status, GPS, last-seen). Will be **linked to** a Terminal Master. |
| **Assignment** *(new concept)* | An app granted to a **Customer** (all its devices) or to one specific **Terminal Master** (one device). Replaces today's `CustomerEntitlement`. |
| **DEFAULT** | Assignment mode — app auto-installs silently the first time the device checks in. |
| **ON_REQUEST** | Assignment mode — app is visible/entitled but the user must tap "Install". |
| **PUBLIC app** | *(new app-level flag)* — visible & installable by **every** terminal, regardless of assignment (the "browse the whole store" requirement). |
| **PRIVATE app** | *(default for all apps today)* — only visible to terminals that have an explicit Customer- or Terminal-level assignment. |

---

## 3. Current State (for reference)

- `Terminal` already stores `terminalId` and `serialNo`, but only exists **after** a device calls
  `POST /auth/terminal/enroll`.
- ⚠️ **Existing security gap found during this review:** [auth.ts](../backend/src/routes/auth.ts)
  `enroll` trusts a client-supplied `customerId` with no verification — any device can enroll
  itself into *any* customer just by sending that customer's code/UUID. The new Terminal Master
  fixes this (see §6.3).
- Entitlement today = `CustomerEntitlement` (customer ↔ app only). [catalog.ts](../backend/src/routes/catalog.ts)
  only returns apps the terminal's **customer** is entitled to; there is no per-device override and
  no "show everything" mode.
- Android client ([full research notes](../android/app/src/main/java/com/worldline/wlstore)) has:
  - No "installed?" detection (no `PackageManager` check anywhere).
  - No first-run default-install flow at all.
  - Per-file download % exists (`InstallManager.downloadApk`), but no "N of M apps" sequencing UI.
  - Catalog only ever shows entitled apps, never the full store.

---

## 4. Open Questions — please confirm before implementation starts

1. **"Show all apps in the store" vs. customer confidentiality.** Your current architecture
   deliberately keeps customers from seeing each other's apps (Slide 3 in the PPT: *"Bank A never
   sees Retailer B's apps"*). Showing *every* app to *every* terminal would break that guarantee.
   **Recommended fix:** add a per-app `visibility` flag — `PUBLIC` (visible to all terminals,
   e.g. generic utilities) vs `PRIVATE` (visible only if assigned, e.g. bank-specific apps). The
   "full store" view then shows *all PUBLIC apps* + *everything assigned to this device/customer*.
   → Confirm this is acceptable, or tell us every app should really be visible to everyone.
2. **Precedence when both Customer-level and Terminal-level assignments exist for the same app**,
   with different modes (e.g. Customer says `ON_REQUEST`, Terminal Master says `DEFAULT`).
   Recommended rule: **most specific wins** — a Terminal Master assignment overrides the Customer
   assignment for that one device. Confirm OK.
3. **Enrollment behavior when a device's TID has no pre-provisioned Terminal Master.** Recommended:
   configurable per deployment —
   - *Strict mode* (recommended for production): reject enrollment, device must be pre-provisioned.
   - *Auto-create mode* (keeps today's behavior for dev/testing): auto-create a Terminal Master
     from the enrollment payload.
   → Which do you want as the default?
4. **Naming** — internally we'll call the new entity `TerminalMaster` in the schema/API, shown as
   **"Device Master"** or **"Provisioning"** in the admin UI. Shout if you prefer different wording.

---

## 5. Data Model Changes (Prisma)

```prisma
// ── NEW: pre-provisioned Serial/TID master, mapped to a Customer ─────────────
model TerminalMaster {
  id           String   @id @default(uuid())
  tid          String   @unique @map("tid")          // matches Terminal.terminalId once enrolled
  serialNo     String   @unique @map("serial_no")
  customerId   String   @map("customer_id")
  customer     Customer @relation(fields: [customerId], references: [id])
  model        String?
  branchCode   String?  @map("branch_code")
  site         String?
  notes        String?
  status       TerminalMasterStatus @default(ACTIVE)
  terminal     Terminal?            // 1:1, set once the physical device enrolls
  assignments  AppAssignment[]
  createdById  String?  @map("created_by_id")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("terminal_masters")
}

enum TerminalMasterStatus {
  ACTIVE
  INACTIVE
}

// Terminal gains an optional back-link to its Master
model Terminal {
  // ...existing fields...
  terminalMasterId String?          @unique @map("terminal_master_id")
  terminalMaster   TerminalMaster?  @relation(fields: [terminalMasterId], references: [id])
}

// ── NEW: replaces CustomerEntitlement with a scope + mode ────────────────────
model AppAssignment {
  id               String    @id @default(uuid())
  appId            String    @map("app_id")
  app              App       @relation(fields: [appId], references: [id], onDelete: Cascade)
  scope            AssignmentScope
  customerId       String?   @map("customer_id")
  customer         Customer? @relation(fields: [customerId], references: [id], onDelete: Cascade)
  terminalMasterId String?   @map("terminal_master_id")
  terminalMaster   TerminalMaster? @relation(fields: [terminalMasterId], references: [id], onDelete: Cascade)
  mode             AssignmentMode @default(ON_REQUEST)
  grantedAt        DateTime  @default(now()) @map("granted_at")
  grantedById      String?   @map("granted_by_id")

  @@unique([appId, customerId])
  @@unique([appId, terminalMasterId])
  @@index([customerId])
  @@index([terminalMasterId])
  @@map("app_assignments")
}

enum AssignmentScope { CUSTOMER TERMINAL }
enum AssignmentMode  { DEFAULT ON_REQUEST }

// App gains a visibility flag (see Open Question 1)
model App {
  // ...existing fields...
  visibility AppVisibility @default(PRIVATE) @map("visibility")
}

enum AppVisibility { PUBLIC PRIVATE }
```

**Migration plan:**
1. Add new tables/enums/columns (additive, non-breaking).
2. Backfill `TerminalMaster` rows from existing `Terminal` rows (`tid = terminalId`,
   `serialNo = serialNo ?? 'UNKNOWN-' + terminalId`), link `Terminal.terminalMasterId`.
3. Backfill `AppAssignment` from `CustomerEntitlement` → `scope=CUSTOMER`, `mode=ON_REQUEST`
   (preserves current behavior — nothing auto-installs today).
4. Keep `CustomerEntitlement` table in place but stop writing to it (mark deprecated); drop in a
   later cleanup migration once the new path is verified in production.

---

## 6. Backend API Changes

### 6.1 Terminal Master (Device Provisioning) — new admin endpoints
- `GET /api/terminal-masters?customerId=&status=&search=` — list, with linked `Terminal` summary.
- `POST /api/terminal-masters` — create one `{ tid, serialNo, customerId, model?, branchCode?, site? }`.
- `POST /api/terminal-masters/bulk-import` — multipart CSV/XLSX upload: `tid, serialNo, customerCode, model, branchCode, site`. Returns per-row success/failure report (never partially silent-fails).
- `PATCH /api/terminal-masters/:id` — edit customer/model/status.
- `DELETE /api/terminal-masters/:id` — only if not linked to a live `Terminal` (otherwise 409).

### 6.2 App Assignment — new admin endpoints (replaces `PUT /customers/:id/entitlements`)
- `GET /api/assignments?scope=&customerId=&terminalMasterId=&appId=` — query current assignments.
- `POST /api/assignments/bulk` — the core bulk-assign operation:
  ```jsonc
  {
    "appIds": ["app1", "app2"],
    "targets": { "scope": "TERMINAL", "terminalMasterIds": ["tm1", "tm2", "tm3"] },
    // or: "targets": { "scope": "CUSTOMER", "customerIds": ["cust1"] }
    "mode": "DEFAULT",          // applied to every (app × target) pair
    "replaceExisting": false     // false = merge/add, true = also remove assignments not in this payload for these targets
  }
  ```
  Returns a diff summary: `{ created: N, updated: N, removed: N }` and writes one `AdminAuditLog`
  entry per bulk action (not per row) so audit logs stay readable.
- `DELETE /api/assignments/:id` — remove a single assignment.

### 6.3 Enrollment — security fix + Terminal Master linking
`POST /auth/terminal/enroll` changes:
- Look up `TerminalMaster` by `tid` (required) — **ignore any `customerId` sent by the device**.
- If found: derive `customerId` from the master, link `Terminal.terminalMasterId`, copy
  `serialNo/model/branchCode/site` from the master as defaults.
- If not found: behavior per **Open Question 3** (reject vs. auto-create-master-from-payload).
- This closes the "device can claim any customer" gap called out in §3.

### 6.4 Catalog — full-store browsing + effective entitlement
`GET /catalog` response gets richer per app:
```jsonc
{
  "id": "...", "name": "...", "packageName": "...", "description": "...",
  "iconUrl": "...", "sizeBytes": "...", "version": "...", "versionCode": 1,
  "visibility": "PUBLIC" | "PRIVATE",
  "isAssigned": true,        // explicit Customer- or Terminal-level assignment exists
  "assignmentMode": "DEFAULT" | "ON_REQUEST" | null,
  "assignmentSource": "TERMINAL" | "CUSTOMER" | null
}
```
Resolution logic (server-side, one query per catalog call):
1. Start from **all published apps** where `visibility = PUBLIC` **OR** an `AppAssignment` exists
   for this terminal's `customerId` **OR** its `terminalMasterId`.
2. For each app, compute effective `mode`: Terminal-level assignment wins over Customer-level
   (§4 Q2); apps with no assignment at all → `assignmentMode: null`, always `ON_REQUEST`-style
   (manual install only, never auto-installed).
3. `GET /catalog/default-apps` — thin convenience endpoint returning just the ordered list of
   `DEFAULT`-mode apps, used to drive first-run install (avoids the client re-deriving this logic).
4. `GET /catalog/download/:appId` entitlement check becomes: `visibility === PUBLIC` **or** an
   `AppAssignment` row exists for this app at customer or terminal level (replaces the old
   `CustomerEntitlement` lookup, otherwise unchanged — still returns pre-signed URL + checksum).

---

## 7. Admin Portal UX

### 7.1 New page — **"Device Master"** (`/devices`)
- Table: TID, Serial No, Customer, Model/Branch/Site, linked Terminal status (Enrolled ✅ / Not yet
  enrolled ⏳), Status (Active/Inactive), assigned-app count.
- **"+ Add Device"** modal for one-off entries.
- **"Bulk Import"** button → CSV/XLSX upload modal with a column-mapping preview (like the
  "Upload APK" drag-drop pattern already used in [AppsPage.tsx](../admin-portal/src/pages/AppsPage.tsx)),
  then a results table: ✅ 48 created, ⚠️ 2 skipped (duplicate TID) with reasons.
- Row action **"Manage Apps"** → opens the same assignment panel as §7.2 pre-scoped to that device.

### 7.2 New — **Bulk App Assignment wizard** (reachable from Apps page, Customers page, and Device
Master page, always the same 4-step flow so admins learn it once)
1. **Targets** — toggle `Customer` vs `Device (Serial/TID)`; multi-select via searchable
   checkbox list; devices can be filtered by customer/branch/model first, or pasted as a
   TID/Serial list for fast bulk entry.
2. **Apps** — searchable, category-grouped multi-select grid (reuse the card style from
   [CustomersPage.tsx](../admin-portal/src/pages/CustomersPage.tsx) entitlement modal).
3. **Mode** — big two-option toggle: **"Install automatically (Default)"** vs **"Available on
   request"**, with a one-line explanation under each so it's unambiguous to non-technical admins.
4. **Review** — plain-English summary: *"3 apps → 12 devices = up to 36 assignments. 5 already
   exist and will be updated to Default. 31 are new."* Confirm button executes
   `POST /assignments/bulk`.
- A lighter **matrix view** (apps × targets grid of checkboxes, Default shown as a filled star)
  stays available for quick single-cell edits without the wizard.

### 7.3 Apps page changes
- New **Visibility** column/toggle per app: `Public` / `Private` pill, editable inline (maps to
  §4 Q1). Default stays `Private` so nothing becomes unexpectedly visible on upgrade.
- New "Assigned to" count + quick link into the assignment wizard pre-filled with that app selected.

### 7.4 Customers / Terminals pages
- `CustomersPage` entitlement modal is replaced by a link into the shared wizard (§7.2), scoped to
  that customer — keeps one assignment UI instead of two.
- `TerminalsPage` gains a "Master" column showing linked TID/Serial record, and a banner for
  Terminals whose TID has **no** Terminal Master (meaning they enrolled under auto-create / legacy
  mode) prompting the admin to formally register them.

---

## 8. Android Client UX

### 8.1 First-run default install (new `DefaultAppsSetupActivity`, shown once right after enroll)
- Flow: `verifyTerminal()` → `GET /catalog/default-apps` → if list is non-empty, show setup screen
  **before** the normal catalog; if empty, skip straight to catalog (no empty progress screen).
- Screen design:
  - Header: *"Setting up your terminal"* + subtitle *"Installing required apps — please wait"*.
  - A large overall progress indicator: **"Installing 2 of 3"** with a segmented progress bar
    (one segment per app, filled as each completes) — this is the literal "1/3, 2/3" ask.
  - Below it, a compact list of the N default apps, each row showing: icon, name, and a trailing
    state icon — queued (grey clock) → downloading (circular % ring) → installing (spinner) →
    done (green check) → failed (red icon + inline **"Retry"** link, does not block the others).
  - Apps install **sequentially** (not parallel) — simpler progress semantics, and avoids
    saturating storage I/O / PackageInstaller sessions on low-end terminal hardware.
  - Footer button: disabled **"Continue"** until all apps reach done/failed, then enabled
    (*"Continue to Store"*); failures never hard-block the user from entering the store.
  - Each app's telemetry (`DOWNLOADING` → `SUCCESS`/`FAILED`) is reported exactly as today via
    `reportEvent`, just orchestrated in sequence by this new screen instead of one-at-a-time by
    `AppDetailActivity`.

### 8.2 Catalog redesign — full store, assignment-aware
- Tabs become: **"For You"** (apps where `isAssigned=true`, today's behavior) and **"All Apps"**
  (every app returned by `/catalog`, i.e. assigned + `PUBLIC`), both still grouped by category
  underneath via the existing `TabLayout`/`ViewPager2`/category-fragment structure.
- Each app card (`AppGridAdapter`) gains a **state badge** in the corner:
  - **Installed** — green check pill, tapping opens the app (via `packageManager.getLaunchIntentForPackage`) instead of going to the detail screen's install flow.
  - **Update available** — amber pill (installed `versionCode` < catalog `versionCode`).
  - **Not installed** — neutral, no badge (default Play-Store-like appearance).
  - Installed-state is computed locally via `PackageManager.getPackageInfo(packageName, 0)` —
    no backend round-trip needed — re-checked in `onResume()` and also via a registered
    `BroadcastReceiver` for `ACTION_PACKAGE_ADDED`/`REMOVED` so badges update live without
    navigating away.

### 8.3 App Detail screen redesign
- Header: icon, name, developer, version, size — unchanged.
- **New: full description block** (already stored as `App.description`, just not rendered in
  detail screen today per the code research — confirm during implementation) with a "read more"
  expand for long text.
- Primary button is now **state-driven**:
  - Not installed → **"Install"** (existing download→verify→install pipeline).
  - Installed & up to date → **"Open"**.
  - Installed & outdated → **"Update"** (same pipeline, `PackageInstaller` handles it as an
    update automatically since package name matches).
- If the app is `ON_REQUEST`/unassigned-but-`PUBLIC`, show a small info row: *"This app is not
  pre-assigned to your terminal — you can still install it manually."* — keeps the UX honest
  about why some apps auto-installed and others didn't.

---

## 9. End-to-End Flows (for review)

**A. Pre-provisioning (new):** Admin bulk-imports 500 Serial/TID rows mapped to Customer "Retail
Chain A" → runs the assignment wizard once, selects those 500 devices as targets, picks 3 apps,
mode = Default → done before any device is unboxed.

**B. First boot:** Device enrolls with its real TID → backend matches the pre-provisioned
`TerminalMaster`, derives customer, links records → Android shows "Installing 1/3…3/3" → lands on
Catalog with those 3 apps already installed and badged "Installed".

**C. Later, user wants an extra app:** opens **"All Apps"** tab → sees an app that's `PUBLIC` or
`ON_REQUEST`-assigned → taps it → reads description → taps **Install** → same download/verify/
silent-install pipeline as today, badge flips to "Installed" on completion.

**D. Admin changes a device's assignment later:** marks one more app as Default for a specific
Serial/TID (not the whole customer) → next time that one terminal calls `/catalog`, the app shows
`assignmentMode: DEFAULT`; (note: current scope is "assign at install time only" — auto-pushing
newly-added Default apps to already-provisioned devices in the background is **out of scope** for
this phase; flagged as a roadmap item in §12).

---

## 10. Security Considerations
- Enrollment no longer trusts client-supplied `customerId` (closes real gap found in §3).
- `AppVisibility.PUBLIC` is opt-in per app (defaults `PRIVATE`) so existing customer-isolation
  guarantees aren't silently weakened by this change.
- Bulk-import endpoint must validate every row with Zod (reject unknown customer codes, duplicate
  TID/Serial) and report failures per-row rather than partially committing silently.
- `requireAdmin` / `requireSuperAdmin` gating on all new admin endpoints; `requireTerminal` only
  ever exposes a terminal's **own** catalog (no change to that isolation boundary).

---

## 11. Phased Rollout

| Phase | Scope |
|---|---|
| 1 | Prisma schema + migration + backend endpoints (§5, §6) — no UI changes yet, old UI keeps working against legacy `CustomerEntitlement` path removed only after backfill verified. |
| 2 | Admin Portal: Device Master page, bulk assignment wizard, Apps-page visibility toggle. |
| 3 | Android: installed-state detection, Catalog "All Apps" tab, App Detail redesign. |
| 4 | Android: first-run Default-apps setup screen + sequential install queue. |
| 5 | Cleanup: drop deprecated `CustomerEntitlement` table once Phase 1–4 verified in production. |

---

## 12. Task Checklist (granular, for sprint planning)

### Backend
- [ ] Prisma schema: `TerminalMaster`, `AppAssignment`, `AppVisibility`, `Terminal.terminalMasterId`.
- [ ] Migration + backfill script (Terminal → TerminalMaster, CustomerEntitlement → AppAssignment).
- [ ] `terminal-masters` route: list/create/bulk-import/patch/delete.
- [ ] `assignments` route: list/bulk/delete + audit logging.
- [ ] Update `auth.ts` enroll to resolve customer via `TerminalMaster.tid`, link Terminal.
- [ ] Update `catalog.ts`: full-store resolution, `default-apps` endpoint, updated download-entitlement check.
- [ ] Update `apps.ts`: `visibility` field on create/update.
- [ ] Unit/integration tests for entitlement resolution precedence (§4 Q2) and enroll security fix.

### Admin Portal
- [ ] `api.ts`: `terminalMastersApi`, `assignmentsApi` clients.
- [ ] New `DeviceMasterPage.tsx` + route/nav entry.
- [ ] Bulk import modal (CSV/XLSX) with per-row result reporting.
- [ ] Shared `AssignAppsWizard` component (targets → apps → mode → review).
- [ ] Wire wizard entry points from Apps, Customers, Device Master pages.
- [ ] Apps page: visibility toggle column.
- [ ] Terminals page: linked-master column + "not registered" banner.

### Android
- [ ] `StoreApiService`: add `getDefaultApps()`, extend `AppInfo`/`CatalogResponse` with
      `visibility`, `isAssigned`, `assignmentMode`, `assignmentSource`.
- [ ] Installed-state helper (`PackageManager` lookup + package add/remove `BroadcastReceiver`).
- [ ] `AppGridAdapter`: Installed / Update / none badge.
- [ ] `AppDetailActivity`: render description, state-driven primary button (Install/Open/Update).
- [ ] `CatalogActivity`: add "All Apps" tab alongside "For You".
- [ ] New `DefaultAppsSetupActivity` + sequential install queue + segmented "i/N" progress UI.
- [ ] Hook `EnrollmentActivity` success path to launch setup screen before Catalog when default
      apps exist.

### QA / Review
- [ ] Confirm answers to Open Questions in §4 before coding begins.
- [ ] Manual test: pre-provision → enroll → first-run install progress → badges correct.
- [ ] Manual test: bulk assign 50 devices × 5 apps, verify review-step diff numbers are accurate.
- [ ] Manual test: visibility=PUBLIC app visible to a customer with zero assignments.
- [ ] Regression test: existing `CustomerEntitlement`-based terminals still see correct catalog
      during the Phase-1→2 transition window.

---

## 13. Out of Scope (this phase — candidate roadmap items)
- Pushing newly-added Default apps to already-provisioned devices automatically in the background.
- Uninstall/remove-app flows initiated from the portal.
- Per-app version pinning per customer/device (always latest published version today).
