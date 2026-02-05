import { google } from "googleapis";
import axios from "axios";

/* =====================
   ENV VALIDATION
===================== */
const {
  GOOGLE_SERVICE_ACCOUNT_JSON,
  GOOGLE_SHEET_ID,
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ACCESS_TOKEN,
  SHOPIFY_API_VERSION
} = process.env;

if (
  !GOOGLE_SERVICE_ACCOUNT_JSON ||
  !GOOGLE_SHEET_ID ||
  !SHOPIFY_STORE_DOMAIN ||
  !SHOPIFY_ACCESS_TOKEN ||
  !SHOPIFY_API_VERSION
) {
  throw new Error("❌ Missing required environment variables");
}

/* =====================
   GOOGLE SHEETS SETUP
===================== */
const auth = new google.auth.JWT(
  JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON).client_email,
  null,
  JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON).private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

const SHEET_NAME = "blogs";

/* =====================
   SHOPIFY API CLIENT
===================== */
const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json"
  }
});

/* =====================
   HELPERS
===================== */
function buildMetaDescription(title, keyword) {
  return `Learn ${keyword} with this expert guide from FurryFable. ${title}. Practical tips, real solutions, and pet-first advice.`;
}

function buildTags(keyword) {
  return [
    "pets",
    "pet care",
    "dog care",
    "cat care",
    keyword
  ].join(", ");
}

/* =====================
   MAIN LOGIC
===================== */
async function getLatestPublishedRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A2:F`
  });

  const rows = res.data.values || [];

  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][4] === "PUBLISHED") {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }

  throw new Error("❌ No PUBLISHED rows found");
}

async function findShopifyArticleByHandle(handle) {
  const res = await shopify.get(`/articles.json?handle=${handle}&limit=1`);
  if (!res.data.articles.length) {
    throw new Error("❌ Shopify article not found");
  }
  return res.data.articles[0];
}

async function updateShopifySEO(articleId, payload) {
  await shopify.put(`/articles/${articleId}.json`, {
    article: payload
  });
}

async function updateSheetStatus(rowIndex, status) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!E${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]]
    }
  });
}

/* =====================
   RUN
===================== */
(async function run() {
  console.log("🔍 Starting SEO sync...");

  const { row, rowIndex } = await getLatestPublishedRow();

  const title = row[1];
  const keyword = row[2];
  const slug = row[3];

  console.log(`📝 Updating SEO for: ${title}`);

  const article = await findShopifyArticleByHandle(slug);

  const seoTitle = title;
  const seoDescription = buildMetaDescription(title, keyword);
  const tags = buildTags(keyword);

  const imageAlt = `${title} – ${keyword} | FurryFable`;

  await updateShopifySEO(article.id, {
    title,
    tags,
    metafields: [
      {
        namespace: "global",
        key: "description_tag",
        value: seoDescription,
        type: "single_line_text_field"
      },
      {
        namespace: "global",
        key: "title_tag",
        value: seoTitle,
        type: "single_line_text_field"
      }
    ],
    image: article.image
      ? {
          id: article.image.id,
          alt: imageAlt
        }
      : undefined
  });

  await updateSheetStatus(rowIndex, "SEO_DONE");

  console.log("✅ SEO sync completed successfully");
})();
