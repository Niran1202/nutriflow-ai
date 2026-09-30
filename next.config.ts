import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build, used by the desktop app (see desktop/).
  output: "standalone",
  // Native SQLite driver: keep it as a real node_modules dependency instead of bundling it.
  serverExternalPackages: ["@libsql/client", "@prisma/adapter-libsql", "libsql"],
};

export default nextConfig;
