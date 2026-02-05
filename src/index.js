import path from "path";

import { getNextBlogRow, updateRowStatus } from "./sheetManager.js";
import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";

async function main() {
  console.log("🚀 Blog automation started");

  // 1. Get next row from Google Sheet
  const row = await getNextBlogRow();

  if (!row) {
    console.log("✅ No pending rows found");
    return;
  }

  const {
    rowIndex,
    title,
    slug
  } = row;

  console.log(`✍️ Picked row ${rowIndex}: ${title}`);

  await updateRowStatus(rowIndex, "IN_PROGRESS");

  // 2. Generate blog content
  console.log("📝 Generating blog content...");
  const html = await generateBlogHTML(title);

  const { filePath } = saveBlogHTML(title, html);
  console.log("📄 Blog saved:", filePath);

  // 3. Generate images (NO TEXT ON IMAGE)
  console.log("🖼️ Generating images...");
  const images = await generateImages(slug, title);

  // 4. Publish to Shopify (THIS IS WHERE MAGIC HAPPENS)
  console.log("🚀 Publishing to Shopify...");
  const result = await publishToShopify({
    title,
    html,
    slug,
    imagePath: images.featured
  });

  console.log("🌍 Blog published:", result);

  // 5. Update sheet status
  await updateRowStatus(rowIndex, "PUBLISHED");

  console.log("✅ Automation completed successfully");
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
});
