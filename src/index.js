import fs from "fs";
import path from "path";

import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishBlog } from "./shopifyPublisher.js";
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

  const blogPath = path.join(
    BLOG_DIR,
    `blog-${slug}.html`
  );

  fs.writeFileSync(blogPath, html);
  console.log("Blog saved:", blogPath);

  console.log("Generating images...");
  const images = await generateImages(slug, topic);

  console.log("Publishing to Shopify...");
  const articleId = await publishBlog({
    title: topic,
    html,
    image: images.featured
  });

  console.log("✅ Blog created in Shopify:", articleId);
  console.log("Automation complete");
}

main().catch(err => {
  console.error("FATAL ERROR:", err.message);
  process.exit(1);
});
