/**
 * fixVideo.js
 * 1. Removes muted from video Liquid snippets
 * 2. Minimal CSS fix for video only (not images)
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

// All files to scan for muted
const VIDEO_LIQUID_FILES = [
  "snippets/product-media.liquid",
  "snippets/video.liquid",
  "snippets/media.liquid",
  "blocks/video.liquid",
  "blocks/_product-media-gallery.liquid",
  "blocks/_featured-product-gallery.liquid",
  "blocks/_media-without-appearance.liquid",
  "sections/product-information.liquid",
  "sections/featured-product.liquid",
];

// Also scan all JS files for muted
const VIDEO_JS_FILES = [
  "assets/media.js",
  "assets/media-gallery.js",
  "assets/video-background.js",
  "assets/product-card.js",
  "assets/product-form.js",
];

function removeMuted(content) {
  return content.replace(/\s+muted(?:=['"](?:muted|true)['"])?(?=[\s\/>])/gi, "");
}

async function main() {
  console.log("=== FurryFable: Fix Product Video ===\n");

  const theme = await getActiveTheme();
  console.log(`Active theme: "${theme.name}" (ID: ${theme.id})\n`);

  // --- FIX 1: Remove muted ---
  console.log("Step 1: Scanning for muted in Liquid + JS files...");
  let mutedFixed = 0;

  for (const key of [...VIDEO_LIQUID_FILES, ...VIDEO_JS_FILES]) {
    const asset = await getAsset(theme.id, key);
    if (!asset) { console.log(`  skip: ${key}`); continue; }

    const content = asset.value;
    const lower = content.toLowerCase();

    // Find ALL occurrences of muted in context
    let searchStart = 0;
    let foundInFile = false;
    while (true) {
      const idx = lower.indexOf("muted", searchStart);
      if (idx === -1) break;
      const ctx = content.slice(Math.max(0, idx - 100), idx + 100);
      // Only care about muted as an HTML attribute or JS property, not CSS color vars
      if (!ctx.includes("foreground-muted") && !ctx.includes("color-muted")) {
        console.log(`  FOUND in ${key}:`);
        console.log(`    ...${ctx.replace(/\n/g, " ")}...`);
        foundInFile = true;
      }
      searchStart = idx + 1;
    }

    if (foundInFile) {
      const fixed = removeMuted(content);
      if (fixed !== content) {
        await putAsset(theme.id, key, fixed);
        mutedFixed++;
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      console.log(`  ok: ${key}`);
    }
  }

  // --- FIX 2: Find a product with video via API ---
  console.log("\nStep 2: Finding products with video media...");
  const productsRes = await shopify.get("/products.json?limit=250&fields=id,title,media");
  const withVideo = productsRes.data.products.filter(p =>
    p.media && p.media.some(m => m.media_type === "video" || m.media_type === "external_video")
  );
  if (withVideo.length > 0) {
    console.log(`  Products with video: ${withVideo.map(p => p.title).join(", ")}`);
    console.log(`  Test URL: https://${SHOPIFY_STORE_DOMAIN}/products/${withVideo[0].handle}`);
  } else {
    console.log("  No products with video media found via API.");
  }

  // --- FIX 3: Minimal CSS - video only, no images ---
  console.log("\nStep 3: Updating CSS (video only, not images)...");

  const themeLiquid = await getAsset(theme.id, "layout/theme.liquid");
  if (!themeLiquid) { console.error("Cannot load theme.liquid"); process.exit(1); }

  // Minimal, targeted CSS - ONLY video elements, nothing else
  const VIDEO_FIX_CSS = `<!-- FurryFable Video Fix -->
<style>
  /* Only targets <video> elements — does NOT affect images */
  video { object-fit: contain !important; }
</style>
<!-- /FurryFable Video Fix -->`;

  let themeContent = themeLiquid.value;

  if (themeContent.includes("FurryFable Video Fix")) {
    themeContent = themeContent.replace(
      /<!-- FurryFable Video Fix -->[\s\S]*?<!-- \/FurryFable Video Fix -->/,
      VIDEO_FIX_CSS
    );
    console.log("  ✓ Updated video CSS (minimal, video only)");
  } else {
    themeContent = themeContent.replace("</head>", VIDEO_FIX_CSS + "\n</head>");
    console.log("  ✓ Injected minimal video CSS");
  }

  await putAsset(theme.id, "layout/theme.liquid", themeContent);

  console.log(`\n=== Done: muted removed from ${mutedFixed} file(s), CSS fixed ===`);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
