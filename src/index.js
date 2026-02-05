import fs from "fs";
import path from "path";
import axios from "axios";

import { generateBlogHTML } from "./blogGenerator.js";
import { generateImages } from "./imageGenerator.js";
import { BLOG_DIR } from "./config.js";

/* ================= ENV ================= */

const {
  GEMINI_API_KEY,
  OPENAI_API_KEY,
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION
} = process.env;

if (!GEMINI_API_KEY || !OPENAI_API_KEY) {
  console.error("❌ Missing AI API keys");
  process.exit(1);
}

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !SHOPIFY_API_VERSION) {
  console.error("❌ Missing Shopify credentials");
  process.exit(1);
}

/* ================= HELPERS ================= */

function normalizeHTML(html) {
  return html
    .replace(/\n{2,}/g, "\n")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<h([1-6])>/g, "<h$1 style='margin-top:32px'>")
    .replace(/<p>/g, "<p style='margin-bottom:16px; line-height:1.7'>");
}

async function uploadImageToShopify(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const res = await axios.post(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/files.json`,
    {
      file: {
        attachment: base64Image,
        filename: path.basename(imagePath)
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.file.preview_image.src;
}

/* ================= MAIN ================= */

async function main() {
  const topic =
    "The Ultimate Guide to Eco-Friendly Pet Supplies for Sustainable Living";

  console.log("Generating blog content for:", topic);

  const rawHTML = await generateBlogHTML(topic);
  const html = normalizeHTML(rawHTML);

  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const blogPath = path.join(BLOG_DIR, `blog-${slug}.html`);
  fs.writeFileSync(blogPath, html, "utf-8");

  console.log("Blog saved:", blogPath);

  console.log("Generating images...");
  const images = await generateImages(slug, topic);

  console.log("Uploading featured image to Shopify...");
  const featuredImageUrl = await uploadImageToShopify(images.featured);

  console.log("Publishing to Shopify...");

  const articleRes = await axios.post(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/articles.json`,
    {
      article: {
        title: topic,
        body_html: html,
        published: true,
        image: {
          src: featuredImageUrl
        }
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("✅ Blog created in Shopify:", articleRes.data.article.id);
}

main().catch(err => {
  console.error("FATAL ERROR:", err.response?.data || err.message);
  process.exit(1);
});
