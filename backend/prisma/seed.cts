import { PrismaClient, AdminRole, TerminalStatus, InstallStatus } from '@prisma/client';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { initMinIO, uploadApk } from '../src/services/minio';

const prisma = new PrismaClient();

function randomApiKey(): string {
  return 'wl_' + crypto.randomBytes(24).toString('hex');
}

// Uploads a small, deterministic placeholder "APK" blob to MinIO for the given
// object name so the download flow is fully real end-to-end (actual bytes in
// storage, checksum/size computed from those exact bytes). This is NOT a real
// installable Android package — it just exercises presigned-URL download,
// progress, and checksum verification in the demo. For an actually installable
// APK, upload a real file via the Admin Portal's Apps page instead.
async function seedApk(objectName: string, label: string) {
  const buffer = Buffer.from(`WL BizStore demo APK placeholder — ${label} — ${objectName}`);
  const apkUrl = await uploadApk(objectName, buffer, 'application/vnd.android.package-archive');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return { apkUrl, checksum, sizeBytes: BigInt(buffer.length) };
}

// Uploads a REAL, installable debug-signed demo APK from disk (see
// prisma/demo-assets/). Used for exactly one app so the demo can show a
// genuine install (checkmark badge, "Open" button) end-to-end on a device.
async function seedRealApk(objectName: string, assetFileName: string) {
  const filePath = path.join(__dirname, 'demo-assets', assetFileName);
  const buffer = fs.readFileSync(filePath);
  const apkUrl = await uploadApk(objectName, buffer, 'application/vnd.android.package-archive');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  return { apkUrl, checksum, sizeBytes: BigInt(buffer.length) };
}

function randomCoord(baseLat: number, baseLng: number, spread = 0.5) {
  return {
    lat: baseLat + (Math.random() - 0.5) * spread,
    lng: baseLng + (Math.random() - 0.5) * spread,
  };
}

const CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.877 },
  { name: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Hyderabad', lat: 17.3850, lng: 78.4867 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567 },
];

