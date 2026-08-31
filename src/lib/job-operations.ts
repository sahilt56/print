import dbConnect from './dbConnect';
import PrintJob from '@/models/PrintJob';
import Cafe from '@/models/Cafe';

/**
 * Calculate total amount for a print job
 */
export function calculateJobAmount(pageCount: number, copies: number, pricePerPage: number): number {
  return Math.round(pageCount * copies * pricePerPage * 100) / 100;
}

/**
 * Validate job pricing against cafe config
 */
export async function validateJobPricing(
  cafeId: string,
  pageCount: number,
  copies: number,
  colorMode: 'bw' | 'color',
  totalAmount: number
): Promise<{ valid: boolean; serverAmount?: number; error?: string }> {
  await dbConnect();

  const cafe = await Cafe.findOne({
    $or: [{ qrCode: cafeId }, { loginId: cafeId.toLowerCase() }, { _id: cafeId }],
  });

  if (!cafe) {
    return { valid: false, error: 'Cafe not found' };
  }

  const rawPricing = cafe.pricingConfig;
  let prices = { bw: 2, color: 10 };

  if (typeof rawPricing === 'string') {
    try {
      const parsed = JSON.parse(rawPricing);
      if (parsed && typeof parsed === 'object') {
        prices = {
          bw: Number(parsed.bw ?? 2),
          color: Number(parsed.color ?? 10),
        };
      }
    } catch {
      prices = { bw: 2, color: 10 };
    }
  } else if (rawPricing && typeof rawPricing === 'object') {
    prices = {
      bw: Number((rawPricing as { bw?: number }).bw ?? 2),
      color: Number((rawPricing as { color?: number }).color ?? 10),
    };
  }

  const pricePerPage = colorMode === 'color' ? prices.color : prices.bw;
  const serverAmount = calculateJobAmount(pageCount, copies, pricePerPage);

  // Allow small float discrepancies (up to 1 paisa)
  const difference = Math.abs(serverAmount - totalAmount);
  if (difference > 0.01) {
    return {
      valid: false,
      serverAmount,
      error: `Price mismatch: expected ${serverAmount}, got ${totalAmount}`,
    };
  }

  return { valid: true, serverAmount };
}

/**
 * Claim a print job atomically for an agent
 * Uses findOneAndUpdate to prevent race conditions
 */
export async function claimPrintJobAtomic(
  cafeId: string,
  agentId: string,
  timeoutMinutes: number = 10
) {
  await dbConnect();

  // Find cafe to get valid IDs
  const cafe = await Cafe.findOne({
    $or: [{ qrCode: cafeId }, { loginId: cafeId.toLowerCase() }, { _id: cafeId }],
    isActive: true,
  });

  if (!cafe) {
    return { success: false, error: 'Cafe not found or inactive' };
  }

  const possibleCafeIds = [cafe.qrCode, cafe.loginId, cafe._id.toString()].filter(Boolean);
  const claimedAt = new Date();
  const timeoutAt = new Date(claimedAt.getTime() + timeoutMinutes * 60 * 1000);

  // Atomic operation: find and update in single call
  // This ensures only ONE agent can successfully claim a job
  const job = await PrintJob.findOneAndUpdate(
    {
      cafeId: { $in: possibleCafeIds },
      paymentStatus: 'paid',
      printStatus: { $in: ['queued', 'pending'] },
      attemptCount: { $lt: 3 }, // Haven't exceeded max attempts
    },
    {
      $set: {
        printStatus: 'claimed',
        agentId,
        claimedAt,
        lastHeartbeat: claimedAt,
        $inc: { attemptCount: 1 },
      },
    },
    {
      sort: { createdAt: 1 }, // FIFO
      new: true, // Return updated document
    }
  );

  if (!job) {
    return { success: false, error: 'No available jobs' };
  }

  return { success: true, job };
}

/**
 * Handle job timeout - reset claim if agent hasn't responded
 */
export async function handleJobTimeout(jobId: string, timeoutMinutes: number = 10) {
  await dbConnect();

  const now = new Date();
  const timeoutThreshold = new Date(now.getTime() - timeoutMinutes * 60 * 1000);

  const job = await PrintJob.findOneAndUpdate(
    {
      _id: jobId,
      printStatus: { $in: ['claimed', 'printing'] },
      lastHeartbeat: { $lt: timeoutThreshold },
    },
    {
      $set: {
        printStatus: 'pending', // Return to queue
        agentId: null,
        claimedAt: null,
        $inc: { attemptCount: 1 },
      },
    },
    { new: true }
  );

  return job;
}

/**
 * Complete a print job
 */
export async function completePrintJob(jobId: string, agentId: string) {
  await dbConnect();

  const job = await PrintJob.findOneAndUpdate(
    {
      _id: jobId,
      printStatus: 'printing',
      agentId, // Verify it's the same agent
    },
    {
      $set: {
        printStatus: 'completed',
        lastHeartbeat: new Date(),
      },
    },
    { new: true }
  );

  return job;
}

/**
 * Fail a print job
 */
export async function failPrintJob(jobId: string, agentId: string, reason?: string) {
  await dbConnect();

  const job = await PrintJob.findOneAndUpdate(
    {
      _id: jobId,
      agentId, // Verify it's the same agent
    },
    {
      $set: {
        printStatus: 'failed',
        agentId: null,
        claimedAt: null,
        lastHeartbeat: new Date(),
      },
    },
    { new: true }
  );

  return job;
}

/**
 * Get job by ID with authorization check
 */
export async function getJobWithAuth(jobId: string, authorizedCafeIds: string[]) {
  await dbConnect();

  const job = await PrintJob.findOne({
    _id: jobId,
    cafeId: { $in: authorizedCafeIds },
  });

  return job;
}

/**
 * Validate job state transition
 */
export function isValidStateTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions: Record<string, string[]> = {
    queued: ['pending', 'claimed', 'cancelled'],
    pending: ['claimed', 'cancelled'],
    claimed: ['printing', 'pending', 'failed'],
    printing: ['completed', 'failed'],
    failed: ['pending'], // Allow retry
    completed: [], // Terminal state
    cancelled: [], // Terminal state
  };

  return (validTransitions[currentStatus] || []).includes(newStatus);
}

/**
 * Get printable job for agent (with all validations)
 */
export async function getAgentPrintableJob(cafeId: string, agentId: string) {
  await dbConnect();

  // Find cafe
  const cafe = await Cafe.findOne({
    $or: [{ qrCode: cafeId }, { loginId: cafeId.toLowerCase() }, { _id: cafeId }],
    isActive: true,
    isAgentActive: true,
  });

  if (!cafe) {
    return { success: false, error: 'Cafe not found or agent inactive' };
  }

  // Claim a job atomically
  return claimPrintJobAtomic(cafeId, agentId);
}
