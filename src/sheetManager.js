import { google } from "googleapis";
import slugify from "slugify";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const SHEET_NAME = "blogs";

if (!SPREADSHEET_ID) {
  throw new Error("❌ GOOGLE_SHEET_ID missing");
}
if (!SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

function normalizeRow(row) {
  return {
    date: row[0] || "",
    title: row[1]?.trim() || null,
    primaryKeyword: row[2]?.trim() || null,
    slug: row[3]?.trim() || null,
    status: row[4]?.trim() || "",
    imageTheme: row[5]?.trim() || null
  };
}

export async function getNextBlogRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:F1000`
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = normalizeRow(rows[i]);

    if (parsed.status !== "PUBLISHED") {
      return {
        rowIndex: i + 2,
        ...parsed
      };
    }
  }

  return null;
}

export async function updateSheetRow(rowIndex, data) {
  const values = [[
    data.Date || "",
    data.Title || "",
    data["Primary Keyword"] || "",
    data.Slug || "",
    data.Status || "",
    data["Image Theme"] || ""
  ]];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${rowIndex}:F${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: { values }
  });
}

export async function addNewTopicToSheet(topic) {
  const slug = slugify(topic.title, { lower: true, strict: true });

  const values = [[
    new Date().toISOString().split("T")[0],
    topic.title,
    topic.primaryKeyword,
    slug,
    "IN_PROGRESS",
    topic.imageTheme
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:F`,
    valueInputOption: "RAW",
    requestBody: { values }
  });
}
