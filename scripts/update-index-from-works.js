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

function normalizeHrefs(rawLink) {
  if (Array.isArray(rawLink)) {
    return rawLink
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  const one = String(rawLink ?? "").trim();
  return one ? [one] : [];
}

function normalizeWorkKey(work, index) {
  const raw = String(work.id ?? "").trim() || String(index + 1);
  return raw.replace(/[^A-Za-z0-9_-]+/g, "-");
}

function renderLink(link) {
  const hrefs = normalizeHrefs(link.link);
  if (!hrefs.length) return "";

  const baseLabel = String(link.name || link.type || hrefs[0]);
  const rendered = hrefs.map((href, idx) => {
    const label =
      hrefs.length > 1 ? `${baseLabel} (${idx + 1})` : baseLabel;
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
  });

  return rendered.join(", ");
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
  return toArray(translation.links).some(
    (link) => normalizeHrefs(link.link).length > 0,
  );
}

function parseSermonTitle(workTitle, workId) {
  const title = String(workTitle || "").trim();
  const rx = /^sermon\s+(\d+)\s*-\s*(.+)$/i;
  const match = title.match(rx);

  if (match) {
    const sermonNumber = String(parseInt(match[1], 10));
    return {
      fullTitle: `Sermon ${sermonNumber} - ${match[2].trim()}`,
      numberLabel: `Sermon ${sermonNumber}`,
      nameLabel: match[2].trim(),
    };
  }

  const fallbackNumber = String(workId || "").trim();
  const numberLabel = fallbackNumber
    ? `Sermon ${fallbackNumber}`
    : "Untitled Sermon";
  const nameLabel = title || "Untitled";
  return {
    fullTitle: `${numberLabel} - ${nameLabel}`,
    numberLabel,
    nameLabel,
  };
}

function renderSermonListItem(work) {
  const workId = String(work.id ?? "").trim();
  if (!workId) return null;

  const parsed = parseSermonTitle(work.title, workId);
  return [
    "            <li>",
    `              <a href="sermons/${escapeHtml(workId)}.html" data-title="${escapeHtml(parsed.fullTitle)}">`,
    `                <span class="sermon-number">${escapeHtml(parsed.numberLabel)}</span>`,
    `                <span class="sermon-name">${escapeHtml(parsed.nameLabel)}</span>`,
    "              </a>",
    "            </li>",
  ].join("\n");
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
      const sermonItem = renderSermonListItem(work);
      if (sermonItem) {
        appendRows.push(sermonItem);
      }
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
