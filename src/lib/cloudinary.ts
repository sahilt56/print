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
  originalName: string;
}

/**
 * Upload a document to Cloudinary with private access
 */
export async function uploadDocument(
  fileBuffer: Buffer,
  originalFileName?: string,
  folder: string = "cafe_print_docs"
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        type: "private", // Signed private URLs are the intended access mode
        resource_type: "auto",
        context: {
          uploadedAt: new Date().toISOString(),
          ...(originalFileName && { originalName: originalFileName }),
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
export async function deleteDocument(publicId: string, resourceType: string = "image"): Promise<void> {
  if (!publicId) return;
  
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "private",
      invalidate: true, // Invalidate CDN cache
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
  resourceType: string = "image",
  expirationSeconds: number = 300
): string {
  try {
    const resolvedFormat = normalizeCloudinaryFormat(format, resourceType === 'raw' ? 'pdf' : 'jpg');
    const resolvedResourceType = resourceType === 'raw' || resolvedFormat === 'pdf' ? 'raw' : resourceType;

    return cloudinary.url(publicId, {
      resource_type: resolvedResourceType,
      type: "private",
      format: resolvedFormat,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + expirationSeconds,
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
    return await cloudinary.api.resource(publicId);
  } catch (error) {
    console.error(`Failed to fetch metadata for ${publicId}:`, error);
    throw error;
  }
}

/**
 * Check if document exists in Cloudinary
 */
export async function documentExists(publicId: string): Promise<boolean> {
  try {
    await cloudinary.api.resource(publicId);
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
export async function deleteDocuments(publicIds: string[], resourceType: string = "image"): Promise<void> {
  if (!publicIds || publicIds.length === 0) return;

  try {
    await cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType,
      type: "private",
      invalidate: true,
    });
  } catch (error) {
    console.error('Batch delete failed:', error);
    throw error;
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
