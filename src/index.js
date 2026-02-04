import { google } from "googleapis";
import { generateTopic } from "./topicGenerator.js";

console.log("Gemini key present:", !!process.env.GEMINI_API_KEY);

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

const sheets = google.sheets({ version: "v4", auth });

const SHEET_RANGE = "blogs!A2:F";

async function getNextEmptyRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: SHEET_RANGE
  });

  const rows = res.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][4]) {
      return { rowIndex: i + 2 };
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

async function appendNewRow(topic) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "blogs!A:F",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        topic.date,
        topic.title,
        topic.primaryKeyword,
        topic.slug,
        "IN_PROGRESS",
        topic.imageTheme
      ]]
    }
  });
}

async function main() {
  const emptyRow = await getNextEmptyRow();

  if (emptyRow) {
    console.log("Using existing empty row:", emptyRow.rowIndex);
    await markInProgress(emptyRow.rowIndex);
    return;
  }

  console.log("No empty rows found. Generating new topic...");
  const topic = await generateTopic();
  await appendNewRow(topic);
  console.log("New topic appended and locked");
}

main().catch(err => {
  console.error("FATAL ERROR:", err.message);
  process.exit(1);
});
