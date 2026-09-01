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

  // Direct fetch by Mongo _id OR jobNumber
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

  const jobDoc = rawJob as any;

  // 🔢 Calculate Live Queue Position (Kitne log aapse pehle hain)
  let queuePosition = 0;
  if (jobDoc.printStatus === 'queued' || jobDoc.printStatus === 'pending') {
    queuePosition = await PrintJob.countDocuments({
      cafeId: jobDoc.cafeId,
      printStatus: { $in: ['queued', 'pending'] },
      createdAt: { $lte: jobDoc.createdAt },
    });
  }

  // Convert raw Mongo doc to UI object safely
  const job = {
    id: jobDoc._id.toString(),
    jobNumber: jobDoc.jobNumber || 'PRINT-REQ',
    totalAmount: jobDoc.totalAmount || jobDoc.amount || 0,
    paymentMethod: jobDoc.paymentMethod || jobDoc.paymentStatus || 'cash',
    printStatus: jobDoc.printStatus || 'queued',
  };

  return (
    <Layout>
      <div className={styles.container}>
        <div className={styles.successIcon}>✓</div>
        <h1 className={styles.title}>Print Request Submitted</h1>

        {/* 🚀 Live Queue Position Banner */}
        {job.printStatus === 'completed' ? (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '1rem', borderRadius: '12px', textAlign: 'center', marginBottom: '1rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🎉 Print Completed / Ready!</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>Aapka print nikal chuka hai, counter se collect karein.</p>
          </div>
        ) : job.printStatus === 'cancelled' ? (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '12px', textAlign: 'center', marginBottom: '1rem', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>❌ Print Cancelled</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>Yeh print request cancel kar di gayi hai.</p>
          </div>
        ) : (
          <div style={{ background: 'var(--card-bg, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', padding: '1rem', borderRadius: '12px', textAlign: 'center', marginBottom: '1rem', width: '100%', maxWidth: '400px' }}>
            <p style={{ fontSize: '0.9rem', color: '#070808', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Apne Print Ke status ko Check karne ke liye page ko refresh kare.
            </p>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary, #2563eb)', margin: '6px 0' }}>
              {queuePosition === 1 ? '🎉 Aapka number abhi hai!' : `Aapse pehle ${queuePosition - 1} log hain`}
            </h2>
            <p style={{ fontSize: '1.5rem', color: '#e80505', margin: 0 }}>
              Queue Position: <b>#{queuePosition}</b>
            </p>
          </div>
        )}

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