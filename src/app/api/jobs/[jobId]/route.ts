import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await dbConnect();

    const { jobId } = await params;
    const cleanJobId = jobId ? String(jobId).trim() : '';

    if (!cleanJobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(cleanJobId);

    // Dynamic Search: Match by MongoDB _id OR custom jobNumber
    const job = await PrintJob.findOne({
      $or: [
        ...(isObjectId ? [{ _id: cleanJobId }] : []),
        { jobNumber: cleanJobId },
      ],
    }).lean();

    if (!job) {
      return NextResponse.json({ error: 'Job Not Found' }, { status: 404 });
    }

    return NextResponse.json({
      jobId: (job as any)._id.toString(),
      jobNumber: (job as any).jobNumber,
      fileName: (job as any).fileName,
      totalAmount: (job as any).totalAmount,
      paymentStatus: (job as any).paymentStatus,
      printStatus: (job as any).printStatus,
      createdAt: (job as any).createdAt,
    });
  } catch (error: any) {
    console.error('Fetch Job Status Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}