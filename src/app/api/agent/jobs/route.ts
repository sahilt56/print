import { NextRequest } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
import { apiError, apiSuccess, internalError, isRequiredString } from '@/lib/api-utils';
import { verifyAgentToken } from '@/lib/security';
import { getPrivateDownloadUrl as getCloudinaryUrl } from '@/lib/cloudinary';

/**
 * Agent Jobs Endpoint
 * 
 * Security measures:
 * - Validates agent token (bearer token)
 * - Uses atomic findOneAndUpdate to prevent two agents claiming same job (race condition fix)
 * - Only returns jobs that are paid and ready
 * - Limits to jobs from agent's cafe
 * - Returns time-limited download URLs
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // 1. Extract and validate authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiError('Unauthorized: Missing token', 401);
    }

    const token = authHeader.slice(7).trim(); // Remove "Bearer "
    if (!isRequiredString(token)) {
      return apiError('Unauthorized: Invalid token', 401);
    }

    // 2. Get cafeId from query params
    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');

    if (!isRequiredString(cafeId)) {
      return apiError('Cafe ID required', 400);
    }

    // 3. Verify agent token
    const { valid, cafeDoc } = await verifyAgentToken(token, cafeId);
    if (!valid || !cafeDoc) {
      console.warn('[Agent Jobs] Invalid agent token attempt', { cafeId });
      return apiError('Unauthorized: Invalid Agent Secret Key', 403);
    }

    // 4. Get all possible cafe identifiers for query
    const possibleCafeIds = [
      cafeDoc.qrCode,
      cafeDoc.loginId,
      cafeDoc._id.toString(),
    ].filter(Boolean);

    // 5. Atomically claim a job (CRITICAL FIX FOR RACE CONDITION)
    // This ensures only ONE agent can successfully claim a job even if two call simultaneously
    const job = await PrintJob.findOneAndUpdate(
      {
        cafeId: { $in: possibleCafeIds },
        paymentStatus: 'paid', // CRITICAL: Only printable jobs
        printStatus: { $in: ['queued', 'pending'] },
        attemptCount: { $lt: 3 }, // Haven't exceeded max attempts
      },
      {
        $set: {
          printStatus: 'claimed', // Mark as claimed
          agentId: cafeDoc._id.toString(),
          claimedAt: new Date(),
          lastHeartbeat: new Date(),
        },
        $inc: { attemptCount: 1 },
      },
      {
        sort: { createdAt: 1 }, // FIFO - oldest first
        returnDocument: 'after',
      }
    );

    if (!job) {
      return apiSuccess({ job: null });
    }

    // 6. Build download URL
    const resolveAssetUrl = (value: string | null | undefined, fallbackType?: string, fallbackResourceType: string = 'image') => {
      if (!value) return null;
      if (value.startsWith('http://') || value.startsWith('https://')) return value;

      try {
        const fileType = fallbackType || 'image/png';
        const resourceType = fileType.includes('pdf') ? 'raw' : fallbackResourceType;
        return getCloudinaryUrl(value, fileType, resourceType, 300);
      } catch (error) {
        console.error('[Agent Jobs] Failed to generate download URL', { value, fallbackType });
        return null;
      }
    };

    let downloadUrl: string | null = null;
    let normalizedLayout = null;

    try {
      if (job.cloudinaryPublicId) {
        downloadUrl = resolveAssetUrl(job.cloudinaryPublicId, job.fileType || 'application/pdf', job.fileType?.includes('pdf') ? 'raw' : 'image');
      } else if (job.fileUrl) {
        downloadUrl = resolveAssetUrl(job.fileUrl, job.fileType || 'application/pdf', job.fileType?.includes('pdf') ? 'raw' : 'image');
      }

      if (Array.isArray(job.layout) && job.layout.length > 0) {
        normalizedLayout = job.layout.map((item: any) => {
          const itemCloudId = item.cloudinaryPublicId || item.fileUrl;
          const itemUrl = resolveAssetUrl(itemCloudId, item.fileType || 'image/png', 'image');
          return {
            ...item.toObject ? item.toObject() : item,
            fileUrl: itemUrl || item.fileUrl,
          };
        });
      }
    } catch (error) {
      console.error('[Agent Jobs] Failed to generate download URL', { jobId: job._id });
    }

    // 7. Update last heartbeat
    job.lastHeartbeat = new Date();
    await job.save();

    console.info('[Agent Jobs] Job claimed', {
      jobId: job._id,
      jobNumber: job.jobNumber,
      cafeId: cafeDoc.qrCode,
      agentId: cafeDoc._id,
    });

    return apiSuccess({
      job: {
        id: job._id.toString(),
        jobNumber: job.jobNumber,
        downloadUrl,
        copies: job.copies || 1,
        colorMode: job.colorMode || 'bw',
        paperSize: job.paperSize || 'A4',
        layout: normalizedLayout ?? job.layout ?? null,
        pageCount: job.pageCount || 1,
      },
    });

  } catch (error) {
    return internalError(error, 'Agent Jobs Fetch');
  }
}