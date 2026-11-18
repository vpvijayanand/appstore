# WL BizStore — PPT + Live Demo Prompt Pack

Purpose: one file that tells you (1) the story flow, (2) the exact prompt to paste into an AI slide/infographic tool (Copilot Designer, Gamma, Beautiful.ai, Canva Magic Design, Midjourney, DALL·E) for every slide, and (3) when to switch to the live demo so the audience never gets a long stretch of static slides.

---

## 0. Global Design Brief (paste this FIRST into the AI tool, then reuse for every slide)

```
Design system for a 16:9 enterprise fintech deck called "WL BizStore".
Palette: deep navy #0B1F3A (background for hero slides), white #FFFFFF (content slides),
accent green #01875F (success/secure), electric blue #2F6FED (data/flow), amber #F9AB00 (highlight/warning).
Typography: Inter or Segoe UI; titles 40pt bold, body 20pt, max 6 words per bullet on the slide
(details go to speaker notes). One idea per slide. Large icons, generous whitespace, rounded cards,
thin line icons, subtle glow on connecting arrows. No stock-photo people, no real brand logos
(use generic Android robot / generic store icon). Every slide has: a punchy headline that states
the takeaway (not a topic label), ONE hero visual, max 3 supporting points, and a small
"LIVE DEMO" badge where indicated. Consistent footer: "WL BizStore · Worldline".
```

## 1. Attention Strategy (why the audience won't skip)

| Technique | How it is used in this deck |
|---|---|
| Open with a problem, not a logo | Slide 2 starts with a painful scenario (10,000 terminals, one wrong APK) |
| 5-minute rule | Never more than 3 slides in a row without touching the live product |
| Question hooks | Each section opens with a question the next demo answers |
| Before/After | Play Store vs WL BizStore, manual vs automated rollout |
| Numbers on screen | "1 click → 10,000 terminals", "0 unsigned installs", "< 60 s remote reboot" |
| Live proof for every claim | Security, scale, remote support all have a demo moment |
| Interactive close | Invite a volunteer to scan/approve on the live device |

Total runtime target: about 30 min (12 slides ≈ 12 min + 4 live demo blocks ≈ 15 min + 3 min Q&A).

---

## 2. Flow at a Glance

```
S1  Title (hook)
S2  The Problem (story)
S3  The Solution — What is WL BizStore
S4  Live Demo #1: "One terminal, zero touch"  ← DEMO
S5  Feature Map (everything in one picture)
S6  Multi-Terminal & Multi-Customer at scale
S7  Live Demo #2: "Assign once, deploy to many" ← DEMO
S8  Security — "As trusted as Google Play"
S9  Architecture
S10 Tech Stack
S11 Scale & Performance
S12 Live Demo #3: "Remote support & live analytics" ← DEMO
S13 Business Value / Roadmap
S14 Closing + Call to Action
```

---

## 3. Slide-by-Slide Prompts

For each slide: **Headline**, **On-slide content**, **Speaker script**, **Infographic prompt**, **Demo cue**.

### Slide 1 — Title (Hook)
- **Headline:** "Your Own Play Store. For Every Terminal You Manage."
- **On-slide:** WL BizStore · Private Enterprise App Store for Payment Terminals · Presenter name.
- **Speaker script:** "In the next 30 minutes I'll show you how one console can control apps on thousands of terminals, as securely as Google Play, and I'll prove it live."
- **Infographic prompt:**
  ```
  Hero title slide, navy gradient background with a faint glowing network mesh. Center: a stylized
  Android payment terminal with a glowing store icon above it, thin light-blue data streams
  connecting it to many smaller terminals fanning out to the horizon (suggesting thousands).
  Left: cloud/server icon. Minimal, premium fintech look, no text in image, leave top-left clear for title.
  ```

### Slide 2 — The Problem (Story)
- **Headline:** "10,000 Terminals. One Wrong APK. Big Problem."
- **On-slide (3 pain points):** Manual USB/MDM sideloading · No per-customer control · No audit of who installed what.
- **Speaker script:** "Today, updating one app across a fleet means field visits, spreadsheets and hope. Public stores are not allowed on regulated payment hardware."
- **Infographic prompt:**
  ```
  Three-panel comic-style infographic in flat illustration. Panel 1: a technician with a USB cable
  surrounded by a pile of terminals (stress). Panel 2: spreadsheet icon with red question marks over
  customer logos (generic). Panel 3: an empty audit-log clipboard with a red alert. Muted gray/red
  palette to contrast with the green/blue of later slides. No text in image.
  ```
