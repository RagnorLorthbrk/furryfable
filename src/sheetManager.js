import { google } from "googleapis";
import slugify from "slugify";

// ⬇️ IMPORTANT: match this to your EXISTING GitHub secret name
const SPREADSHEET_ID =
  process.env.GOOGLE_SHEET_ID || process.env.SPREADSHEET_ID;

if (!SPREADSHEET_ID) {
  throw new Error("❌ Spreadsheet ID missing (GOOGLE_SHEET_ID / SPREADSHEET_ID)");
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

const auth = new google.auth.JWT({
  email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email,
  key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });
const SHEET_NAME = "Sheet1";

/**
 * Get next empty row (Status empty)
 */
export async function getNextBlogRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:F1000`
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = row[4];

    if (!status || status.trim() === "") {
      return {
        rowIndex: i + 2,
        title: row[1]
      };
    }
  }

  return null;
}

/**
 * Add new AI-generated topic if sheet is empty
 */
export async function addNewTopicToSheet({ title }) {
  const slug = slugify(title, { lower: true, strict: true });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:F`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          new Date().toISOString().split("T")[0],
          title,
          title,
          slug,
          "",
          ""
        ]
      ]
    }
  });
}

/**
 * Update row status
 */
export async function updateRowStatus(rowIndex, status) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!E${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]]
    }
  });
}
