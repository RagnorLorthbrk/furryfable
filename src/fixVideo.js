/**
 * fixVideo.js
 * 1. Removes muted from video Liquid snippets
 * 2. Injects CSS to fix video cropping (object-fit: contain)
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

// Files most likely to contain muted on video elements
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

function removeMuted(content) {
  // Remove standalone muted attribute (with or without value)
  return content.replace(/\s+muted(?:=['"](?:muted|true)['"])?(?=[\s\/>])/gi, "");
}

async function main() {
  console.log("=== FurryFable: Fix Product Video ===\n");

  const theme = await getActiveTheme();
  console.log(`Active theme: "${theme.name}" (ID: ${theme.id})\n`);

  // --- FIX 1: Remove muted from video Liquid files ---
  console.log("Step 1: Scanning for muted attribute in video Liquid files...");
  let mutedFixed = 0;

  for (const key of VIDEO_LIQUID_FILES) {
    const asset = await getAsset(theme.id, key);
    if (!asset) { console.log(`  skip: ${key} (not found)`); continue; }

    const content = asset.value;
    if (!content.toLowerCase().includes("muted")) {
      console.log(`  ok:   ${key}`);
      continue;
    }

    // Show context around muted
    const idx = content.toLowerCase().indexOf("muted");
    const ctx = content.slice(Math.max(0, idx - 80), idx + 80);
    console.log(`  FOUND muted in ${key}:`);
    console.log(`    ...${ctx}...`);

    const fixed = removeMuted(content);
    if (fixed !== content) {
      await putAsset(theme.id, key, fixed);
      mutedFixed++;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (mutedFixed === 0) {
    console.log("  No muted attributes found in video Liquid files.");
    console.log("  (Videos may not be on the tested product — muted will be removed if found when videos are present)\n");
  }

  // --- FIX 2: CSS override for video crop ---
  console.log("\nStep 2: Injecting CSS fix for video crop...");

  const themeLiquid = await getAsset(theme.id, "layout/theme.liquid");
  if (!themeLiquid) { console.error("Cannot load theme.liquid"); process.exit(1); }

  const VIDEO_FIX_CSS = `
<!-- FurryFable Video Fix -->
<style>
  /* Force contain so videos are never cropped */
  .product-media-container video,
  .product-media video,
  [class*="media"] video,
  video {
    object-fit: contain !important;
    width: 100% !important;
    height: auto !important;
    max-height: 70vh;
    background: #000;
  }
  /* Override the --product-media-fit CSS variable for videos */
  .product-media-container:has(video) {
    --product-media-fit: contain !important;
  }
</style>
<!-- /FurryFable Video Fix -->`;

  let themeContent = themeLiquid.value;

  if (themeContent.includes("FurryFable Video Fix")) {
    // Update existing block
    themeContent = themeContent.replace(
      /<!-- FurryFable Video Fix -->[\s\S]*?<!-- \/FurryFable Video Fix -->/,
      VIDEO_FIX_CSS.trim()
    );
    console.log("  ✓ Updated existing video CSS in theme.liquid");
  } else {
    themeContent = themeContent.replace("</head>", VIDEO_FIX_CSS.trim() + "\n</head>");
    console.log("  ✓ Injected video CSS into theme.liquid");
  }

  await putAsset(theme.id, "layout/theme.liquid", themeContent);

  console.log("\n=== Done ===");
  console.log("- Video crop fixed via CSS (object-fit: contain)");
  console.log(`- Muted removed from ${mutedFixed} file(s)`);
  console.log("Hard refresh your store (Cmd+Shift+R) to verify.");
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
