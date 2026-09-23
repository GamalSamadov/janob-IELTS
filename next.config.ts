import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The bottom-left corner holds the account menu.
  devIndicators: { position: "bottom-right" },
  async headers() {
    return [
      {
        // Browsers check for a new service worker on every visit: no cache may hold back an update.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
