import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@huggingface/transformers"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      {
        source: "/brain/Specialistes",
        destination: "/brain/specialistes",
        permanent: false,
      },
      {
        source: "/brain/Spécialistes",
        destination: "/brain/specialistes",
        permanent: false,
      },
    ]
  },
};

export default nextConfig;
