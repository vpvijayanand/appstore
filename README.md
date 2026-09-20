# 🏪 WL Playstore — Private Enterprise App Store

> Worldline Global Services India · Private Android App Distribution Platform
> Authored by Vijayanand · Architecture v1.0 August 2026

A production-grade, self-hosted private app store for distributing Android applications exclusively to Worldline-managed POS/kiosk terminals — with per-customer catalog entitlements, GPS location capture on every download, and silent install via Android Enterprise Device Owner mode.

---

## 🏗️ Architecture

```
Internet (HTTPS)
       │
   ┌───┴────────────────────────────────────────────────┐
   │  Nginx Reverse Proxy (SSL + Let's Encrypt)          │
   │  ├── /api/*   → Backend API (Node.js)               │
   │  └── /        → Admin Portal (React)                │
   └─────────────────────────────────────────────────────┘
          │                    │
   ┌──────┴──────┐    ┌────────┴────────┐
   │  PostgreSQL  │    │   MinIO (APKs)  │
   │  (Prisma)   │    │  (Signed URLs)  │
   └─────────────┘    └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Android Terminal  │
                    │  (Kotlin App)      │
                    │  ├── GPS Capture   │
                    │  ├── Silent Install│
                    │  └── Telemetry     │
                    └───────────────────┘
```

## 📦 Project Structure

```
WL_Playstore/
├── backend/              # Node.js + Express + TypeScript API
│   ├── prisma/           # Database schema + seed data
│   └── src/
│       ├── routes/       # auth, catalog, apps, events, analytics
│       ├── middleware/   # JWT + terminal API key auth
│       └── services/     # MinIO APK storage
├── admin-portal/         # React + Vite + TypeScript Admin UI
│   └── src/
│       └── pages/        # Dashboard, Apps, Customers, Terminals, Map, Downloads
├── android/              # Kotlin Android client app
│   └── app/src/main/
│       ├── java/com/worldline/wlstore/
│       │   ├── ui/       # Enrollment, Catalog, AppDetail activities
│       │   ├── data/     # Retrofit API, models
│       │   └── service/  # GPS telemetry, APK install
│       └── res/layout/
├── nginx/                # Production reverse proxy config
├── scripts/              # Deployment automation
└── docker-compose.yml    # Full stack orchestration
```

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+ and npm
- Docker Desktop
- Android Studio (for the Android app)

### 1. Start infrastructure
```bash
docker-compose up -d postgres minio
```

### 2. Set up backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
npm run dev
```

### 3. Start admin portal
```bash
cd admin-portal
npm install
npm run dev
# Open http://localhost:5173
```

### 4. Login
- **URL**: http://localhost:5173
- **Email**: admin@worldline.com
- **Password**: Admin@123456

### 5. Android app
- Open `android/` in Android Studio
- Set your backend URL in `app/build.gradle` → `API_BASE_URL`
- Run on emulator or device

---

## 🌐 Deploy to Hostinger Ubuntu VPS

### Option A: Automated script
```bash
# SSH into your VPS
git clone <repo-url> /opt/wlstore
cd /opt/wlstore
chmod +x scripts/deploy.sh
./scripts/deploy.sh your-domain.com
```

### Option B: Manual
```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh

# 2. Configure environment
cp backend/.env.example .env
# Edit .env — set JWT_SECRET, CORS_ORIGIN, etc.

# 3. Set domain in nginx config
sed -i 's/YOUR_DOMAIN/your-domain.com/g' nginx/nginx.conf

# 4. Start services
docker-compose up -d

# 5. Run migrations
docker-compose exec backend npx prisma migrate deploy
docker-compose exec backend npx ts-node prisma/seed.ts

