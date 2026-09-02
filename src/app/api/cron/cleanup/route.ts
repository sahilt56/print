import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import { cleanupJobCloudinaryAssets } from '@/lib/cloudinary';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const requestSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

  if (!configuredSecret || requestSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await dbConnect();

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleJobs = await PrintJob.find({ createdAt: { $lt: cutoff } })
      .select('_id cloudinaryPublicId cloudinaryResourceType fileUrl layout')
      .limit(100);

    let cleaned = 0;
    let failed = 0;

    for (const job of staleJobs) {
      try {
        await cleanupJobCloudinaryAssets(job.toObject());
        await PrintJob.deleteOne({ _id: job._id });
        cleaned += 1;
      } catch (error) {
        failed += 1;
        console.warn('[Cron Cleanup] Job retained for retry', { jobId: job._id, error });
      }
    }

    return NextResponse.json({ success: true, scanned: staleJobs.length, cleaned, failed });
  } catch (error) {
    console.error('[Cron Cleanup] Failed', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}