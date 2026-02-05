// src/seoSync.js
import axios from "axios";
import { getLatestPublishedRow, updateRowStatus } from "./sheetManager.js";

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION
} = process.env;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN || !SHOPIFY_API_VERSION) {
  throw new Error("❌ Missing Shopify credentials");
}

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

export async function runSeoSync() {
  console.log("🔎 SEO Sync started");

  const row = await getLatestPublishedRow();

  if (!row) {
    console.log("ℹ️ No published blog pending SEO");
    return;
  }

  const {
    rowIndex,
    title,
    primaryKeyword,
    slug,
    imageTheme,
    shopifyArticleId
  } = row;

  // ---- SEO VALUES ----
  const seoTitle = title.slice(0, 70);
  const metaDescription = `Learn ${primaryKeyword}. Practical, expert-backed guidance for pet parents at FurryFable.`;

  const tags = [
    primaryKeyword,
    "pet care",
    "dog care",
    "cat care",
    "furryfable"
  ];

  // ---- FETCH ARTICLE ----
  const articleRes = await shopify.get(`/articles/${shopifyArticleId}.json`);
  let article = articleRes.data.article;

  // ---- IMAGE ALT TEXT ----
  if (article.image) {
    article.image.alt = `${title} – FurryFable pet care guide`;
  }

  // ---- INTERNAL LINKS ----
  const internalLinksHtml = `
    <hr>
    <h3>Related Reading from FurryFable</h3>
    <ul>
      <li><a href="/blogs/blog">Browse all pet care articles</a></li>
      <li><a href="/">Visit FurryFable Home</a></li>
    </ul>
  `;

  if (!article.body_html.includes("Related Reading from FurryFable")) {
    article.body_html += internalLinksHtml;
  }

  // ---- UPDATE ARTICLE ----
  await shopify.put(`/articles/${shopifyArticleId}.json`, {
    article: {
      id: shopifyArticleId,
      tags: tags.join(", "),
      seo: {
        title: seoTitle,
        description: metaDescription
      },
      image: article.image,
      body_html: article.body_html
    }
  });

  await updateRowStatus(rowIndex, "SEO_DONE");

  console.log("✅ SEO sync completed");
}
