import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import Cafe from '@/models/Cafe';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await dbConnect();
    
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    const token = authHeader.split(' ')[1].trim();

    const { jobId } = await params;
    const { status } = await request.json();

    const job = await PrintJob.findById(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const lookup: {
      $or: Array<{ qrCode?: string; loginId?: string; _id?: string }>;
    } = {
      $or: [
        { qrCode: job.cafeId },
        { loginId: job.cafeId },
      ],
    };

    if (mongoose.Types.ObjectId.isValid(job.cafeId)) {
      lookup.$or.push({ _id: job.cafeId });
    }

    const cafe = await Cafe.findOne(lookup).lean();

    const dbToken = String((cafe as any)?.agentSecretKey || '').trim();
    if (!cafe || dbToken !== token) {
      return NextResponse.json({ error: 'Forbidden: Invalid Secret Key' }, { status: 403 });
    }

    if (status === 'completed' || status === 'failed') {
      // Delete Main File from Disk
      if (job.fileUrl) {
        const filePath = join(process.cwd(), 'public', job.fileUrl);
        await unlink(filePath).catch(() => {});
      }

      // Delete Multi-image Layout Files from Disk
      if (job.layout && job.layout.length > 0) {
        for (const item of job.layout) {
          if (item.fileUrl) {
            const itemPath = join(process.cwd(), 'public', item.fileUrl);
            await unlink(itemPath).catch(() => {});
          }
        }
      }
    }

    // Zero-Data Retention update
    job.printStatus = status;
    if (status === 'completed') {
      job.paymentStatus = 'paid';
    }
    job.fileUrl = null;
    job.layout = [];
    job.fileName = 'Deleted for Privacy';
    await job.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Status Update Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}