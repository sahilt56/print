import React from 'react';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';
import dbConnect from '@/lib/dbConnect';
import PrintJob from '@/models/PrintJob';
import mongoose from 'mongoose';

export default async function StatusPage({
  params,
}: {
  params: Promise<{ cafeId: string; jobId: string }>;
}) {
  const resolvedParams = await params;
  const { cafeId, jobId } = resolvedParams;

  await dbConnect();

  const isObjectId = mongoose.Types.ObjectId.isValid(jobId);

  // Direct fetch by Mongo _id OR jobNumber without strict cafe filter block
  const rawJob = await PrintJob.findOne({
    $or: [
      ...(isObjectId ? [{ _id: jobId }] : []),
      { jobNumber: jobId },
    ],
  }).lean();

  if (!rawJob) {
    return (
      <Layout>
        <div className={styles.container}>
          <h1>Job Not Found</h1>
          <p>Please check the link or submit a new job.</p>
        </div>
      </Layout>
    );
  }

  // Convert raw Mongo doc to UI object safely
  const job = {
    id: (rawJob as any)._id.toString(),
    jobNumber: (rawJob as any).jobNumber || 'PRINT-REQ',
    totalAmount: (rawJob as any).totalAmount || (rawJob as any).amount || 0,
    paymentMethod: (rawJob as any).paymentMethod || (rawJob as any).paymentStatus || 'cash',
  };

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
            <span className={styles.value}>
              {String(job.paymentMethod).toLowerCase() === 'online' ? 'Online' : 'Cash'}
            </span>
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