- **Demo cue:** none (emotional setup).

### Slide 3 — The Solution
- **Headline:** "One Console. Every Terminal. Total Control."
- **On-slide:** Private store · Per-customer app visibility · Silent, verified installs · Full audit trail.
- **Speaker script:** "WL BizStore is a private Play Store: admins publish, assign, monitor; terminals auto-install."
- **Infographic prompt:**
  ```
  Before/After split. Left (gray): tangled cables and scattered terminals. Right (green/blue):
  a clean hub-and-spoke diagram, central store icon with shielded, glowing links to organized
  terminals grouped by three customer colors. Arrow in the middle labeled with a plain right-arrow.
  Flat vector, white background, no text.
  ```

### Slide 4 — LIVE DEMO #1: "Zero-Touch Terminal" (3 min)
- **Headline:** "Watch a Terminal Set Itself Up."
- **On-slide:** Big "LIVE DEMO" badge + 4-step tracker: Enroll → Auto-install Defaults → Browse → Install.
- **Demo script (do in this order):**
  1. Show Android emulator/terminal first launch → Enrollment screen shows its **Serial No / TID**.
  2. It matches a pre-registered **Device Master** record and inherits its customer automatically.
  3. "Installing 1 of 3…" screen auto-installs **Default** apps with per-app progress.
  4. Land on the white catalog: **For You** tab vs **All Apps** tab; open an app detail; tap Install on an On-Request app.
  5. Switch to Admin Portal → **Downloads** page: the event appears with timestamp/network/GPS.
- **Fallback if network fails:** play the pre-recorded 60-second screen capture (keep it on the desktop).
- **Infographic prompt (progress tracker overlay):**
  ```
  Horizontal 4-step progress tracker with circular numbered nodes connected by a glowing blue line;
  step icons: fingerprint/ID, download arrow, grid of apps, checkmark. First node highlighted green.
  Transparent background so it can overlay the demo screen. Includes a small pulsing red "LIVE" badge. No text.
  ```

### Slide 5 — Complete Feature Map
- **Headline:** "Everything You Need, In One Platform."
- **On-slide (8 tiles):**
  1. App Catalog & Categories (versioning, screenshots)
  2. Customers & Groups
  3. Device Master (Serial/TID, bulk CSV import)
  4. Assignments: Customer or Terminal scope, Default / On-Request
  5. Silent verified installs (checksum)
  6. Telemetry: GPS, network, install result
  7. Remote Access: screen share, reboot, device-initiated approval
  8. Analytics, live map, Excel export, Audit log, Advertisements
- **Speaker script:** "Eight capabilities, one pane of glass. I'll show you the highlights live."
- **Infographic prompt:**
  ```
  Feature-map infographic: central hexagon "BizStore" with eight rounded tiles around it in a 3x3
  grid (center is the hub). Each tile has one thin-line icon: package, building, barcode/ID chip,
  assignment-arrows, shield-check, map-pin, screen-share monitor, bar chart. White cards, soft shadows,
  alternating green/blue accent strokes. No text inside the image.
  ```

### Slide 6 — Multi-Terminal & Multi-Customer
- **Headline:** "Bank A Never Sees Retailer B's Apps."
- **On-slide:** Customer → Groups → Terminals hierarchy · Terminal-level override beats customer-level · Default vs On-Request.
- **Speaker script:** "Assignments resolve per device. A terminal-scope assignment always overrides a customer-scope assignment, so pilots and exceptions are trivial."
- **Infographic prompt:**
  ```
  Tree/hierarchy infographic: top node a generic organization, branching to three customer nodes in
  different colors, each branching to groups and then to rows of small terminal icons. A highlighted
  single terminal with a golden ring and an arrow labeled by a lightning bolt (override). Side legend
  with two chips: solid green "Default", outlined green "On Request". Clean flat style, no text.
  ```

### Slide 7 — LIVE DEMO #2: "Assign Once, Deploy to Many" (4 min)
- **Headline:** "One Wizard. Hundreds of Terminals."
- **Demo script:**
  1. **Device Master** page → bulk-import a CSV (show per-row success/fail report).
  2. **Assignments** wizard: targets → apps → mode (Default) → plain-English review → confirm.
  3. Flip to the terminal: pending-defaults banner appears → one tap installs the missing apps.
  4. Show a **terminal-scope** override on one device vs the customer default.
