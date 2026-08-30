'use client';

import { Button } from '@/components/ui/Button';
import { markJobPaid, markJobComplete, cancelJob } from './actions';
import styles from './page.module.css';

interface JobActionsProps {
  jobId: string;
  paymentStatus: string;
  printStatus: string;
}

export function JobActions({ jobId, paymentStatus, printStatus }: JobActionsProps) {
  const isPaid = paymentStatus === 'paid';
  const isDone = printStatus === 'completed' || printStatus === 'cancelled';

  return (
    <div className={styles.actions}>
      {!isPaid && (
        <form action={async () => { 'use server'; await markJobPaid(jobId); }}>
          <Button variant="secondary" type="submit">
            ✓ Mark Paid
          </Button>
        </form>
      )}
      {isPaid && !isDone && (
        <form action={async () => { 'use server'; await markJobComplete(jobId); }}>
          <Button variant="primary" type="submit">
            🖨️ Mark Printed
          </Button>
        </form>
      )}
      {!isDone && (
        <form action={async () => { 'use server'; await cancelJob(jobId); }}>
          <Button variant="danger" type="submit">
            ✕ Cancel
          </Button>
        </form>
      )}
    </div>
  );
}
