import axios from "axios";
import fs from "fs";
import path from "path";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN; // vfsn10-30.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-01";
const SHOPIFY_BLOG_ID = process.env.SHOPIFY_BLOG_ID;

if (!SHOPIFY_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !SHOPIFY_BLOG_ID) {
  console.error("❌ Missing Shopify credentials");
  process.exit(1);
}

const BLOG_DIR = "blog";

export async function publishLatestBlog() {
  // 1. Pick latest generated blog JSON
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      file: f,
      time: fs.statSync(path.join(BLOG_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (!files.length) {
    console.log("No blog metadata found to publish.");
    return;
  }

  const latest = files[0].file;
  const metadataPath = path.join(BLOG_DIR, latest);
  const meta = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  const htmlPath = path.join(BLOG_DIR, `blog-${meta.slug}.html`);
  if (!fs.existsSync(htmlPath)) {
    throw new Error("Blog HTML file missing for " + meta.slug);
  }

  const html = fs.readFileSync(htmlPath, "utf-8");

  console.log("Publishing to Shopify blog ID:", SHOPIFY_BLOG_ID);

  // 2. Create article
  const response = await axios.post(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/blogs/${SHOPIFY_BLOG_ID}/articles.json`,
    {
      article: {
        title: meta.title,
        body_html: html,
        summary_html: meta.excerpt,
        tags: meta.tags.join(", "),
        published: false // DRAFT by default
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  const article = response.data.article;

  console.log("✅ Shopify article created:", article.id);

  // 3. Update metadata status
  meta.status = "published_to_shopify";
  meta.shopify_article_id = article.id;
  meta.shopify_admin_url = `https://admin.shopify.com/store/${SHOPIFY_DOMAIN.replace(
    ".myshopify.com",
    ""
  )}/content/articles/${article.id}`;

  fs.writeFileSync(metadataPath, JSON.stringify(meta, null, 2));

  console.log("Metadata updated:", metadataPath);
}