- **Infographic prompt:**
  ```
  Four-step wizard strip: 1 Targets (people/terminal icon), 2 Apps (grid), 3 Mode (toggle switch),
  4 Review (checklist). Below, a fan-out arrow from a single cloud icon to a grid of 12 terminals
  lighting up one after another (green glow). Flat, white background, no text.
  ```

### Slide 8 — Security: "As Trusted as Google Play"
- **Headline:** "Every Install Is Verified, Signed, and Logged."
- **On-slide comparison table (use a real table, not an image):**

| Control | Google Play | WL BizStore |
|---|---|---|
| Binary integrity | App signing | SHA-256 checksum verified before install |
| Authenticated devices | Google account | Per-terminal API key, revocable, TID-bound |
| Delivery | Signed CDN URLs | Short-lived pre-signed MinIO URLs (backend never streams APKs) |
| Admin access | Play Console IAM | JWT + bcrypt, rate-limited, Helmet hardening |
| Audit | Console logs | Every admin & device action logged (incl. remote access approvals) |
| Remote support | n/a | Device-initiated, approval-gated, TLS/WebRTC |
| Strict mode | Managed Play | `TERMINAL_ENROLLMENT_MODE=strict` rejects unknown devices |

- **Speaker script:** "Same principles as Play: identity, integrity, least privilege, auditability, applied to your own fleet."
- **Demo cue (30 s):** Revoke a terminal key in the portal; show the terminal immediately losing access.
- **Infographic prompt:**
  ```
  Layered defense-in-depth "shield" infographic: concentric rings from outside to inside labeled
  with icons only: HTTPS/lock, rate-limit gauge, JWT key, per-device key, checksum hash symbol,
  signed-URL link, audit-log scroll. A small terminal icon sits safely at the center. Navy
  background, green glowing rings, no text.
  ```

### Slide 9 — Architecture
- **Headline:** "Simple to Run. Built to Grow."
- **On-slide:** Diagram only, ≤ 8 boxes.
- **Diagram content:** Android Terminals → HTTPS → Nginx (TLS) → Backend API (Express/Prisma) → PostgreSQL + MinIO (APK storage) ; Admin Portal (React) → Nginx ; Coturn (WebRTC relay) for remote screen share.
- **Infographic prompt:**
  ```
  Clean architecture diagram, left-to-right flow. Far left: cluster of terminal icons and a browser
  window. Middle: shield-shaped reverse proxy, then a hexagon API server. Far right: stacked
  database cylinder and storage-bucket cube, plus a small relay/antenna icon for WebRTC. Arrows in
  electric blue, secure paths shown with a small padlock. Containers drawn as rounded dashed
  rectangles to suggest Docker. White background, no text.
  ```

### Slide 10 — Technology Stack
- **Headline:** "Modern, Open, Proven."
- **On-slide table:** Android: Kotlin, Retrofit, Coroutines, Material, Device Owner APIs · Backend: Node 20, Express, TypeScript, Prisma, Zod · Portal: React 19, Vite, Recharts, Leaflet · Data: PostgreSQL 15, MinIO (S3) · Infra: Docker Compose, Nginx, Let's Encrypt, coturn.
- **Infographic prompt:**
  ```
  Five stacked horizontal layers (Client, Portal, API, Data, Infrastructure), each a different blue
  shade, left-aligned simple line icon per layer, right side empty for logos to be added.
  Slight 3D isometric stack with soft glow. White background, no text.
  ```

### Slide 11 — Scale & Performance
- **Headline:** "From 10 Terminals to 100,000. Same Platform."
- **On-slide (3 lanes):**
  - Stateless API → horizontal scale behind a load balancer
  - APKs from object storage / CDN, not the API server
  - Read replicas, indexed queries, paginated lists, rate limiting
- **Speaker script:** "Heavy bytes never touch the API. Signed URLs send traffic straight to storage, so adding terminals mostly adds storage bandwidth, which is the cheapest thing to scale. Moving from one VPS to Kubernetes is configuration, not a rewrite." (See `docs/SCALE_AND_PERFORMANCE.md`.)
- **Infographic prompt:**
  ```
  Growth staircase infographic: three steps rising left to right. Step 1 single server + few
  terminals, Step 2 load-balanced API replicas + storage bucket, Step 3 Kubernetes cluster
  with CDN and database replicas feeding a large field of terminals. Glowing blue upward arrow.
  Flat vector, white background, no text.
  ```

