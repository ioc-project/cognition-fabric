import type {NextConfig} from 'next';
import path from 'path';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve || {alias: {}};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src')
    };
    return config;
  }
};

export default config;
