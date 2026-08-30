import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    if (typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      console.error('Razorpay credentials are not configured');
      return NextResponse.json({ error: 'Online payments are temporarily unavailable' }, { status: 503 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const job = await prisma.printJob.findUnique({
      where: { id: jobId }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.paymentStatus === 'paid' || job.paymentMethod !== 'online' || job.totalAmount <= 0) {
      return NextResponse.json({ error: 'Job already paid' }, { status: 400 });
    }

    // Razorpay amounts are in paisa (amount * 100)
    const options = {
      amount: Math.round(job.totalAmount * 100),
      currency: 'INR',
      receipt: `receipt_${job.jobNumber}`,
      notes: {
        jobId: job.id,
        cafeId: job.cafeId,
      }
    };

    const order = await razorpay.orders.create(options);

    // Update the job with the generated order ID
    await prisma.printJob.update({
      where: { id: job.id },
      data: { 
        paymentMethod: 'online',
        paymentGatewayOrderId: order.id 
      }
    });

    return NextResponse.json({ 
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId
    });

  } catch (error) {
    console.error('Razorpay Create Order Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
