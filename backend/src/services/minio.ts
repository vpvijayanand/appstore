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
export async function getPresignedUrl(objectName: string, expirySeconds = 900): Promise<string> {
  try {
    return await minioClient.presignedGetObject(BUCKET, objectName, expirySeconds);
  } catch {
    // If object doesn't exist (demo mode), return a placeholder
    return `http://localhost:${process.env.MINIO_PORT || '9000'}/${BUCKET}/${objectName}?demo=true`;
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
