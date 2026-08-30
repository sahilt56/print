'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
import { unlink } from 'fs/promises';
import { join } from 'path';

async function updateOwnedJob(jobId: string, data: { paymentStatus?: string; printStatus?: string }) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error('Unauthorized');

  await dbConnect();

  const userObj = session.user as any;
  const cafeId = userObj.cafeId || userObj.qrCode;
  const loginId = userObj.loginId || userObj.email;

  // Find cafe to match identifiers
  const cafe = await Cafe.findOne({
    $or: [
      ...(cafeId ? [{ qrCode: cafeId }] : []),
      ...(loginId ? [{ loginId: loginId }] : []),
    ],
  }).lean();

  if (!cafe) throw new Error('Cafe not found');

  const possibleCafeIds = [cafe.qrCode, cafe.loginId, cafe._id.toString()].filter(Boolean);

  // Update using Mongoose
  const result = await PrintJob.updateOne(
    {
      _id: jobId,
      cafeId: { $in: possibleCafeIds },
    },
    { $set: data }
  );

  if (result.matchedCount !== 1) {
    throw new Error('Job not found or access denied');
  }
}

export async function markJobPaid(jobId: string) {
  await updateOwnedJob(jobId, { paymentStatus: 'paid', printStatus: 'pending' });
  revalidatePath('/admin');
}

export async function markJobComplete(jobId: string) {
  await updateOwnedJob(jobId, { printStatus: 'completed', paymentStatus: 'paid' });
  revalidatePath('/admin');
}

export async function cancelJob(jobId: string) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) throw new Error('Unauthorized');

  await dbConnect();

  const job = await PrintJob.findById(jobId);
  if (job) {
    // Delete Main File from Disk immediately
    if (job.fileUrl) {
      const filePath = join(process.cwd(), 'public', job.fileUrl);
      await unlink(filePath).catch(() => {});
    }

    // Delete Layout Files from Disk immediately
    if (job.layout && job.layout.length > 0) {
      for (const item of job.layout) {
        if (item.fileUrl) {
          const itemPath = join(process.cwd(), 'public', item.fileUrl);
          await unlink(itemPath).catch(() => {});
        }
      }
    }

    // Update status and clear data
    job.printStatus = 'cancelled';
    job.fileUrl = null;
    job.layout = [];
    job.fileName = 'Cancelled for Privacy';
    await job.save();
  }

  revalidatePath('/admin');
}