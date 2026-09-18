import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (minimal server.js +
  // only the dependencies actually used) so the exhibition PC can run the
  // app with just a bundled Node binary — no `npm install` on that machine.
  output: "standalone",
};

export default nextConfig;