### Slide 12 — LIVE DEMO #3: "Remote Support & Live Insights" (5 min)
- **Headline:** "Fix It Without Leaving Your Chair."
- **Demo script:**
  1. On the terminal, tap **Request Remote Support**; admin sees the request and **approves** it (approval gate).
  2. **Remote Screen** page: live view of the terminal; trigger a **remote reboot**.
  3. **Analytics Map**: live terminal locations; **Dashboard**: download trends, top apps, success rate.
  4. **Advertisements**: push a promo that appears on the terminal.
  5. Export Downloads to Excel in one click.
- **Infographic prompt (opening transition):**
  ```
  Split-screen concept: left a support engineer at a laptop, right a distant terminal in a shop;
  between them a glowing dotted bridge with a shield in the middle (approval gate). Small icons for
  screen share, reboot, and map pin float along the bridge. Flat illustration, blue/green, no text.
  ```

### Slide 13 — Business Value & Roadmap
- **Headline:** "Less Field Visits. More Uptime. Full Control."
- **On-slide:** Value metrics (placeholders to fill with real data): Field visits ↓, Rollout time ↓ from days to minutes, Compliance evidence on demand.
  Roadmap: Staged rollouts / canary · Auto-update policies · SSO for admins · Kubernetes helm chart · POS vendor SDK integrations.
- **Infographic prompt:**
  ```
  Left: three big KPI cards with up/down arrows and empty number slots. Right: horizontal roadmap
  timeline with four milestone circles (Now, Next, Later, Future) connected by a blue line, small
  icons above each. Light background, rounded cards, no text.
  ```

### Slide 14 — Closing & Call to Action
- **Headline:** "Let's Pilot It on Your Terminals."
- **On-slide:** 3 steps: 1) Pick a pilot customer 2) Import their Device Master 3) Go live in a day. Contact + QR code to the repo/docs.
- **Infographic prompt:**
  ```
  Closing slide on the navy gradient background, a single glowing terminal at the center with
  a green check halo, a short three-step path leading up to it, and an empty square area at the
  bottom-right reserved for a QR code. Minimal, premium, no text.
  ```

---

## 4. Live Demo Checklist (do before going on stage)

- [ ] Backend, portal, MinIO, Postgres up (`/health` returns OK); login works.
- [ ] Seed data loaded: 2+ customers, 3 apps (1 with an installable demo APK), 5+ Device Master rows, a CSV file ready for bulk import.
- [ ] Emulator/terminal freshly reset (not yet enrolled) with location set (emulator Extended controls → Location) so GPS shows in Downloads.
- [ ] One app assigned as **Default**, one **On-Request**, one **Terminal-scope override** ready.
- [ ] Browser tabs pre-opened: Dashboard, Device Master, Assignments, Downloads, Remote Screen, Analytics Map.
- [ ] Screen-recorded fallback video of each demo block saved locally.
- [ ] Notifications off, large font / zoom 125%, dark/light mode consistent.

## 5. Presenter Tips

- Say the takeaway headline aloud before showing details; keep slide text under 25 words.
- Ask a question before each demo ("How long would this take today?"), then show the answer.
- Pause 2 seconds after each "wow" moment (auto-install, remote reboot) instead of talking over it.
- End each section with the sentence: "That's X, now let's see how it stays secure/scales."

## 6. One-Shot Prompt (generate the whole deck in one go)

```
Create a 14-slide 16:9 presentation titled "WL BizStore — Private Enterprise App Store for
Payment Terminals" using the design brief above. Slides in order: 1 Title hook; 2 The Problem;
3 The Solution; 4 Live Demo #1 (zero-touch terminal); 5 Feature Map (8 tiles); 6 Multi-customer,
multi-terminal hierarchy; 7 Live Demo #2 (assignment wizard); 8 Security comparison with Google
Play (table); 9 Architecture diagram; 10 Tech stack layers; 11 Scale & performance staircase;
12 Live Demo #3 (remote support & analytics); 13 Business value & roadmap; 14 Closing call to
action. Use a punchy takeaway headline per slide, max 3 short bullets, one hero infographic per
slide, a "LIVE DEMO" badge on slides 4, 7 and 12, and put detailed talking points in speaker notes.
```
