(function () {
  const audio = document.getElementById("sermon-audio");
  const article = document.querySelector(".sermon-content");
  const status = document.getElementById("sync-status");
  const reorientBtn = document.getElementById("reorient-audio");
  const mainContent = document.getElementById("main-content");
  const pageHeader = document.querySelector(".page-header");

  if (!audio || !article || !status || !reorientBtn || !mainContent) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const markerPrefKey = "eckhart-page-markers-visible";
  const modernizedPrefKey = "eckhart-modernized-text";
  let followMode = true;
  let suppressNextScrollEvent = false;
  let userScrollIntentUntil = 0;
  let activeSentences = [];
  let sentenceElements = [];
  let sentenceBaseTexts = [];
  let cues = [];
  let cueSentenceRanges = [];
  let syncReady = false;
  let lastResolvedSentenceIdx = -1;
  let modernizedTargets = [];
  const modernToggleWrap = document.createElement("div");
  const modernToggleLabel = document.createElement("label");
  const modernToggleInput = document.createElement("input");
  const modernToggleText = document.createElement("span");
  const markerToggleWrap = document.createElement("div");
  const markerToggleLabel = document.createElement("label");
  const markerToggleInput = document.createElement("input");
  const markerToggleText = document.createElement("span");
  const archiveId =
    article.getAttribute("data-archive-id") || "meistereckhart0001eckh";
  const archivePageOffset = Number.parseInt(
    article.getAttribute("data-page-offset") || "0",
    10,
  );

  function setStatus(message) {
    status.textContent = message;
  }

  function applyPageMarkerVisibility(visible, persist = true) {
    document.body.classList.toggle("hide-page-markers", !visible);
    markerToggleInput.checked = visible;
    if (!persist) return;
    try {
      window.localStorage.setItem(markerPrefKey, visible ? "1" : "0");
    } catch (_error) {
      // Ignore storage unavailability.
    }
  }

  function initPageMarkerToggle(markerCount) {
    if (!Number.isFinite(markerCount) || markerCount <= 0) {
      return;
    }

    markerToggleWrap.className = "page-marker-toggle";
    markerToggleLabel.className = "page-marker-toggle-label";
    markerToggleInput.className = "page-marker-toggle-input";
    markerToggleInput.type = "checkbox";
    markerToggleInput.setAttribute("aria-controls", "main-content");
    markerToggleText.textContent = "Show in-text hyperlinked page numbers";
    markerToggleLabel.appendChild(markerToggleInput);
    markerToggleLabel.appendChild(markerToggleText);
    markerToggleWrap.appendChild(markerToggleLabel);

    let initialVisible = true;
    try {
      const stored = window.localStorage.getItem(markerPrefKey);
      if (stored === "0") initialVisible = false;
    } catch (_error) {
      // Ignore storage unavailability.
    }

    markerToggleInput.addEventListener("change", () =>
      applyPageMarkerVisibility(markerToggleInput.checked, true),
    );

    insertTopToggle(markerToggleWrap);
    applyPageMarkerVisibility(initialVisible, false);
  }

  function insertTopToggle(toggleElement) {
    if (pageHeader && pageHeader.parentNode) {
      pageHeader.parentNode.insertBefore(toggleElement, mainContent);
    } else if (mainContent.parentNode) {
      mainContent.parentNode.insertBefore(toggleElement, mainContent);
    }
  }

  function collectModernizedTargets() {
    const hosts = Array.from(article.querySelectorAll("[data-gloss]"));
    const targets = [];

    hosts.forEach((host) => {
      const modernText = (host.getAttribute("data-gloss") || "").trim();
      if (!modernText) return;

      const sentenceNodes = Array.from(host.querySelectorAll(".sermon-sentence"));
      if (sentenceNodes.length !== 1) {
        console.warn("Skipping unsupported data-gloss structure", host);
        return;
      }

      const sentenceNode = sentenceNodes[0];
      const originalText = sentenceNode.textContent || "";
      if (!originalText.trim()) return;

      targets.push({ sentenceNode, originalText, modernText });
    });

    return targets;
  }

  function applyModernizedText(enabled, persist = true) {
    modernToggleInput.checked = enabled;
    modernizedTargets.forEach((target) => {
      target.sentenceNode.textContent = enabled
        ? target.modernText
        : target.originalText;
    });

    if (!persist) return;
    try {
      window.localStorage.setItem(modernizedPrefKey, enabled ? "1" : "0");
    } catch (_error) {
      // Ignore storage unavailability.
    }
  }

  function initModernizedToggle() {
    modernizedTargets = collectModernizedTargets();
    if (!modernizedTargets.length) return;

    modernToggleWrap.className = "text-modernize-toggle page-marker-toggle";
    modernToggleLabel.className =
      "text-modernize-toggle-label page-marker-toggle-label";
    modernToggleInput.className =
      "text-modernize-toggle-input page-marker-toggle-input";
    modernToggleInput.type = "checkbox";
    modernToggleInput.setAttribute("aria-controls", "main-content");
    modernToggleText.textContent = "Use modernized text";
    modernToggleLabel.appendChild(modernToggleInput);
    modernToggleLabel.appendChild(modernToggleText);
    modernToggleWrap.appendChild(modernToggleLabel);

    let initialEnabled = false;
    try {
      initialEnabled = window.localStorage.getItem(modernizedPrefKey) === "1";
    } catch (_error) {
      // Ignore storage unavailability.
    }

    modernToggleInput.addEventListener("change", () =>
      applyModernizedText(modernToggleInput.checked, true),
    );

    insertTopToggle(modernToggleWrap);
    applyModernizedText(initialEnabled, false);
  }

  function resolveTranscriptSrc() {
    const explicit = audio.getAttribute("data-srt");
    if (explicit && explicit.trim()) return explicit.trim();

    const sourceEl = audio.querySelector("source[src]");
    const rawAudioSrc =
      audio.getAttribute("src") ||
      (sourceEl ? sourceEl.getAttribute("src") : "") ||
      "";

    if (!rawAudioSrc) return "";

    const replaced = rawAudioSrc.replace(/\.[^./?#]+(?=([?#].*)?$)/, ".srt");
    return replaced === rawAudioSrc ? `${rawAudioSrc}.srt` : replaced;
  }

  function normalizeText(input) {
    return decodeHtmlEntities(stripTranscriptMarkup(input))
      .replace(/^edge-tts\s+--text\s+["']?/, "")
      .replace(/Ã¢â‚¬â„¢|Ã¢â‚¬Ëœ|â€™|â€˜|[’‘]/g, "'")
      .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â|â€œ|â€|[“”]/g, '"')
      .replace(/Ã¢â‚¬â€|â€”|[—–]/g, "-")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function stripTranscriptMarkup(input) {
    return String(input || "")
      // Subtitle line-break tags should become whitespace, not text tokens.
      .replace(/<br\s*\/?>/gi, " ")
      // Drop any HTML-ish formatting tags used in SRT/WebVTT payloads.
      .replace(/<\/?[a-z][^>]*>/gi, " ");
  }

  function decodeHtmlEntities(input) {
    const text = String(input || "");
    if (!text.includes("&")) return text;
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  function parseSrtTimestamp(stamp) {
    const parts = stamp.split(/[:,]/).map(Number);
    const [hh, mm, ss, ms] = parts;
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  }

  function parseSrt(content) {
    return String(content || "")
      .trim()
      .split(/\r?\n\r?\n/)
      .flatMap((block, blockIdx) => {
        const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(
          Boolean,
        );
        if (lines.length < 2) return [];

        const timeLineIdx = lines.findIndex((line) => line.includes("-->"));
        if (timeLineIdx < 0) return [];

        const timeMatch = lines[timeLineIdx].match(
          /(\d\d:\d\d:\d\d,\d\d\d)\s+-->\s+(\d\d:\d\d:\d\d,\d\d\d)/,
        );
        if (!timeMatch) return [];

        const rawId = Number.parseInt(lines[0], 10);
        const cueId = Number.isFinite(rawId) ? rawId : blockIdx + 1;
        const text = lines.slice(timeLineIdx + 1).join(" ").trim();
        const normalized = normalizeText(text);
        if (!normalized) return [];

        return [
          {
            id: cueId,
            start: parseSrtTimestamp(timeMatch[1]),
            end: parseSrtTimestamp(timeMatch[2]),
            startStamp: timeMatch[1],
            endStamp: timeMatch[2],
            text,
            normalized,
          },
        ];
      });
  }

  function splitTextIntoSentenceParts(text) {
    if (!text || !text.trim()) return [];
    // Preserve punctuation-only fragments too, so text like ".â€™" is not lost.
    return text.match(/[^.!?]+[.!?]+|[^.!?]+$|[.!?]+/g) || [];
  }

  function wrapParagraphSentences(paragraph) {
    if (!paragraph) return [];
    paragraph.normalize();
    const made = [];
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((node) => {
      const raw = node.nodeValue || "";
      const parts = splitTextIntoSentenceParts(raw);
      if (!parts.length) return;

      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        const leading = (part.match(/^\s+/) || [""])[0];
        const trailing = (part.match(/\s+$/) || [""])[0];
        const core = part.trim();

        if (leading) fragment.appendChild(document.createTextNode(leading));
        if (core) {
          if (normalizeText(core).length > 0) {
            const span = document.createElement("span");
            span.className = "sermon-sentence";
            span.textContent = core;
            fragment.appendChild(span);
            made.push(span);
          } else {
            fragment.appendChild(document.createTextNode(core));
          }
        }
        if (trailing) fragment.appendChild(document.createTextNode(trailing));
      });

      node.replaceWith(fragment);
    });

    made.forEach((span, idx) => {
      span.dataset.syncSentence = String(idx);
    });
    return made;
  }

  function injectPageMarkerTokens(paragraph) {
    const markers = Array.from(paragraph.querySelectorAll(".page-marker"));
    return markers.map((marker, idx) => {
      const token = `__PM_TOKEN_${idx}_${marker.dataset.page || ""}__`;
      marker.replaceWith(document.createTextNode(token));
      return { token, marker };
    });
  }

  function restorePageMarkers(sentenceSpans, markerTokens) {
    if (!sentenceSpans.length || !markerTokens.length) return;
    const isWordLikeChar = (char) => /[A-Za-z0-9']/.test(char || "");
    const tokenToMarker = new Map();
    markerTokens.forEach(({ token, marker }) => {
      const pageNum = Number.parseInt(marker.dataset.page || "", 10);
      const archivePage =
        Number.isFinite(pageNum) && Number.isFinite(archivePageOffset)
          ? pageNum + archivePageOffset
          : null;

      const link = document.createElement("a");
      link.className = "page-marker-overlay";
      if (marker.dataset.page) link.dataset.page = marker.dataset.page;
      if (archivePage !== null) {
        link.href =
          "https://archive.org/details/" +
          archiveId +
          "/page/" +
          archivePage +
          "/mode/1up";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", "Open source scan page " + archivePage);
        link.title = "Open source scan page " + archivePage;
      }

      tokenToMarker.set(token, link);
    });

    sentenceSpans.forEach((span) => {
      const text = span.textContent || "";
      if (!text.includes("__PM_TOKEN_")) return;

      const fragment = document.createDocumentFragment();
      let cursor = 0;

      while (cursor < text.length) {
        let nextIndex = -1;
        let nextToken = "";

        tokenToMarker.forEach((_marker, token) => {
          const idx = text.indexOf(token, cursor);
          if (idx >= 0 && (nextIndex === -1 || idx < nextIndex)) {
            nextIndex = idx;
            nextToken = token;
          }
        });

        if (nextIndex === -1) {
          fragment.appendChild(document.createTextNode(text.slice(cursor)));
          break;
        }

        if (nextIndex > cursor) {
          fragment.appendChild(
            document.createTextNode(text.slice(cursor, nextIndex)),
          );
        }

        const tokenEndIndex = nextIndex + nextToken.length;
        const prevChar = nextIndex > 0 ? text[nextIndex - 1] : "";
        const nextChar = tokenEndIndex < text.length ? text[tokenEndIndex] : "";
        const needsCopySafeSpacing =
          isWordLikeChar(prevChar) && isWordLikeChar(nextChar);

        const marker = tokenToMarker.get(nextToken);
        if (marker) {
          if (needsCopySafeSpacing) {
            fragment.appendChild(document.createTextNode(" "));
          }
          fragment.appendChild(marker);
          if (needsCopySafeSpacing) {
            fragment.appendChild(document.createTextNode(" "));
          }
          tokenToMarker.delete(nextToken);
        }
        cursor = tokenEndIndex;
      }

      span.replaceChildren(fragment);
    });
  }

  function buildSentenceElements() {
    const paragraphs = Array.from(article.querySelectorAll("p"));
    const collected = [];
    paragraphs.forEach((p) => {
      const markerTokens = injectPageMarkerTokens(p);
      p.normalize();
      const wrapped = wrapParagraphSentences(p);
      restorePageMarkers(wrapped, markerTokens);
      wrapped.forEach((el) => collected.push(el));
    });
    return collected;
  }

  function buildNormalizedSermonIndex() {
    const normalizedSentences = sentenceElements.map((el, idx) => {
      const baseText = sentenceBaseTexts[idx];
      return normalizeText(baseText === undefined ? el.textContent || "" : baseText);
    });
    const fullText = normalizedSentences.join(" ");
    const compactChars = [];
    const compactIndexToSentence = [];
    const compactIndexToFull = [];
    let fullCursor = 0;

    normalizedSentences.forEach((sentence, sentenceIdx) => {
      for (let i = 0; i < sentence.length; i += 1) {
        const ch = sentence[i];
        if (ch === " ") continue;
        compactChars.push(ch);
        compactIndexToSentence.push(sentenceIdx);
        compactIndexToFull.push(fullCursor + i);
      }
      fullCursor += sentence.length;
      if (sentenceIdx < normalizedSentences.length - 1) {
        fullCursor += 1;
      }
    });

    return {
      fullText,
      compactText: compactChars.join(""),
      compactIndexToSentence,
      compactIndexToFull,
      normalizedSentences,
    };
  }

  function findBestExactOffset(haystack, needle, cursor) {
    if (!needle) return { offset: -1, usedBackwardFallback: false };
    let idx = haystack.indexOf(needle);
    let firstForward = -1;
    let nearestBackward = -1;

    while (idx >= 0) {
      if (idx >= cursor) {
        firstForward = idx;
        break;
      }
      nearestBackward = idx;
      idx = haystack.indexOf(needle, idx + 1);
    }

    if (firstForward >= 0) {
      return { offset: firstForward, usedBackwardFallback: false };
    }
    if (nearestBackward >= 0) {
      return { offset: nearestBackward, usedBackwardFallback: true };
    }
    return { offset: -1, usedBackwardFallback: false };
  }

  function mapCuesToSentenceRangesExact() {
    const {
      fullText,
      compactText,
      compactIndexToSentence,
      compactIndexToFull,
    } = buildNormalizedSermonIndex();
    const ranges = new Array(cues.length).fill(null).map(() => ({
      start: -1,
      end: -1,
    }));
    let compactCursor = 0;
    let outOfOrderCount = 0;

    for (let cueIdx = 0; cueIdx < cues.length; cueIdx += 1) {
      const cue = cues[cueIdx];
      const cueText = cue.normalized.replace(/\s+/g, "");
      const exactMatch = findBestExactOffset(compactText, cueText, compactCursor);
      const foundStart = exactMatch.offset;

      if (foundStart < 0) {
        const safeCompactCursor = Math.max(
          0,
          Math.min(compactCursor, compactIndexToFull.length - 1),
        );
        const fullCursor = compactIndexToFull[safeCompactCursor] || 0;
        const excerptStart = Math.max(0, fullCursor - 120);
        const excerptEnd = Math.min(fullText.length, fullCursor + 220);
        return {
          ok: false,
          ranges,
          error: {
            cueIdx,
            cue,
            compactCursor,
            fullCursor,
            sermonAroundCursor: fullText.slice(excerptStart, excerptEnd),
          },
        };
      }

      const foundEnd = foundStart + cueText.length - 1;
      const startSentence = compactIndexToSentence[foundStart];
      const endSentence = compactIndexToSentence[foundEnd];
      if (
        !Number.isFinite(startSentence) ||
        !Number.isFinite(endSentence) ||
        startSentence < 0 ||
        endSentence < startSentence
      ) {
        const safeCompactCursor = Math.max(
          0,
          Math.min(foundStart, compactIndexToFull.length - 1),
        );
        const fullCursor = compactIndexToFull[safeCompactCursor] || 0;
        const excerptStart = Math.max(0, fullCursor - 120);
        const excerptEnd = Math.min(fullText.length, fullCursor + 220);
        return {
          ok: false,
          ranges,
          error: {
            cueIdx,
            cue,
            compactCursor: foundStart,
            fullCursor,
            sermonAroundCursor: fullText.slice(excerptStart, excerptEnd),
          },
        };
      }
      ranges[cueIdx] = { start: startSentence, end: endSentence };
      if (exactMatch.usedBackwardFallback) {
        outOfOrderCount += 1;
      }
      compactCursor = Math.max(compactCursor, foundEnd + 1);
    }

    return { ok: true, ranges, outOfOrderCount };
  }

  function setFollowMode(enabled) {
    followMode = enabled;
    if (enabled) {
      reorientBtn.hidden = true;
      reorientBtn.disabled = true;
      if (syncReady) setStatus("Following audio position.");
    } else {
      reorientBtn.hidden = false;
      reorientBtn.disabled = false;
      if (syncReady) setStatus("Follow paused. Click Reorient to Audio to resume.");
    }
  }

  function maybeAutoScrollToActive() {
    const lead = activeSentences[0] || null;
    if (!followMode || !lead) return;
    const rect = lead.getBoundingClientRect();
    const viewportTop = window.innerHeight * 0.22;
    const viewportBottom = window.innerHeight * 0.78;
    if (rect.top >= viewportTop && rect.bottom <= viewportBottom) return;

    suppressNextScrollEvent = true;
    window.scrollTo({
      top: window.scrollY + rect.top - window.innerHeight * 0.35,
      behavior: reduceMotion ? "auto" : "smooth",
    });
    window.setTimeout(
      () => {
        suppressNextScrollEvent = false;
      },
      reduceMotion ? 0 : 350,
    );
  }

  function isSameSentenceSet(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function updateActiveSentences(nextSentences) {
    if (isSameSentenceSet(activeSentences, nextSentences)) return;
    activeSentences.forEach((el) => el.classList.remove("is-speaking"));
    activeSentences = nextSentences.slice();
    activeSentences.forEach((el) => el.classList.add("is-speaking"));
    maybeAutoScrollToActive();
  }

  function findCueIndex(timeSec) {
    const activeIndices = [];
    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i];
      if (cue.start > timeSec && activeIndices.length > 0) break;
      if (timeSec >= cue.start && timeSec < cue.end) {
        if (cueSentenceRanges[i] && cueSentenceRanges[i].start >= 0) {
          activeIndices.push(i);
        }
      }
    }

    if (!activeIndices.length) return -1;
    if (activeIndices.length === 1) return activeIndices[0];

    if (lastResolvedSentenceIdx >= 0) {
      let bestIdx = activeIndices[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestForwardBias = 0;
      activeIndices.forEach((idx) => {
        const range = cueSentenceRanges[idx];
        const distance = Math.abs(range.start - lastResolvedSentenceIdx);
        const forwardBias = range.start >= lastResolvedSentenceIdx ? 1 : 0;
        if (
          distance < bestDistance ||
          (distance === bestDistance && forwardBias > bestForwardBias) ||
          (distance === bestDistance &&
            forwardBias === bestForwardBias &&
            cues[idx].start > cues[bestIdx].start) ||
          (distance === bestDistance &&
            forwardBias === bestForwardBias &&
            cues[idx].start === cues[bestIdx].start &&
            idx > bestIdx)
        ) {
          bestIdx = idx;
          bestDistance = distance;
          bestForwardBias = forwardBias;
        }
      });
      return bestIdx;
    }

    return activeIndices.reduce((best, idx) => {
      if (cues[idx].start > cues[best].start) return idx;
      if (cues[idx].start === cues[best].start && idx > best) return idx;
      return best;
    }, activeIndices[0]);
  }

  function onAudioProgress() {
    if (!syncReady || !cues.length || !cueSentenceRanges.length) return;
    const cueIdx = findCueIndex(audio.currentTime);
    if (cueIdx < 0) {
      updateActiveSentences([]);
      lastResolvedSentenceIdx = -1;
      return;
    }

    const range = cueSentenceRanges[cueIdx];
    if (!range || range.start < 0 || range.end < range.start) {
      updateActiveSentences([]);
      return;
    }

    const safeStart = Math.max(0, Math.min(range.start, sentenceElements.length - 1));
    const safeEnd = Math.max(safeStart, Math.min(range.end, sentenceElements.length - 1));
    lastResolvedSentenceIdx = safeStart;
    updateActiveSentences(sentenceElements.slice(safeStart, safeEnd + 1));
  }

  function markUserScrollIntent() {
    userScrollIntentUntil = Date.now() + 1200;
  }

  window.addEventListener("wheel", markUserScrollIntent, { passive: true });
  window.addEventListener("touchmove", markUserScrollIntent, { passive: true });
  window.addEventListener("keydown", (event) => {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
    ];
    if (keys.includes(event.key)) markUserScrollIntent();
  });

  window.addEventListener(
    "scroll",
    () => {
      if (suppressNextScrollEvent) return;
      if (!followMode) return;
      if (Date.now() <= userScrollIntentUntil) {
        setFollowMode(false);
      }
    },
    { passive: true },
  );

  reorientBtn.addEventListener("click", () => {
    const lead = activeSentences[0] || null;
    if (!lead) {
      setFollowMode(true);
      return;
    }
    setFollowMode(true);
    suppressNextScrollEvent = true;
    lead.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    window.setTimeout(
      () => {
        suppressNextScrollEvent = false;
      },
      reduceMotion ? 0 : 350,
    );
  });

  audio.addEventListener("timeupdate", onAudioProgress);
  audio.addEventListener("seeking", () => {
    lastResolvedSentenceIdx = -1;
    onAudioProgress();
  });
  audio.addEventListener("ended", () => {
    updateActiveSentences([]);
    lastResolvedSentenceIdx = -1;
    if (syncReady) setStatus("Audio ended.");
  });

  (async function init() {
    try {
      sentenceElements = buildSentenceElements();
      sentenceBaseTexts = sentenceElements.map((el) => el.textContent || "");
      if (!sentenceElements.length) {
        setStatus("No sermon text found for synchronization.");
        return;
      }
      initModernizedToggle();
      initPageMarkerToggle(
        article.querySelectorAll(".page-marker-overlay").length,
      );

      const transcriptSrc = resolveTranscriptSrc();
      if (!transcriptSrc) {
        setStatus("No transcript source configured for this sermon.");
        return;
      }
      const response = await fetch(transcriptSrc, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          `Failed to load transcript ${transcriptSrc} (${response.status})`,
        );
      }

      const srtText = await response.text();
      cues = parseSrt(srtText);
      if (!cues.length) {
        setStatus("Transcript loaded, but no timing cues were found.");
        return;
      }

      const mapping = mapCuesToSentenceRangesExact();
      if (!mapping.ok) {
        syncReady = false;
        const failedCue = mapping.error.cue;
        setStatus(
          `Transcript sync failed at cue ${failedCue.id} (${failedCue.startStamp} --> ${failedCue.endStamp}): exact text not found in sermon order.`,
        );
        console.error("Transcript sync failed", {
          cueIndex: mapping.error.cueIdx + 1,
          cueId: failedCue.id,
          timeRange: `${failedCue.startStamp} --> ${failedCue.endStamp}`,
          cueTextExcerpt: failedCue.text.slice(0, 240),
          normalizedCueExcerpt: failedCue.normalized.slice(0, 240),
          compactCursor: mapping.error.compactCursor,
          fullCursor: mapping.error.fullCursor,
          sermonAroundCursor: mapping.error.sermonAroundCursor,
        });
        return;
      }

      cueSentenceRanges = mapping.ranges;
      syncReady = true;
      if (mapping.outOfOrderCount > 0) {
        setStatus(
          `Transcript sync ready (${cueSentenceRanges.length}/${cues.length} cues mapped, ${mapping.outOfOrderCount} out-of-order cues handled).`,
        );
      } else {
        setStatus(`Transcript sync ready (${cueSentenceRanges.length}/${cues.length} cues mapped).`);
      }
    } catch (error) {
      console.error(error);
      setStatus("Audio sync unavailable. Playback still works.");
    }
  })();
})();

