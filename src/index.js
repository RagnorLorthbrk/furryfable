import { getNextBlogRow, updateRowStatus } from "./sheetManager.js";
import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishBlogToShopify } from "./shopifyPublisher.js";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Blog automation started");

  const row = await getNextBlogRow();

  if (!row) {
    console.log("✅ No READY rows found. Exiting.");
    return;
  }

  const { rowIndex, title, slug, imageTheme } = row;

  await updateRowStatus(rowIndex, "IN_PROGRESS");

  console.log("✍️ Generating blog content:", title);
  const html = await generateBlogHTML(title);

  console.log("🖼 Generating images (no text)...");
  const images = await generateImages(slug, imageTheme);

  console.log("🛒 Publishing to Shopify...");
  const shopifyResult = await publishBlogToShopify({
    title,
    html,
    slug,
    images
  });

  await updateRowStatus(rowIndex, "PUBLISHED");

  console.log("🎉 Blog published:", shopifyResult.adminUrl);
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err);
  process.exit(1);
});
