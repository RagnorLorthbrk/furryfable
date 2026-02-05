import { google } from "googleapis";

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  throw new Error("❌ GOOGLE_SERVICE_ACCOUNT_JSON missing");
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const RANGE = "Sheet1!A2:F";

export async function getNextBlogRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const [date, title, keyword, slug, status, imageTheme] = rows[i];
    if (status === "READY") {
      return {
        rowIndex: i + 2,
        title,
        slug,
        imageTheme
      };
    }
  }

  return null;
}

export async function updateRowStatus(rowIndex, status) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `Sheet1!E${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status]]
    }
  });
}
