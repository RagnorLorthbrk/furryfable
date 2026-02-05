import { getNextBlogRow, updateRowStatus } from "./sheetManager.js";
import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";

async function main() {
  console.log("🚀 Blog automation started");

  const row = await getNextBlogRow();

  if (!row) {
    console.log("✅ No pending blogs found");
    return;
  }

  const { rowIndex, title, slug } = row;

  console.log(`✍️ Picked row ${rowIndex}: ${title}`);
  await updateRowStatus(rowIndex, "IN_PROGRESS");

  console.log("📝 Generating blog content...");
  const html = await generateBlogHTML(title);
  saveBlogHTML(title, html);

  console.log("🖼️ Generating images...");
  const images = await generateImages(slug, title);

  console.log("🚀 Publishing to Shopify...");
  const result = await publishToShopify({
    title,
    html,
    slug,
    imagePath: images.featured
  });

  console.log("🌍 Blog published:", result.adminUrl);

  await updateRowStatus(rowIndex, "PUBLISHED");

  console.log("✅ Automation completed successfully");
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
});
