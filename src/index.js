import slugify from "slugify";
import { getNextBlogRow, updateSheetRow, addNewTopicToSheet } from "./sheetManager.js";
import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";
import { generateNewTopic } from "./topicGenerator.js";
import { generateMetadata } from "./metadataGenerator.js";

console.log("🚀 Blog automation started");

try {
  let row = await getNextBlogRow();

  if (!row) {
    console.log("🔍 No pending blogs. Generating topic...");
    const topic = await generateNewTopic();
    await addNewTopicToSheet(topic);
    row = await getNextBlogRow();
  }

  let { rowIndex, title, primaryKeyword, slug, imageTheme } = row;

  if (!title) {
    const topic = await generateNewTopic();
    title = topic.title;
    primaryKeyword = topic.primaryKeyword;
    imageTheme = topic.imageTheme;
    slug = slugify(title, { lower: true, strict: true });
    // Update sheet immediately to lock the row
    await updateSheetRow(rowIndex, { Date: new Date().toISOString().split("T")[0], Title: title, "Primary Keyword": primaryKeyword, Slug: slug, Status: "IN_PROGRESS", "Image Theme": imageTheme });
  }

  console.log(`📝 Content for: ${title}`);
  const html = await generateBlogHTML({ title, primaryKeyword });

  console.log("📊 Generating SEO Metadata...");
  const metadata = await generateMetadata(html);

  console.log("🖼️ Generating images...");
  const images = await generateImages(slug, imageTheme);

  console.log("🚀 Publishing to Shopify with SEO tags...");
  const shopifyResult = await publishToShopify({
    title,
    html,
    slug,
    imagePath: images.featured,
    metadata
  });

  await updateSheetRow(rowIndex, {
    Date: new Date().toISOString().split("T")[0],
    Title: title,
    "Primary Keyword": primaryKeyword,
    Slug: slug,
    Status: "PUBLISHED",
    "Image Theme": imageTheme
  });

  console.log(`✅ Success! Admin URL: ${shopifyResult.adminUrl}`);

} catch (err) {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
}
