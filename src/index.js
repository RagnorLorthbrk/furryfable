import { google } from "googleapis";
import { generateTopic } from "./topicGenerator.js";

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
    if (!rows[i][4]) {
      return { row: rows[i], rowIndex: i + 2 };
    }
  }

  return null;
}

async function appendRow(topic) {
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

  console.log("New topic appended and marked IN_PROGRESS");
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

  if (next) {
    console.log("Using existing row:", next.row);
    await markInProgress(next.rowIndex);
    return;
  }

  console.log("No empty rows found. Generating new topic...");
  const topic = await generateTopic();
  await appendRow(topic);
}

main();
