import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

const credentials = JSON.parse(SERVICE_ACCOUNT_JSON);

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

const SHEET_NAME = "blogs"; // ⚠️ THIS MATCHES YOUR TAB NAME

/**
 * Get next blog row where Status is empty
 */
export async function getNextBlogRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:F`
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const [
      date,
      title,
      primaryKeyword,
      slug,
      status,
      imageTheme
    ] = rows[i];

    if (!status || status.trim() === "") {
      return {
        rowIndex: i + 2, // Sheet row number
        title,
        primaryKeyword,
        slug,
        imageTheme
      };
    }
  }

  return null;
}

/**
 * Update status cell
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
