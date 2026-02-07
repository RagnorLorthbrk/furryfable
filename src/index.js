import slugify from "slugify";
import { getNextBlogRow, updateSheetRow, addNewTopicToSheet } from "./sheetManager.js";
import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";
import { generateNewTopic } from "./topicGenerator.js";

console.log("🚀 Blog automation started");

try {
  let row = await getNextBlogRow();

  // CASE 1: No pending rows → generate topic + append to sheet
  if (!row) {
    console.log("🔍 No pending blogs found. Generating new topic...");
    const topic = await generateNewTopic();
    await addNewTopicToSheet(topic);
    row = await getNextBlogRow();
  }

  if (!row) {
    console.log("✅ Nothing to process");
    process.exit(0);
  }

  let { rowIndex, title, primaryKeyword, slug, imageTheme } = row;

  // CASE 2: Row exists but title missing → auto-fill row
  if (!title) {
    console.log("✍️ Empty row found. Auto-generating topic...");
    const topic = await generateNewTopic();

    title = topic.title;
    primaryKeyword = topic.primaryKeyword;
    imageTheme = topic.imageTheme;
    slug = slugify(title, { lower: true, strict: true });

    await updateSheetRow(rowIndex, {
      Date: new Date().toISOString().split("T")[0],
      Title: title,
      "Primary Keyword": primaryKeyword,
      Slug: slug,
      Status: "IN_PROGRESS",
      "Image Theme": imageTheme
    });
  }

  console.log(`📝 Generating blog: ${title}`);

  const html = await generateBlogHTML(title);
  const { filePath } = saveBlogHTML(title, html);

  console.log("🖼️ Generating images...");
  const images = await generateImages(slug, imageTheme);

  console.log("🚀 Publishing to Shopify...");
  await publishToShopify({
    title,
    html,
    slug,
    imagePath: images.featured
  });

  await updateSheetRow(rowIndex, {
    Date: new Date().toISOString().split("T")[0],
    Title: title,
    "Primary Keyword": primaryKeyword,
    Slug: slug,
    Status: "PUBLISHED",
    "Image Theme": imageTheme
  });

  console.log("✅ Blog published successfully");

} catch (err) {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
}
