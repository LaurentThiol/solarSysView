import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@huggingface/transformers"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
