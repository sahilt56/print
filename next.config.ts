import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Security configuration */
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          value: 'geolocation=(), microphone=(), camera=(self)',
        },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ],
    },
    // API routes - stricter CSP
    {
      source: '/api/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "default-src 'none'",
        },
      ],
    },
  ],
};

export default nextConfig;
