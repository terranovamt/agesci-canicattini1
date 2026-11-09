"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { renderHtml } = require("./site-layout.cjs");

const siteRoot = path.resolve(__dirname, "..");
const publicEntries = [
  "404.html",
  "index.html",
  "manifest.webmanifest",
  "assets",
  "config",
  "calendars",
  "documents",
  "documenti",
  "area-riservata",
  "assemblea",
  "peg",
];

function buildSite(destination = path.join(siteRoot, "dist")) {
  const output = path.resolve(destination);
  if (
    output === siteRoot ||
    publicEntries.some(
      (entry) => output === path.join(siteRoot, entry) || output.startsWith(path.join(siteRoot, entry) + path.sep),
    )
  )
    throw new Error("La build non puo sovrascrivere i sorgenti pubblici");
  fs.mkdirSync(output, { recursive: true });
  for (const entry of publicEntries)
    fs.cpSync(path.join(siteRoot, entry), path.join(output, entry), { recursive: true });
  function versionAssets(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        versionAssets(file);
        continue;
      }
      if (!file.endsWith(".html")) continue;
      const relative = path.relative(output, file).split(path.sep).join("/");
      const html = renderHtml(fs.readFileSync(file, "utf8"), relative);
      const generated = html.replace(
        /(<(?:script|link)\b[^>]*?\b(?:src|href)=)(["'])([^"']+)\2/g,
        (match, tag, quote, reference) => {
          const url = new URL(reference, "https://static.invalid/" + relative);
          if (
            url.origin !== "https://static.invalid" ||
            !/\.(?:js|css)$/.test(url.pathname) ||
            /\/(?:config\/site|dati)\.js$/.test(url.pathname)
          )
            return match;
          const asset = path.resolve(output, "." + decodeURIComponent(url.pathname));
          if (!asset.startsWith(output + path.sep) || !fs.existsSync(asset)) return match;
          url.searchParams.set(
            "v",
            crypto.createHash("sha256").update(fs.readFileSync(asset)).digest("hex").slice(0, 12),
          );
          return tag + quote + reference.split(/[?#]/, 1)[0] + url.search + url.hash + quote;
        },
      );
      fs.writeFileSync(file, generated);
    }
  }
  versionAssets(output);
  return output;
}

module.exports = { buildSite };
if (require.main === module) console.log("Sito statico: " + buildSite(process.argv[2]));
