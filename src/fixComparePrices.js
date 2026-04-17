/**
 * fixComparePrices.js
 * Sets compare_at_price on all variants that don't have one.
 * compare_at_price = price * 1.45, rounded up to nearest dollar.
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

async function getAllProducts() {
  const products = [];
  let url = "/products.json?limit=250&fields=id,title,variants";
  while (url) {
    const res = await shopify.get(url);
    products.push(...res.data.products);
    const link = res.headers["link"] || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    if (next) {
      // extract just the path+query from the full URL
      const fullUrl = next[1];
      url = fullUrl.replace(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`, "");
    } else {
      url = null;
    }
  }
  return products;
}

async function main() {
  console.log("=== FurryFable: Fix Compare-At Prices ===\n");

  const products = await getAllProducts();
  console.log(`Loaded ${products.length} products\n`);

  let updated = 0;
  let skipped = 0;

  for (const product of products) {
    for (const variant of product.variants) {
      const price = parseFloat(variant.price);
      const compareAt = parseFloat(variant.compare_at_price);

      // Skip if already has a compare_at_price
      if (compareAt && compareAt > 0) {
        skipped++;
        continue;
      }

      if (!price || price <= 0) {
        skipped++;
        continue;
      }

      // Round up to nearest dollar at 1.45x
      const newCompareAt = Math.ceil(price * 1.45).toFixed(2);

      await shopify.put(`/variants/${variant.id}.json`, {
        variant: {
          id: variant.id,
          compare_at_price: newCompareAt,
        },
      });

      console.log(`  ✓ "${product.title}" — variant ${variant.id}: $${price} → compare at $${newCompareAt}`);
      updated++;

      // Respect Shopify rate limit (2 req/s)
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n=== Done: ${updated} variants updated, ${skipped} already had compare price ===`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
