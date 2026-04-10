import slugify from "slugify";
import { getNextBlogRow, updateSheetRow, addNewTopicToSheet, getAllExistingTitles } from "./sheetManager.js";
import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishToShopify } from "./shopifyPublisher.js";
import { generateNewTopic } from "./topicGenerator.js";
import { generateMetadata } from "./metadataGenerator.js";

console.log("🚀 Blog automation started (SEO + GEO Optimized)");

try {
  let row = await getNextBlogRow();

  if (!row) {
    const existingTitles = await getAllExistingTitles();
    const topic = await generateNewTopic(existingTitles);
    await addNewTopicToSheet(topic);
    row = await getNextBlogRow();
  }

  let { rowIndex, title, primaryKeyword, slug, imageTheme } = row;

  // Generate slug if missing
  if (!slug) {
    slug = slugify(title, { lower: true, strict: true });
  }

  console.log(`📝 Writing SEO+GEO Optimized Content: ${title}`);
  console.log(`   🔑 Primary Keyword: ${primaryKeyword}`);
  const html = await generateBlogHTML({ title, primaryKeyword, slug });

  console.log("📊 Generating SEO Metadata...");
  const metadata = await generateMetadata(html);

  console.log("🖼️ Generating Featured Image...");
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

  console.log(`✅ Published: ${result.adminUrl}`);
  console.log(`🌐 Live URL: https://www.furryfable.com/blogs/blog/${slug}`);

} catch (err) {
  console.error("❌ FATAL ERROR:", err.message);
  process.exit(1);
}
