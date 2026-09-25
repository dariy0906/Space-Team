import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Keep dev HMR chunks separate from production builds. Reusing .next can
  // leave a browser tab loading an incompatible webpack runtime after a build.
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};
export default nextConfig;
