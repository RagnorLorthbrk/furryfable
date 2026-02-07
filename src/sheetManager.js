import { google } from "googleapis";
import slugify from "slugify";

const GOOGLE_SERVICE_ACCOUNT_JSON =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = "FurryFable Blog Automation";

if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}
if (!SPREADSHEET_ID) {
  throw new Error("❌ SPREADSHEET_ID missing");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

/**
 * Get next row with EMPTY or PENDING status
 */
export async function getNextBlogRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A2:F`
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const [title, status] = rows[i];
    if (title && (!status || status === "PENDING")) {
      return {
        rowIndex: i + 2,
        title
      };
    }
  }

  return null;
}

/**
 * Add a newly generated topic to the sheet
 */
export async function addNewTopicToSheet(title) {
  if (!title || typeof title !== "string") {
    throw new Error("❌ addNewTopicToSheet received invalid title");
  }

  const safeSlug = slugify(title, {
    lower: true,
    strict: true
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!A:F`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[title, "PENDING", safeSlug]]
    }
  });

  return title;
}

/**
 * Update row status
 */
export async function updateRowStatus(rowIndex, status) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'!B${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[status]]
    }
  });
}
