export const dynamic = 'force-dynamic'; // 👈 यह Next.js को मजबूर करेगा कि वह हर बार ताज़ा डेटा ही भेजे, पुराना कैश नहीं!
export const revalidate = 0;
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

    // 4. Claim jobs for the cafe's canonical ObjectId.
    const job = await PrintJob.findOneAndUpdate(
      {
        cafeId: cafeDoc._id,
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
    const resolveAssetUrl = (
      value: string | null | undefined,
      fallbackType?: string,
      fallbackResourceType?: string,
      fallbackFormat?: string,
      fallbackVersion?: number | string | null
    ) => {
      if (!value) return null;
      if (value.startsWith('http://') || value.startsWith('https://')) return value;

      try {
        const fileType = fallbackType || 'image/png';
        const resourceType = fallbackResourceType || (fileType.includes('pdf') ? 'raw' : 'image');
        const format = fallbackFormat || fileType;
        const version = fallbackVersion !== undefined && fallbackVersion !== null ? Number(fallbackVersion) : undefined;
        return getCloudinaryUrl(value, format, resourceType, 300, version);
      } catch (error) {
        console.error('[Agent Jobs] Failed to generate download URL', { value, fallbackType });
        return null;
      }
    };

    let downloadUrl: string | null = null;
    let normalizedLayout = null;

    try {
      if (job.cloudinaryPublicId) {
        downloadUrl = resolveAssetUrl(
          job.cloudinaryPublicId,
          job.cloudinaryFormat || job.fileType || 'application/pdf',
          job.cloudinaryResourceType || (job.fileType?.includes('pdf') ? 'raw' : 'image'),
          job.cloudinaryFormat || job.fileType || 'application/pdf',
          job.cloudinaryVersion
        );
      } else if (job.fileUrl) {
        downloadUrl = resolveAssetUrl(job.fileUrl, job.fileType || 'application/pdf', job.cloudinaryResourceType || (job.fileType?.includes('pdf') ? 'raw' : 'image'), job.cloudinaryFormat || job.fileType || 'application/pdf', job.cloudinaryVersion);
      }

      if (Array.isArray(job.layout) && job.layout.length > 0) {
        normalizedLayout = job.layout.map((item: any) => {
          const itemCloudId = item.cloudinaryPublicId || item.fileUrl;
          const itemUrl = resolveAssetUrl(itemCloudId, item.fileType || 'image/png', item.cloudinaryResourceType || 'image', item.cloudinaryFormat || item.fileType || 'image/png', item.cloudinaryVersion);
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

    const isPdfFile = [
      job.fileType,
      job.fileName,
      job.cloudinaryFormat,
    ].some((value) => String(value || '').toLowerCase().includes('pdf'))
      || job.cloudinaryResourceType === 'raw';

    console.info('[Agent Jobs] Print selection prepared', {
      jobId: job._id,
      fileType: job.fileType,
      fileName: job.fileName,
      cloudinaryFormat: job.cloudinaryFormat,
      isPdfFile,
      selectedPages: job.selectedPages || 'all',
    });

    return apiSuccess({
      job: {
        id: job._id.toString(),
        jobNumber: job.jobNumber,
        downloadUrl,
        copies: job.copies || 1,
        
        // 💡 फ़िक्स 1: एजेंट 'colorMode' रीड करता है, उसे सही वैल्यू पास करें
        colorMode: job.colorMode || 'bw',
        paperSize: job.paperSize || 'A4',

        // 💡 फ़िक्स 2: अगर असली PDF है, तो layout को खाली '[]' भेजें ताकि एजेंट सीधा सिंगल फाइल डाउनलोड मोड में जाए
        layout: isPdfFile ? [] : (normalizedLayout ?? job.layout ?? null),
        
        pageCount: job.pageCount || 1,

        pageRange: job.selectedPages || 'all',
      },
    });

  } catch (error) {
    return internalError(error, 'Agent Jobs Fetch');
  }
}
