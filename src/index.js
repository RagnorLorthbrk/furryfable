import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

async function getNextRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "blogs!A2:F"
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const status = rows[i][4];
    if (!status) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }

  return null;
}

async function markInProgress(rowIndex) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `blogs!E${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["IN_PROGRESS"]]
    }
  });
}

async function main() {
  const next = await getNextRow();

  if (!next) {
    console.log("No unpublished rows found");
    return;
  }

  console.log("Selected row:", next.row);

  await markInProgress(next.rowIndex);

  console.log(`Row ${next.rowIndex} marked as IN_PROGRESS`);
}

main();
