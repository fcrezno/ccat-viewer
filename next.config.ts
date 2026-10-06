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
      /*
       * THE BATTLE'S FILES, KEPT AN HOUR. The loading screen fetches all of them
       * up front (components/LoadingScreen, lib/battleAssets) — JP, 2026-10-06:
       * "make it so the loading screen loads everything for the battle scene".
       * Vercel's default for public files is max-age=0, must-revalidate: cached,
       * but every use asks the server again first, so a preloaded picture still
       * waited on a round trip when the fight needed it. An hour holds them for a
       * session; after it, the browser checks in the background while it shows
       * the copy it has, so a changed file arrives within a visit or two.
       */
      ...["/game/:file*", "/title/:file*", "/yard/items/:file*"].map(source => ({
        source,
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      })),
    ];
  },
};

export default nextConfig;
