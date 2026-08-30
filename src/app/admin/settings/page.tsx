import { getServerSession } from 'next-auth';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Layout } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';
import styles from './page.module.css';
import { SettingsForm } from './SettingsForm';
import { DownloadConfigButton } from './DownloadConfigButton';
import { prisma } from '@/lib/prisma';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  const cafeId = (session.user as any)?.cafeId;

  const cafe = await prisma.cafe.findUnique({
    where: { qrCode: cafeId },
  });

  if (!cafe) {
    return <div>Cafe not found.</div>;
  }

  // Build customer URL
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const customerUrl = `${protocol}://${host}/${cafe.qrCode}`;

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(customerUrl)}`;

  const pricingConfig = JSON.parse(cafe.pricingConfig || '{"bw": 2, "color": 10}');

  return (
    <Layout>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Manage your Cyber Cafe configuration &amp; branding</p>
      </div>

      {/* ── QR Code Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle}>📱 Your Cafe QR Code</h2>
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
            <p className={styles.qrCafeId}>Cafe ID: <strong>{cafe.qrCode}</strong></p>
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
              >
                ⬇️ Download QR Code (PNG)
              </a>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Pricing & Branding Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle}>⚙️ Cafe Branding &amp; Pricing Configuration</h2>
        <p className={styles.description}>
          Upload your cafe logo and set per-page printing prices.
        </p>
        <SettingsForm 
          initialBw={pricingConfig.bw} 
          initialColor={pricingConfig.color}
          initialLogoUrl={(cafe as any).logoUrl || null}
        />
      </Card>

      {/* ── Print Agent Setup Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle}>🖨️ Print Agent Setup</h2>
        <p className={styles.description}>
          Download the Print Agent to connect your cafe computer to the cloud.
          Place the <code>config.json</code> in the same folder as the agent and run it.
        </p>
        <ol className={styles.setupSteps}>
          <li>Download the <strong>QrPrintAgent.exe</strong> and <strong>config.json</strong></li>
          <li>Place both files in the same folder on your cafe computer</li>
          <li>Double-click <strong>QrPrintAgent.exe</strong> to start it</li>
          <li>Keep it running in the background while your cafe is open</li>
        </ol>
        <div className={styles.downloadButtons}>
          <DownloadConfigButton />
        </div>
      </Card>

      {/* ── Agent Key Card ── */}
      <Card className={styles.card}>
        <h2 className={styles.sectionTitle}>🔑 Agent Key</h2>
        <p className={styles.description}>
          This is the secret key used by your Local Print Agent. Do not share this with anyone.
        </p>
        <div className={styles.keyBox}>
          <code>{cafe.agentSecretKey || 'No key generated'}</code>
        </div>
      </Card>
      
      <div className={styles.footer}>
        <a href="/admin" className={styles.backLink}>&larr; Back to Dashboard</a>
      </div>
    </Layout>
  );
}