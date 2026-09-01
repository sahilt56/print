'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import styles from './super-admin.module.css';

type Cafe = { 
  id: string; 
  name: string; 
  loginId: string | null; 
  qrCode: string; 
  createdAt: string;
  totalJobs?: number;
  status?: string;
};

type CreatedCafe = { name: string; loginId: string; qrCode: string; initialPassword: string };

export function SuperAdminDashboard({ initialCafes }: { initialCafes: Cafe[] }) {
  const [cafes, setCafes] = useState<Cafe[]>(initialCafes);
  const [cafeName, setCafeName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<CreatedCafe | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 🎲 Random User ID Generator Function (Starts with 'cafe-')
  const generateRandomUserId = () => {
    const randomHex = Math.random().toString(36).substring(2, 8); // 6 character random hex/string
    setLoginId(`cafe-${randomHex}`);
  };

  async function createCafe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setCreated(null);

    try {
      const response = await fetch('/api/super-admin/cafes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeName, loginId, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create cafe account.');

      const returnedLoginId = data.cafe?.loginId || data.loginId || loginId;
      const returnedQrCode = data.cafe?.qrCode || data.qrCode || '';
      const returnedName = data.cafe?.name || cafeName;
      const returnedId = data.cafe?.id || data.cafe?._id || Date.now().toString();
      const returnedCreatedAt = data.cafe?.createdAt || new Date().toISOString();

      const newCreatedCafe: CreatedCafe = {
        name: returnedName,
        loginId: returnedLoginId,
        qrCode: returnedQrCode,
        initialPassword: data.initialPassword || password,
      };

      setCreated(newCreatedCafe);

      setCafes((current) => [
        {
          id: returnedId,
          name: returnedName,
          loginId: returnedLoginId,
          qrCode: returnedQrCode,
          createdAt: returnedCreatedAt,
          totalJobs: 0,
          status: 'Never Used',
        },
        ...current,
      ]);

      setCafeName('');
      setLoginId('');
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create cafe account.');
    } finally {
      setLoading(false);
    }
  }

  // 🗑️ Delete Cafe Function
  async function deleteCafe(cafeId: string, cafeName: string) {
    if (!confirm(`Kya aap sach mein "${cafeName}" cafe ko permanent delete karna chahte hain?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/super-admin/cafes?id=${cafeId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to delete cafe.');

      setCafes((current) => current.filter((c) => c.id !== cafeId));
    } catch (err: any) {
      alert(err.message || 'Error deleting cafe.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Super Admin</h1>
          <p>Create and manage cyber cafe login accounts &amp; track live activity.</p>
        </div>
        <form action="/api/auth/signout" method="POST">
          <input type="hidden" name="callbackUrl" value="/login" />
          <Button type="submit" variant="secondary">Logout</Button>
        </form>
      </header>

      <Card className={styles.card}>
        <h2>Create cyber cafe account</h2>
        <form onSubmit={createCafe} className={styles.form}>
          <label>
            Cafe name
            <input
              value={cafeName}
              onChange={(event) => setCafeName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </label>
          <label>
            User ID
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value.toLowerCase())}
                required
                pattern="[a-z0-9_-]{3,40}"
                placeholder="e.g. cafe-a1b2c3"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={generateRandomUserId}
                title="Generate Random User ID"
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #cbd5e1)',
                  background: 'var(--card-bg, #f8fafc)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >
                🔄
              </button>
            </div>
          </label>
          <label>
            Initial password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create account'}
          </Button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        {created && (
          <div className={styles.credentials}>
            <strong>Give these credentials to {created.name}:</strong>
            <span>User ID: <b>{created.loginId}</b></span>
            <span>Password: <b>{created.initialPassword}</b></span>
            <span>Cafe ID: <b>{created.qrCode}</b></span>
            <small>Copy the password now. It will not be shown again.</small>
          </div>
        )}
      </Card>

      <Card className={styles.card}>
        <h2>Created cafes ({cafes.length})</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr><th>Cafe</th><th>User ID</th><th>Cafe ID</th><th>Status &amp; Prints</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {cafes.map((cafe) => {
                let badgeBg = '#dcfce7';
                let badgeColor = '#166534';
                if (cafe.status === 'Never Used') {
                  badgeBg = '#fee2e2';
                  badgeColor = '#991b1b';
                } else if (cafe.status === 'Sleeping') {
                  badgeBg = '#fef3c7';
                  badgeColor = '#92400e';
                }

                return (
                  <tr key={cafe.id}>
                    <td>{cafe.name}</td>
                    <td><b>{cafe.loginId || '—'}</b></td>
                    <td>{cafe.qrCode}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ background: badgeBg, color: badgeColor, padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>{cafe.status || 'Active'}</span>
                        <span style={{ fontSize: '0.85rem', color: '#555' }}>({cafe.totalJobs || 0} prints)</span>
                      </div>
                    </td>
                    <td>{new Date(cafe.createdAt).toLocaleDateString('en-IN')}</td>
                    <td>
                      <button 
                        type="button"
                        onClick={() => deleteCafe(cafe.id, cafe.name)}
                        style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}