import fs from "fs";
import path from "path";
import axios from "axios";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

const BLOG_DIR = "blog";

if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
  console.error("❌ Missing Shopify credentials");
  process.exit(1);
}

/* ---------------- HELPERS ---------------- */

function getLatestBlog() {
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      file: f,
      time: fs.statSync(path.join(BLOG_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (!files.length) {
    throw new Error("No blog metadata JSON found");
  }

  const jsonFile = files[0].file;
  const slug = jsonFile.replace("blog-", "").replace(".json", "");

  return {
    slug,
    html: fs.readFileSync(
      path.join(BLOG_DIR, `blog-${slug}.html`),
      "utf-8"
    ),
    meta: JSON.parse(
      fs.readFileSync(path.join(BLOG_DIR, jsonFile), "utf-8")
    )
  };
}

async function uploadImage(imagePath) {
  const base64 = fs.readFileSync(imagePath, "base64");

  const res = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/files.json`,
    {
      file: {
        attachment: base64,
        filename: path.basename(imagePath)
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.file.url;
}

/* ---------------- MAIN EXPORT ---------------- */

export async function publishLatestBlog() {
  console.log("📦 Loading latest blog from GitHub...");

  const { html, meta } = getLatestBlog();

  console.log("🖼 Uploading featured image...");
  const imageUrl = await uploadImage(meta.featured_image);

  console.log("📝 Creating Shopify draft...");

  const blogsRes = await axios.get(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/blogs.json`,
    {
      headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN }
    }
  );

  const blogId = blogsRes.data.blogs[0].id;

  const articleRes = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/blogs/${blogId}/articles.json`,
    {
      article: {
        title: meta.title,
        body_html: html,
        summary_html: meta.excerpt,
        image: { src: imageUrl },
        tags: meta.tags.join(", "),
        published: false
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  console.log(
    "✅ Shopify draft created:",
    articleRes.data.article.admin_graphql_api_id
  );
}
