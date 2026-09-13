# World ID, Selfie Check: what integrating it was like

*Ground State, ETHOnline 2026 — feedback for the World team, written 13.09.2026 while building it,
and finished the same night after the first live check passed.*

## What we built with it

A place in Ground State resolves faster the more people stand in it, and what one person finds is
kept for everybody. Both invite one person with fifty tabs. Selfie Check is our answer: a person
who has passed it stands in the room as a person, drawn in the same grey as you; a stranger is
drawn in white. A person's word about a place — "there is a wallet standing here" — is kept for
everybody at once; a stranger's is heard by the room and kept once five strangers agree. The
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
5. **The credential page says Selfie Check (Beta) is "access-gated" and needs a feature flag.**
   We spent an evening planning around that — a message to the team, a sandbox enrolment — and
   then the live check simply passed in production, for a World ID that already had Selfie
   Check enrolled, with no flag asked for. Either the gate is on the user's side (the credential
   has to exist in their World App) and the page should say so, or the gate is off and the page is
   stale. Say which; it decides whether an integrator can test on their own phone tonight.
6. **Sandbox access is a form and a wait.** For a hackathon that runs over a weekend, an
   integrator who finds the docs on Friday night cannot test a live selfie before Monday. The
   sandbox docs also do not say whether the sandbox needs its own `app_id`/`rp_id` or the
   production ones with `environment: "sandbox"` — we read the latter from the IDKit types. (We
   ended up not needing the sandbox at all, see 5.)
7. **`docs.idkit.com` does not resolve** (DNS), though search engines still point at it.
8. **Small:** the verify reference says the `identifier` for Selfie Check is `"selfie"` with
   `"face"` accepted as an alias. The credential page never mentions either word.

## Developer Portal

Registering the app and the relying party took minutes, and the portal gave us everything the
server needs on one screen: App ID, RP ID, signer address, private key. Two things to say:

- **The portal and the SDK use different words for the same key.** The portal shows "Signer
  address" and "Private key"; the docs say "RP signing key" and the SDK wants `signingKeyHex`.
  It is the same secp256k1 key, and a newcomer has to guess that. One name across the three.
- **Nothing on that screen says what the action is or where to create one.** We used an action
  name of our own (`stand-as-a-person`) in the request and the verifier accepted it — which was
  a relief, and also a surprise, because the IDKit docs recommend `action_description` "only for
  actions created on-the-fly" without saying that on-the-fly is the default.

The first live check passed on the production environment on 13.09.2026, on an Android World ID
that already had Selfie Check enrolled. Before that the whole flow — client, server, weighting,
drawing, persistence — had been tested end to end against a stub verifier and the real bridge.

## What would have made it a day shorter

- A "vanilla JS, no React, own backend" quick start in one page: the eight lines of server code,
  the ten lines of client code, the field mapping, the verify call.
- A plain statement of who needs what for Selfie Check: what the user's World App must have,
  what the app must have, and what needs nobody's permission.
- A test vector for the verify endpoint: one complete IDKit result JSON that verifies against a
  known `rp_id` in sandbox, so an integrator can test the server half before the app half.
