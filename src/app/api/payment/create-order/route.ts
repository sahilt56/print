import { NextRequest } from 'next/server';
import Razorpay from 'razorpay';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import { apiError, apiSuccess, internalError, isRequiredString } from '@/lib/api-utils';

/**
 * Create Razorpay Order Route
 * 
 * Security measures:
 * - Validates job exists and is in valid state
 * - Verifies amount is > 0
 * - Prevents creating orders for already paid jobs
 * - Returns keyId for frontend (never returns secret)
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { jobId } = body;

    // 1. Validate input
    if (!isRequiredString(jobId)) {
      return apiError('Missing jobId', 400);
    }

    // 2. Verify Razorpay configuration
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      console.error('[Payment Create] Razorpay credentials not configured');
      return apiError('Online payments are temporarily unavailable', 503);
    }

    // 3. Find job
    const job = await PrintJob.findById(jobId);
    if (!job) {
      return apiError('Job not found', 404);
    }

    // 4. Validate job state
    if (job.paymentStatus === 'paid') {
      return apiError('Job already paid', 400);
    }

    if (job.paymentMethod !== 'online') {
      return apiError('Job is not set for online payment', 400);
    }

    if (job.totalAmount <= 0) {
      return apiError('Invalid job amount', 400);
    }

    // 5. Create Razorpay order
    const razorpay = new Razorpay({ 
      key_id: keyId, 
      key_secret: keySecret,
    });

    // Razorpay amounts are in paisa (amount * 100)
    const amountInPaisa = Math.round(job.totalAmount * 100);
    
    const options = {
      amount: amountInPaisa,
      currency: 'INR',
      receipt: `receipt_${job.jobNumber}`,
      notes: {
        jobId: job._id.toString(),
        cafeId: job.cafeId,
        jobNumber: job.jobNumber,
      },
    };

    const order = await razorpay.orders.create(options);

    // 6. Update job with order ID
    job.paymentGatewayOrderId = order.id;
    await job.save();

    console.info('[Payment Create] Order created', {
      jobId,
      jobNumber: job.jobNumber,
      orderId: order.id,
      amount: job.totalAmount,
    });

    return apiSuccess({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId, // Safe to return - not the secret
    });

  } catch (error) {
    return internalError(error, 'Payment Create Order');
  }
}
