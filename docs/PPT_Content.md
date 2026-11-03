# WL BizStore — Presentation Content Outline
> Slide-by-slide script + detailed AI image-generation prompts.
> Paste the "Content" sections into PowerPoint/Google Slides; use the "Image Prompt" with any AI image tool (DALL·E, Midjourney, Copilot Designer, Stable Diffusion) to generate the visual for that slide.

---

## Slide 1 — Title Slide

**Title:** WL BizStore
**Subtitle:** A Private Enterprise App Store for Worldline Payment Terminals

**Content:**
- Secure, self-hosted Android app distribution platform
- Built exclusively for Worldline-managed POS / kiosk terminals
- Replaces Google Play Store with a fully controlled, enterprise-owned alternative
- Author: Vijayanand · Worldline Global Services India · 2026

**Image Prompt:**
"A sleek, modern enterprise technology title slide background. Dark navy-blue gradient (#0B1F3A to #142b52) with a subtle glowing network mesh pattern. Center-right shows a stylized Android POS payment terminal device with a glowing app-store icon above it, connected by light-blue data streams to a cloud/server icon on the left. Minimalist, corporate, high-tech fintech aesthetic, 16:9 widescreen, no text embedded in image."

---

## Slide 2 — What Is WL BizStore?

**Content:**
- A **private, enterprise-only app store** — not available on the public internet / Play Store
- Distributes Android apps (payment apps, utilities, reporting tools) exclusively to **company-managed POS/kiosk terminals**
- Every terminal is enrolled with a unique cryptographic identity before it can see or download anything
- Apps are organized by **category** and assigned to **customers** (business units / retail chains / banks) via an entitlement model — a terminal only sees apps its organization is allowed to have
- Every download is logged with **GPS location, timestamp, and install result** for full auditability
- Designed to support **silent, unattended installation** on kiosk-mode Android Enterprise devices (no user interaction required)

**Image Prompt:**
"An isometric illustration of a retail store counter with an Android payment terminal displaying an app-store grid interface. Above the terminal, a translucent shield icon overlays the screen to represent security. In the background, a faint corporate office building and a cloud icon are connected via dotted lines to the terminal, representing centralized enterprise control. Clean flat-design illustration style, blue and white color palette, no text."

---

## Slide 3 — Why a Private App Store?

**Content:**
- Public app stores (Google Play) are **not acceptable for regulated payment terminals**:
  - No control over which apps/versions are distributed
  - No way to restrict visibility per customer/bank/retailer
  - No enterprise-grade audit trail of who downloaded what, when, and where
- WL BizStore solves this with:
  - **Customer-level entitlements** — Bank A never sees Retailer B's apps
  - **Checksum-verified binaries** — tamper-proof distribution
  - **Centralized kill-switch** — retire/wipe a terminal remotely, instantly revoking its API key
  - **Full compliance trail** — every admin action and every device download is audit-logged

**Image Prompt:**
"A split-screen comparison illustration. Left side: a public app store icon (generic, no real logos) with a red 'X' and scattered unlocked padlocks, representing lack of control. Right side: the WL BizStore icon surrounded by a glowing green shield, connected neatly to three labeled terminal icons representing different customer organizations. Flat corporate illustration style, red-vs-green contrast, no real brand logos, no text."

---

## Slide 4 — Key Features

**Content:**
- 📦 **Centralized App Catalog** — categorized app listing with versioning, descriptions, screenshots
- 🏢 **Customer Entitlement Management** — assign specific apps to specific customer organizations
- 📱 **Per-Terminal Enrollment** — unique API key issued per device, rotatable/revocable by admin
- 📍 **GPS-Tagged Download Telemetry** — every download event records device location + install outcome
- 🔐 **Checksum-Verified, Silent Installs** — SHA-256 verified APKs, installed without user prompts (Device Owner mode)
- 📊 **Admin Analytics Dashboard** — download trends, top apps, live terminal map, install success rates
- 📈 **Excel Export** — one-click export of apps/customers/downloads for reporting
- 🗂️ **Full Audit Log** — every admin create/update/delete action is permanently recorded

