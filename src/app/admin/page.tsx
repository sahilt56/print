export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';
import { markJobPaid, markJobComplete, cancelJob } from './actions';
import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import PrintJob from '@/models/PrintJob';
import { redirect } from 'next/navigation';

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  pending: 'Waiting',
  printing: 'Printing...',
  completed: 'Completed ✓',
  cancelled: 'Cancelled',
  failed: 'Failed ✗',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Payment Pending',
  paid: 'Paid ✓',
};

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/login');
  }

  if (session.user.role === 'super-admin') {
    redirect('/super-admin');
  }

  await dbConnect();

  const userObj = session.user as any;
  const cafeId = userObj.cafeId || userObj.qrCode;
  const userId = userObj.id;
  const loginId = userObj.loginId || userObj.email;

  // Find cafe details in MongoDB
  const cafe = await Cafe.findOne({
    $or: [
      ...(cafeId ? [{ qrCode: cafeId }] : []),
      ...(loginId ? [{ loginId: loginId }] : []),
    ],
  }).lean();

  if (!cafe) {
    return (
      <Layout>
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <h2>Cafe record not found. Please log out and log in again.</h2>
        </div>
      </Layout>
    );
  }

  // Match the schema's ObjectId-backed cafeId field.
  const rawJobs = await PrintJob.find({
    cafeId: cafe._id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const jobs = rawJobs.map((j: any) => ({
    id: j._id.toString(),
    jobNumber: j.jobNumber || 'PRINT-REQ',
    fileName: j.fileName || 'Document',
    fileUrl: j.fileUrl || '',
    pageCount: j.totalPages || j.pageCount || 1,
    copies: j.copies || 1,
    colorMode: j.isColor ? 'color' : 'bw',
    paperSize: j.paperSize || 'A4',
    totalAmount: j.totalAmount || 0,
    paymentStatus: j.paymentStatus || 'pending',
    printStatus: j.printStatus || 'pending',
    createdAt: j.createdAt || new Date(),
  }));

  const pending = jobs.filter(j => ['queued', 'pending'].includes(j.printStatus) && j.paymentStatus !== 'paid');
  const paid = jobs.filter(j => ['queued', 'pending'].includes(j.printStatus) && j.paymentStatus === 'paid');
  const inProgress = jobs.filter(j => j.printStatus === 'printing');
  const done = jobs.filter(j => ['completed', 'cancelled', 'failed'].includes(j.printStatus));

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>{cafe.name}&apos;s Print Queue</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/admin/settings" className={`${styles.btn} ${styles.btnPrimary}`}>⚙️ Settings</Link>
          <form action="/api/auth/signout" method="POST">
            <input type="hidden" name="callbackUrl" value="/login" />
            <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`}>Logout</button>
          </form>
        </div>
      </div>

      {/* Awaiting Payment */}
      {pending.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>⏳ Awaiting Payment</h2>
          <div className={styles.jobList}>
            {pending.map(job => (
              <Card key={job.id} className={styles.jobCard}>
                <JobCard job={job} />
                <div className={styles.actions}>
                  <form action={markJobPaid.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`}>✓ Mark Paid</button>
                  </form>
                  <form action={cancelJob.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnDanger}`}>✕ Cancel</button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Ready to Print */}
      {paid.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🖨️ Ready to Print</h2>
          <div className={styles.jobList}>
            {paid.map(job => (
              <Card key={job.id} className={`${styles.jobCard} ${styles.readyCard}`}>
                <JobCard job={job} />
                <div className={styles.actions}>
                  <form action={markJobComplete.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>🖨️ Mark Printed</button>
                  </form>
                  <form action={cancelJob.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnDanger}`}>✕ Cancel</button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Printing */}
      {inProgress.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🔄 Printing...</h2>
          <div className={styles.jobList}>
            {inProgress.map(job => (
              <Card key={job.id} className={`${styles.jobCard} ${styles.printingCard}`}>
                <JobCard job={job} />
                <div className={styles.actions}>
                  <form action={markJobComplete.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>✓ Mark Complete</button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Completed / Recent History */}
      {done.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📜 Recent History</h2>
          <div className={styles.jobList}>
            {done.map(job => (
              <Card key={job.id} className={`${styles.jobCard} ${styles.doneCard}`}>
                <JobCard job={job} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {jobs.length === 0 && (
        <div className={styles.empty}>
          <p>No print jobs yet.</p>
          <p>Jobs submitted by customers will appear here.</p>
        </div>
      )}
    </Layout>
  );
}

function JobCard({ job }: { job: any }) {
  const timeAgo = new Date(job.createdAt).toLocaleString('en-IN', {
    hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
  });

  return (
    <div className={styles.jobContent}>
      <div className={styles.jobHeader}>
        <span className={styles.jobNumber}>{job.jobNumber}</span>
        <div className={styles.badges}>
          <span className={styles.statusBadge} data-status={job.printStatus}>
            {STATUS_LABELS[job.printStatus] ?? job.printStatus}
          </span>
          <span className={styles.paymentBadge} data-status={job.paymentStatus}>
            {PAYMENT_LABELS[job.paymentStatus] ?? job.paymentStatus}
          </span>
        </div>
      </div>

      <div className={styles.jobDetails}>
        <span className={styles.detail}>
           <a href={job.fileUrl || `/api/files/${job.id}`} target="_blank" rel="noreferrer" className={styles.link}>{job.fileName}</a>
        </span>
        <span className={styles.detail}>
           {job.copies} × {job.pageCount} page{job.pageCount !== 1 ? 's' : ''} &bull; {job.colorMode === 'color' ? 'Color' : 'B&W'} &bull; {job.paperSize}
        </span>
        <span className={styles.detail}>₹{job.totalAmount} cash</span>
        <span className={styles.detail}>{timeAgo}</span>
      </div>
    </div>
  );
}