import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import { apiError, apiSuccess, internalError, unauthorized, isRequiredNumber } from '@/lib/api-utils';
import { getAuthenticatedCafeId } from '@/lib/security';
import { uploadBackgroundImage } from '@/lib/cloudinary';

/**
 * Admin Settings Update Route
 * 
 * Security measures:
 * - Verifies session and cafe ownership
 * - Validates pricing ranges
 * - Prevents arbitrary price manipulation
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return unauthorized('Login required');
    }

    await dbConnect();

    // Get authenticated cafe from session
    const sessionCafeId = await getAuthenticatedCafeId();
    if (!sessionCafeId) {
      return unauthorized('No cafe associated with session');
    }

    const contentType = request.headers.get('content-type') || '';
    const isMultipart = contentType.includes('multipart/form-data');
    let bw: unknown;
    let color: unknown;
    let logoUrl: unknown;
    let backgroundImage: File | null = null;

    if (isMultipart) {
      const formData = await request.formData();
      bw = formData.get('bw');
      color = formData.get('color');
      logoUrl = formData.get('logoUrl');
      backgroundImage = formData.get('backgroundImage') instanceof File
        ? formData.get('backgroundImage') as File
        : null;
      bw = bw === null ? undefined : Number(bw);
      color = color === null ? undefined : Number(color);
    } else {
      const body = await request.json();
      ({ bw, color, logoUrl } = body);
    }

    // Validate pricing fields
    const MAX_PRICE = 1000;
    const MIN_PRICE = 0;

    if (bw !== undefined) {
      if (!isRequiredNumber(bw) || bw < MIN_PRICE || bw > MAX_PRICE) {
        return apiError(`B&W price must be between ${MIN_PRICE} and ${MAX_PRICE}`, 400);
      }
    }

    if (color !== undefined) {
      if (!isRequiredNumber(color) || color < MIN_PRICE || color > MAX_PRICE) {
        return apiError(`Color price must be between ${MIN_PRICE} and ${MAX_PRICE}`, 400);
      }
    }

    if (logoUrl !== undefined && logoUrl !== null) {
      if (typeof logoUrl !== 'string') {
        return apiError('Invalid logo URL', 400);
      }
      // Allow data URLs for base64 encoded images, or HTTPS URLs
      if (logoUrl && !logoUrl.startsWith('data:') && !logoUrl.startsWith('https://')) {
        return apiError('Logo URL must be a data URL or HTTPS', 400);
      }
    }

    if (backgroundImage && backgroundImage.size > 10 * 1024 * 1024) {
      return apiError('Background image must be smaller than 10MB', 400);
    }
    if (backgroundImage && !backgroundImage.type.startsWith('image/')) {
      return apiError('Background image must be an image file', 400);
    }

    // Find cafe using session cafe ID. Only include _id when it is a valid ObjectId,
    // because qrCode values like "cafe_7813f45eb2" are not ObjectIds.
    const cafeLookup: {
      $or: Array<{ qrCode?: string; loginId?: string; _id?: string }>; 
      isActive: boolean;
    } = {
      $or: [
        { qrCode: sessionCafeId },
        { loginId: sessionCafeId.toLowerCase() },
      ],
      isActive: true,
    };

    if (mongoose.Types.ObjectId.isValid(sessionCafeId)) {
      cafeLookup.$or.push({ _id: sessionCafeId });
    }

    const cafe = await Cafe.findOne(cafeLookup);

    if (!cafe) {
      return apiError('Cafe not found', 404);
    }

    // Update pricing config
    if (bw !== undefined || color !== undefined) {
      cafe.pricingConfig = {
        bw: typeof bw === 'number' ? bw : (cafe.pricingConfig?.bw || 2),
        color: typeof color === 'number' ? color : (cafe.pricingConfig?.color || 10),
      };
    }

    // Update logo if provided
    if (logoUrl !== undefined) {
      cafe.logoUrl = logoUrl;
    }

    if (backgroundImage) {
      const uploadedBackground = await uploadBackgroundImage(
        Buffer.from(await backgroundImage.arrayBuffer())
      );
      cafe.backgroundImageUrl = uploadedBackground.secure_url;
    }

    await cafe.save();

    console.info('[Admin Settings] Updated', {
      cafeId: cafe.qrCode,
      pricing: cafe.pricingConfig,
      backgroundImageUrl: cafe.backgroundImageUrl,
    });

    return apiSuccess({
      message: 'Settings updated successfully',
      pricing: cafe.pricingConfig,
    });

  } catch (error) {
    return internalError(error, 'Admin Settings Update');
  }
}