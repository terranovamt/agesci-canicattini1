"use strict";

const fs = require("node:fs");
const path = require("node:path");
const partials = new Set(["brand", "footer", "menu-toggle"]);
const escape = value => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function renderHtml(source, page) {
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
