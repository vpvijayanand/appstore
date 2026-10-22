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
// NOTE: MinIO generates URLs with its internal hostname (usually 'localhost').
// Android emulators reach the host machine via 10.0.2.2, not localhost.
// We rewrite the hostname so the URL works from inside the emulator.
export async function getPresignedUrl(objectName: string, expirySeconds = 900): Promise<string> {
  // The host that Android devices/emulators use to reach this machine's services
  const publicHost = process.env.MINIO_PUBLIC_HOST || '10.0.2.2';
  const minioPort  = process.env.MINIO_PORT || '9000';

  try {
    const url = await minioClient.presignedGetObject(BUCKET, objectName, expirySeconds);
    // Replace internal hostname with the address reachable from the Android emulator
    return url
      .replace(/localhost/g, publicHost)
      .replace(/127\.0\.0\.1/g, publicHost);
  } catch (e) {
    // MinIO unavailable — return a placeholder so the app shows a clear error
    console.warn(`[MinIO] getPresignedUrl failed for "${objectName}":`, e);
    return `http://${publicHost}:${minioPort}/${BUCKET}/${objectName}`;
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
