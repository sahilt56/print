import React from 'react';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';

// For simplicity, we can fetch the job from our API or Prisma directly.
// Since this is a server component, we can use Prisma directly here.
import { prisma } from '@/lib/prisma';

export default async function StatusPage({ params }: { params: Promise<{ cafeId: string, jobId: string }> }) {
  const resolvedParams = await params;
  const { cafeId, jobId } = resolvedParams;

  const job = await prisma.printJob.findFirst({
    where: { id: jobId, cafe: { qrCode: cafeId } }
  });

  if (!job) {
    return (
      <Layout>
        <div className={styles.container}>
          <h1>Job Not Found</h1>
          <p>Please check the link or submit a new job.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.container}>
        <div className={styles.successIcon}>✓</div>
        <h1 className={styles.title}>Print Request Submitted</h1>
        
        <Card className={styles.detailsCard}>
          <div className={styles.jobNoRow}>
            <span className={styles.label}>Job No:</span>
            <span className={styles.jobNo}>{job.jobNumber}</span>
          </div>
          
          <div className={styles.divider}></div>
          
          <div className={styles.detailRow}>
            <span className={styles.label}>Amount:</span>
            <span className={styles.value}>₹{job.totalAmount}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.label}>Payment:</span>
            <span className={styles.value}>{job.paymentMethod === 'online' ? 'Online' : 'Cash'}</span>
          </div>
        </Card>

        <p className={styles.instruction}>
          Please show this number at the counter to pay and collect your print.
        </p>

        <Link href={`/${cafeId}`} className={styles.homeButton}>
          ← Back to Home &amp; Upload Another File
        </Link>
      </div>
    </Layout>
  );
}
