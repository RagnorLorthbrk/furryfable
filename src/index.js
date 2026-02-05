import fs from "fs";
import path from "path";

import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishLatestBlog } from "./shopifyPublisher.js";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!GEMINI_API_KEY || !OPENAI_API_KEY) {
  console.error("❌ Missing AI API keys");
  process.exit(1);
}

if (!SHOPIFY_ADMIN_TOKEN) {
  console.error("❌ Missing SHOPIFY_ADMIN_TOKEN");
  process.exit(1);
}

async function main() {
  const topic =
    "The Ultimate Guide to Eco-Friendly Pet Supplies for Sustainable Living";

  console.log("Generating blog content for:", topic);

  // 1️⃣ Generate blog HTML
  const html = await generateBlogHTML(topic);
  const { slug } = saveBlogHTML(topic, html);

  console.log("Blog saved:", `blog-${slug}.html`);

  // 2️⃣ Generate images
  console.log("Generating images...");
  const images = await generateImages(slug, topic);

  console.log("Images saved:", images);

  // 3️⃣ Save metadata JSON (for Shopify / future automation)
  const metadata = {
    title: topic,
    slug,
    excerpt:
      "A practical guide to choosing sustainable, eco-friendly products for dogs and cats.",
    category: "Sustainability",
    tags: ["eco-friendly", "pet supplies", "sustainable living"],
    featured_image: images.featured,
    thumbnail_image: images.thumb,
    status: "blog_generated",
    source: "github-automation"
  };

  const jsonPath = path.join(BLOG_DIR, `blog-${slug}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2), "utf-8");

  console.log("Metadata JSON saved:", jsonPath);

  // 4️⃣ Publish to Shopify as DRAFT
  console.log("Publishing blog to Shopify (draft)...");
  await publishLatestBlog();

  console.log("✅ Full automation completed successfully");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
