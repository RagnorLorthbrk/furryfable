import axios from "axios";
import { google } from "googleapis";

// ---------- ENV ----------
const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_API_VERSION,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  SPREADSHEET_ID
} = process.env;

if (
  !SHOPIFY_STORE_DOMAIN ||
  !SHOPIFY_ADMIN_TOKEN ||
  !SHOPIFY_API_VERSION ||
  !GOOGLE_SERVICE_ACCOUNT_JSON ||
  !SPREADSHEET_ID
) {
  throw new Error("❌ Missing required environment variables");
}

// ---------- GOOGLE SHEETS ----------
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// ---------- SHOPIFY ----------
const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
    "Content-Type": "application/json"
  }
});

// ---------- HELPERS ----------
function buildSeoTitle(title) {
  return title.length > 65 ? title.slice(0, 62) + "…" : title;
}

function buildMetaDescription(title) {
  return `Learn ${title.toLowerCase()} with expert tips for dogs and cats. Practical, safe, and easy advice for pet parents.`;
}

function buildTags(title) {
  const base = title.toLowerCase();
  const tags = [
    "pets",
    "dogs",
    "cats",
    "pet care",
    "furryfable",
    ...base.split(" ").slice(0, 5)
  ];
  return [...new Set(tags)].join(", ");
}

function injectInternalLinks(html) {
  const links = `
<hr/>
<h3>Helpful Resources</h3>
<ul>
  <li><a href="https://www.furryfable.com">FurryFable Home</a></li>
  <li><a href="https://www.furryfable.com/blogs/blog">All Blog Articles</a></li>
</ul>
`;
  return html.replace("</body>", `${links}</body>`);
}

// ---------- MAIN ----------
async function seoSync() {
  console.log("🔎 Finding latest PUBLISHED row from Sheet");

  const sheet = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sheet1!A2:F"
  });

  const rows = sheet.data.values || [];
  const lastRowIndex = rows
    .map((r, i) => ({ r, i }))
    .reverse()
    .find(row => row.r[5] === "PUBLISHED");

  if (!lastRowIndex) {
    console.log("⚠️ No published rows found");
    return;
  }

  const rowNumber = lastRowIndex.i + 2;
  const articleId = lastRowIndex.r[4];

  console.log("🧩 Syncing SEO for article:", articleId);

  const articleRes = await shopify.get(
    `/blogs/564038336686/articles/${articleId}.json`
  );

  const article = articleRes.data.article;

  const seoTitle = buildSeoTitle(article.title);
  const metaDescription = buildMetaDescription(article.title);
  const tags = buildTags(article.title);

  const updatedHtml = injectInternalLinks(article.body_html);

  await shopify.put(
    `/blogs/564038336686/articles/${articleId}.json`,
    {
      article: {
        id: articleId,
        title: article.title,
        body_html: updatedHtml,
        tags,
        metafields: [
          {
            namespace: "global",
            key: "title_tag",
            value: seoTitle,
            type: "single_line_text_field"
          },
          {
            namespace: "global",
            key: "description_tag",
            value: metaDescription,
            type: "single_line_text_field"
          }
        ]
      }
    }
  );

  console.log("✅ Shopify SEO updated");

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Sheet1!F${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["SEO_DONE"]]
    }
  });

  console.log("📊 Sheet updated → SEO_DONE");
}

seoSync().catch(err => {
  console.error("❌ SEO SYNC FAILED:", err.message);
  process.exit(1);
});
