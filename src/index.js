import fs from "fs";
import path from "path";

import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishBlog } from "./shopifyPublisher.js";
import { BLOG_DIR } from "./config.js";

// ---------------- ENV CHECK ----------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GEMINI_API_KEY || !OPENAI_API_KEY) {
  console.error("❌ Missing AI API keys");
  process.exit(1);
}
// -------------------------------------------

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  // 🔹 TEMP static topic (later comes from Google Sheet)
  const topic =
    "The Ultimate Guide to Eco-Friendly Pet Supplies for Sustainable Living";

  console.log("Generating blog content for:", topic);

  // 1️⃣ Generate blog HTML
  const html = await generateBlogHTML(topic);

  // 2️⃣ Save blog locally (GitHub source of truth)
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const slug = slugify(topic);
  const blogPath = path.join(
    BLOG_DIR,
    `blog-${slug}.html`
  );

  fs.writeFileSync(blogPath, html, "utf-8");
  console.log("Blog saved:", blogPath);

  // 3️⃣ Generate images (already working)
  console.log("Generating images...");
  const images = await generateImages(slug, topic);

  console.log("Images saved:", images);

  // 4️⃣ Publish blog to Shopify (NO IMAGE YET)
  console.log("Publishing to Shopify...");
  const articleId = await publishBlog({
    title: topic,
    html
  });

  console.log("✅ Blog created in Shopify:", articleId);
  console.log("✅ Automation complete");
}

main().catch(err => {
  console.error("FATAL ERROR:", err.message || err);
  process.exit(1);
});
