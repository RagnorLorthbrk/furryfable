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
    const topic = await generateNewTopic();
    await addNewTopicToSheet(topic);
    row = await getNextBlogRow();
  }

  let { rowIndex, title, primaryKeyword, slug, imageTheme } = row;

  console.log(`📝 Writing Content: ${title}`);
  const html = await generateBlogHTML({ title, primaryKeyword });

  console.log("📊 Generating SEO Metadata via Gemini...");
  const metadata = await generateMetadata(html);

  console.log("🖼️ Handling Images...");
  const images = await generateImages(slug, imageTheme);

  console.log("🚀 Publishing to Shopify...");
  const result = await publishToShopify({
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

  console.log(`✅ Success! Published at: ${result.adminUrl}`);

} catch (err) {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
}
