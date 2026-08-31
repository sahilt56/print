import { NextRequest } from 'next/server';
import { uploadDocument } from '@/lib/cloudinary';
import { apiError, apiSuccess, internalError } from '@/lib/api-utils';

const ALLOWED_MIMES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
]);

const MAGIC_BYTES = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  jpeg: Buffer.from([0xff, 0xd8, 0xff]),
};

function verifyFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 4).equals(MAGIC_BYTES.pdf);
  }
  if (mimeType === 'image/png') {
    return buffer.subarray(0, 4).equals(MAGIC_BYTES.png);
  }
  if (mimeType === 'image/jpeg') {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('No file uploaded', 400);
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return apiError('File size exceeds 10MB limit', 400);
    }

    if (!ALLOWED_MIMES.has(file.type)) {
      return apiError('Only PDF, JPG, JPEG, and PNG files are allowed', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (!verifyFileSignature(buffer, file.type)) {
      return apiError('File content does not match its claimed type', 400);
    }

    let uploadResult: Awaited<ReturnType<typeof uploadDocument>>;
    try {
      uploadResult = await uploadDocument(buffer, 'cafe_print_docs');
    } catch (error) {
      console.error('[Upload] Cloudinary upload failed:', error);
      return apiError('Failed to upload file', 500);
    }

    const safeName = file.name
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .slice(0, 150);

    const cloudinaryResourceType = uploadResult.resource_type === 'raw' ? 'raw' : 'image';
    const cloudinaryFormat = uploadResult.format || (file.type.includes('pdf') ? 'pdf' : file.type.includes('png') ? 'png' : 'jpg');
    const cloudinaryVersion = uploadResult.version ?? 0;

    console.info('[Upload] File uploaded successfully', {
      public_id: uploadResult.public_id,
      size: uploadResult.bytes,
      type: file.type,
      resourceType: cloudinaryResourceType,
    });

    return apiSuccess({
      fileUrl: uploadResult.public_id,
      fileName: safeName,
      cloudinaryPublicId: uploadResult.public_id,
      cloudinaryResourceType,
      cloudinaryFormat,
      cloudinaryVersion,
      resourceType: cloudinaryResourceType,
      format: cloudinaryFormat,
      version: cloudinaryVersion,
      bytes: uploadResult.bytes,
    });
  } catch (error) {
    return internalError(error, 'File Upload');
  }
}
