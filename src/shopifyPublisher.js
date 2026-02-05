import axios from "axios";
import fs from "fs";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION
} = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  throw new Error("Missing Shopify credentials");
}

const client = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

export async function publishBlog({
  title,
  html,
  slug,
  imagePath
}) {
  const imageData = fs.readFileSync(imagePath).toString("base64");

  const res = await client.post("/articles.json", {
    article: {
      title,
      body_html: html,
      handle: slug,
      published: true,
      image: {
        attachment: imageData
      }
    }
  });

  return res.data.article;
}
