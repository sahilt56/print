import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import { NextRequest } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import Cafe from '@/models/Cafe';
import { getAuthenticatedCafeId } from '@/lib/security';
import { getPrivateDownloadUrl as getCloudinaryUrl } from '@/lib/cloudinary';
import { apiError, internalError } from '@/lib/api-utils';

/**
 * File Download Route
 * 
 * Security measures:
 * - Verifies user/agent authorization
 * - Validates cafe ownership
 * - Returns file with safe headers
 * - Uses Cloudinary for secure file storage
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await dbConnect();

    const { jobId } = await params;

    // 1. Find the job
    const job = await PrintJob.findById(jobId).populate('cafeId', '_id qrCode loginId');
    if (!job) {
      return apiError('File not found', 404);
    }

    // 2. Get authorization: either agent token or authenticated cafe
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    const sessionCafeId = await getAuthenticatedCafeId();

    // Find cafe to verify ownership
    const cafe = await Cafe.findOne({
      $or: [
        { qrCode: job.cafeId },
        { loginId: job.cafeId },
        { _id: job.cafeId },
      ],
    });

    if (!cafe) {
      return apiError('Cafe not found', 404);
    }

    // 3. Verify authorization
    const isAgent = Boolean(token && cafe.isAgentActive);
    const isOwner = Boolean(
      sessionCafeId &&
      (sessionCafeId === cafe.qrCode ||
        sessionCafeId === cafe.loginId ||
        sessionCafeId === cafe._id.toString())
    );

    if (!isAgent && !isOwner) {
      return apiError('Unauthorized', 401);
    }

    // 4. If agent, verify the token matches
    if (token && isAgent) {
      try {
        const isValidSecret = await require('bcryptjs').compare(token, cafe.agentSecretKey);
        if (!isValidSecret) {
          return apiError('Forbidden', 403);
        }
      } catch (error) {
        return apiError('Forbidden', 403);
      }
    }

    // 5. Get file URL
    let fileContent: Buffer | null = null;

    try {
      if (job.cloudinaryPublicId) {
        // For Cloudinary files, return redirect URL with expiration
        const downloadUrl = getCloudinaryUrl(
          job.cloudinaryPublicId,
          job.fileType || 'pdf',
          'image',
          300 // 5-minute expiration
        );
        return new Response(
          JSON.stringify({ downloadUrl }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } else if (job.fileUrl) {
        // Fallback for legacy local files
        const storedName = basename(job.fileUrl);
        if (!/^[a-f0-9]{32}\.(pdf|jpe?g|png)$/.test(storedName)) {
          return apiError('Invalid file reference', 404);
        }

        try {
          fileContent = await readFile(join(process.cwd(), 'uploads', storedName));
        } catch (error) {
          console.warn('[Files] Failed to read local file', { jobId, file: storedName });
          return apiError('File not found', 404);
        }
      } else {
        return apiError('File not found', 404);
      }
    } catch (error) {
      console.error('[Files] Failed to generate download URL', { jobId });
      return apiError('Failed to retrieve file', 500);
    }

    // 6. Return file with security headers
    if (fileContent) {
      const MIME_TYPES: Record<string, string> = {
        'application/pdf': 'application/pdf',
        'image/jpeg': 'image/jpeg',
        'image/png': 'image/png',
      };

      const safeName = basename(job.fileName || 'document').replace(
        /[\\/:*?"<>|\u0000-\u001f]/g,
        '_'
      );

      return new Response(fileContent.toString('binary'), {
        headers: {
          'Content-Type': MIME_TYPES[job.fileType] ?? 'application/octet-stream',
          'Content-Disposition': `inline; filename="${safeName || 'document'}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'",
        },
      });
    }

    return apiError('File not available', 503);

  } catch (error) {
    return internalError(error, 'File Download');
  }
}
