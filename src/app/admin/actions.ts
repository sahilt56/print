'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
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
		await cleanupJobCloudinaryAssets(job).catch((err) =>
			console.warn('[Admin Cleanup] Cloudinary failed:', err)
		);
		await PrintJob.deleteOne({ _id: job._id });
  }

  revalidatePath('/admin');
} 