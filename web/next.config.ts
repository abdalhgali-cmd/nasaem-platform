import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // TEMP DIAGNOSTIC ONLY: enables browser source maps so the minified
    // React hydration error (#418) seen in production can be traced back
    // to its exact component/file/line via a Preview deployment.
    // Not for production use — revert before merging any real fix to main.
    productionBrowserSourceMaps: true,
};

export default nextConfig;
