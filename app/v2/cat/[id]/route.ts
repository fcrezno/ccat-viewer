/**
 * Same metadata as /v2/meta/[id], served from a fresh path.
 *
 * Marketplaces cache metadata keyed on the tokenURI string, and several cats
 * were fetched during the reveal race and cached as "?" cards. Rarible's own
 * "Refresh Metadata" didn't re-fetch them — the URL hadn't changed, so there was
 * nothing to invalidate.
 *
 * Pointing baseURI here changes every tokenURI, which no indexer has seen before,
 * so all of them fetch fresh. /v2/meta/[id] stays live so nothing that already
 * resolved through it breaks.
 */
export { GET } from '../../meta/[id]/route'
