(function (root) {
  "use strict";

  const STORAGE_KEY = "agesci-canicattini1.canzoniere.playlist.v1";
  const MAX_SONGS = 100;
  const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function validate(slugs) {
    if (!Array.isArray(slugs) || slugs.length > MAX_SONGS ||
        slugs.some((slug) => typeof slug !== "string" || !SLUG.test(slug)) ||
        new Set(slugs).size !== slugs.length)
      throw new Error("Scaletta locale non valida.");
    return [...slugs];
  }

  function read() {
    try {
      const saved = root.localStorage.getItem(STORAGE_KEY);
      return { slugs: saved === null ? [] : validate(JSON.parse(saved)), error: null };
    } catch (error) {
      return { slugs: [], error };
    }
  }

  function write(slugs) {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(validate(slugs)));
      return { ok: true, error: null };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function shareUrl(slugs, currentUrl) {
    const validated = validate(slugs);
    if (!validated.length) throw new Error("Aggiungi almeno una canzone prima di condividere la scaletta.");
    const url = new URL("canzone.html", currentUrl);
    url.searchParams.set("slugs", validated.join(","));
    return url.href;
  }

  root.CANZONIERE_PLAYLIST_STORE = Object.freeze({ read, shareUrl, validate, write });
})(typeof window === "object" ? window : globalThis);
