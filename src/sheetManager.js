import { google } from "googleapis";
import slugify from "slugify";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SHEET_ID || !SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ Google Sheets credentials missing");
}

const auth = new google.auth.JWT({
  email: JSON.parse(SERVICE_ACCOUNT_JSON).client_email,
  key: JSON.parse(SERVICE_ACCOUNT_JSON).private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });
const SHEET_NAME = "blogs";

/**
 * Get next blog row with Status = PENDING or IN_PROGRESS
 */
export async function getNextBlogRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:F`
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const [date, title, keyword, slug, status, imageTheme] = rows[i];

    if (!status || status === "PENDING" || status === "IN_PROGRESS") {
      return {
        rowIndex: i + 2,
        title,
        primaryKeyword: keyword,
        slug,
        imageTheme
      };
    }
  }

  return null;
}

/**
 * Add new AI-generated topic into sheet
 */
export async function addNewTopicToSheet(topic) {
  const slug = slugify(topic.title, { lower: true, strict: true });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:F`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          new Date().toISOString().split("T")[0],
          topic.title,
          topic.primaryKeyword,
          slug,
          "IN_PROGRESS",
          topic.imageTheme
        ]
      ]
    }
  });

  console.log("🆕 New topic added to sheet:", topic.title);
}

/**
 * Update row status
 */
export async function updateRowStatus(rowIndex, status) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!E${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]]
    }
  });
}
