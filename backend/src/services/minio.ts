import * as Minio from 'minio';
import { Readable } from 'stream';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'wlstore_minio',
  secretKey: process.env.MINIO_SECRET_KEY || 'wlstore_minio_secret',
});

const BUCKET = process.env.MINIO_BUCKET || 'wl-apks';

// Initialize bucket
export async function initMinIO() {
  const exists = await minioClient.bucketExists(BUCKET);
  if (!exists) {
    await minioClient.makeBucket(BUCKET, 'us-east-1');
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

// Generate a 15-minute pre-signed download URL
// NOTE: MinIO generates URLs using its internal Docker-network hostname (e.g. "minio").
// Clients outside the Docker network can't resolve that, so we rewrite the host
// (and optionally port/scheme) to whatever is actually reachable:
//   - Android emulator (dev):   MINIO_PUBLIC_HOST=10.0.2.2 (default), same port, http
//   - Real device / production: MINIO_PUBLIC_HOST=<public domain>, MINIO_PUBLIC_SSL=true,
//                                MINIO_PUBLIC_PORT="" (proxied through nginx on 443)
export async function getPresignedUrl(objectName: string, expirySeconds = 900): Promise<string> {
  const publicHost = process.env.MINIO_PUBLIC_HOST || '10.0.2.2';
  const publicPort = process.env.MINIO_PUBLIC_PORT;
  const publicSsl = process.env.MINIO_PUBLIC_SSL === 'true';

  try {
    const rawUrl = await minioClient.presignedGetObject(BUCKET, objectName, expirySeconds);
    const url = new URL(rawUrl);
    url.protocol = publicSsl ? 'https:' : 'http:';
    url.hostname = publicHost;
    if (publicPort !== undefined) url.port = publicPort;
    return url.toString();
  } catch (e) {
    // MinIO unavailable — return a placeholder so the app shows a clear error
    console.warn(`[MinIO] getPresignedUrl failed for "${objectName}":`, e);
    const fallbackPort = publicPort !== undefined ? publicPort : (process.env.MINIO_PORT || '9005');
    const portSuffix = fallbackPort ? `:${fallbackPort}` : '';
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
