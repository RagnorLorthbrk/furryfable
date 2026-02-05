import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

// 🔴 THIS MUST MATCH YOUR TAB NAME EXACTLY
const SHEET_NAME = "FurryFable Blog Automation";

if (!SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

if (!SHEET_ID) {
  throw new Error("❌ GOOGLE_SHEET_ID missing");
}

const auth = new google.auth.JWT(
  JSON.parse(SERVICE_ACCOUNT_JSON).client_email,
  null,
  JSON.parse(SERVICE_ACCOUNT_JSON).private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });

export async function getNextBlogRow() {
  const range = `${SHEET_NAME}!A2:F`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const status = row[4]; // Column E = Status

    if (!status || status === "NEW") {
      return {
        rowIndex: i + 2,
        date: row[0],
        title: row[1],
        keyword: row[2],
        slug: row[3],
        imageTheme: row[5]
      };
    }
  }

  return null;
}

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
