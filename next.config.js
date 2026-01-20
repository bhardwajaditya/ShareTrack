/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve Node.js built-in modules on the client
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        aws4: false,
        'mongodb-client-encryption': false,
        snappy: false,
        '@aws-sdk/credential-providers': false,
        'mongodb': false,
        'timers': false,
        'timers/promises': false,
        'crypto': false,
        'stream': false,
        'http': false,
        'https': false,
        'zlib': false,
        'path': false,
        'os': false,
        'util': false,
        'buffer': false,
        'url': false,
        'querystring': false,
        'events': false,
        'string_decoder': false,
        'punycode': false,
        'constants': false,
        'assert': false,
        'process': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig; 