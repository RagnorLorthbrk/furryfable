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
const SAVE_BADGE_STYLE = `
<!-- FurryFable Save Badge -->
<style>
  .ff-save-badge {
    display: inline-block;
    background: #27ae60;
    color: #fff;
    font-weight: 700;
    font-size: 0.85em;
    padding: 3px 10px;
    border-radius: 4px;
    margin-left: 8px;
    vertical-align: middle;
    letter-spacing: 0.02em;
  }
  /* Card / collection grid badges */
  .ff-save-badge-card {
    position: absolute;
    top: 10px;
    left: 10px;
    background: #27ae60;
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
  // FurryFable Save Badge — dynamic injection
  (function() {
    function calcSavePct(compare, price) {
      if (!compare || compare <= price) return 0;
      return Math.round((compare - price) / compare * 100);
    }
    function injectBadgeNearPrice(priceEl, pct) {
      if (!pct) return;
      if (priceEl.parentNode.querySelector('.ff-save-badge')) return; // already there
      var badge = document.createElement('span');
      badge.className = 'ff-save-badge';
      badge.textContent = 'Save ' + pct + '%';
      priceEl.parentNode.insertBefore(badge, priceEl.nextSibling);
    }

    function run() {
      // Product page — use Shopify global
      if (typeof window.ShopifyAnalytics !== 'undefined' && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
        var meta = window.ShopifyAnalytics.meta.product;
        var compare = meta.compareAtPrice ? meta.compareAtPrice / 100 : 0;
        var price = meta.price ? meta.price / 100 : 0;
        var pct = calcSavePct(compare, price);
        if (pct > 0) {
          document.querySelectorAll('.price--on-sale .price__regular, .price--on-sale .price-item--sale, [class*="price-item--sale"], .price__sale').forEach(function(el) {
            injectBadgeNearPrice(el, pct);
          });
        }
      }

      // Collection / related products cards — look for sale price elements
      document.querySelectorAll('[data-compare-at-price]').forEach(function(el) {
        var compare = parseFloat(el.getAttribute('data-compare-at-price')) / 100;
        var priceEl = el.closest('[data-product-card], .card, .product-card, li.grid__item')
          ? el.closest('[data-product-card], .card, .product-card, li.grid__item').querySelector('[data-price], .price-item--sale, .price__sale')
          : null;
        var price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : 0;
        var pct = calcSavePct(compare, price);
        if (pct > 0) {
          var container = el.closest('[data-product-card], .card, .product-card, li.grid__item');
          if (container && !container.querySelector('.ff-save-badge-card')) {
            var badge = document.createElement('span');
            badge.className = 'ff-save-badge-card';
            badge.textContent = 'Save ' + pct + '%';
            container.style.position = 'relative';
            container.prepend(badge);
          }
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }

    // Re-run for dynamic content (quick view, etc.)
    var observer = new MutationObserver(function() { run(); });
    observer.observe(document.body, { childList: true, subtree: true });
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
