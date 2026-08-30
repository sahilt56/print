import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1].trim();

    const { searchParams } = new URL(request.url);
    const cafeId = searchParams.get('cafeId');

    if (!cafeId) {
      return NextResponse.json({ error: 'Cafe ID required' }, { status: 400 });
    }

    const cafe = await Cafe.findOne({
      $or: [{ qrCode: cafeId }, { loginId: cafeId.toLowerCase() }],
    }).lean();

    const dbToken = String((cafe as any)?.agentSecretKey || '').trim();
    if (!cafe || dbToken !== token) {
      return NextResponse.json({ error: 'Forbidden: Invalid Agent Secret Key' }, { status: 403 });
    }

    const possibleCafeIds = [cafe.qrCode, cafe.loginId, cafe._id.toString()].filter(Boolean);

    // RULE: Agent will ONLY pick up jobs where paymentStatus is 'paid' and printStatus is queued/pending
    const job = await PrintJob.findOne({
      cafeId: { $in: possibleCafeIds },
      paymentStatus: 'paid', // <-- Jab tak admin 'Mark Paid' nahi karega, print nahi hoga!
      printStatus: { $in: ['queued', 'pending'] },
    }).sort({ createdAt: 1 });

    if (!job) {
      return NextResponse.json({ job: null });
    }

    // Mark status as 'printing'
    job.printStatus = 'printing';
    await job.save();

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const downloadUrl = (job as any).fileUrl?.startsWith('http')
      ? (job as any).fileUrl
      : `${protocol}://${host}${(job as any).fileUrl}`;

    return NextResponse.json({
      job: {
        id: job._id.toString(),
        jobNumber: job.jobNumber,
        downloadUrl,
        copies: job.copies || 1,
        colorMode: job.isColor ? 'color' : 'bw',
        paperSize: 'A4',
        layout: (job as any).layout || null,
      },
    });

  } catch (error: any) {
    console.error('Agent Jobs Fetch Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}