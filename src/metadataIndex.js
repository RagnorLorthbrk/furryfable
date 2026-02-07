import fs from "fs";
import path from "path";
import { execSync } from "child_process";

console.log("Starting blog metadata automation…");

// 1. Detect newly added blog file
const diff = execSync("git diff --name-only HEAD~1", { encoding: "utf-8" });
const blogFiles = diff
  .split("\n")
  .filter(f => f.startsWith("blog/") && f.endsWith(".md"));

if (blogFiles.length === 0) {
  console.log("No new blog detected. Exiting safely.");
  process.exit(0);
}

if (blogFiles.length > 1) {
  console.error("More than one new blog detected. Aborting for safety.");
  process.exit(1);
}

const blogPath = blogFiles[0];
console.log(`Detected new blog: ${blogPath}`);

// 2. Read blog content
const blogContent = fs.readFileSync(path.resolve(blogPath), "utf-8");

// TEMP: just log size so we know pipeline works
console.log(`Blog content length: ${blogContent.length} chars`);

console.log("Metadata workflow completed (stub mode).");