**Image Prompt:**
"A clean dashboard-style infographic mockup showing six rounded icon tiles in a grid: a package/box icon, a building icon, a smartphone-with-key icon, a map-pin icon, a shield-checkmark icon, and a bar-chart icon. Each tile has a soft drop shadow on a light gray background, modern SaaS product marketing style, blue and teal accent colors, no text labels."

---

## Slide 5 — Technology Stack Overview

**Content:**
| Layer | Technology |
|---|---|
| **Admin Portal (Frontend)** | React 19 + TypeScript + Vite 8, React Router, Recharts (analytics charts), Leaflet (live map), Axios, served via Nginx |
| **Backend API** | Node.js 20 + Express 4 + TypeScript, Prisma ORM, Zod validation, JWT (jsonwebtoken) + bcrypt, Helmet, express-rate-limit, Multer (uploads) |
| **Database** | PostgreSQL 15 (relational data: apps, customers, terminals, entitlements, audit logs) |
| **Object Storage** | MinIO (S3-compatible) — stores APK binaries, serves via AWS SigV4 pre-signed URLs |
| **Android Client** | Kotlin, minSdk 26 / targetSdk 34, Retrofit2 + OkHttp, Kotlin Coroutines, Android Enterprise Device Owner APIs, EncryptedSharedPreferences |
| **Infrastructure** | Docker + Docker Compose (multi-container orchestration), Nginx (reverse proxy + SSL termination), Let's Encrypt/Certbot |
| **Deployment Target** | Self-hosted Ubuntu VPS (horizontally scalable to Kubernetes) |

**Image Prompt:**
"A vertical technology stack diagram with five horizontal layered bars stacked like a pyramid, each in a different shade of blue from dark (bottom/infrastructure) to light (top/frontend). Each bar has a simple icon on the left: a gear for infrastructure, a database cylinder, a server rack, a box/package for API, and a mobile phone + browser window for frontend/client layer. Modern flat tech-stack diagram style, white background, no text inside the image (labels will be added separately in PowerPoint)."

---

## Slide 6 — High-Level System Architecture

**Content:**
```
Internet (HTTPS)
       │
   Nginx Reverse Proxy (SSL / Let's Encrypt)
   ├── /api/*  → Backend API (Node.js, Express)
   └── /       → Admin Portal (React, static build)
          │                    │
   PostgreSQL (Prisma ORM)    MinIO (APK binaries, pre-signed URLs)
                              │
                    Android Terminal (Kotlin)
                    ├── GPS Capture
                    ├── Silent Install (Device Owner)
                    └── Telemetry Reporting
```
- Every component runs as an isolated **Docker container**, orchestrated by `docker-compose`
- Nginx is the single public entry point — all other services are bound to `127.0.0.1` only (never exposed directly to the internet)
- The backend never streams APK bytes itself — it only issues short-lived signed download URLs (see Slide 14)

**Image Prompt:**
"A professional network architecture diagram, clean vector style. Top: a cloud icon labeled 'Internet/HTTPS'. Below it, a shield-shield gateway box representing a reverse proxy, with two arrows branching to a 'React' browser-window icon and a 'Node.js' server icon. The Node.js server connects downward to a cylindrical database icon and a cube/bucket storage icon side by side. At the bottom, a smartphone icon with a small GPS pin and a download arrow. Connect everything with clean blue directional arrows. White background, isometric or flat technical diagram style, no embedded text."

---

## Slide 7 — Backend API Architecture

**Content:**
- Built with **Express.js + TypeScript**, organized into modular route files:
  - `auth.ts` — admin login (JWT), terminal enrollment (per-device API key issuance)
  - `apps.ts` — APK upload, publish/unpublish, delete, download history (admin-only)
  - `catalog.ts` — terminal-facing catalog browsing + presigned download URL generation
  - `customers.ts` / `categories.ts` / `terminals.ts` — org, catalog grouping, and device management
  - `analytics.ts` — dashboard metrics, geographic download map data
  - `events.ts` — telemetry ingestion (download/install status from devices)
