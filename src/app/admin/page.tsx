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
import LogoutButton from './LogoutButton';
import { 
  Clock, 
  Printer, 
  History, 
  FileText, 
  Banknote, 
  Settings, 
  Palette, 
  CheckCircle, 
  X, 
  RefreshCcw 
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  pending: 'Waiting',
  printing: 'Printing...',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const PAYMENT_LABELS: Record<string, string> = {
  pending: 'Payment Pending',
  paid: 'Paid',
};

interface PrintJobData {
  id: string;
  jobNumber: string;
  fileName: string;
  fileUrl: string;
  pageCount: number;
  copies: number;
  colorMode: string;
  paperSize: string;
  totalAmount: number;
  paymentStatus: string;
  printStatus: string;
  createdAt: Date;
}

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/login');
  }

  const userObj = session.user as { role?: string; cafeId?: string; qrCode?: string; loginId?: string; email?: string };

  if (userObj.role === 'super-admin') {
    redirect('/super-admin');
  }

  await dbConnect();

  const cafeId = userObj.cafeId || userObj.qrCode;
  const loginId = userObj.loginId || userObj.email;

  const cafe = await Cafe.findOne({
    $or: [
      ...(cafeId ? [{ qrCode: cafeId }] : []),
      ...(loginId ? [{ loginId: loginId }] : []),
    ],
  }).lean() as { _id: unknown; name?: string } | null;

  if (!cafe) {
    return (
      <Layout>
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <h2>Cafe record not found. Please log out and log in again.</h2>
        </div>
      </Layout>
    );
  }

  const rawJobs = await PrintJob.find({
    cafeId: cafe._id,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const jobs: PrintJobData[] = rawJobs.map((j: Record<string, unknown>) => ({
    id: String(j._id),
    jobNumber: (j.jobNumber as string) || 'PRINT-REQ',
    fileName: (j.fileName as string) || 'Document',
    fileUrl: (j.fileUrl as string) || '',
    pageCount: Number(j.totalPages || j.pageCount || 1),
    copies: Number(j.copies || 1),
    colorMode: j.isColor ? 'color' : 'bw',
    paperSize: (j.paperSize as string) || 'A4',
    totalAmount: Number(j.totalAmount || 0),
    paymentStatus: (j.paymentStatus as string) || 'pending',
    printStatus: (j.printStatus as string) || 'pending',
    createdAt: (j.createdAt as Date) || new Date(),
  }));

  const pending = jobs.filter(j => ['queued', 'pending'].includes(j.printStatus) && j.paymentStatus !== 'paid');
  const paid = jobs.filter(j => ['queued', 'pending'].includes(j.printStatus) && j.paymentStatus === 'paid');
  const inProgress = jobs.filter(j => j.printStatus === 'printing');
  const done = jobs.filter(j => ['completed', 'cancelled', 'failed'].includes(j.printStatus));

  return (
    <Layout>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <p className={styles.subtitle}>{cafe.name}&apos;s Print Queue</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link href="/admin/settings" className={`${styles.btn} ${styles.btnSecondary}`}>
            <Settings size={16} /> Settings
          </Link>
          <LogoutButton />
        </div>
      </div>

      {/* Awaiting Payment */}
      {pending.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Clock size={18} className="text-amber-500" /> Awaiting Payment
          </h2>
          <div className={styles.jobList}>
            {pending.map(job => (
              <Card key={job.id} className={styles.jobCard}>
                <JobCard job={job} />
                <div className={styles.actions}>
                  <form action={markJobPaid.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnSecondary}`}>
                      <CheckCircle size={15} /> Mark Paid
                    </button>
                  </form>
                  <form action={cancelJob.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnDanger}`}>
                      <X size={15} /> Cancel
                    </button>
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
          <h2 className={styles.sectionTitle}>
            <Printer size={18} /> Ready to Print
          </h2>
          <div className={styles.jobList}>
            {paid.map(job => (
              <Card key={job.id} className={`${styles.jobCard} ${styles.readyCard}`}>
                <JobCard job={job} />
                <div className={styles.actions}>
                  <form action={markJobComplete.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
                      <Printer size={15} /> Mark Printed
                    </button>
                  </form>
                  <form action={cancelJob.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnDanger}`}>
                      <X size={15} /> Cancel
                    </button>
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
          <h2 className={styles.sectionTitle}>
            <RefreshCcw size={18} className="animate-spin" /> Printing...
          </h2>
          <div className={styles.jobList}>
            {inProgress.map(job => (
              <Card key={job.id} className={`${styles.jobCard} ${styles.printingCard}`}>
                <JobCard job={job} />
                <div className={styles.actions}>
                  <form action={markJobComplete.bind(null, job.id)}>
                    <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
                      <CheckCircle size={15} /> Mark Complete
                    </button>
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
          <h2 className={styles.sectionTitle}>
            <History size={18} /> Recent History
          </h2>
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
          <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <p>No print jobs yet.</p>
          <p>Jobs submitted by customers will appear here.</p>
        </div>
      )}
    </Layout>
  );
}

function JobCard({ job }: { job: PrintJobData }) {
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
        <span className={styles.detail} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
           <FileText size={14} /> 
           <a href={job.fileUrl || `/api/files/${job.id}`} target="_blank" rel="noreferrer" className={styles.link}>{job.fileName}</a>
        </span>
        <span className={styles.detail} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
           <Palette size={14} /> {job.copies} × {job.pageCount} page{job.pageCount !== 1 ? 's' : ''} &bull; {job.colorMode === 'color' ? 'Color' : 'B&W'} &bull; {job.paperSize}
        </span>
        <span className={styles.detail} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
           <Banknote size={14} /> <strong>₹{job.totalAmount}</strong> cash
        </span>
        <span className={styles.detail} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
           <Clock size={14} /> {timeAgo}
        </span>
      </div>
    </div>
  );
}