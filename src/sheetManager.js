import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!SHEET_ID) {
  throw new Error("❌ GOOGLE_SHEET_ID missing");
}

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

const creds = JSON.parse(SERVICE_ACCOUNT_JSON);

const auth = new google.auth.JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

const SHEET_NAME = "blogs";

/**
 * Get next blog row where Status (column E) is empty
 */
export async function getNextBlogRow() {
  const range = `${SHEET_NAME}!A2:F`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const status = row[4]; // Column E

    if (!status || status.trim() === "") {
      return {
        rowIndex: i + 2,
        date: row[0],
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
 * Update Status column
 */
export async function updateStatus(rowIndex, status) {
  const range = `${SHEET_NAME}!E${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]]
    }
  });
}
