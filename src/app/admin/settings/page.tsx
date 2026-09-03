import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Layout } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';
import { SettingsForm } from './SettingsForm';
import { DownloadConfigButton } from './DownloadConfigButton';
import dbConnect from '@/lib/dbConnect';
import Cafe from '@/models/Cafe';
import mongoose from 'mongoose';
import Link from 'next/link';
import { 
  QrCode, 
  Sliders, 
  Terminal, 
  Key, 
  ArrowLeft, 
  Download, 
  ExternalLink 
} from 'lucide-react';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/login');
  }

  await dbConnect();

  const userObj = session.user as { cafeId?: string; qrCode?: string; id?: string; loginId?: string; email?: string };
  const cafeId = userObj?.cafeId || userObj?.qrCode;
  const userId = userObj?.id || '';
  const loginId = userObj?.loginId || userObj?.email;

  const isObjectId = mongoose.Types.ObjectId.isValid(userId);

  const cafe = await Cafe.findOne({
    $or: [
      ...(cafeId ? [{ qrCode: cafeId }] : []),
      ...(isObjectId ? [{ _id: userId }] : []),
      ...(loginId ? [{ loginId: loginId }] : []),
    ],
  }).lean() as {
    qrCode?: string;
    loginId?: string;
    name?: string;
    pricingConfig?: string | { bw: number; color: number };
    logoUrl?: string;
    backgroundImageUrl?: string;
    agentSecretKey?: string;
  } | null;

  if (!cafe) {
    return (
      <Layout>
        <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <h2>Cafe not found.</h2>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>
            Please log out and log back in to refresh your admin session.
          </p>
          <Link
  href="/login"
  style={{
    display: 'inline-block',
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#2563eb',
    color: '#fff',
    borderRadius: '6px',
    textDecoration: 'none',
  }}
>
  Go to Login
</Link>
        </div>
      </Layout>
    );
  }

  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const customerUrl = `${protocol}://${host}/${cafe.qrCode || cafe.loginId}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(
    customerUrl
  )}`;

  let pricingConfig = { bw: 2, color: 10 };
  if (cafe.pricingConfig) {
    try {
      pricingConfig =
        typeof cafe.pricingConfig === 'string'
          ? JSON.parse(cafe.pricingConfig)
          : cafe.pricingConfig;
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <Layout>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Manage your Cyber Cafe configuration &amp; branding</p>
      </div>

      {/* ── QR Code Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <QrCode size={20} /> Your Cafe QR Code
        </h2>
        <p className={styles.description}>
          Print this QR code and place it at your counter. Customers scan it to upload files and submit print jobs.
        </p>
        <div className={styles.qrSection}>
          <div className={styles.qrWrapper}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt={`QR Code for ${cafe.name}`}
              width={220}
              height={220}
              className={styles.qrImage}
            />
            <p className={styles.qrCafeId}>
              Cafe ID: <strong>{cafe.qrCode}</strong>
            </p>
          </div>
          <div className={styles.qrInfo}>
            <p className={styles.qrUrl}>{customerUrl}</p>
            <p className={styles.qrInstruction}>
              👆 This is the link customers open when they scan your QR code.
            </p>
            <div className={styles.qrButtons}>
              <a
                href={qrImageUrl}
                download={`qr-${cafe.qrCode}.png`}
                target="_blank"
                rel="noreferrer"
                className={styles.downloadQrBtn}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={15} /> Download QR Code (PNG)
              </a>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Pricing & Branding Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sliders size={20} /> Cafe Branding &amp; Pricing Configuration
        </h2>
        <p className={styles.description}>
          Upload your cafe logo and set per-page printing prices.
        </p>
        <SettingsForm
          initialBw={pricingConfig.bw}
          initialColor={pricingConfig.color}
          initialLogoUrl={cafe.logoUrl || null}
          initialBackgroundImageUrl={cafe.backgroundImageUrl || null}
        />
      </Card>

      {/* ── Print Agent Setup Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={20} /> Print Agent Setup
        </h2>
        <p className={styles.description}>
          Download the Print Agent to connect your cafe computer to the cloud. Place the{' '}
          <code>config.json</code> in the same folder as the agent and run it.
        </p>
        <ol className={styles.setupSteps}>
          <li>
            Download the <strong>QrPrintAgent.exe</strong> and <strong>config.json</strong>
          </li>
          <li>Place both files in the same folder on your cafe computer</li>
          <li>
            Double-click <strong>QrPrintAgent.exe</strong> to start it
          </li>
          <li>Keep it running in the background while your cafe is open</li>
        </ol>
        <div className={styles.downloadButtons}>
          <DownloadConfigButton />
        </div>
      </Card>

      {/* ── Agent Key Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Key size={20} /> Agent Key
        </h2>
        <p className={styles.description}>
          This is the secret key used by your Local Print Agent. Do not share this with anyone.
        </p>
        <div className={styles.keyBox}>
          <code>{cafe.agentSecretKey || 'No key generated'}</code>
        </div>
      </Card>

      <div className={styles.footer}>
        <Link
  href="/admin"
  className={styles.backLink}
  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
>
  <ArrowLeft size={16} /> Back to Dashboard
</Link>
      </div>
    </Layout>
  );
}