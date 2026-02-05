import axios from "axios";
import { SHOPIFY } from "./config.js";

export async function publishLatestBlog(metadata, html) {
  const { storeDomain, accessToken, apiVersion } = SHOPIFY;

  if (!storeDomain || !accessToken) {
    console.error("❌ Missing Shopify credentials");
    process.exit(1);
  }

  console.log("✅ Shopify credentials detected");

  const url = `https://${storeDomain}/admin/api/${apiVersion}/blogs.json`;

  const payload = {
    blog: {
      title: metadata.title,
      body_html: html,
      published: false
    }
  };

  const res = await axios.post(url, payload, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json"
    }
  });

  console.log("✅ Blog created in Shopify:", res.data.blog.id);
  return res.data.blog;
}
