const API = process.env.API_URL || 'http://127.0.0.1:4000';
/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
  transpilePackages: ['@nexus/ui', '@nexus/business-logic'],
  // The browser only talks to this origin; the API receives its cookies through this proxy.
  async rewrites() { return [{ source: '/api/v1/:path*', destination: `${API}/api/v1/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' } ] }]; },
};
