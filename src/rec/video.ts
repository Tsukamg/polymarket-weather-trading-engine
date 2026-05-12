/**
 * PnL / demo screen recording shipped in-repo (path from repo root).
 * README “Does it make money?” embeds `<video src={MONEY_PROOF_VIDEO_GITHUB_RAW_URL}>`.
 * If you rename the file, update the basename here and the two URLs in README.md (same values).
 */
export const MONEY_PROOF_VIDEO_BASENAME = "2026-05-13_01-03-44 - user.mp4";

export const MONEY_PROOF_VIDEO_RELATIVE_PATH = `src/rec/${MONEY_PROOF_VIDEO_BASENAME}`;

/** GitHub `user/repo` for absolute links (README raw embed + blob fallback). */
const MONEY_PROOF_GITHUB_REPO_SLUG = "Tsukamg/polymarket-weather-trading-engine";

const MONEY_PROOF_GITHUB_BRANCH = "main";

function encodePathSegments(relativePosixPath: string): string {
  return relativePosixPath
    .split("/")
    .filter((s) => s.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** `https://raw.githubusercontent.com/...` — works as `<video src>` on github.com README. */
export const MONEY_PROOF_VIDEO_GITHUB_RAW_URL = `https://raw.githubusercontent.com/${MONEY_PROOF_GITHUB_REPO_SLUG}/${MONEY_PROOF_GITHUB_BRANCH}/${encodePathSegments(MONEY_PROOF_VIDEO_RELATIVE_PATH)}`;

/** Opens the MP4 in GitHub’s file viewer (native player) if inline embed fails. */
export const MONEY_PROOF_VIDEO_GITHUB_BLOB_URL = `https://github.com/${MONEY_PROOF_GITHUB_REPO_SLUG}/blob/${MONEY_PROOF_GITHUB_BRANCH}/${encodePathSegments(MONEY_PROOF_VIDEO_RELATIVE_PATH)}`;
