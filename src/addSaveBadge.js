/**
 * addSaveBadge.js
 * Injects a dynamic "Save X%" badge into the Shopify theme.
 * Adds a snippet + injects it into product price areas via theme.liquid JS.
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
  console.log(`  ✓ Updated: ${key}`);
}

// The save-badge snippet (Liquid)
const SAVE_BADGE_SNIPPET = `{% comment %}Save badge — auto-injected by FurryFable automation{% endcomment %}
{% if product.compare_at_price_max > product.price_min %}
  {% assign savings_pct = product.compare_at_price_max | minus: product.price_min | times: 100.0 | divided_by: product.compare_at_price_max | round %}
  {% if savings_pct > 0 %}
    <span class="ff-save-badge">Save {{ savings_pct }}%</span>
  {% endif %}
{% endif %}`;

// CSS + JS injected into theme.liquid (before </head>)
// Uses existing .inline-discount class from theme CSS (green, bold, inline)
// Adds .ff-save-badge-card only for collection grid cards
const SAVE_BADGE_STYLE = `
<!-- FurryFable Save Badge -->
<style>
  .ff-save-badge-card {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #1db954;
    color: #fff;
    font-weight: 700;
    font-size: 0.78em;
    padding: 2px 8px;
    border-radius: 4px;
    z-index: 2;
    pointer-events: none;
  }
</style>
<script>
  // FurryFable Save Badge
  // Theme uses .compare-at-price + .price-item--sale (no <s>/<del> tags)
  (function() {
    function parsePrice(el) {
      var t = (el ? el.textContent : '').replace(/,/g, '');
      var m = t.match(/\d+\.?\d*/);
      return m ? parseFloat(m[0]) : 0;
    }
    function calcPct(compare, sale) {
      if (!compare || !sale || compare <= sale) return 0;
      return Math.round((compare - sale) / compare * 100);
    }

    function run() {
      // Theme structure:
      // div.price__sale
      //   span.price-item__group > span.price-item--sale.price > span.glc-money ($X)
      //   span.price-item__group > span.price-item--regular.compare-at-price > span.glc-money ($Y)
      document.querySelectorAll('.compare-at-price').forEach(function(compareEl) {
        // Skip if badge already added
        if (compareEl.parentNode.querySelector('.inline-discount')) return;

        var comparePrice = parsePrice(compareEl);
        if (!comparePrice) return;

        // Go up to div.price__sale which contains both price groups
        var priceBlock = compareEl.closest('.price__sale') || compareEl.parentNode.parentNode;
        var saleEl = priceBlock ? priceBlock.querySelector('.price-item--sale') : null;
        var salePrice = parsePrice(saleEl);

        var pct = calcPct(comparePrice, salePrice);
        if (!pct) return;

        // Insert badge after the compare-at-price's parent group span
        var groupSpan = compareEl.parentNode;
        var badge = document.createElement('span');
        badge.className = 'inline-discount';
        badge.textContent = 'Save ' + pct + '%';
        groupSpan.insertAdjacentElement('afterend', badge);

        // Card badge on collection/related product cards
        var card = compareEl.closest('li, article, [class*="card"], [class*="product-item"], [class*="grid__item"]');
        if (card && !card.querySelector('.ff-save-badge-card')) {
          var cardBadge = document.createElement('span');
          cardBadge.className = 'ff-save-badge-card';
          cardBadge.textContent = 'Save ' + pct + '%';
          card.style.position = 'relative';
          card.prepend(cardBadge);
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  })();
</script>
<!-- /FurryFable Save Badge -->`;

const BADGE_MARKER = "<!-- FurryFable Save Badge -->";

async function main() {
  console.log("=== FurryFable: Add Save Badge to Theme ===\n");

  const theme = await getActiveTheme();
  console.log(`Active theme: "${theme.name}" (ID: ${theme.id})\n`);

  // 1. Create/update the snippet
  await putAsset(theme.id, "snippets/ff-save-badge.liquid", SAVE_BADGE_SNIPPET);

  // 2. Inject CSS+JS into theme.liquid before </head>
  const themeLayout = await getAsset(theme.id, "layout/theme.liquid");
  if (!themeLayout) {
    console.error("Could not load layout/theme.liquid");
    process.exit(1);
  }

  let themeContent = themeLayout.value;

  if (themeContent.includes(BADGE_MARKER)) {
    // Already injected — update it by replacing the block
    const start = themeContent.indexOf(BADGE_MARKER);
    const end = themeContent.indexOf("<!-- /FurryFable Save Badge -->") + "<!-- /FurryFable Save Badge -->".length;
    themeContent = themeContent.slice(0, start) + SAVE_BADGE_STYLE.trim() + themeContent.slice(end);
    console.log("  ↻ Updated existing badge injection in theme.liquid");
  } else {
    // First time — inject before </head>
    themeContent = themeContent.replace("</head>", SAVE_BADGE_STYLE.trim() + "\n</head>");
    console.log("  ✓ Injected badge code into theme.liquid");
  }

  await putAsset(theme.id, "layout/theme.liquid", themeContent);

  console.log("\n=== Done: Save badge is live on the store ===");
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
