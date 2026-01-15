import type {NextConfig} from 'next';
import path from 'path';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  env: {
    CSP_UI_API_BASE_URL: process.env.CSP_UI_API_BASE_URL,
    CSP_UI_API_TIMEOUT: process.env.CSP_UI_API_TIMEOUT
  },
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