# 6. Get SSL certificate
certbot certonly --standalone -d your-domain.com
# Then uncomment nginx service in docker-compose.yml
docker-compose up -d nginx
```

---

## 🔐 Security Features

| Feature | Implementation |
|---|---|
| Terminal authentication | Per-terminal API key issued at enrollment, stored in EncryptedSharedPreferences |
| APK access control | Short-TTL (15-min) pre-signed MinIO URLs — no direct storage access |
| Per-customer isolation | Entitlement check enforced server-side on every catalog/download request |
| APK integrity | SHA-256 checksum verified on device before install |
| Admin access | JWT (1h) + refresh token (7d), bcrypt passwords |
| API rate limiting | 200 req/15min per IP |
| Transport | HTTPS with TLS 1.2/1.3 via Nginx + Let's Encrypt |

---

## 📡 API Endpoints

### Terminal-facing (requires `X-Terminal-Key` header)
| Method | Path | Description |
|---|---|---|
| GET | `/api/catalog` | Entitled catalog (categories + apps) |
| GET | `/api/catalog/download/:appId` | Get signed download URL |
| POST | `/api/events` | Report download/install event with GPS |

### Admin-facing (requires `Authorization: Bearer <JWT>`)
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/admin/login` | Admin login |
| GET | `/api/analytics/stats` | Dashboard KPIs |
| GET | `/api/analytics/map` | GPS download events (Leaflet map) |
| GET | `/api/analytics/events` | Paginated event log |
| GET/POST/DELETE | `/api/apps` | App catalog management |
| POST | `/api/apps/upload` | Upload APK (multipart/form-data) |
| GET/PUT | `/api/customers` | Customer + entitlement management |
| GET/PATCH | `/api/terminals` | Terminal management |

### Enrollment
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/terminal/enroll` | Register terminal, receive API key |
| POST | `/api/auth/terminal/verify` | Verify API key |

---

## 📱 Android App Flow

```
Launch
  │
  ├─ First launch? → EnrollmentActivity
  │    ├── Enter Terminal ID + Customer ID
  │    ├── POST /api/auth/terminal/enroll
  │    ├── Store API key in EncryptedSharedPreferences
  │    └── Navigate to CatalogActivity
  │
  └─ Already enrolled → CatalogActivity (load API key)
       ├── GET /api/catalog (X-Terminal-Key)
       ├── Show category tabs (ViewPager2 + TabLayout)
       └── Tap app → AppDetailActivity
            ├── GET /api/catalog/download/:appId
            ├── Capture GPS (FusedLocationProviderClient)
            ├── POST /api/events (DOWNLOADING + GPS)
            ├── Download APK (progress bar)
            ├── Verify SHA-256 checksum
            ├── PackageInstaller.Session (silent if Device Owner)
            └── POST /api/events (SUCCESS/FAILED)
```

---

## 🗄️ Data Model

| Table | Key Fields |
|---|---|
| admin_users | id, email, password_hash, role |
| customers | id, name, code, contact_email |
| categories | id, name, icon_name, sort_order |
| apps | id, category_id, name, package_name, version, apk_url, checksum, size_bytes |
| customer_entitlements | customer_id, category_id (unique pair) |
| terminals | id, terminal_id, api_key, customer_id, status, last_latitude, last_longitude |
| download_events | terminal_id, app_id, version, timestamp, latitude, longitude, install_status |
| admin_audit_logs | admin_id, action, entity_type, entity_id, details |

---

## 🌍 Demo Data (after seed)

**Customers**: Retailer Plus India · HDFC Merchant Services · BlueDart Logistics
**Apps**: WL Pay Terminal · EMV Kernel Suite · Device Configurator · Sales Analytics · TamperGuard
**Terminals**: 10 terminals across Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Kolkata, Pune
**Events**: 60 download events with GPS coordinates

---

## ⚠️ Production Checklist

- [ ] Change default admin password (`Admin@123456`)
- [ ] Set strong random JWT secrets in `.env`
- [ ] Configure domain in `nginx/nginx.conf`
- [ ] Enable HTTPS (uncomment nginx service in `docker-compose.yml`)
- [ ] Set up daily PostgreSQL backups
- [ ] Configure MinIO backup policy
- [ ] Document data retention policy for GPS telemetry (per arch doc §6)
- [ ] Provision terminals as Device Owner for silent install
