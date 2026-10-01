/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  experimental: {
    authInterrupts: true,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
