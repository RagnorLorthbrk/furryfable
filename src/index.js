import fs from "fs";
import path from "path";

import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishLatestBlog } from "./shopifyPublisher.js";
import { BLOG_DIR } from "./config.js";

async function main() {
  const topic =
    "The Ultimate Guide to Eco-Friendly Pet Supplies for Sustainable Living";

  console.log("Generating blog content for:", topic);

  const html = await generateBlogHTML(topic);

  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const htmlPath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(htmlPath, html, "utf-8");

  console.log("Blog saved:", htmlPath);

  console.log("Generating images...");
  const images = await generateImages(slug, topic);

  const metadata = {
    title: topic,
    slug,
    featured_image: images.featured,
    thumbnail_image: images.thumb,
    status: "blog_generated"
  };

  console.log("Publishing to Shopify...");
  await publishLatestBlog(metadata, html);

  console.log("✅ Automation complete");
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
