import { NextRequest } from 'next/server';
import { uploadDocument } from '@/lib/cloudinary';
import { apiError, apiSuccess, internalError } from '@/lib/api-utils';

const ALLOWED_MIMES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
]);

const MAGIC_BYTES = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG signature
  jpeg: Buffer.from([0xff, 0xd8, 0xff]), // JPEG signature
};

/**
 * Verify file magic bytes to prevent spoofed files
 */
function verifyFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 4).equals(MAGIC_BYTES.pdf);
  }
  if (mimeType === 'image/png') {
    return buffer.subarray(0, 4).equals(MAGIC_BYTES.png);
  }
  if (mimeType === 'image/jpeg') {
    // JPEG can have varying headers
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  return false;
}

/**
 * File Upload Endpoint
 * 
 * Security measures:
 * - Validates file size (max 10MB)
 * - Validates MIME type
 * - Verifies magic bytes
 * - Uploads to Cloudinary (private)
 * - Never stores files locally
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('No file uploaded', 400);
    }

    // 1. Validate file size (10MB limit)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return apiError('File size exceeds 10MB limit', 400);
    }

    // 2. Validate MIME type
    const extension = ALLOWED_MIMES.get(file.type);
    if (!extension) {
      return apiError('Only PDF, JPG, JPEG, and PNG files are allowed', 400);
    }

    // 3. Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 4. Verify magic bytes (prevent spoofed files)
    if (!verifyFileSignature(buffer, file.type)) {
      return apiError('File content does not match its claimed type', 400);
    }

    // 5. Upload to Cloudinary
    let uploadResult;
    try {
      uploadResult = await uploadDocument(
        buffer,
        file.name,
        'cafe_print_docs'
      );
    } catch (error) {
      console.error('[Upload] Cloudinary upload failed:', error);
      return apiError('Failed to upload file', 500);
    }

    // 6. Sanitize filename
    const safeName = file.name
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .slice(0, 150);

    console.info('[Upload] File uploaded successfully', {
      public_id: uploadResult.public_id,
      size: uploadResult.bytes,
      type: file.type,
    });

    return apiSuccess({
      fileUrl: uploadResult.public_id, // Return Cloudinary public_id
      fileName: safeName,
      cloudinaryPublicId: uploadResult.public_id,
      resourceType: uploadResult.resource_type,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
    });

  } catch (error) {
    return internalError(error, 'File Upload');
  }
}