import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SHEET_ID) {
  throw new Error("❌ GOOGLE_SHEET_ID missing");
}

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

const auth = new google.auth.JWT({
  email: JSON.parse(SERVICE_ACCOUNT_JSON).client_email,
  key: JSON.parse(SERVICE_ACCOUNT_JSON).private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

// ⚠️ SHEET NAME MUST MATCH EXACTLY
const SHEET_NAME = "FurryFable Blog Automation";

// Column mapping
// A = Date
// B = Title
// C = Primary Keyword
// D = Slug
// E = Status
// F = Image Theme

/**
 * Get first row where Status is empty
 */
export async function getNextBlogRow() {
  const range = `'${SHEET_NAME}'!A2:F`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = row[4]; // column E

    if (!status || status.trim() === "") {
      return {
        rowIndex: i + 2, // sheet rows start at 1, data starts at row 2
        title: row[1],
        primaryKeyword: row[2],
        slug: row[3],
        imageTheme: row[5] || ""
      };
    }
  }

  return null;
}

/**
 * Update status column (E)
 */
export async function updateStatus(rowIndex, status) {
  const range = `'${SHEET_NAME}'!E${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]]
    }
  });
}
