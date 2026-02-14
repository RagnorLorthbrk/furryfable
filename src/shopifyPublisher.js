import fs from "fs";
import path from "path";
import axios from "axios";

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, SHOPIFY_API_VERSION = "2026-01" } = process.env;

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

export async function publishToShopify({ title, html, slug, imagePath, metadata }) {
  const articleData = {
    title: title,
    body_html: html,
    summary_html: metadata.excerpt || "",
    tags: metadata.tags ? metadata.tags.join(", ") : "",
    author: "Ragnor",
    handle: slug,
    published: true
  };

  // Only add image if it exists
  if (imagePath && fs.existsSync(imagePath)) {
    articleData.image = {
      attachment: fs.readFileSync(path.resolve(imagePath), "base64"),
      alt: title
    };
  }

  // 1. Create Article
  const res = await shopify.post("/articles.json", { article: articleData });
  const articleId = res.data.article.id;

  // 2. Push SEO Meta Description
  await shopify.post(`/articles/${articleId}/metafields.json`, {
    metafield: {
      namespace: "global",
      key: "description_tag",
      value: metadata.metaDescription,
      type: "single_line_text_field"
    }
  });

  return {
    id: articleId,
    adminUrl: `https://admin.shopify.com/store/${SHOPIFY_STORE_DOMAIN.replace(".myshopify.com", "")}/content/articles/${articleId}`
  };
}
