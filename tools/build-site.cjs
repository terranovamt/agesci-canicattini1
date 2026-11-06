"use strict";

const fs = require("node:fs");
const path = require("node:path");

const siteRoot = path.resolve(__dirname, "..");
const publicEntries = ["index.html", "manifest.webmanifest", "assets", "config", "calendars", "documents", "documenti", "area-riservata", "assemblea", "peg"];

function buildSite(destination = path.join(siteRoot, "dist")) {
  const output = path.resolve(destination);
  if (output === siteRoot || publicEntries.some(entry => output === path.join(siteRoot, entry) || output.startsWith(path.join(siteRoot, entry) + path.sep)))
    throw new Error("La build non puo sovrascrivere i sorgenti pubblici");
  fs.mkdirSync(output, { recursive: true });
  for (const entry of publicEntries) fs.cpSync(path.join(siteRoot, entry), path.join(output, entry), { recursive: true });
  return output;
}

module.exports = { buildSite };
if (require.main === module) console.log("Sito statico: " + buildSite(process.argv[2]));