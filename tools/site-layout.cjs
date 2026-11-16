"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const partials = new Set(["brand", "footer", "menu-toggle"]);
const escape = value => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
let currentRevision;

function normalizeRevision(revision) {
  if (revision === "manual") return revision;
  if (typeof revision !== "string" || !/^[a-f0-9]{7,40}$/i.test(revision))
    throw new Error("Hash del commit di release non valido");
  return revision.toLowerCase();
}

function resolveRevision() {
  if (currentRevision) return currentRevision;
  const supplied = process.env.NAS_RELEASE_REVISION;
  if (supplied) return (currentRevision = normalizeRevision(supplied));
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
  });
  if (result.error) throw new Error("Impossibile leggere il commit Git: " + result.error.message);
  if (result.status !== 0) throw new Error("Impossibile leggere il commit Git: " + result.stderr.trim());
  return (currentRevision = normalizeRevision(result.stdout.trim()));
}

function renderHtml(source, page, revision) {
  const segments = page.split("/");
  if (path.isAbsolute(page) || segments.some(segment => !segment || segment === "." || segment === ".."))
    throw new Error("Percorso pagina non valido: " + page);
  const prefix = "../".repeat(segments.length - 1);
  const html = source.replace(/<!-- include:([\w-]+)(?: (\{[^\n]*\}))? -->/g, (_, name, options) => {
    if (!partials.has(name)) throw new Error("Frammento HTML sconosciuto: " + name);
    const parameters = options ? JSON.parse(options) : {};
    if (!parameters || Array.isArray(parameters) || Object.entries(parameters).some(([key, value]) =>
      !["caption", "top"].includes(key) || typeof value !== "string"))
      throw new Error("Parametri del frammento HTML non validi: " + name);
    const values = {
      home: prefix || "./",
      assets: prefix + "assets/",
      caption: parameters.caption ?? "Associazione Guide e Scouts Cattolici Italiani",
      top: parameters.top ?? "contenuto",
    };
    if (name === "footer")
      values.commit = (revision === undefined ? resolveRevision() : normalizeRevision(revision)).slice(0, 7);
    return fs.readFileSync(path.join(__dirname, "partials", name + ".html"), "utf8")
      .trimEnd().replace(/\{\{(\w+)\}\}/g, (_, key) => {
        if (!(key in values)) throw new Error("Variabile del frammento HTML sconosciuta: " + key);
        return escape(values[key]);
      });
  });
  if (html.includes("<!-- include:")) throw new Error("Inclusione HTML non valida: " + page);
  return html;
}

module.exports = { renderHtml };
