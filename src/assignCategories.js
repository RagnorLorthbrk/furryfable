/**
 * assignCategories.js
 * Assigns Shopify standard product taxonomy categories to products that have none.
 * Uses product_type to map to Google/Shopify taxonomy for GMC compatibility.
 */

import axios from "axios";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION = "2026-01",
  GEMINI_API_KEY,
} = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json",
  },
});

// Shopify standard taxonomy GIDs for pet products
// Source: Shopify standard product taxonomy (Google Shopping compatible)
const TAXONOMY_MAP = {
  // Dog supplies
  "dog toy":              "gid://shopify/TaxonomyCategory/sg-4-14-2-16",
  "dog toys":             "gid://shopify/TaxonomyCategory/sg-4-14-2-16",
  "dog harness":          "gid://shopify/TaxonomyCategory/sg-4-14-2-6",
  "dog leash":            "gid://shopify/TaxonomyCategory/sg-4-14-2-6",
  "dog collar":           "gid://shopify/TaxonomyCategory/sg-4-14-2-5",
  "dog bed":              "gid://shopify/TaxonomyCategory/sg-4-14-2-1",
  "dog apparel":          "gid://shopify/TaxonomyCategory/sg-4-14-2-2",
  "dog clothing":         "gid://shopify/TaxonomyCategory/sg-4-14-2-2",
  "dog grooming":         "gid://shopify/TaxonomyCategory/sg-4-14-2-8",
  "dog nail":             "gid://shopify/TaxonomyCategory/sg-4-14-2-8",
  "dog feeder":           "gid://shopify/TaxonomyCategory/sg-4-14-2-9",
  "dog bowl":             "gid://shopify/TaxonomyCategory/sg-4-14-2-9",
  "dog water bottle":     "gid://shopify/TaxonomyCategory/sg-4-14-2-9",
  "dog training":         "gid://shopify/TaxonomyCategory/sg-4-14-2-18",
  "dog carrier":          "gid://shopify/TaxonomyCategory/sg-4-14-2-4",
  "dog mat":              "gid://shopify/TaxonomyCategory/sg-4-14-2-1",
  "dog pad":              "gid://shopify/TaxonomyCategory/sg-4-14-2-1",
  "dog shaver":           "gid://shopify/TaxonomyCategory/sg-4-14-2-8",
  "dog clipper":          "gid://shopify/TaxonomyCategory/sg-4-14-2-8",
  "dog comb":             "gid://shopify/TaxonomyCategory/sg-4-14-2-8",
  "dog brush":            "gid://shopify/TaxonomyCategory/sg-4-14-2-8",
  // Cat supplies
  "cat toy":              "gid://shopify/TaxonomyCategory/sg-4-14-1-14",
  "cat toys":             "gid://shopify/TaxonomyCategory/sg-4-14-1-14",
  "cat collar":           "gid://shopify/TaxonomyCategory/sg-4-14-1-4",
  "cat bed":              "gid://shopify/TaxonomyCategory/sg-4-14-1-1",
  "cat furniture":        "gid://shopify/TaxonomyCategory/sg-4-14-1-6",
  "cat tree":             "gid://shopify/TaxonomyCategory/sg-4-14-1-6",
  "cat wall":             "gid://shopify/TaxonomyCategory/sg-4-14-1-6",
  "cat mattress":         "gid://shopify/TaxonomyCategory/sg-4-14-1-1",
  "cat nest":             "gid://shopify/TaxonomyCategory/sg-4-14-1-1",
  "cat grooming":         "gid://shopify/TaxonomyCategory/sg-4-14-1-8",
  "cat litter":           "gid://shopify/TaxonomyCategory/sg-4-14-1-10",
  "cat feeder":           "gid://shopify/TaxonomyCategory/sg-4-14-1-7",
  "cat water":            "gid://shopify/TaxonomyCategory/sg-4-14-1-7",
  // Pet (general)
  "pet toy":              "gid://shopify/TaxonomyCategory/sg-4-14-16",
  "pet bed":              "gid://shopify/TaxonomyCategory/sg-4-14-1",
  "pet grooming":         "gid://shopify/TaxonomyCategory/sg-4-14-9",
  "pet apparel":          "gid://shopify/TaxonomyCategory/sg-4-14-2",
  "pet harness":          "gid://shopify/TaxonomyCategory/sg-4-14-2-6",
  "pet collar":           "gid://shopify/TaxonomyCategory/sg-4-14-2-5",
  "pet leash":            "gid://shopify/TaxonomyCategory/sg-4-14-2-6",
  "pet water bottle":     "gid://shopify/TaxonomyCategory/sg-4-14-9",
  "pet feeder":           "gid://shopify/TaxonomyCategory/sg-4-14-9",
  "pet training":         "gid://shopify/TaxonomyCategory/sg-4-14-16",
  "pet carrier":          "gid://shopify/TaxonomyCategory/sg-4-14-3",
  "pet mat":              "gid://shopify/TaxonomyCategory/sg-4-14-1",
  "pet pad":              "gid://shopify/TaxonomyCategory/sg-4-14-1",
  "pet supplies":         "gid://shopify/TaxonomyCategory/sg-4-14",
  "harness and leash":    "gid://shopify/TaxonomyCategory/sg-4-14-2-6",
  "safety":               "gid://shopify/TaxonomyCategory/sg-4-14-16",
  "anxiety":              "gid://shopify/TaxonomyCategory/sg-4-14-16",
};

function findTaxonomyId(productType, title) {
  const search = `${productType} ${title}`.toLowerCase();
  // Longest match wins
  let bestKey = "";
  let bestId = null;
  for (const [key, id] of Object.entries(TAXONOMY_MAP)) {
    if (search.includes(key) && key.length > bestKey.length) {
      bestKey = key;
      bestId = id;
    }
  }
  return bestId || "gid://shopify/TaxonomyCategory/sg-4-14"; // fallback: Pet Supplies
}

async function getAllProducts() {
  const products = [];
  let url = "/products.json?limit=250&fields=id,title,product_type,product_category";
  while (url) {
    const res = await shopify.get(url);
    products.push(...res.data.products);
    const link = res.headers["link"] || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next
      ? next[1].replace(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`, "")
      : null;
  }
  return products;
}

async function main() {
  console.log("=== FurryFable: Assign Product Categories ===\n");

  const products = await getAllProducts();
  console.log(`Loaded ${products.length} products\n`);

  let updated = 0;
  let skipped = 0;

  for (const product of products) {
    // Skip if already categorized
    const existingCat = product.product_category?.product_taxonomy_node_id;
    if (existingCat) {
      skipped++;
      continue;
    }

    const taxonomyId = findTaxonomyId(product.product_type || "", product.title || "");

    try {
      await shopify.put(`/products/${product.id}.json`, {
        product: {
          id: product.id,
          product_category: {
            product_taxonomy_node_id: taxonomyId,
          },
        },
      });

      const label = taxonomyId.split("/").pop();
      console.log(`  ✓ "${product.title}" [${product.product_type}] → ${label}`);
      updated++;
    } catch (err) {
      console.log(`  ✗ "${product.title}": ${err.response?.data?.errors || err.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== Done: ${updated} categorized, ${skipped} already had category ===`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
