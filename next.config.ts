import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Konva requires 'canvas' on server — mock it out
      config.externals = [...(config.externals ?? []), "canvas"];
    }
    return config;
  },
};

export default nextConfig;
