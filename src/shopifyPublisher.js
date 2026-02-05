import axios from "axios";
import { SHOPIFY } from "./config.js";

const { storeDomain, accessToken, apiVersion, blogHandle } = SHOPIFY;

if (!storeDomain || !accessToken) {
  throw new Error("❌ Missing Shopify credentials");
}

const shopify = axios.create({
  baseURL: `https://${storeDomain}/admin/api/${apiVersion}`,
  headers: {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json"
  }
});

async function getBlogId() {
  const res = await shopify.get("/blogs.json");

  const blog = res.data.blogs.find(b => b.handle === blogHandle);

  if (!blog) {
    throw new Error(`❌ Blog with handle "${blogHandle}" not found`);
  }

  return blog.id;
}

function sanitizeHTML(html) {
  return html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "");
}

export async function publishBlog({ title, html }) {
  const blogId = await getBlogId();

  const cleanHTML = sanitizeHTML(html);

  const payload = {
    article: {
      title,
      body_html: cleanHTML,
      published: true
    }
  };

  const res = await shopify.post(
    `/blogs/${blogId}/articles.json`,
    payload
  );

  return res.data.article.id;
}
