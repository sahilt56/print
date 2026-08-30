import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, jobId } = await request.json();

    if (![razorpay_order_id, razorpay_payment_id, razorpay_signature, jobId].every((value) => typeof value === 'string' && value.length > 0)) {
      return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      console.error('Razorpay credentials are not configured');
      return NextResponse.json({ error: 'Online payments are temporarily unavailable' }, { status: 503 });
    }
    
    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const receivedSignature = Buffer.from(razorpay_signature, 'utf8');
    const expectedSignature = Buffer.from(generatedSignature, 'utf8');
    if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const updatedJob = await prisma.printJob.updateMany({
      where: {
        id: jobId,
        paymentMethod: 'online',
        paymentStatus: 'pending',
        paymentGatewayOrderId: razorpay_order_id,
      },
      data: {
        paymentStatus: 'paid',
        printStatus: 'pending', // Print Agent will now pick it up
        paymentGatewayPaymentId: razorpay_payment_id
      }
    });

    if (updatedJob.count !== 1) {
      return NextResponse.json({ error: 'Payment does not match this job or has already been processed' }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Razorpay Verify Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
