import fs from "fs";
import path from "path";
import axios from "axios";

const SHOPIFY_STORE = "furryfable.myshopify.com";
const API_VERSION = "2024-01";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

if (!SHOPIFY_TOKEN) {
  console.error("❌ SHOPIFY_ADMIN_TOKEN missing");
  process.exit(1);
}

const BLOG_DIR = "blog";
const IMAGE_DIR = "images/blog";

/**
 * Upload image to Shopify Files
 */
async function uploadImage(filePath) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath, { encoding: "base64" });

  const res = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/files.json`,
    {
      file: {
        attachment: fileData,
        filename: fileName
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.file.public_url;
}

/**
 * Create blog article (DRAFT)
 */
async function createBlogArticle(title, html, imageUrl) {
  const res = await axios.post(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/articles.json`,
    {
      article: {
        title,
        body_html: html,
        published: false,
        image: {
          src: imageUrl
        }
      }
    },
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.article;
}

export async function publishLatestBlog() {
  const files = fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.endsWith(".html"))
    .sort()
    .reverse();

  if (!files.length) {
    console.log("No blog files found.");
    return;
  }

  const blogFile = files[0];
  const slug = blogFile.replace(".html", "");
  const title = slug
    .replace("blog-", "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());

  const html = fs.readFileSync(path.join(BLOG_DIR, blogFile), "utf-8");

  const featuredImagePath = path.join(
    IMAGE_DIR,
    `${slug}-featured.png`
  );

  if (!fs.existsSync(featuredImagePath)) {
    throw new Error("Featured image not found");
  }

  console.log("Uploading image to Shopify...");
  const imageUrl = await uploadImage(featuredImagePath);

  console.log("Creating Shopify blog draft...");
  const article = await createBlogArticle(title, html, imageUrl);

  console.log("✅ Shopify draft created:");
  console.log(article.admin_graphql_api_id);
}
