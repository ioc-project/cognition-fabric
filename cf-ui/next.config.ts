import type {NextConfig} from 'next';

const config: NextConfig = {
  output: 'standalone',
  experimental: {
    optimizeCss: false
  }
};

export default config;
