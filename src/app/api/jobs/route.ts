import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
import { apiError, apiSuccess, internalError, isRequiredString, isRequiredNumber, isEnum } from '@/lib/api-utils';
import { validateJobPricing } from '@/lib/job-operations';

const DEFAULT_PRICES = { bw: 2, color: 10 };
const ALLOWED_PAPER_SIZES = ['A4', 'A3', 'Letter'] as const;
const ALLOWED_COLOR_MODES = ['bw', 'color'] as const;
const ALLOWED_PAYMENT_METHODS = ['cash', 'online'] as const;

/**
 * Create Print Job Endpoint
 * 
 * Security measures:
 * - Validates all input parameters
 * - Calculates authoritative pricing server-side
 * - Validates cafe exists and is active
 * - Uses strict enums for state fields
 * - Prevents arbitrary price manipulation
 * - Generates unique job number
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const {
      cafeId,
      fileUrl,
      fileName,
      fileType,
      pageCount,
      selectedPages,
      colorMode,
      paperSize,
      copies,
      paymentMethod,
      layout,
      cloudinaryPublicId,
      cloudinaryResourceType,
      cloudinaryFormat,
      cloudinaryVersion,
    } = body;

    // 1. Validate required fields
    if (!isRequiredString(cafeId)) {
      return apiError('Cafe ID is required', 400);
    }

    // 2. Validate optional fields
    if (fileName !== undefined && typeof fileName !== 'string') {
      return apiError('Invalid fileName', 400);
    }

    if (fileType !== undefined && typeof fileType !== 'string') {
      return apiError('Invalid fileType', 400);
    }

    // 3. Validate numeric fields
    if (!isRequiredNumber(pageCount) || pageCount < 1 || pageCount > 1000) {
      return apiError('pageCount must be between 1 and 1000', 400);
    }

    if (!isRequiredNumber(copies) || copies < 1 || copies > 100) {
      return apiError('copies must be between 1 and 100', 400);
    }

    // 4. Validate enum fields
    if (!isEnum(ALLOWED_COLOR_MODES)(colorMode)) {
      return apiError('colorMode must be "bw" or "color"', 400);
    }

    if (!isEnum(ALLOWED_PAPER_SIZES)(paperSize)) {
      return apiError('paperSize must be A4, A3, or Letter', 400);
    }

    if (!isEnum(ALLOWED_PAYMENT_METHODS)(paymentMethod)) {
      return apiError('paymentMethod must be "cash" or "online"', 400);
    }

    // 5. Find and validate cafe
    const cleanCafeId = String(cafeId).trim();
    const cafeLookup: {
      $or: Array<{ qrCode?: { $regex: RegExp }; loginId?: { $regex: RegExp }; _id?: string }>;
      isActive: boolean;
    } = {
      $or: [
        { qrCode: { $regex: new RegExp(`^${cleanCafeId}$`, 'i') } },
        { loginId: { $regex: new RegExp(`^${cleanCafeId}$`, 'i') } },
      ],
      isActive: true,
    };

    if (mongoose.Types.ObjectId.isValid(cleanCafeId)) {
      cafeLookup.$or.push({ _id: cleanCafeId });
    }

    const cafe = await Cafe.findOne(cafeLookup);

    if (!cafe) {
      console.warn('[Jobs Create] Cafe not found', { cafeId: cleanCafeId });
      return apiError('Cafe not found', 404);
    }

    // 6. Get cafe pricing and calculate server-side amount (CRITICAL)
    const rawPricing = cafe.pricingConfig;
    let prices = DEFAULT_PRICES;

    if (typeof rawPricing === 'string') {
      try {
        const parsed = JSON.parse(rawPricing);
        if (parsed && typeof parsed === 'object') {
          prices = { bw: Number(parsed.bw ?? 2), color: Number(parsed.color ?? 10) };
        }
      } catch {
        prices = DEFAULT_PRICES;
      }
    } else if (rawPricing && typeof rawPricing === 'object') {
      prices = {
        bw: Number((rawPricing as { bw?: number }).bw ?? 2),
        color: Number((rawPricing as { color?: number }).color ?? 10),
      };
    }

    const pricePerPage = colorMode === 'color' ? prices.color : prices.bw;

    // Calculate authoritative amount
    const finalPageCount = Math.floor(pageCount);
    const finalCopies = Math.floor(copies);
    const totalAmount = finalPageCount * finalCopies * pricePerPage;

    // Validate amount is reasonable
    if (totalAmount <= 0 || totalAmount > 100000) {
      return apiError('Invalid calculated amount', 400);
    }

    // 7. Validate layout if provided
    if (layout !== undefined) {
      if (!Array.isArray(layout)) {
        return apiError('layout must be an array', 400);
      }
      if (layout.length > 10) {
        return apiError('Maximum 10 layout items allowed', 400);
      }
      // Validate layout items
      for (const item of layout) {
        if (typeof item !== 'object' || item === null) {
          return apiError('Invalid layout item', 400);
        }
        if (item.xPercent !== undefined && (typeof item.xPercent !== 'number' || item.xPercent < 0 || item.xPercent > 100)) {
          return apiError('Invalid xPercent in layout', 400);
        }
        if (item.yPercent !== undefined && (typeof item.yPercent !== 'number' || item.yPercent < 0 || item.yPercent > 100)) {
          return apiError('Invalid yPercent in layout', 400);
        }
      }
    }

    // 8. Generate unique job number
    const jobNumber = `PRINT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // 9. Prepare job data
    const hasLayout = Array.isArray(layout) && layout.length > 0;
    const primaryFileUrl = fileUrl || (hasLayout ? layout[0].fileUrl : null);

    // 10. Create job
    const newJob = await PrintJob.create({
      jobNumber,
      cafeId: cafe._id,
      fileUrl: primaryFileUrl,
      fileName: fileName || 'Print Document',
      fileType: fileType || 'image/png',
      cloudinaryPublicId: cloudinaryPublicId || null,
      cloudinaryResourceType: cloudinaryResourceType || null,
      cloudinaryFormat: cloudinaryFormat || null,
      cloudinaryVersion: Number.isFinite(Number(cloudinaryVersion)) ? Number(cloudinaryVersion) : null,
      layout: hasLayout ? layout : [],
      pageCount: finalPageCount,
      selectedPages: selectedPages || 'all',
      colorMode,
      paperSize,
      copies: finalCopies,
      pricePerPage,
      totalAmount,
      paymentMethod,
      paymentStatus: 'pending',
      printStatus: 'queued',
    });

    console.info('[Jobs Create] Job created', {
      jobId: newJob._id,
      jobNumber: newJob.jobNumber,
      cafeId: cafe.qrCode,
      amount: totalAmount,
    });

    return apiSuccess({
      jobId: newJob._id.toString(),
      jobNumber: newJob.jobNumber,
      totalAmount: newJob.totalAmount,
    });

  } catch (error) {
    return internalError(error, 'Job Creation');
  }
}