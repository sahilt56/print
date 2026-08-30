'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedCafeId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function updateOwnedJob(jobId: string, data: { paymentStatus?: string; printStatus?: string }) {
  const cafeId = await getAuthenticatedCafeId();
  if (!cafeId) throw new Error('Unauthorized');

  const result = await prisma.printJob.updateMany({
    where: { id: jobId, cafe: { qrCode: cafeId } },
    data,
  });

  if (result.count !== 1) throw new Error('Job not found or access denied');
}

export async function markJobPaid(jobId: string) {
  await updateOwnedJob(jobId, { paymentStatus: 'paid', printStatus: 'pending' });
  revalidatePath('/admin');
}

export async function markJobComplete(jobId: string) {
  await updateOwnedJob(jobId, { printStatus: 'completed' });
  revalidatePath('/admin');
}

export async function cancelJob(jobId: string) {
  await updateOwnedJob(jobId, { printStatus: 'cancelled' });
  revalidatePath('/admin');
}
