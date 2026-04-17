/**
 * revertVideo.js
 * Removes ALL video fix changes from the theme:
 * 1. Removes FurryFable Video Fix CSS block from layout/theme.liquid
 * 2. Restores snippets/video.liquid to original (re-adds muted back)
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
  const res = await shopify.get(`/themes/${themeId}/assets.json`, {
    params: { "asset[key]": key },
  });
  return res.data.asset;
}

async function putAsset(themeId, key, value) {
  await shopify.put(`/themes/${themeId}/assets.json`, { asset: { key, value } });
  console.log(`  ✓ Restored: ${key}`);
}

async function main() {
  console.log("=== FurryFable: Revert All Video Changes ===\n");

  const theme = await getActiveTheme();
  console.log(`Theme: "${theme.name}" (ID: ${theme.id})\n`);

  // 1. Remove CSS block from theme.liquid
  const themeLiquid = await getAsset(theme.id, "layout/theme.liquid");
  let themeContent = themeLiquid.value;

  if (themeContent.includes("FurryFable Video Fix")) {
    themeContent = themeContent.replace(
      /\n?<!-- FurryFable Video Fix -->[\s\S]*?<!-- \/FurryFable Video Fix -->\n?/,
      ""
    );
    await putAsset(theme.id, "layout/theme.liquid", themeContent);
    console.log("  Removed video CSS block from theme.liquid");
  } else {
    console.log("  No video CSS block found in theme.liquid (already clean)");
  }

  // 2. Restore snippets/video.liquid — re-add muted back
  await new Promise(r => setTimeout(r, 500));
  const videoSnippet = await getAsset(theme.id, "snippets/video.liquid");
  let videoContent = videoSnippet.value;

  let changed = false;

  // Re-add muted: true to native video_tag if missing
  videoContent = videoContent.replace(
    /(video_tag:[^|]*?autoplay:\s*true,[^|]*?loop:\s*video_loop)(?!.*muted)/gi,
    (match) => {
      changed = true;
      return match + ", muted: true";
    }
  );

  // Re-add muted: '1' to Vimeo external_video_url if missing
  videoContent = videoContent.replace(
    /(external_video_url:[^|]*?autoplay:\s*true,[^|]*?loop:\s*video_loop)(?!.*muted)/gi,
    (match) => {
      changed = true;
      return match + ", muted: '1'";
    }
  );

  // Re-add &muted=1 to YouTube URL if missing
  videoContent = videoContent.replace(
    /(&autoplay=1)(?!.*muted)/gi,
    (match) => {
      changed = true;
      return match + "&muted=1";
    }
  );

  if (changed) {
    await putAsset(theme.id, "snippets/video.liquid", videoContent);
    console.log("  Restored muted in snippets/video.liquid");
  } else {
    console.log("  snippets/video.liquid already has muted (no change needed)");
  }

  console.log("\n=== Done: all video changes reverted ===");
  console.log("Store is back to exactly how it was before.");
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