- **Middleware layer** (`middleware/auth.ts`) enforces three access levels: `requireAdmin`, `requireSuperAdmin`, `requireTerminal`
- All request bodies validated with **Zod schemas** before touching the database — no raw/unsafe input reaches Prisma
- **Prisma ORM** provides type-safe PostgreSQL access and migration management

**Image Prompt:**
"A technical flowchart showing a central hexagonal node labeled with a generic 'API' gear icon, with six smaller connected hexagon nodes arranged around it representing different modules, each with a minimal icon: a lock (auth), a box (apps), a grid (catalog), a building (customers), a chart (analytics), a bell (events). Connected with thin blue lines to the central hub. Flat vector technical diagram, white/light-gray background, no text."

---

## Slide 8 — Data Model (Database Schema)

**Content:**
- **PostgreSQL** relational schema managed via **Prisma migrations**
- Core entities:
  - `Admin` — portal users with role-based access (ADMIN / SUPER_ADMIN)
  - `Customer` — business organizations (banks, retailers, logistics firms), each with a short human-readable `code` (e.g. `RETAIL_A`)
  - `Category` — app groupings (Payment, Utilities, Reporting, Security…)
  - `App` — package name, version, checksum, size, MinIO object reference, publish status
  - `CustomerEntitlement` — many-to-many join: which apps a customer's terminals are allowed to see
  - `Terminal` — enrolled devices, API key, branch code, GPS-tagged status (ACTIVE/RETIRED/WIPED)
  - `DownloadEvent` — one row per download attempt: terminal, app, GPS lat/long, install status, timestamp
  - `AdminAuditLog` — immutable record of every admin create/update/delete action
- Relationships enforce that a terminal can only ever download apps its parent customer is entitled to

**Image Prompt:**
"An entity-relationship diagram (ERD) in a clean modern style: eight rounded rectangle boxes representing database tables, connected with thin crow's-foot relationship lines. Each box has a small database-table icon in its header. Soft pastel color-coding per box (blue, teal, purple, orange). White background, professional software-architecture documentation style, no readable text inside (table names will be added in PowerPoint)."

---

## Slide 9 — Android Client App

**Content:**
- Native **Kotlin** application, `minSdk 26` (Android 8.0+) to `targetSdk 34`
- Built for **Android Enterprise Device Owner mode** — enables fully silent APK installation with zero user prompts, ideal for locked-down kiosk/POS terminals
- **Retrofit2 + OkHttp** for all backend communication, with an `X-Terminal-Key` header interceptor for authenticated requests
- **Kotlin Coroutines** handle async download/install flows without blocking the UI thread
- Core screens:
  - **Enrollment** — one-time setup entering a short Customer Code to bind the device
  - **Catalog** — browse entitled apps by category
  - **App Detail** — download → SHA-256 checksum verification → silent install → telemetry report, all in one guided flow
- Sensitive data (terminal API key) stored in **EncryptedSharedPreferences** (AES-256-GCM), never in plaintext

**Image Prompt:**
"A realistic mockup of an Android smartphone/POS terminal device displaying a clean app-store style UI: a grid of app icons under category tabs, with a prominent 'Download' button on a featured app card. The device has a slim bezel, dark mode interface with blue accent buttons. Floating semi-transparent icons around the phone represent: a fingerprint/lock (security), a Kotlin logo-style hexagon, and a small downward arrow with a checkmark (verified download). Studio product-photography lighting, isolated on a soft gradient background, no readable text in the UI."

---

## Slide 10 — Containerization & Deployment

**Content:**
- Entire stack defined in a single **`docker-compose.yml`**, with a production override file (`docker-compose.prod.yml`) for port bindings and environment secrets
- Independent containers:
  - `postgres` — database, with health checks gating backend startup
  - `minio` — custom-built image (Go) for APK object storage
  - `backend` — multi-stage Docker build (TypeScript compiled → slim Node runtime)
  - `admin-portal` — React build served as static files through Nginx
