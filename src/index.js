import fs from "fs";
import path from "path";

import { BLOG_DIR } from "./config.js";
import { getNextReadyRow, updateStatus } from "./sheetManager.js";
import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { publishBlog } from "./shopifyPublisher.js";

async function main() {
  const row = await getNextReadyRow();

  if (!row) {
    console.log("No READY rows found.");
    return;
  }

  const { rowIndex, title, keyword, slug, imageTheme } = row;

  await updateStatus(rowIndex, "IN_PROGRESS");

  console.log("Generating blog:", title);

  const html = await generateBlogHTML(title, keyword);

  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true });
  }

  const blogPath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(blogPath, html);

  console.log("Generating images...");
  const images = await generateImages(slug, imageTheme);

  console.log("Publishing to Shopify...");
  const article = await publishBlog({
    title,
    html,
    slug,
    imagePath: images.featured
  });

  const liveUrl = `https://www.furryfable.com/blogs/blog/${slug}`;

  await updateStatus(rowIndex, "PUBLISHED", liveUrl);

  console.log("Published:", liveUrl);
}

main().catch(err => {
  console.error("FATAL ERROR:", err.message);
  process.exit(1);
});
