// Cloudflare R2 Object Storage Setup
// S3-compatible storage with zero egress fees

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// R2 configuration
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'anyschool-uploads';

export interface FileMetadata {
  url: string;
  key: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Upload a file to R2 with school-scoped path
 */
export async function uploadFile(
  schoolId: string,
  entityType: string,
  entityId: string,
  file: Buffer,
  fileName: string,
  contentType: string
): Promise<FileMetadata> {
  const key = `schools/${schoolId}/${entityType}/${entityId}/${fileName}`;

  await r2Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
  }));

  const url = `https://${process.env.CLOUDFLARE_PUBLIC_DOMAIN}/${key}`;

  return {
    url,
    key,
    name: fileName,
    type: contentType,
    size: file.length,
  };
}

/**
 * Get a presigned URL for downloading a file
 */
export async function getDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 3600 });
}

/**
 * Delete a file from R2
 */
export async function deleteFile(key: string): Promise<void> {
  await r2Client.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }));
}

/**
 * Generate a school-scoped path for file storage
 */
export function generateStoragePath(
  schoolId: string,
  entityType: string,
  entityId: string,
  fileName: string
): string {
  return `schools/${schoolId}/${entityType}/${entityId}/${fileName}`;
}