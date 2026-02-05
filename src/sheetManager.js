import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = "Sheet1"; // change only if your tab name is different

export async function getNextReadyRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:F`
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const status = rows[i][4];
    if (status === "READY") {
      return {
        rowIndex: i + 2,
        date: rows[i][0],
        title: rows[i][1],
        keyword: rows[i][2],
        slug: rows[i][3],
        imageTheme: rows[i][5]
      };
    }
  }

  return null;
}

export async function updateStatus(rowIndex, status, extra = {}) {
  const updates = [
    [status]
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!E${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: updates
    }
  });

  if (extra.url) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!G${rowIndex}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[extra.url]]
      }
    });
  }
}
