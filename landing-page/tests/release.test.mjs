import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_RELEASE, fetchLatestRelease, formatSizeMB, pickLatestApkRelease,
} from '../src/release.js';

const apk = (name, extra = {}) => ({
  name,
  size: 1000,
  browser_download_url: `https://github.com/x/y/releases/download/t/${name}`,
  ...extra,
});

test('picks the newest non-draft release that has an .apk asset (pre-releases allowed)', () => {
  const picked = pickLatestApkRelease([
    { tag_name: 'v2.0.0', draft: true, published_at: '2026-12-01T00:00:00Z', assets: [apk('a.apk')] },
    { tag_name: 'v1.9.0', draft: false, published_at: '2026-11-30T00:00:00Z', assets: [apk('notes.txt')] },
    { tag_name: 'v1.0.0', draft: false, prerelease: false, published_at: '2026-09-05T00:00:00Z', assets: [apk('old.apk')] },
    { tag_name: 'v1.1.0', draft: false, prerelease: true, name: 'Kaaj 1.1.0 Pilot', html_url: 'https://github.com/x/y/releases/tag/v1.1.0', published_at: '2026-11-10T00:00:00Z', assets: [apk('readme.md'), apk('Kaaj-1.1.0-android.APK', { size: 2097152 })] },
  ]);
  assert.equal(picked.tag, 'v1.1.0');
  assert.equal(picked.version, '1.1.0');
  assert.equal(picked.prerelease, true);
  assert.equal(picked.fileName, 'Kaaj-1.1.0-android.APK');
  assert.equal(picked.sizeBytes, 2097152);
  assert.equal(picked.releaseUrl, 'https://github.com/x/y/releases/tag/v1.1.0');
  assert.equal(picked.sha256, null, 'unknown versions must not show a checksum');
  assert.equal(picked.source, 'github');
});

test('uses the known checksum only for the exact fallback version, or a GitHub sha256 digest', () => {
  const known = pickLatestApkRelease([{ tag_name: FALLBACK_RELEASE.tag, published_at: FALLBACK_RELEASE.publishedAt, assets: [apk(FALLBACK_RELEASE.fileName)] }]);
  assert.equal(known.sha256, FALLBACK_RELEASE.sha256);
  const digest = 'a'.repeat(64);
  const withDigest = pickLatestApkRelease([{ tag_name: 'v1.2.0', published_at: '2026-11-01T00:00:00Z', assets: [apk('k.apk', { digest: `sha256:${digest}` })] }]);
  assert.equal(withDigest.sha256, digest);
});

test('returns null for unusable payloads', () => {
  assert.equal(pickLatestApkRelease(null), null);
  assert.equal(pickLatestApkRelease({ message: 'API rate limit exceeded' }), null);
  assert.equal(pickLatestApkRelease([]), null);
  assert.equal(pickLatestApkRelease([{ tag_name: 'v1', draft: false, assets: [apk('a.zip')] }]), null);
});

test('fetchLatestRelease returns the live release on success', async () => {
  const release = await fetchLatestRelease({
    fetchImpl: async () => ({ ok: true, json: async () => [{ tag_name: 'v1.3.0', published_at: '2026-11-05T00:00:00Z', assets: [apk('k.apk')] }] }),
  });
  assert.equal(release.version, '1.3.0');
});

test('fetchLatestRelease falls back on errors, rate limits, bad data and timeouts', async () => {
  assert.equal(await fetchLatestRelease({ fetchImpl: async () => { throw new TypeError('offline'); } }), FALLBACK_RELEASE);
  assert.equal(await fetchLatestRelease({ fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: 'rate limited' }) }) }), FALLBACK_RELEASE);
  assert.equal(await fetchLatestRelease({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }) }), FALLBACK_RELEASE);
  assert.equal(await fetchLatestRelease({ fetchImpl: null }), FALLBACK_RELEASE);
  const started = Date.now();
  const slow = await fetchLatestRelease({ timeoutMs: 50, fetchImpl: (url, { signal }) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.equal(slow, FALLBACK_RELEASE);
  assert.ok(Date.now() - started < 1000);
});

test('formats sizes in MB for both languages', () => {
  assert.equal(formatSizeMB(64876324), '62');
  assert.equal(formatSizeMB(64876324, 'bn'), '৬২');
  assert.equal(formatSizeMB(5 * 1024 * 1024), '5.0');
  assert.equal(formatSizeMB(0), null);
});
