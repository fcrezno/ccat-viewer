import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * THE LAYER ART HAS TO BE SHIPPED WITH THE FUNCTION.
   *
   * /api/cat-art composes an opponent by reading `layers/` at runtime. Next
   * traces a route's dependencies STATICALLY, and a `readdir(join(cwd(),
   * 'layers'))` is invisible to that — so on Vercel the folder was simply not in
   * the bundle and the route returned 500 in production while working perfectly
   * on a local dev server, where the whole repo is on disk.
   *
   * Keys are route globs; values are globs resolved from the project root.
   */
  outputFileTracingIncludes: {
    "/api/cat-art": ["./layers/**"],
  },

  async headers() {
    return [
      {
        // V2 metadata files have no extension, because tokenURI is BASE_URI + tokenId.
        // Without this they'd serve as application/octet-stream and marketplaces
        // would refuse to parse them.
        source: "/v2/metadata/:id",
        headers: [
          { key: "Content-Type",  value: "application/json; charset=utf-8" },
          // Long cache is safe: a token's metadata never changes once revealed.
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          // Marketplaces and wallets fetch these cross-origin.
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/v2/images/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
