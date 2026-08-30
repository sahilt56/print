'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import styles from './super-admin.module.css';

type Cafe = { id: string; name: string; loginId: string | null; qrCode: string; createdAt: string };
type CreatedCafe = { name: string; loginId: string; qrCode: string; initialPassword: string };

export function SuperAdminDashboard({ initialCafes }: { initialCafes: Cafe[] }) {
  const [cafes, setCafes] = useState<Cafe[]>(initialCafes);
  const [cafeName, setCafeName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [created, setCreated] = useState<CreatedCafe | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function createCafe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setCreated(null);

    try {
      // 1. Ensure fetch hits the correct route (Check if route is /super-admin/cafes or /api/super-admin/cafes)
      // Replace this fetch call inside createCafe function:
const response = await fetch('/api/super-admin/cafes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cafeName, loginId, password }),
});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create cafe account.');

      // 2. Safe key extraction (Support both data.cafe.loginId and top-level response)
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

      // 3. Update table state instantly
      setCafes((current) => [
        {
          id: returnedId,
          name: returnedName,
          loginId: returnedLoginId,
          qrCode: returnedQrCode,
          createdAt: returnedCreatedAt,
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Super Admin</h1>
          <p>Create and manage cyber cafe login accounts.</p>
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
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value.toLowerCase())}
              required
              pattern="[a-z0-9_-]{3,40}"
              placeholder="e.g. raj_cafe"
            />
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
              <tr>
                <th>Cafe</th>
                <th>User ID</th>
                <th>Cafe ID</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cafes.map((cafe) => (
                <tr key={cafe.id}>
                  <td>{cafe.name}</td>
                  <td><b>{cafe.loginId || '—'}</b></td>
                  <td>{cafe.qrCode}</td>
                  <td>{new Date(cafe.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}