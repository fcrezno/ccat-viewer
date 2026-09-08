/**
 * The same metadata as /v3/meta/[id], on a second path — and THE ONE THE
 * CONTRACT SHOULD POINT AT.
 *
 * V2 needed this after the fact. Several cats were fetched during a reveal race
 * and cached as "?" cards, and Rarible's own "Refresh Metadata" would not
 * re-fetch them: marketplaces key their cache on the tokenURI string, and the
 * URL had not changed, so there was nothing to invalidate. A fresh path was the
 * only way to make every indexer look again.
 *
 * V3 gets it from the start. `/v3/meta/` stays live and identical, so if this
 * ever has to be burned the spare is already there.
 */
export { GET } from '../../meta/[id]/route'
