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

export async function publishToShopify({ title, html, slug, imagePath }) {
  const imageBase64 = fs.readFileSync(
    path.resolve(imagePath),
    "base64"
  );

  const payload = {
    article: {
      title,
      body_html: html,
      author: "FurryFable Team"
      handle: slug,
      published: true,
      image: {
        attachment: imageBase64,
        alt: title
      }
    }
  };

  const res = await shopify.post("/articles.json", payload);

  return {
    id: res.data.article.id,
    adminUrl: `https://admin.shopify.com/store/${SHOPIFY_STORE_DOMAIN.replace(
      ".myshopify.com",
      ""
    )}/content/articles/${res.data.article.id}`
  };
}