async function main() {
  console.log('🌱 Seeding WL BizStore database...');

  // ── Admin User ────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123456', 12);
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@worldline.com' },
    update: {},
    create: {
      id: uuidv4(),
      email: 'admin@worldline.com',
      passwordHash: adminPassword,
      name: 'Vijayanand',
      role: AdminRole.SUPER_ADMIN,
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // ── Categories ────────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { id: '11111111-1111-1111-1111-111111111111' },
      update: {},
      create: { id: '11111111-1111-1111-1111-111111111111', name: 'Payment', iconName: 'payment', sortOrder: 1 },
    }),
    prisma.category.upsert({
      where: { id: '22222222-2222-2222-2222-222222222222' },
      update: {},
      create: { id: '22222222-2222-2222-2222-222222222222', name: 'Utilities', iconName: 'build', sortOrder: 2 },
    }),
    prisma.category.upsert({
      where: { id: '33333333-3333-3333-3333-333333333333' },
      update: {},
      create: { id: '33333333-3333-3333-3333-333333333333', name: 'Reporting', iconName: 'bar_chart', sortOrder: 3 },
    }),
    prisma.category.upsert({
      where: { id: '44444444-4444-4444-4444-444444444444' },
      update: {},
      create: { id: '44444444-4444-4444-4444-444444444444', name: 'Security', iconName: 'security', sortOrder: 4 },
    }),
  ]);
  console.log('✅ Categories created:', categories.map(c => c.name).join(', '));

  // ── Customers ─────────────────────────────────────────────────────────────
  const customers = await Promise.all([
    prisma.customer.upsert({
      where: { code: 'RETAIL_A' },
      update: {},
      create: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Retailer Plus India',
        code: 'RETAIL_A',
        contactEmail: 'it@retailerplus.in',
      },
    }),
    prisma.customer.upsert({
      where: { code: 'BANK_B' },
      update: {},
      create: {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'HDFC Merchant Services',
        code: 'BANK_B',
        contactEmail: 'ops@hdfcms.com',
      },
    }),
    prisma.customer.upsert({
      where: { code: 'LOGISTIC_C' },
      update: {},
      create: {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        name: 'BlueDart Logistics',
        code: 'LOGISTIC_C',
        contactEmail: 'tech@bluedart.com',
      },
    }),
  ]);
  console.log('✅ Customers created:', customers.map(c => c.name).join(', '));

  // ── Apps ──────────────────────────────────────────────────────────────────
  await initMinIO();

  const appDefs = [
    {
      id: 'app11111-1111-1111-1111-111111111111',
      categoryId: '11111111-1111-1111-1111-111111111111',
      name: 'WL Pay Terminal',
      packageName: 'com.worldline.payterminal',
      description: 'Core payment processing application for Worldline POS terminals. Supports UPI, cards, contactless, and EMI transactions.',
      version: '3.2.1',
      versionCode: 1, // matches the real debug-signed demo-assets APK's embedded versionCode
      objectName: 'com.worldline.payterminal-3.2.1.apk',
      minOsApi: 26,
      visibility: 'PUBLIC' as const,
      realApkAsset: 'wl-pay-terminal-debug.apk',
    },
    {
      id: 'app22222-2222-2222-2222-222222222222',
      categoryId: '11111111-1111-1111-1111-111111111111',
      name: 'EMV Kernel Suite',
      packageName: 'com.worldline.emvkernel',
      description: 'EMV Level 1 & 2 kernel for chip card processing. Required for all certified payment flows.',
      version: '2.0.4',
      versionCode: 204,
      objectName: 'com.worldline.emvkernel-2.0.4.apk',
      minOsApi: 26,
      visibility: 'PUBLIC' as const,
    },
    {
      id: 'app33333-3333-3333-3333-333333333333',
      categoryId: '22222222-2222-2222-2222-222222222222',
      name: 'Device Configurator',
      packageName: 'com.worldline.deviceconfig',
      description: 'Terminal configuration and diagnostics tool. Manage network settings, printer, and hardware peripherals.',
      version: '1.5.0',
      versionCode: 150,
      objectName: 'com.worldline.deviceconfig-1.5.0.apk',
      minOsApi: 26,
      visibility: 'PRIVATE' as const,
    },
    {
      id: 'app44444-4444-4444-4444-444444444444',
      categoryId: '33333333-3333-3333-3333-333333333333',
      name: 'Sales Analytics',
      packageName: 'com.worldline.salesreport',
      description: 'Real-time sales dashboard and end-of-day reconciliation reports with CSV/PDF export.',
      version: '1.2.3',
      versionCode: 123,
      objectName: 'com.worldline.salesreport-1.2.3.apk',
      minOsApi: 26,
      visibility: 'PRIVATE' as const,
    },
    {
      id: 'app55555-5555-5555-5555-555555555555',
      categoryId: '44444444-4444-4444-4444-444444444444',
      name: 'TamperGuard',
      packageName: 'com.worldline.tamperguard',
      description: 'Hardware tamper detection and security monitoring agent. Sends alerts on physical breach detection.',
      version: '2.1.0',
      versionCode: 210,
      objectName: 'com.worldline.tamperguard-2.1.0.apk',
      minOsApi: 28,
      visibility: 'PRIVATE' as const,
    },
  ];

  const apps = [];
  for (const def of appDefs) {
    const { apkUrl, checksum, sizeBytes } = typeof def.realApkAsset === 'string'
      ? await seedRealApk(def.objectName, def.realApkAsset)
      : await seedApk(def.objectName, def.name);
    const app = await prisma.app.upsert({
      where: { packageName: def.packageName },
      update: { apkUrl, apkObjectName: def.objectName, checksum, sizeBytes, isPublished: true, visibility: def.visibility },
      create: {
        id: def.id,
        categoryId: def.categoryId,
        name: def.name,
        packageName: def.packageName,
        description: def.description,
        developer: 'Worldline Global Services',
        version: def.version,
        versionCode: def.versionCode,
        apkUrl,
        apkObjectName: def.objectName,
        checksum,
        sizeBytes,
        minOsApi: def.minOsApi,
        isPublished: true,
        visibility: def.visibility,
        screenshotUrls: [],
      },
    });
    apps.push(app);
  }
  console.log('✅ Apps created (with real uploaded demo APK bytes):', apps.map(a => a.name).join(', '));

  // ── Customer Entitlements ─────────────────────────────────────────────────
  await prisma.customerEntitlement.createMany({
    skipDuplicates: true,
    data: [
      // Retailer A: App 1 + App 2 (Payment), App 3 (Utilities)
      { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appId: 'app11111-1111-1111-1111-111111111111' },
      { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appId: 'app22222-2222-2222-2222-222222222222' },
      { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appId: 'app33333-3333-3333-3333-333333333333' },
      // Bank B: App 1 (Payment), App 4 (Reporting), App 5 (Security)
      { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', appId: 'app11111-1111-1111-1111-111111111111' },
      { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', appId: 'app44444-4444-4444-4444-444444444444' },
      { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', appId: 'app55555-5555-5555-5555-555555555555' },
      // Logistics C: App 3 (Utilities), App 4 (Reporting)
      { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', appId: 'app33333-3333-3333-3333-333333333333' },
      { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', appId: 'app44444-4444-4444-4444-444444444444' },
    ],
  });
  console.log('✅ Customer entitlements configured');

  // ── App Assignments (drives Android "For You" / "All Apps") ───────────────
  // mode=DEFAULT -> shows under "For You" and auto-installs; mode=ON_REQUEST -> shows under "All Apps" only.
  const assignmentDefs: { customerId: string; appId: string; mode: 'DEFAULT' | 'ON_REQUEST' }[] = [
    // Retailer A
    { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appId: 'app11111-1111-1111-1111-111111111111', mode: 'DEFAULT' },
    { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appId: 'app22222-2222-2222-2222-222222222222', mode: 'DEFAULT' },
    { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', appId: 'app33333-3333-3333-3333-333333333333', mode: 'ON_REQUEST' },
    // Bank B
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', appId: 'app11111-1111-1111-1111-111111111111', mode: 'DEFAULT' },
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', appId: 'app44444-4444-4444-4444-444444444444', mode: 'ON_REQUEST' },
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', appId: 'app55555-5555-5555-5555-555555555555', mode: 'ON_REQUEST' },
    // Logistics C
    { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', appId: 'app33333-3333-3333-3333-333333333333', mode: 'DEFAULT' },
    { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', appId: 'app44444-4444-4444-4444-444444444444', mode: 'ON_REQUEST' },
  ];
  for (const a of assignmentDefs) {
    await prisma.appAssignment.upsert({
      where: { appId_customerId: { appId: a.appId, customerId: a.customerId } },
      update: { mode: a.mode },
      create: { appId: a.appId, scope: 'CUSTOMER', customerId: a.customerId, mode: a.mode },
    });
  }
  console.log('✅ App assignments configured (For You / All Apps)');

  // ── Terminals ─────────────────────────────────────────────────────────────
  const terminalData = [
    // Retailer A terminals
    { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', site: 'Mumbai-Central-01', city: CITIES[0] },
    { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', site: 'Mumbai-Andheri-02', city: CITIES[0] },
    { customerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', site: 'Pune-Koregaon-01', city: CITIES[6] },
    // Bank B terminals
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', site: 'Delhi-Connaught-01', city: CITIES[1] },
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', site: 'Bangalore-MG-Road-01', city: CITIES[2] },
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', site: 'Chennai-T-Nagar-01', city: CITIES[3] },
    { customerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', site: 'Hyderabad-Hitech-01', city: CITIES[4] },
    // Logistics C terminals
    { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', site: 'Kolkata-Salt-Lake-01', city: CITIES[5] },
    { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', site: 'Delhi-Nehru-Place-01', city: CITIES[1] },
    { customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', site: 'Bangalore-Whitefield-01', city: CITIES[2] },
  ];

  const terminals = await Promise.all(
    terminalData.map((t, i) => {
      const coord = randomCoord(t.city.lat, t.city.lng, 0.05);
      const terminalId = `WL-TRM-${String(1000 + i).padStart(4, '0')}`;
      return prisma.terminal.upsert({
        where: { terminalId },
        update: {},
        create: {
          id: uuidv4(),
          terminalId,
          serialNo: `SN${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          model: ['PAX A920', 'Verifone P400', 'Ingenico Desk/3500', 'Sunmi P2 Pro'][i % 4],
          customerId: t.customerId,
          site: t.site,
          branchCode: `BR-${String(100 + i).padStart(3, '0')}`,
          apiKey: randomApiKey(),
          status: TerminalStatus.ACTIVE,
          lastSeenAt: new Date(Date.now() - Math.random() * 86400000 * 7),
          lastLatitude: coord.lat,
          lastLongitude: coord.lng,
        },
      });
    })
  );
  console.log(`✅ ${terminals.length} terminals enrolled`);

  // ── Download Events ───────────────────────────────────────────────────────
  const appIds = ['app11111-1111-1111-1111-111111111111', 'app22222-2222-2222-2222-222222222222',
                  'app33333-3333-3333-3333-333333333333', 'app44444-4444-4444-4444-444444444444',
                  'app55555-5555-5555-5555-555555555555'];

  const networkTypes = ['WIFI', 'LTE', 'WIFI', 'WIFI', 'LTE', 'HSPA'];
  const statuses = [InstallStatus.SUCCESS, InstallStatus.SUCCESS, InstallStatus.SUCCESS, InstallStatus.FAILED, InstallStatus.SUCCESS];

  const events = [];
  for (let i = 0; i < 60; i++) {
    const terminal = terminals[Math.floor(Math.random() * terminals.length)];
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const coord = randomCoord(city.lat, city.lng, 0.1);
    const appId = appIds[Math.floor(Math.random() * appIds.length)];
    const app = apps.find(a => a.id === appId)!;

    events.push({
      id: uuidv4(),
      terminalId: terminal.id,
      appId,
      version: app.version,
      timestamp: new Date(Date.now() - Math.random() * 86400000 * 30),
      latitude: coord.lat,
      longitude: coord.lng,
      accuracyMeters: 5 + Math.random() * 20,
      networkType: networkTypes[Math.floor(Math.random() * networkTypes.length)],
      installStatus: statuses[Math.floor(Math.random() * statuses.length)],
      ipAddress: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    });
  }

  await prisma.downloadEvent.createMany({ skipDuplicates: true, data: events });
  console.log(`✅ ${events.length} download events seeded`);

  // ── Admin Audit Log ───────────────────────────────────────────────────────
  await prisma.adminAuditLog.createMany({
    data: [
      { id: uuidv4(), adminId: admin.id, action: 'UPLOAD_APP', entityType: 'App', entityId: 'app11111-1111-1111-1111-111111111111', details: { version: '3.2.1' }, timestamp: new Date(Date.now() - 86400000 * 5) },
      { id: uuidv4(), adminId: admin.id, action: 'GRANT_ENTITLEMENT', entityType: 'CustomerEntitlement', entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', details: { categoryName: 'Payment' }, timestamp: new Date(Date.now() - 86400000 * 4) },
      { id: uuidv4(), adminId: admin.id, action: 'ENROLL_TERMINAL', entityType: 'Terminal', entityId: terminals[0].id, details: { site: terminals[0].site }, timestamp: new Date(Date.now() - 86400000 * 3) },
    ],
  });
  console.log('✅ Admin audit log seeded');

  console.log('\n🎉 Seed complete! Ready for demo.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
