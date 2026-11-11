// Android release configuration and the pure logic that picks the newest APK.
// Kept free of React/DOM so it can be unit-tested with `node --test`.

export const GITHUB_REPO = 'sufyan-github/KaJ-App';
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`;
export const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;
export const RELEASE_TIMEOUT_MS = 4000;
export const MIN_ANDROID = '8.0';
export const PACKAGE_NAME = 'app.kaaj.mobile';

// Last known build. Used until (or instead of) the live GitHub lookup.
export const FALLBACK_RELEASE = Object.freeze({
  tag: 'v1.0.2',
  version: '1.0.2',
  versionCode: 3,
  name: 'Kaaj 1.0.2 Pilot',
  prerelease: true,
  publishedAt: '2026-10-20T07:54:51Z',
  fileName: 'Kaaj-1.0.2-android.apk',
  sizeBytes: 64876324,
  downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/v1.0.2/Kaaj-1.0.2-android.apk`,
  releaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/v1.0.2`,
  sha256: 'efc831fc804d4370d04ddad5e7ba2abc7de03b2650a2e86eb44544d88e1d75c4',
  source: 'fallback',
});

const SHA256_RE = /^[a-f0-9]{64}$/;

function versionFromTag(tag) {
  return String(tag || '').trim().replace(/^v(?=\d)/i, '');
}

function shaFor(tag, asset) {
  // GitHub exposes `digest: "sha256:<hex>"` for newer uploads; otherwise only trust the hash we
  // recorded for the exact fallback version.
  const digest = typeof asset?.digest === 'string' ? asset.digest.toLowerCase() : '';
  if (digest.startsWith('sha256:') && SHA256_RE.test(digest.slice(7))) return digest.slice(7);
  return tag === FALLBACK_RELEASE.tag ? FALLBACK_RELEASE.sha256 : null;
}

/**
 * Pick the newest non-draft release (pre-releases allowed) that ships an `.apk` asset.
 * Returns a normalized release object, or null when nothing usable is present.
 */
export function pickLatestApkRelease(releases) {
  if (!Array.isArray(releases)) return null;
  const candidates = [];
  for (const release of releases) {
    if (!release || typeof release !== 'object' || release.draft) continue;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const apk = assets.find((asset) => typeof asset?.name === 'string'
      && asset.name.toLowerCase().endsWith('.apk')
      && typeof asset.browser_download_url === 'string'
      && asset.browser_download_url.startsWith('https://'));
    if (!apk) continue;
    const time = Date.parse(release.published_at || release.created_at || '');
    candidates.push({ release, apk, time: Number.isFinite(time) ? time : 0 });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.time - a.time);
  const { release, apk } = candidates[0];
  const tag = String(release.tag_name || '');
  return {
    tag,
    version: versionFromTag(tag) || FALLBACK_RELEASE.version,
    versionCode: tag === FALLBACK_RELEASE.tag ? FALLBACK_RELEASE.versionCode : null,
    name: release.name || tag,
    prerelease: Boolean(release.prerelease),
    publishedAt: release.published_at || release.created_at || null,
    fileName: apk.name,
    sizeBytes: Number.isFinite(apk.size) ? apk.size : null,
    downloadUrl: apk.browser_download_url,
    releaseUrl: typeof release.html_url === 'string' && release.html_url.startsWith('https://')
      ? release.html_url
      : `${RELEASES_PAGE}/tag/${encodeURIComponent(tag)}`,
    sha256: shaFor(tag, apk),
    source: 'github',
  };
}

/**
 * Ask GitHub for the newest APK. Never throws: any failure (network, rate limit, timeout,
 * unexpected payload) resolves to FALLBACK_RELEASE.
 */
export async function fetchLatestRelease({
  fetchImpl = globalThis.fetch,
  timeoutMs = RELEASE_TIMEOUT_MS,
  url = RELEASES_API,
} = {}) {
  if (typeof fetchImpl !== 'function') return FALLBACK_RELEASE;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { controller?.abort(); resolve(null); }, timeoutMs);
  });
  try {
    const request = (async () => {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: controller?.signal,
      });
      if (!response || !response.ok) return null;
      return pickLatestApkRelease(await response.json());
    })();
    const result = await Promise.race([request, timeout]);
    return result || FALLBACK_RELEASE;
  } catch {
    return FALLBACK_RELEASE;
  } finally {
    clearTimeout(timer);
  }
}

/** Whole megabytes (MiB) for large files, one decimal below 10 MB. */
export function formatSizeMB(bytes, locale = 'en') {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  const digits = mb >= 10 ? 0 : 1;
  return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(mb);
}
