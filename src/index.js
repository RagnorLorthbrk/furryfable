import { getNextBlogRow, addNewTopicToSheet, updateRowStatus } from "./sheetManager.js";
import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateBlogImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";
import { generateNewTopic } from "./topicGenerator.js";

console.log("🚀 Blog automation started");

let row = await getNextBlogRow();

/**
 * 🔥 AUTO TOPIC DISCOVERY
 */
if (!row) {
  console.log("🔍 No pending blogs found. Researching new topic...");

  const topic = await generateNewTopic();
  await addNewTopicToSheet(topic);

  row = await getNextBlogRow();

  if (!row) {
    throw new Error("❌ Failed to create new topic");
  }
}

console.log(`✍️ Picked row ${row.rowIndex}: ${row.title}`);

try {
  await updateRowStatus(row.rowIndex, "IN_PROGRESS");

  console.log("📝 Generating blog content...");
  const html = await generateBlogHTML(row.title);
  const { slug, filePath } = saveBlogHTML(row.title, html);

  console.log("🖼️ Generating images...");
  const imagePath = await generateBlogImages({
    title: row.title,
    imageTheme: row.imageTheme,
    slug
  });

  console.log("🚀 Publishing to Shopify...");
  const result = await publishToShopify({
    title: row.title,
    html,
    slug,
    imagePath
  });

  await updateRowStatus(row.rowIndex, "DONE");

  console.log("🌍 Blog published:", result.adminUrl);
  console.log("✅ Automation completed successfully");
} catch (err) {
  console.error("❌ FATAL ERROR:", err.message);
  await updateRowStatus(row.rowIndex, "ERROR");
  process.exit(1);
}
