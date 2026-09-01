import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await dbConnect();
    const { jobId } = await params;

    const currentJob = await PrintJob.findById(jobId);
    if (!currentJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Agar job already complete ya cancel ho chuki hai
    if (currentJob.printStatus === 'completed' || currentJob.printStatus === 'cancelled') {
      return NextResponse.json({ queuePosition: 0, status: currentJob.printStatus });
    }

    // Is cafe ke wo sabhi jobs jo isse pehle create huye the aur abhi tak queued/pending hain
    const precedingJobsCount = await PrintJob.countDocuments({
      cafeId: currentJob.cafeId,
      printStatus: { $in: ['queued', 'pending'] },
      createdAt: { $lte: currentJob.createdAt },
    });

    return NextResponse.json({
      queuePosition: precedingJobsCount, // 1 matlab abhi aapka hi number hai
      printStatus: currentJob.printStatus,
      paymentStatus: currentJob.paymentStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}