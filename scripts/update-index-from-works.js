#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const ROOT = path.resolve(__dirname, "..");
const WORKS_YML = path.join(ROOT, "works.yml");
const INDEX_HTML = path.join(ROOT, "index.html");

const LEGACY_START_MARKER = "<!-- AUTO-WORKS-LIST:START -->";
const LEGACY_END_MARKER = "<!-- AUTO-WORKS-LIST:END -->";
const WORK_MARKER_PREFIX = "AUTO-WORK-LINKS";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeHref(rawLink) {
  if (Array.isArray(rawLink)) {
    return String(rawLink[0] ?? "").trim();
  }
  return String(rawLink ?? "").trim();
}

function normalizeWorkKey(work, index) {
  const raw = String(work.id ?? "").trim() || String(index + 1);
  return raw.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function renderLink(link) {
  const href = normalizeHref(link.link);
  if (!href) return "";

  const label = String(link.name || link.type || href);
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);

  if (Boolean(link.external)) {
    return (
      `<a class="work-link-external" href="${safeHref}" target="_blank" rel="noopener noreferrer">` +
      `${safeLabel}<sup class="external-cite" aria-hidden="true">&#8599;</sup>` +
      `</a>`
    );
  }

  return `<a class="work-link-internal" href="${safeHref}">${safeLabel}</a>`;
}

function collectTranslations(work) {
  const translations = [];
  const translationGroups = work.translations || {};

  Object.keys(translationGroups).forEach((language) => {
    toArray(translationGroups[language]).forEach((translation) => {
      translations.push({ language, ...translation });
    });
  });

  return translations;
}

function hasRenderableLinks(translation) {
  return toArray(translation.links).some((link) => normalizeHref(link.link));
}

function renderWorkRow(work, workIndex) {
  const key = normalizeWorkKey(work, workIndex);
  const translations = collectTranslations(work).filter(hasRenderableLinks);
  if (!translations.length) return null;

  const lines = [];
  lines.push(`            <!-- ${WORK_MARKER_PREFIX}:${key}:START -->`);
  lines.push('            <li class="sermon-work-links-item">');

  translations.forEach((translation) => {
    const edition = escapeHtml(String(translation.id || "Unknown edition"));
    const occursOn = String(translation.occurs_on || "").trim();
    const occursOnHtml = occursOn
      ? ` <span class="sermon-work-links-occurs">(${escapeHtml(occursOn)})</span>`
      : "";

    const links = toArray(translation.links)
      .map(renderLink)
      .filter(Boolean)
      .join(' <span class="sermon-work-links-sep" aria-hidden="true">&middot;</span> ');

    lines.push(
      `              <p class="sermon-work-links-meta"><strong>${edition}</strong>${occursOnHtml}: ${links}</p>`,
    );
  });

  lines.push("            </li>");
  lines.push(`            <!-- ${WORK_MARKER_PREFIX}:${key}:END -->`);
  return lines.join("\n");
}

function stripGeneratedBlocks(htmlFragment) {
  let out = String(htmlFragment);

  const legacyRegex = new RegExp(
    `${escapeRegex(LEGACY_START_MARKER)}[\\s\\S]*?${escapeRegex(LEGACY_END_MARKER)}\\s*`,
    "g",
  );
  out = out.replace(legacyRegex, "");

  const workBlockRegex = new RegExp(
    `<!--\\s*${WORK_MARKER_PREFIX}:[^:>]+:START\\s*-->[\\s\\S]*?<!--\\s*${WORK_MARKER_PREFIX}:[^:>]+:END\\s*-->\\s*`,
    "g",
  );
  out = out.replace(workBlockRegex, "");

  return out;
}

function insertWorkRowsInSermonList(sermonListBody, works) {
  let body = stripGeneratedBlocks(sermonListBody).replace(/\s+$/, "");
  const appendRows = [];

  works.forEach((work, idx) => {
    const row = renderWorkRow(work, idx);
    if (!row) return;

    const workId = String(work.id ?? "").trim();
    let inserted = false;

    if (workId) {
      const byHrefRegex = new RegExp(
        `(<li>\\s*<a[^>]+href=\"(?:\\./)?sermons/${escapeRegex(workId)}\\.html\"[^>]*>[\\s\\S]*?<\\/li>)`,
        "m",
      );

      if (byHrefRegex.test(body)) {
        body = body.replace(byHrefRegex, `$1\n${row}`);
        inserted = true;
      }
    }

    if (!inserted) {
      appendRows.push(row);
    }
  });

  if (appendRows.length) {
    body = `${body}\n${appendRows.join("\n")}`;
  }

  return body;
}

function updateIndex(indexHtml, works) {
  const listRegex = /(<ul[^>]*id=\"sermon-list\"[^>]*>)([\s\S]*?)(\n\s*<\/ul>)/m;
  const match = String(indexHtml).match(listRegex);
  if (!match) {
    throw new Error('Could not find <ul id="sermon-list"> in index.html');
  }

  const [, open, body, close] = match;
  const updatedBody = insertWorkRowsInSermonList(body, works);

  return String(indexHtml).replace(listRegex, `${open}${updatedBody}${close}`);
}

function main() {
  const worksRaw = fs.readFileSync(WORKS_YML, "utf8");
  const indexRaw = fs.readFileSync(INDEX_HTML, "utf8");

  const parsed = YAML.parse(worksRaw) || {};
  const works = toArray(parsed.works);

  const updated = updateIndex(indexRaw, works);

  if (updated !== indexRaw) {
    fs.writeFileSync(INDEX_HTML, updated, "utf8");
    console.log(`Updated ${INDEX_HTML} from ${WORKS_YML} (${works.length} works).`);
  } else {
    console.log("No changes needed.");
  }
}

main();
