/**
 * fixTheme.js
 * 1. Removes all FurryFable-injected blocks from theme.liquid (video fix, save badge)
 * 2. Adds clean heading CSS for product descriptions (shrinks h1/h2 to h3 size)
 */

import axios from "axios";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION = "2026-01",
} = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json",
  },
});

const HEADING_CSS = `<!-- FurryFable Heading Fix -->
<style>
  /* Normalize h1/h2 inside product descriptions — keeps them readable, not massive */
  .product__description h1,
  .product__description h2,
  .product-single__description h1,
  .product-single__description h2,
  .rte h1,
  .rte h2,
  [class*="product-description"] h1,
  [class*="product-description"] h2,
  [class*="product__description"] h1,
  [class*="product__description"] h2 {
    font-size: 1.25rem !important;
    font-weight: 700 !important;
    line-height: 1.4;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .product__description h3,
  .product-single__description h3,
  .rte h3,
  [class*="product-description"] h3 {
    font-size: 1.1rem !important;
    font-weight: 600 !important;
    line-height: 1.4;
    margin-top: 1.2rem;
    margin-bottom: 0.4rem;
  }
</style>
<!-- /FurryFable Heading Fix -->`;

async function main() {
  console.log("=== FurryFable: Fix Theme (headings + cleanup) ===\n");

  // Get active theme
  const res = await shopify.get("/themes.json");
  const theme = res.data.themes.find(t => t.role === "main");
  console.log(`Active theme: "${theme.name}" (ID: ${theme.id})\n`);

  // Load theme.liquid
  const assetRes = await shopify.get(`/themes/${theme.id}/assets.json`, {
    params: { "asset[key]": "layout/theme.liquid" },
  });
  let content = assetRes.data.asset.value;

  // Remove ALL previously injected FurryFable blocks
  const blocks = [
    "FurryFable Video Fix",
    "FurryFable Save Badge",
    "FurryFable Heading Fix",
    "FurryFable Discount Badge",
  ];
  for (const block of blocks) {
    const regex = new RegExp(`<!-- ${block} -->[\\s\\S]*?<!-- \\/${block} -->\\s*`, "g");
    if (regex.test(content)) {
      content = content.replace(
        new RegExp(`<!-- ${block} -->[\\s\\S]*?<!-- \\/${block} -->\\s*`, "g"),
        ""
      );
      console.log(`  ✓ Removed: ${block}`);
    }
  }

  // Inject heading CSS right before </head>
  content = content.replace("</head>", HEADING_CSS + "\n</head>");
  console.log("  ✓ Injected heading CSS");

  // Save
  await shopify.put(`/themes/${theme.id}/assets.json`, {
    asset: { key: "layout/theme.liquid", value: content },
  });
  console.log("\n✓ theme.liquid saved — all old injections removed, headings fixed.");
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
