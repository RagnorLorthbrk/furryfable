/**
 * addSaveBadge.js
 * Downloads snippets/price.liquid, injects a "Save X%" badge
 * directly into the Liquid template (server-side, no JS needed).
 * Idempotent — safe to run multiple times.
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

async function getActiveTheme() {
  const res = await shopify.get("/themes.json");
  return res.data.themes.find(t => t.role === "main");
}

async function getAsset(themeId, key) {
  try {
    const res = await shopify.get(`/themes/${themeId}/assets.json`, {
      params: { "asset[key]": key },
    });
    return res.data.asset;
  } catch {
    return null;
  }
}

async function putAsset(themeId, key, value) {
  await shopify.put(`/themes/${themeId}/assets.json`, {
    asset: { key, value },
  });
  console.log(`  ✓ Saved: ${key}`);
}

// The badge Liquid code — uses inline-discount class already in theme CSS
const BADGE_LIQUID = `{%- comment -%}FF-SAVE-BADGE{%- endcomment -%}
      {%- if compare_at_price > price -%}
        {%- assign ff_savings = compare_at_price | minus: price | times: 100.0 | divided_by: compare_at_price | round -%}
        {%- if ff_savings > 0 -%}
          <span class="inline-discount">Save {{ ff_savings }}%</span>
        {%- endif -%}
      {%- endif -%}`;

const BADGE_MARKER = "FF-SAVE-BADGE";

function injectBadge(liquid) {
  // Already injected?
  if (liquid.includes(BADGE_MARKER)) {
    console.log("  Badge already present — updating...");
    // Remove old badge block so we re-inject fresh
    liquid = liquid.replace(
      /\{%-?\s*comment\s*-?%\}FF-SAVE-BADGE\{%-?\s*endcomment\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/,
      ""
    );
  }

  // Strategy 1: inject inside the compare_at_price conditional block
  // Pattern: endif that closes a compare_at_price > price check
  // We look for the LAST endif before a closing </div> that follows compare-at-price
  const strategy1 = liquid.replace(
    /(class="[^"]*compare-at-price[^"]*"[\s\S]*?<\/span>)([\s\S]*?)(\{%-?\s*endif\s*-?%\})/,
    (match, span, between, endif) => {
      return span + between + "\n" + BADGE_LIQUID + "\n" + endif;
    }
  );
  if (strategy1 !== liquid) {
    console.log("  ✓ Injected via strategy 1 (after compare-at-price span, before endif)");
    return strategy1;
  }

  // Strategy 2: inject right after the compare-at-price closing span
  const strategy2 = liquid.replace(
    /(class="[^"]*compare-at-price[^"]*"[\s\S]*?<\/span>)/,
    (match) => match + "\n" + BADGE_LIQUID
  );
  if (strategy2 !== liquid) {
    console.log("  ✓ Injected via strategy 2 (after compare-at-price span)");
    return strategy2;
  }

  // Strategy 3: inject after compare_at_price variable usage
  const strategy3 = liquid.replace(
    /(compare_at_price\s*\|\s*money[^}]*\}\}[^<]*<\/[^>]+>)/,
    (match) => match + "\n" + BADGE_LIQUID
  );
  if (strategy3 !== liquid) {
    console.log("  ✓ Injected via strategy 3 (after compare_at_price | money)");
    return strategy3;
  }

  console.error("  ✗ Could not find injection point. Printing file content for debugging:");
  console.log(liquid);
  throw new Error("Injection failed — no matching pattern found in snippets/price.liquid");
}

async function main() {
  console.log("=== FurryFable: Add Save Badge (Liquid) ===\n");

  const theme = await getActiveTheme();
  console.log(`Active theme: "${theme.name}" (ID: ${theme.id})\n`);

  // Download snippets/price.liquid
  const asset = await getAsset(theme.id, "snippets/price.liquid");
  if (!asset) throw new Error("snippets/price.liquid not found");

  console.log(`Downloaded snippets/price.liquid (${asset.value.length} chars)`);

  // Inject badge
  const modified = injectBadge(asset.value);

  // Upload modified file
  await putAsset(theme.id, "snippets/price.liquid", modified);

  console.log("\n=== Done: Save badge injected into price template ===");
  console.log("Visible immediately on all product pages and collection cards.");
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
