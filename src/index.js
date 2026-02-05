import fs from "fs";
import path from "path";

import { generateBlogHTML, saveBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { BLOG_DIR } from "./config.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GEMINI_API_KEY || !OPENAI_API_KEY) {
  console.error("❌ Missing API keys");
  process.exit(1);
}

async function main() {
  const topic =
    "The Ultimate Guide to Eco-Friendly Pet Supplies for Sustainable Living";

  console.log("Generating blog content for:", topic);

  const html = await generateBlogHTML(topic);
  const { slug } = saveBlogHTML(topic, html);

  console.log("Blog saved:", `blog-${slug}.html`);

  console.log("Generating images...");
  const images = await generateImages(slug, topic);

  console.log("Images saved:", images);

  // 🔹 NEW: Metadata JSON
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
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
