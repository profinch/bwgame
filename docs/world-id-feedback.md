# World ID, Selfie Check: what integrating it was like

*Ground State, ETHOnline 2026 — feedback for the World team, written 13.09.2026 while building it.*

## What we built with it

A place in Ground State resolves faster the more people stand in it, and what one person finds is
kept for everybody. Both invite one person with fifty tabs. Selfie Check is our answer: a person
who has passed it stands in the room as a person, drawn in the same grey as you; a stranger is
drawn in white. A person's word about a place — "there is a wallet standing here" — is kept for
everybody at once; a stranger's is heard by the room and kept once three strangers agree. The
credential is used as a weight, not a gate: the world works the same for a stranger, it just
trusts them a third as much (`live/server.js`, `STRANGER_WORD`; `src/human.ts`).

IDKit runs in a vanilla TypeScript page (no React), the RP signature is made on our small Node
server with `@worldcoin/idkit-server`, and the proof goes from the page to the server to
`developer.world.org/api/v4/verify/{rp_id}`.

## Docs: what read well

- The `@worldcoin/idkit-core` type definitions are excellent and complete — `IDKitRequestConfig`,
  the `IDKitResult` union, `IDKitCompletionResult` "never throws", the error code list. We built
  against the `.d.ts` more than against the site, and it was enough.
- `signRequest` in `@worldcoin/idkit-server` is one call with three arguments. Good.
- The verify endpoint takes the IDKit result whole. Good: the client does not have to know the
  proof's shape, and neither do we.

## Docs: what was confusing or missing

1. **The Selfie Check credential page (`/world-id/credentials/11`) does not say which preset to
   call.** It says "see IDKit"; IDKit's page lists `selfieCheckLegacy`. The word *Legacy* on the
   only Selfie Check preset, for a credential marked *Beta*, made us doubt we had the right one
   for a quarter of an hour. Either name the preset on the credential page, or name the preset
   `selfieCheck` and say what "legacy" is about.
2. **`rp_context` field names differ between the signing SDK and IDKit.** `signRequest` returns
   `{ sig, nonce, createdAt, expiresAt }`; `IDKit.request` wants
   `{ rp_id, nonce, created_at, expires_at, signature }`. The integrate page shows the mapping
   in passing, the signatures page uses a third spelling (`"sig"`, `"created_at"` as JSON names).
   One shape, or one line saying "map these four", would save every integrator the same ten
   minutes.
3. **The credential page says the check returns "a proof of the completed check, not a
   uniqueness score"**, and the V4 response item has a `nullifier`. Is a Selfie Check nullifier
   stable per person per action, or not? We wanted to know whether one person can be "three
   strangers" by checking three times. We could not tell from the docs, so we treat the
   credential as a per-browser signal and keep our own token.
4. **Where the RP ID and signing key come from** is stated nowhere we could find on
   docs.world.org: the signatures page says "from the Developer Portal" and stops. A screenshot
   or a path ("Developer Portal → app → Relying Party → create key") would do.
5. **Sandbox access is a form and a wait.** For a hackathon that runs over a weekend, an
   integrator who finds the docs on Friday night cannot test a live selfie before Monday. The
   sandbox docs also do not say whether the sandbox needs its own `app_id`/`rp_id` or the
   production ones with `environment: "sandbox"` — we read the latter from the IDKit types.
6. **`docs.idkit.com` does not resolve** (DNS), though search engines still point at it.
7. **Small:** the verify reference says the `identifier` for Selfie Check is `"selfie"` with
   `"face"` accepted as an alias. The credential page never mentions either word.

## Developer Portal

We did not get through this part before submission. Selfie Check (Beta) is behind a feature flag
that "your World point of contact" enables, and a solo hackathon team has no point of contact;
the sandbox app is behind an enrolment request. Everything is wired so that setting
`WORLD_APP_ID`, `WORLD_RP_ID` and `WORLD_RP_SIGNING_KEY` on the server turns it on; the client,
the server, the weighting, the drawing and the persistence are tested end to end against a stub
verifier, and the IDKit request itself is made against the real sandbox bridge (the QR code on
the panel is a live `sandbox.world.org/verify` link).

## What would have made it a day shorter

- A "vanilla JS, no React, own backend" quick start in one page: the eight lines of server code,
  the ten lines of client code, the field mapping, the verify call.
- The sandbox app installable from a public TestFlight link for hackathon periods.
- A test vector for the verify endpoint: one complete IDKit result JSON that verifies against a
  known `rp_id` in sandbox, so an integrator can test the server half before the app half.
