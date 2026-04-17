/**
 * fixVideo.js
 * Finds and fixes video issues in Shopify theme:
 * 1. Removes muted attribute so audio plays
 * 2. Fixes object-fit so video isn't cropped
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

async function getAllAssets(themeId) {
  const res = await shopify.get(`/themes/${themeId}/assets.json`);
  return res.data.assets;
}

function fixMuted(content, filename) {
  let changed = false;

  // Remove muted attribute from <video> tags (various forms)
  const fixed = content
    .replace(/(<video\b[^>]*?)\s+muted(?:\s*=\s*["']?(?:muted|true)?["']?)?([^>]*>)/gi, (match, before, after) => {
      changed = true;
      console.log(`    Removed 'muted' from <video> in ${filename}`);
      return before + after;
    })
    // Also handle playsinline muted combos
    .replace(/\bmuted\b(?:\s*=\s*["'](?:muted|true)["'])?/gi, (match, offset, str) => {
      // Only inside video tags
      const before = str.slice(0, offset);
      const inVideoTag = before.lastIndexOf('<video') > before.lastIndexOf('>');
      if (inVideoTag) {
        changed = true;
        return '';
      }
      return match;
    });

  return { content: fixed, changed };
}

function fixObjectFit(content, filename) {
  let changed = false;

  // Fix object-fit: cover on video elements → contain
  const fixed = content.replace(
    /(\.(?:product-media|media|video)[^{]*\{[^}]*?)object-fit\s*:\s*cover([^}]*\})/gi,
    (match, before, after) => {
      changed = true;
      console.log(`    Fixed object-fit: cover → contain in ${filename}`);
      return before + 'object-fit: contain' + after;
    }
  );

  return { content: fixed, changed };
}

async function main() {
  console.log("=== FurryFable: Fix Product Video (audio + crop) ===\n");

  const theme = await getActiveTheme();
  console.log(`Active theme: "${theme.name}" (ID: ${theme.id})\n`);

  const assets = await getAllAssets(theme.id);

  // Find relevant files — Liquid and JS/CSS that mention video or media
  const videoAssets = assets.filter(a =>
    /\.(liquid|js|css)$/.test(a.key) &&
    (a.key.includes("video") || a.key.includes("media") || a.key.includes("product") || a.key.includes("player"))
  );

  console.log(`Scanning ${videoAssets.length} relevant files...\n`);

  let totalFixed = 0;

  for (const assetMeta of videoAssets) {
    const asset = await getAsset(theme.id, assetMeta.key);
    if (!asset || !asset.value) continue;

    let content = asset.value;
    let fileChanged = false;

    // Fix muted in Liquid and JS files
    if (/\.(liquid|js)$/.test(assetMeta.key)) {
      const { content: c1, changed: ch1 } = fixMuted(content, assetMeta.key);
      content = c1;
      if (ch1) fileChanged = true;
    }

    // Fix object-fit in CSS and Liquid files
    if (/\.(css|liquid)$/.test(assetMeta.key)) {
      const { content: c2, changed: ch2 } = fixObjectFit(content, assetMeta.key);
      content = c2;
      if (ch2) fileChanged = true;
    }

    if (fileChanged) {
      await putAsset(theme.id, assetMeta.key, content);
      totalFixed++;
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
  }

  // Also inject a CSS override in theme.liquid to ensure video plays correctly
  const themeLiquid = await getAsset(theme.id, "layout/theme.liquid");
  if (themeLiquid) {
    const videoCSS = `
<!-- FurryFable Video Fix -->
<style>
  .product-media video,
  .media video,
  video.product-video,
  [class*="media"] video {
    object-fit: contain !important;
    width: 100% !important;
    height: 100% !important;
    max-height: 600px;
  }
</style>
<!-- /FurryFable Video Fix -->`;

    let themeContent = themeLiquid.value;
    if (!themeContent.includes("FurryFable Video Fix")) {
      themeContent = themeContent.replace("</head>", videoCSS + "\n</head>");
      await putAsset(theme.id, "layout/theme.liquid", themeContent);
      console.log("  ✓ Added CSS override in theme.liquid for video sizing");
      totalFixed++;
    } else {
      console.log("  ℹ Video CSS override already present in theme.liquid");
    }
  }

  if (totalFixed === 0) {
    console.log("\n⚠️  No changes made. Printing all video-related file names for manual review:");
    videoAssets.forEach(a => console.log(" ", a.key));
  } else {
    console.log(`\n=== Done: Fixed ${totalFixed} file(s) ===`);
    console.log("Videos will now play with audio and show without cropping.");
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
