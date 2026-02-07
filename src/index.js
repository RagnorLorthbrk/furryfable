import { getNextBlogRow, addNewTopicToSheet, updateRowStatus } from "./sheetManager.js";
import { generateNewTopic } from "./topicGenerator.js";
import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";

console.log("🚀 Blog automation started");

async function main() {
  let row = await getNextBlogRow();
  let title;
  let rowIndex;

  if (!row) {
    console.log("🔍 No pending blogs found. Researching new topic...");
    title = await generateNewTopic();
    await addNewTopicToSheet(title);

    // Re-fetch after insert
    row = await getNextBlogRow();
  }

  title = row.title;
  rowIndex = row.rowIndex;

  console.log(`✍️ Picked row ${rowIndex}: ${title}`);
  await updateRowStatus(rowIndex, "IN_PROGRESS");

  console.log("📝 Generating blog content...");
  const html = await generateBlogHTML(title);
  const { slug, filePath } = saveBlogHTML(title, html);

  console.log("🖼️ Generating images...");
  const images = await generateImages(slug, title);

  console.log("🚀 Publishing to Shopify...");
  await publishToShopify({
    title,
    html,
    slug,
    imagePath: images.featured
  });

  await updateRowStatus(rowIndex, "PUBLISHED");

  console.log("✅ Automation completed successfully");
}

main().catch(err => {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
});
