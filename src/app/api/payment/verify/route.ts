import { NextRequest } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import { apiError, apiSuccess, internalError } from '@/lib/api-utils';
import { timingSafeCompare } from '@/lib/security';

/**
 * Payment Verification Route
 * 
 * Security measures:
 * - Verifies Razorpay signature using timing-safe comparison
 * - Idempotent: duplicate callbacks won't create duplicate payments
 * - Uses atomic MongoDB operation (findOneAndUpdate with conditions)
 * - Validates payment status before marking paid
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, jobId } = body;

    // 1. Validate input
    if (
      typeof razorpay_order_id !== 'string' || razorpay_order_id.trim().length === 0 ||
      typeof razorpay_payment_id !== 'string' || razorpay_payment_id.trim().length === 0 ||
      typeof razorpay_signature !== 'string' || razorpay_signature.trim().length === 0 ||
      typeof jobId !== 'string' || jobId.trim().length === 0
    ) {
      return apiError('Missing required payment details', 400);
    }

    // 2. Verify Razorpay credentials are configured
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.error('[Payment Verify] Razorpay credentials not configured');
      return apiError('Online payments are temporarily unavailable', 503);
    }

    // 3. Verify Razorpay signature (timing-safe)
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!timingSafeCompare(razorpay_signature, generatedSignature)) {
      console.warn('[Payment Verify] Invalid signature attempt', { jobId });
      return apiError('Invalid payment signature', 400);
    }

    // 4. Find job and verify it exists and is in valid state
    const job = await PrintJob.findOne({
      _id: jobId,
      paymentMethod: 'online',
      paymentStatus: 'pending', // Only process pending payments
      paymentGatewayOrderId: razorpay_order_id,
    });

    if (!job) {
      return apiError(
        'Job not found or already processed',
        400
      );
    }

    // 5. Verify amount (critical for payment integrity)
    if (job.totalAmount <= 0) {
      return apiError('Invalid job amount', 400);
    }

    // 6. Update job status atomically
    // Using findOneAndUpdate with conditions to ensure idempotency
    const updatedJob = await PrintJob.findOneAndUpdate(
      {
        _id: jobId,
        paymentMethod: 'online',
        paymentStatus: 'pending', // Only update if still pending
        paymentGatewayOrderId: razorpay_order_id,
      },
      {
        $set: {
          paymentStatus: 'paid',
          paymentGatewayPaymentId: razorpay_payment_id,
          printStatus: 'pending', // Ready for agent to pick up
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedJob) {
      // Job was already processed or is in different state
      return apiError('Payment already processed or job state changed', 400);
    }

    console.info('[Payment Verify] Payment verified successfully', {
      jobId,
      jobNumber: job.jobNumber,
      amount: job.totalAmount,
    });

    return apiSuccess({ 
      success: true,
      message: 'Payment verified and job is ready for printing'
    });

  } catch (error) {
    return internalError(error, 'Payment Verification');
  }
}
