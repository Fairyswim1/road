import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext applies this limit to multipart POSTs before route dispatch, too.
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
};

export default nextConfig;