- **Nginx** sits in front of everything as the single public-facing reverse proxy, terminating SSL (Let's Encrypt via Certbot) and routing `/api/*` → backend, `/` → admin portal, `/wl-apks/*` → MinIO
- All internal services (Postgres, MinIO, backend) are bound to `127.0.0.1` only — **never directly exposed to the internet**
- One command (`docker compose up -d --build`) rebuilds and redeploys the entire platform

**Image Prompt:**
"A container orchestration illustration: four labeled shipping-container icons (styled as 3D isometric cargo containers) arranged side by side on a platform, each a different color (blue, green, orange, purple), with the Docker whale logo style silhouette subtly in the background. Above them, a lighthouse/gateway icon representing a reverse proxy directs traffic arrows down into the correct containers. Isometric flat illustration, tech-conference-slide aesthetic, no readable text."

---

## Slide 11 — Security Architecture: Overview

**Content:**
| Security Domain | Google Play Store | WL BizStore |
|---|---|---|
| User Auth | Google Account + 2FA | JWT + bcrypt + refresh tokens |
| Device Auth | Google Play Services | Per-device cryptographic API key |
| App Integrity | Play Protect signature scan | SHA-256 checksum, verified both server + client side |
| Distribution Control | App visibility settings | Customer Entitlement model (per-app, per-org) |
| Audit Trail | Internal only | Full `AdminAuditLog` on every write action |
| Transport Security | HTTPS / TLS 1.3 | HTTPS + Android Network Security Config (cleartext blocked) |
| Rate Limiting | Google infra | `express-rate-limit` (200 req / 15 min per IP) |
| Secrets Storage | Android Keystore | `EncryptedSharedPreferences` (AES-256-GCM) |

**Image Prompt:**
"A balanced scale/comparison illustration: on the left pan of a scale, a generic public app-store icon; on the right pan, a shield-checkmark icon labeled conceptually as 'Enterprise'. Both sides glow softly, scale perfectly balanced, suggesting equivalent protection through different means. Background is a subtle dark navy with a faint circuit-board pattern. Professional cybersecurity marketing illustration style, blue/gold color accents, no text."

---

## Slide 12 — Security Deep Dive: Authentication & Access Control

**Content:**
- **Admin login:** bcrypt-hashed passwords, short-lived 1-hour JWT access tokens + separately-secreted 7-day refresh tokens (a stolen access token alone cannot mint new sessions)
- Generic `"Invalid credentials"` error on login failures — prevents user/email enumeration
- **Terminal enrollment:** each device receives a 48-character cryptographically random API key (`crypto.randomBytes`, OS-backed CSPRNG) — never reused, independently revocable
- **Role-based middleware** (`requireAdmin`, `requireSuperAdmin`, `requireTerminal`) gates every route — a retired/wiped terminal is rejected even with a technically valid key
- **HTTP security headers** via Helmet (11 headers: HSTS, X-Frame-Options, CSP, nosniff, etc.) applied to every response
- **Input validation** with Zod on every endpoint — rejects malformed data before it reaches the database

**Image Prompt:**
"A layered security illustration shaped like concentric glowing rings (like a digital fortress/bullseye viewed from an angle), with a padlock icon at the absolute center. Each ring has a tiny icon embedded: a key (authentication), a badge/role icon (authorization), a filter funnel (validation), a wall/brick pattern (headers). Dark background with glowing cyan/blue ring edges, futuristic cybersecurity dashboard style, no text."

---

## Slide 13 — Security Deep Dive: App Integrity & Data Protection

**Content:**
- **Upload time:** server computes SHA-256 checksum of every uploaded APK, stored immutably in the database alongside the binary
- **Download time:** Android client re-computes SHA-256 after download and **rejects install** if it doesn't match — blocks tampered or corrupted binaries, even over a compromised network path
- **Pre-signed URLs (AWS SigV4):** download links are cryptographically signed, scoped to one object, and expire after 15 minutes — nobody can guess or reuse a stale download link
- **Request size limits:** 10 MB JSON body cap, 200 MB APK upload cap — mitigates memory-exhaustion DoS attempts
- **Package name validation:** strict regex prevents path-traversal-style or malformed package identifiers from ever reaching object storage
- **Transport:** all traffic forced over HTTPS/TLS; Android's Network Security Config explicitly blocks cleartext HTTP

**Image Prompt:**
"A visual metaphor of a sealed package/box with a glowing green wax-seal stamp shaped like a checkmark, sitting on a conveyor belt between two terminals labeled conceptually as 'server' and 'device' (shown as abstract icons, no text). A faint magnifying glass hovers over the seal representing checksum verification. Clean 3D render style, soft studio lighting, blue and green accent colors, no readable text."

---

## Slide 14 — Scaling to Millions of Downloads: The Core Design Choice

**Content:**
- **The single most important architectural decision:** APK binary downloads are **100% offloaded from the API servers**
- Flow:
  1. Terminal sends a tiny (~1 KB) API request → backend checks entitlement in milliseconds
  2. Backend returns a **pre-signed URL** pointing directly at object storage (MinIO / S3 / CDN)
  3. Terminal downloads the 20–50 MB APK **directly from storage/CDN** — the Node.js API never touches the binary bytes
- This is the **exact same pattern used by Google Play, Apple App Store, and Netflix**
- Result: whether 100 or 500,000 terminals download simultaneously, the API tier's CPU/memory usage stays flat — only storage/CDN bandwidth scales, and that scales horizontally for free with S3/CDN providers

**Image Prompt:**
"A split-flow diagram: on the left, a thin dotted arrow labeled conceptually as a tiny packet travels from a smartphone icon to a small server icon and back quickly (representing a lightweight metadata request). On the right, a thick, bold solid arrow flows directly from a large cloud-storage/CDN icon straight to a cluster of dozens of small smartphone icons arranged in a grid (representing massive parallel direct downloads), completely bypassing the server icon. Bold contrast between 'thin/fast' and 'thick/parallel' arrows. Modern infographic style, blue and orange color contrast, no text."

---

## Slide 15 — High-Concurrency Architecture (100K+ Terminals)

**Content:**
```
Terminals (Lakhs of Devices)
      │ 1 KB request          │ Direct APK download
      ▼                       ▼
Nginx / Load Balancer      CDN Edge (Cloudflare / S3)
      │
Node.js API Cluster (auto-scaling replicas)
      │                       │
Redis Cache (catalog, 60s TTL)   Async Queue (telemetry events)
      │                       │
PostgreSQL Primary + Read Replicas
```
- **Redis catalog caching:** 50,000 terminals from the same customer asking for the same catalog hit Redis (<1ms), not the database — PostgreSQL sees ~1 query/minute instead of 50,000
- **Async telemetry queue:** download/install events are pushed to a queue and return `202 Accepted` in ~2ms; a background worker batch-inserts them, so logging spikes never block the API
- **Phased rollout + jitter delay:** critical updates roll out in waves (10% → 30% → 100%) and devices add a randomized 1–30 minute delay before polling — prevents a "thundering herd" all hitting the API in the same second
- **Horizontal scaling:** stateless JWT/API-key auth means any number of Node.js replicas can be added behind a load balancer with zero session-affinity requirements

**Image Prompt:**
"A large-scale data-center infographic viewed top-down: a wide base layer showing hundreds of tiny smartphone icons, funneling upward through a load-balancer icon into multiple identical parallel server-rack icons (representing auto-scaled replicas), which then connect to a lightning-bolt cache icon and a database-cylinder icon side by side. Use motion-blur style arrows to suggest high-throughput traffic. Futuristic blue-on-dark-navy data visualization style, no text."

---

## Slide 16 — End-to-End Flow: Enroll → Download → Install

**Content:**
1. **Enroll:** terminal enters a short Customer Code (e.g. `RETAIL_A`) → backend issues a unique API key bound to that customer
2. **Browse:** terminal fetches its entitled catalog, filtered by category
3. **Request download:** terminal requests a specific app → backend verifies entitlement → returns a pre-signed URL + expected checksum
4. **Download:** terminal streams the APK directly from object storage
5. **Verify:** terminal re-computes SHA-256 and compares against the server-issued checksum
6. **Install:** silent install via Device Owner APIs (no user prompts) — or standard install dialog on non-managed devices
7. **Report:** install result (`SUCCESS`/`FAILED`) + GPS location sent back to the backend as a telemetry event, visible instantly on the admin analytics map

**Image Prompt:**
"A horizontal seven-step process flow timeline, each step represented by a simple circular icon connected by an arrow: a handshake (enroll), a grid/list (browse), a document-with-arrow (request), a downward arrow into a box (download), a magnifying-glass-checkmark (verify), a gear-with-checkmark (install), and a location-pin-with-chart (report). Clean, bright, modern infographic timeline style, consistent blue icon set, no text."

---

## Slide 17 — Admin Portal Capabilities

**Content:**
- **Dashboard** — real-time KPIs: total apps, active terminals, downloads today, top-performing apps
- **Apps** — upload new APKs, publish/unpublish, view per-app download history, Excel export
- **Categories** — organize the catalog; click into a category to see every app inside it
- **Customers** — manage organizations and their app entitlements (checkbox-based assignment UI)
- **Terminals** — view/rotate/retire device API keys, see last-seen status
- **Analytics Map** — live geographic visualization of download events (Leaflet-powered)
- **Downloads** — full searchable/filterable download event log with install outcomes

**Image Prompt:**
"A wide browser-window mockup showing a modern dark-themed admin dashboard UI: left sidebar navigation with simple icons (home, box, tag, building, smartphone, map-pin, download), main panel showing a row of KPI stat cards at the top and a world map with scattered glowing location dots below. Clean SaaS admin-panel design, blue/teal accents on dark background, no readable text/numbers in the mockup."

---

## Slide 18 — Roadmap & Future Enhancements

**Content:**
- Redis-backed catalog caching and async telemetry queue (designed, not yet deployed)
- CDN integration (Cloudflare/CloudFront) in front of MinIO/S3 for global edge delivery
- PostgreSQL read replicas + PgBouncer connection pooling for write/read traffic separation
- Kubernetes-based auto-scaling for the backend API tier
- Push-notification-driven update rollout with phased/staggered delivery
- Enhanced reporting: scheduled email digests, customizable dashboards

**Image Prompt:**
"A forward-looking roadmap illustration: a winding dotted path/road disappearing toward a glowing horizon, with five milestone flag markers along the path, each with a faint icon (a lightning bolt, a cloud, a database, a kubernetes-wheel-like gear cluster, a bell). Sunrise gradient background (deep blue to warm orange at the horizon), optimistic and aspirational tech-roadmap illustration style, no text."

---

## Slide 19 — Thank You / Q&A

**Content:**
- WL BizStore — Secure, Scalable, Enterprise-Owned App Distribution
- Questions & Discussion

**Image Prompt:**
"A minimalist closing slide background: dark navy gradient matching the title slide, with a single softly glowing Android POS terminal icon centered, surrounded by faint concentric ripple circles suggesting a completed, settled system. Calm, professional, high-tech close-out aesthetic, 16:9, no text."

---

## Appendix — Notes for Building the Deck
- Keep 1 core idea per slide; move detailed tables into speaker notes if the slide looks crowded.
- Use a consistent color system throughout: **Navy (#0B1F3A)** primary, **Blue (#2E6BE6)** accent, **Teal/Green (#1FB87A)** for "secure/success" indicators, **Amber (#F2A33C)** for warnings/roadmap items.
- Diagrams on Slides 6, 7, 8, 10, 14, 15 can alternatively be built as native PowerPoint SmartArt/shapes instead of AI-generated images, for crisper text-in-diagram labeling.
- Recommended deck length for a 20–25 minute walkthrough: trim to Slides 1–2, 4–6, 11, 14–17, 19 (12 slides) if time is limited.
