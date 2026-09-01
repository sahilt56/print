'use client';

import { useEffect, useState } from 'react';
import { Layout } from '@/components/ui/Layout';
import { Card } from '@/components/ui/Card';

export default function CafeActivityDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/super-admin/cafe-activity')
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) setData(resData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading cafe statuses...</div>;

  return (
    <Layout>
      <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Cyber Cafe Live Tracking</h1>

        {/* Analytics Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1.2rem', borderRadius: '12px', color: '#166534' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🟢 Active (Last 7 Days)</h4>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>{data?.summary?.activeCount || 0}</p>
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1.2rem', borderRadius: '12px', color: '#991b1b' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>🔴 Inactive / Unused</h4>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>{data?.summary?.inactiveCount || 0}</p>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1.2rem', borderRadius: '12px', color: '#1e40af' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>📊 Total Registered Cafes</h4>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0 0' }}>{data?.summary?.totalCafes || 0}</p>
          </div>
        </div>

        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>Detailed Status List</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {data?.cafes?.map((cafe: any) => {
            let badgeColor = '#dcfce7';
            let badgeTextCol = '#166534';
            if (cafe.status.includes('Inactive') || cafe.status.includes('Never')) {
              badgeColor = '#fee2e2';
              badgeTextCol = '#991b1b';
            } else if (cafe.status.includes('Sleeping')) {
              badgeColor = '#fef3c7';
              badgeTextCol = '#92400e';
            }

            return (
              <div key={cafe.id} style={{ padding: '1rem', background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
  <div>
    <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem' }}>{cafe.name}</h3>
    <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
      Login ID: <b>{cafe.loginId}</b> | Total Prints Handled: <b>{cafe.totalJobs}</b>
    </p>
    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#999' }}>
      Last Active: {cafe.lastActiveDate ? new Date(cafe.lastActiveDate).toLocaleString() : 'Never'}
    </p>
  </div>
  <div>
    <span style={{ background: badgeColor, color: badgeTextCol, padding: '0.35rem 0.85rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600 }}>
      {cafe.status}
    </span>
  </div>
</div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}