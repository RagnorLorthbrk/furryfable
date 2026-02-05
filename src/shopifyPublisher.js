import fs from "fs";
import path from "path";
import axios from "axios";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
  console.error("❌ Missing Shopify credentials");
  process.exit(1);
}

const BLOG_DIR = "blog";
const IMAGE_DIR = "images/blog";

/* ------------------ HELPERS ------------------ */

function getLatestBlogFiles() {
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
    htmlPath: path.join(BLOG_DIR, `blog-${slug}.html`),
    jsonPath: path.join(BLOG_DIR, jsonFile)
  };
}

async function uploadImageToShopify(localPath) {
  const imageData = fs.readFileSync(localPath, { encoding: "base64" });

  const res = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/files.json`,
    {
      file: {
        attachment: imageData,
        filename: path.basename(localPath)
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

/* ------------------ MAIN ------------------ */

async function publishBlogDraft() {
  console.log("📦 Loading latest blog from GitHub...");

  const { slug, htmlPath, jsonPath } = getLatestBlogFiles();

  const html = fs.readFileSync(htmlPath, "utf-8");
  const metadata = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  console.log("🖼 Uploading featured image...");
  const featuredImagePath = metadata.featured_image;
  const featuredImageUrl = await uploadImageToShopify(featuredImagePath);

  console.log("📝 Creating Shopify blog post (DRAFT)...");

  const res = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/blogs.json`,
    {},
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN
      }
    }
  );

  const blogId = res.data.blogs?.[0]?.id;
  if (!blogId) throw new Error("No Shopify blog found");

  const articleRes = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/blogs/${blogId}/articles.json`,
    {
      article: {
        title: metadata.title,
        body_html: html,
        summary_html: metadata.excerpt,
        image: {
          src: featuredImageUrl
        },
        tags: metadata.tags.join(", "),
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

/* ------------------ RUN ------------------ */

publishBlogDraft().catch(err => {
  console.error("❌ Shopify publish failed:", err.response?.data || err.message);
  process.exit(1);
});
