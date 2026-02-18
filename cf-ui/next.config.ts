import type {NextConfig} from 'next';
import path from 'path';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  logging: {
    fetches: {
      fullUrl: true
    }
  },

  env: {
    CFN_UI_API_TIMEOUT: process.env.CFN_UI_API_TIMEOUT
  },

  turbopack: {
    resolveAlias: {
      '@': './src'
    }
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
