import { v2 as cloudinary } from "cloudinary";

// Validate Cloudinary configuration (non-fatal if missing)
const validateCloudinaryConfig = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

try {
  if (validateCloudinaryConfig()) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
} catch (error) {
  console.error('Cloudinary initialization error:', error);
}

export interface UploadResult {
  public_id: string;
  resource_type: string;
  format: string;
  version: number;
  bytes: number;
}

export interface DocumentMetadata {
  public_id: string;
  resource_type: string;
  format: string;
  version: number;
  bytes: number;
}

function normalizeCloudinaryResourceType(resourceType?: string): 'image' | 'raw' {
  const normalized = String(resourceType || '').toLowerCase();

  if (normalized === 'raw') return 'raw';
  if (normalized === 'image') return 'image';

  return 'image';
}

function inferResourceTypeFromFileType(fileType?: string): 'image' | 'raw' {
  const normalized = String(fileType || '').toLowerCase();

  if (normalized.includes('pdf')) return 'raw';
  return 'image';
}

/**
 * Upload a document to Cloudinary with private access
 */
export async function uploadDocument(
  fileBuffer: Buffer,
  folder: string = "cafe_print_docs"
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        type: "private",
        resource_type: "auto",
        timeout: 120000,
        context: {
          uploadedAt: new Date().toISOString(),
        },
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Upload failed'));
        }
        resolve({
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format,
          version: result.version,
          bytes: result.bytes,
        });
      }
    );
    uploadStream.end(fileBuffer);
  });
}

/**
 * Delete a document from Cloudinary
 */
export async function deleteDocument(publicId: string, resourceType?: string): Promise<void> {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: normalizeCloudinaryResourceType(resourceType),
      type: "private",
      invalidate: true,
    });
  } catch (error) {
    console.error(`Failed to delete document ${publicId}:`, error);
    throw error;
  }
}

/**
 * Get a private download URL with time-limited access
 * Expires in 5 minutes by default
 */
function normalizeCloudinaryFormat(format?: string, fallback: string = 'jpg'): string {
  const normalized = String(format || fallback).toLowerCase();

  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('jpg') || normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('gif')) return 'gif';

  return fallback;
}

export function getPrivateDownloadUrl(
  publicId: string,
  format?: string,
  resourceType?: string,
  expirationSeconds: number = 300,
  version?: number | string
): string {
  try {
    const inferredResourceType = inferResourceTypeFromFileType(format || resourceType);
    const resolvedResourceType = normalizeCloudinaryResourceType(resourceType || inferredResourceType);
    const resolvedFormat = normalizeCloudinaryFormat(format, resolvedResourceType === 'raw' ? 'pdf' : 'jpg');
    const normalizedVersion = version !== undefined && version !== null && version !== '' ? Number(version) : undefined;

    return cloudinary.url(publicId, {
      resource_type: resolvedResourceType,
      type: "private",
      format: resolvedFormat,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + expirationSeconds,
      ...(normalizedVersion !== undefined && Number.isFinite(normalizedVersion) ? { version: normalizedVersion } : {}),
    });
  } catch (error) {
    console.error('Failed to generate download URL:', error);
    throw error;
  }
}

/**
 * Get document metadata from Cloudinary
 */
export async function getDocumentMetadata(publicId: string): Promise<Record<string, unknown>> {
  try {
    return await cloudinary.api.resource(publicId, { type: 'private' });
  } catch (error) {
    console.error(`Failed to fetch metadata for ${publicId}:`, error);
    throw error;
  }
}

/**
 * Check if document exists in Cloudinary
 */
export async function documentExists(publicId: string, resourceType?: string): Promise<boolean> {
  try {
    await cloudinary.api.resource(publicId, {
      type: 'private',
      ...(resourceType ? { resource_type: normalizeCloudinaryResourceType(resourceType) } : {}),
    });
    return true;
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Delete multiple documents (for batch cleanup)
 */
export async function deleteDocuments(publicIds: string[], resourceType?: string): Promise<void> {
  if (!publicIds || publicIds.length === 0) return;

  try {
    await cloudinary.api.delete_resources(publicIds, {
      resource_type: normalizeCloudinaryResourceType(resourceType),
      type: "private",
      invalidate: true,
    });
  } catch (error) {
    console.error('Batch delete failed:', error);
    throw error;
  }
}

export async function cleanupJobCloudinaryAssets(job: {
  cloudinaryPublicId?: string | null;
  cloudinaryResourceType?: string | null;
  fileUrl?: string | null;
  layout?: Array<{
    cloudinaryPublicId?: string | null;
    cloudinaryResourceType?: string | null;
    fileUrl?: string | null;
  }>;
}): Promise<void> {
  const itemsToDelete: Array<{ publicId: string; resourceType?: string }> = [];

  const addCandidate = (publicId?: string | null, resourceType?: string | null) => {
    if (!publicId || typeof publicId !== 'string') return;
    const normalizedPublicId = publicId.trim();
    if (!normalizedPublicId) return;
    if (normalizedPublicId.startsWith('http://') || normalizedPublicId.startsWith('https://')) return;
    if (normalizedPublicId.startsWith('/')) return;
    itemsToDelete.push({ publicId: normalizedPublicId, resourceType: resourceType || undefined });
  };

  addCandidate(job.cloudinaryPublicId, job.cloudinaryResourceType);
  addCandidate(job.fileUrl, job.cloudinaryResourceType);

  for (const item of job.layout || []) {
    addCandidate(item.cloudinaryPublicId, item.cloudinaryResourceType);
    addCandidate(item.fileUrl, item.cloudinaryResourceType);
  }

  const uniqueItems = itemsToDelete.filter((item, index, array) =>
    array.findIndex(candidate => candidate.publicId === item.publicId && candidate.resourceType === item.resourceType) === index
  );

  for (const item of uniqueItems) {
    try {
      await deleteDocument(item.publicId, item.resourceType);
    } catch (error) {
      console.warn('[Cloudinary Cleanup] Failed to delete asset', {
        publicId: item.publicId,
        resourceType: item.resourceType,
        error,
      });
      try {
        await deleteDocument(item.publicId, item.resourceType === 'raw' ? 'image' : 'raw');
      } catch {
        // Intentionally keep the original error log and fall back only once.
      }
    }
  }
}

/**
 * Verify Cloudinary configuration is valid
 */
export async function verifyCloudinaryConnection(): Promise<boolean> {
  try {
    const result = await cloudinary.api.ping();
    return result.ok === 'ok';
  } catch (error) {
    console.error('Cloudinary connection verification failed:', error);
    return false;
  }
}
