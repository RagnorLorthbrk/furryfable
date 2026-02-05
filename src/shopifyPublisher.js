import fs from "fs";
import path from "path";
import axios from "axios";

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  throw new Error("❌ Missing Shopify credentials");
}

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

/**
 * Publish blog post to Shopify with FEATURED IMAGE
 */
export async function publishToShopify({
  title,
  html,
  slug,
  imagePath
}) {
  // Convert image to base64 (THIS IS THE KEY FIX)
  const absoluteImagePath = path.resolve(imagePath);
  const imageBase64 = fs.readFileSync(absoluteImagePath, {
    encoding: "base64"
  });

  const payload = {
    article: {
      title,
      body_html: html,
      handle: slug,
      published: true,
      image: {
        attachment: imageBase64,
        alt: title
      }
    }
  };

  const response = await shopify.post("/articles.json", payload);

  return {
    id: response.data.article.id,
    adminUrl: `https://admin.shopify.com/store/${SHOPIFY_STORE_DOMAIN.replace(
      ".myshopify.com",
      ""
    )}/content/articles/${response.data.article.id}`
  };
}
