import * as Minio from 'minio';
import { Readable } from 'stream';

const REGION = 'us-east-1';
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'wlstore_minio';
const SECRET_KEY = process.env.MINIO_SECRET_KEY || 'wlstore_minio_secret';

// Internal client — used for everything except presigning (bucket management,
// uploads, deletes, listing). Talks to MinIO over the Docker network.
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  region: REGION,
  accessKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
});

const BUCKET = process.env.MINIO_BUCKET || 'wl-apks';

// Presigning client — configured with the PUBLIC-facing host/port/scheme so the
// AWS SigV4 signature (which covers the "Host" header, see X-Amz-SignedHeaders)
// is computed for the exact host the client will actually connect to. Rewriting
// the hostname in a URL *after* signing breaks the signature (SignatureDoesNotMatch),
// since signing never issues a network call when `region` is set explicitly above.
//   - Android emulator (dev):   MINIO_PUBLIC_HOST=10.0.2.2 (default), same port, http
//   - Real device / production: MINIO_PUBLIC_HOST=<public domain>, MINIO_PUBLIC_SSL=true,
//                                MINIO_PUBLIC_PORT="" (proxied through nginx on 443)
const publicHost = process.env.MINIO_PUBLIC_HOST || '10.0.2.2';
const publicSsl = process.env.MINIO_PUBLIC_SSL === 'true';
const publicPortEnv = process.env.MINIO_PUBLIC_PORT;
const publicPort = publicPortEnv !== undefined && publicPortEnv.trim() !== ''
  ? parseInt(publicPortEnv, 10)
  : (publicPortEnv === undefined ? parseInt(process.env.MINIO_PORT || '9005', 10) : undefined);

const presignClient = new Minio.Client({
  endPoint: publicHost,
  ...(publicPort !== undefined ? { port: publicPort } : {}),
  useSSL: publicSsl,
  region: REGION,
  accessKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
});

// Initialize bucket
export async function initMinIO() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, REGION);
    console.log(`✅ MinIO bucket '${BUCKET}' created`);
  } else {
    console.log(`✅ MinIO bucket '${BUCKET}' ready`);
  }
}

// Upload APK buffer
export async function uploadApk(objectName: string, buffer: Buffer, contentType: string): Promise<string> {
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
    'x-amz-meta-uploaded-by': 'wl-playstore',
  });
  return `minio://${BUCKET}/${objectName}`;
}

// Generate a 15-minute pre-signed download URL, signed for the public host so it
// works directly for real devices and production without any post-hoc rewriting.
export async function getPresignedUrl(objectName: string, expirySeconds = 900): Promise<string> {
  try {
    return await presignClient.presignedGetObject(BUCKET, objectName, expirySeconds);
  } catch (e) {
    console.warn(`[MinIO] getPresignedUrl failed for "${objectName}":`, e);
    const portSuffix = publicPort !== undefined ? `:${publicPort}` : '';
    return `${publicSsl ? 'https' : 'http'}://${publicHost}${portSuffix}/${BUCKET}/${objectName}`;
  }
}

// Delete object
export async function deleteObject(objectName: string): Promise<void> {
  try {
    await minioClient.removeObject(BUCKET, objectName);
  } catch (e) {
    console.warn('MinIO delete warning:', e);
  }
}

// List all objects
export async function listObjects(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const objects: string[] = [];
    const stream = minioClient.listObjects(BUCKET, '', true);
    stream.on('data', obj => { if (obj.name) objects.push(obj.name); });
    stream.on('end', () => resolve(objects));
    stream.on('error', reject);
  });
}

export default minioClient;
