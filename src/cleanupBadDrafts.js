import axios from "axios";

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

async function main() {
  console.log("=== Cleaning up draft products with bad variant names ===\n");

  // Get all draft products (cursor-based pagination)
  let drafts = [];
  let url = "/products.json?status=draft&limit=50";

  while (url) {
    const res = await shopify.get(url);
    drafts.push(...(res.data.products || []));

    // Check Link header for next page
    const link = res.headers["link"] || "";
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      url = nextMatch[1].replace(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`, "");
    } else {
      url = null;
    }
  }

  console.log(`Found ${drafts.length} draft products\n`);

  let deleted = 0;
  for (const p of drafts) {
    const variantNames = p.variants.map(v => v.option1 || v.title).join(", ");
    console.log(`Product: ${p.title}`);
    console.log(`  Variants: ${variantNames.substring(0, 150)}`);

    // Detect bad variants
    const hasBadVariants = p.variants.some(v => {
      const name = (v.option1 || v.title || "").toLowerCase();
      return (
        name.startsWith("default") ||
        name.includes("long=") ||
        name.includes("width=") ||
        name.includes("height=") ||
        /^variant \d+/.test(name) ||
        /^style \d+/.test(name)
      );
    });

    if (hasBadVariants) {
      console.log("  → DELETING (bad variants)");
      await shopify.delete(`/products/${p.id}.json`);
      console.log("  → Deleted ✓");
      deleted++;
      await new Promise(r => setTimeout(r, 500));
    } else {
      console.log("  → KEEPING (good variants)");
    }
  }

  console.log(`\n=== Done: Deleted ${deleted}/${drafts.length} drafts ===`);
}

main().catch(err => {
  console.error("Error:", err.message);
  if (err.response) console.error("Response:", JSON.stringify(err.response.data));
  process.exit(1);
});
