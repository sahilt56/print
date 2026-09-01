'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { cleanupJobCloudinaryAssets } from '@/lib/cloudinary';

// 🛡️ Helper: Secure Cafe Verification
async function getVerifiedCafeId(sessionUser: any) {
  const cafeId = sessionUser.cafeId || sessionUser.qrCode;
  const loginId = sessionUser.loginId || sessionUser.email;

  const cafe = await Cafe.findOne({
    $or: [
      ...(cafeId ? [{ qrCode: cafeId }] : []),
      ...(loginId ? [{ loginId: loginId }] : []),
    ],
  })
    .select('_id')
    .lean();

  if (!cafe) throw new Error('Cafe not found');
  return cafe._id;
}

// 🛡️ Helper: Fast Background Disk & Cloud Cleanup
function triggerBackgroundCleanup(jobObject: any) {
  // Cloudinary cleanup fire-and-forget (Doesn't block server response)
  cleanupJobCloudinaryAssets(jobObject).catch((err) =>
    console.warn('[Admin Cleanup] Cloudinary failed:', err)
  );

  // Local Disk Files Cleanup
  if (jobObject.fileUrl) {
    const filePath = join(process.cwd(), 'public', jobObject.fileUrl);
    unlink(filePath).catch(() => {});
  }

  if (Array.isArray(jobObject.layout)) {
    for (const item of jobObject.layout) {
      if (item.fileUrl) {
        const itemPath = join(process.cwd(), 'public', item.fileUrl);
        unlink(itemPath).catch(() => {});
      }
    }
  }
}

export async function markJobPaid(jobId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  await dbConnect();
  const cafeDbId = await getVerifiedCafeId(session.user);

  await PrintJob.updateOne(
    { _id: jobId, cafeId: cafeDbId },
    { $set: { paymentStatus: 'paid', printStatus: 'pending' } }
  );

  revalidatePath('/admin');
}

export async function markJobComplete(jobId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  await dbConnect();
  const cafeDbId = await getVerifiedCafeId(session.user);

  // 🚀 Fast Direct Update
  const job = await PrintJob.findOneAndUpdate(
    { _id: jobId, cafeId: cafeDbId },
    { $set: { printStatus: 'completed', paymentStatus: 'paid' } },
    { new: false }
  ).lean();

  if (job) {
    // ⚡ Non-blocking background deletion
    triggerBackgroundCleanup(job);
  }

  revalidatePath('/admin');
}

export async function cancelJob(jobId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  await dbConnect();
  const cafeDbId = await getVerifiedCafeId(session.user);

  // 🚀 Fast Security-Filtered Update
  const job = await PrintJob.findOneAndUpdate(
    { _id: jobId, cafeId: cafeDbId },
    {
      $set: {
        printStatus: 'cancelled',
        fileUrl: null,
        layout: [],
        fileName: 'Cancelled for Privacy',
        cloudinaryPublicId: null,
        cloudinaryResourceType: null,
        cloudinaryFormat: null,
        cloudinaryVersion: null,
      },
    },
    { new: false }
  ).lean();

  if (job) {
    // ⚡ Non-blocking background deletion
    triggerBackgroundCleanup(job);
  }

  revalidatePath('/admin');
} 