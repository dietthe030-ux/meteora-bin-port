/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@rome-protocol/registry"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
