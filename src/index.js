import { getNextBlogRow, updateStatus } from "./sheetManager.js";
import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishBlogToShopify } from "./shopifyPublisher.js";

console.log("🚀 Blog automation started");

async function main() {
  // 1️⃣ Get next row from Google Sheet
  const row = await getNextBlogRow();

  if (!row) {
    console.log("✅ No pending blogs found. Exiting.");
    return;
  }

  const { rowIndex, title, slug } = row;

  console.log(`✍️ Picked row ${rowIndex}: ${title}`);

  // 2️⃣ Mark IN_PROGRESS
  await updateStatus(rowIndex, "IN_PROGRESS");

  // 3️⃣ Generate blog HTML
  console.log("📝 Generating blog content...");
  const html = await generateBlogHTML(title);
  const { filePath } = saveBlogHTML(title, html);

  console.log("📄 Blog saved:", filePath);

  // 4️⃣ Generate images (no text on images)
  console.log("🖼️ Generating images...");
  const images = await generateImages(slug, title);

  // 5️⃣ Publish to Shopify
  console.log("🚀 Publishing to Shopify...");
  const blogUrl = await publishBlogToShopify({
    title,
    html,
    images
  });

  console.log("🌍 Blog published:", blogUrl);

  // 6️⃣ Update final status
  await updateStatus(rowIndex, "PUBLISHED");

  console.log("✅ Automation completed successfully");
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
});
