/**
 * FBP Hub — External Player Link Generator
 * ──────────────────────────────────────────
 * Generates links to BBRef, FanGraphs, MLB.com, and Yahoo.
 * Uses stored IDs (bbref_id, fangraphs_id, mlb_id, yahoo_id)
 * when available; falls back to name-based URL generation.
 *
 * Usage:
 *   const html = window.PlayerLinks.renderBadges(player);
 *   container.innerHTML = html;
 */

(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────

  /** Strip accents → ASCII lowercase. */
  function normalize(str) {
    return (str || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** Split "First Last Jr." → [first, last] (strips suffixes). */
  function nameParts(full) {
    const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
    const parts = (full || '').trim().split(/\s+/);
    if (parts.length > 2 && suffixes.has(parts[parts.length - 1].toLowerCase().replace('.', ''))) {
      parts.pop();
    }
    if (parts.length === 1) return [parts[0], parts[0]];
    return [parts[0], parts.slice(1).join(' ')];
  }

  /** Make a string URL-path safe (lowercase, hyphens). */
  function slugify(s) {
    return normalize(s).replace(/['.]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim();
  }

  // ── Baseball Reference ──────────────────────────────────────

  function bbrefUrl(player) {
    const id = player.bbref_id;
    if (id) {
      const letter = id.charAt(0);
      return `https://www.baseball-reference.com/players/${letter}/${id}.shtml`;
    }
    // Algorithmic fallback: {last5}{first2}01
    const [first, last] = nameParts(player.name || '');
    const lastClean = normalize(last).replace(/[\s-]/g, '');
    const firstClean = normalize(first).replace(/[\s-]/g, '');
    const generated = lastClean.slice(0, 5) + firstClean.slice(0, 2) + '01';
    return `https://www.baseball-reference.com/players/${generated.charAt(0)}/${generated}.shtml`;
  }

  // ── FanGraphs ───────────────────────────────────────────────

  function fangraphsUrl(player) {
    const fgId = player.fangraphs_id;
    const slug = slugify(player.name || '');
    if (fgId) {
      return `https://www.fangraphs.com/players/${slug}/${fgId}/stats`;
    }
    // Name-slug fallback (FG redirects if unique)
    return `https://www.fangraphs.com/players/${slug}/`;
  }

  // ── MLB.com ─────────────────────────────────────────────────

  function mlbUrl(player) {
    const mlbId = player.mlb_id;
    const slug = slugify(player.name || '');
    if (mlbId) {
      return `https://www.mlb.com/player/${slug}-${mlbId}`;
    }
    return `https://www.mlb.com/search#query=${encodeURIComponent(player.name || '')}`;
  }

  // ── Yahoo Fantasy ───────────────────────────────────────────

  function yahooUrl(player) {
    const yid = player.yahoo_id;
    if (yid) {
      return `https://sports.yahoo.com/mlb/players/${yid}`;
    }
    return '';
  }

  // ── Badge renderer ──────────────────────────────────────────

  /**
   * Render compact link badges for a player.
   * @param {Object} player — combined_players record
   * @returns {string} HTML string of anchor badges
   */
  function renderBadges(player) {
    if (!player || !player.name) return '';

    const links = [
      { url: bbrefUrl(player),     cls: 'ext-link--bbref', label: 'BBRef' },
      { url: fangraphsUrl(player), cls: 'ext-link--fg',    label: 'FG' },
      { url: mlbUrl(player),       cls: 'ext-link--mlb',   label: 'MLB' },
    ];

    const yUrl = yahooUrl(player);
    if (yUrl) {
      links.push({ url: yUrl, cls: 'ext-link--yahoo', label: 'Yahoo' });
    }

    return links.map(l =>
      `<a href="${l.url}" target="_blank" rel="noopener" class="ext-link ${l.cls}">${l.label}</a>`
    ).join('');
  }

  // ── Public API ──────────────────────────────────────────────

  window.PlayerLinks = {
    bbrefUrl,
    fangraphsUrl,
    mlbUrl,
    yahooUrl,
    renderBadges,
  };

})();
