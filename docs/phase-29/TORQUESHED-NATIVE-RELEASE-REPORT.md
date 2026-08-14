# Phase 29 — TorqueShed Native Release Report

## Outcome

Phase 29 restores the imported Expo Router product as an active OperatorOS workspace application at `apps/torqueshed-native`. The source artifact remains read-only migration evidence. The active iOS and Android clients use the same Phase 28 production API, tenant membership, module entitlement, privacy, moderation, media, shared-provider, and persistence boundaries as the web product.

**Source/local status:** IMPLEMENTED_AND_VERIFIED.  
**Store/device release status:** EXTERNAL_SIGNING_GATES_REMAIN. No iOS/Android store build ID is claimed in this repository report.

## Source reconciliation

The imported source exposes eight route/layout files: root layout, SSO return, tab layout, feed, Assist, builds, market, and garage. The active application preserves all eight outcomes and expands them to 13 route files with persistent build, diagnostic, live-bay, profile, settings, and notification deep links.

| Source outcome | Active native route / boundary | Status |
| --- | --- | --- |
| Root layout and tab identity | `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx` | ACTIVE_NATIVE |
| Query-token SSO return | PKCE S256 authorization plus opaque exchange in `src/lib/auth.tsx` | ACTIVE_NATIVE_SECURE_EQUIVALENT |
| Community feed | `src/app/(tabs)/index.tsx` | ACTIVE_NATIVE |
| Garage and vehicle history | `src/app/(tabs)/garage.tsx` | ACTIVE_NATIVE |
| Build journals | `src/app/(tabs)/builds.tsx`, `src/app/build/[id].tsx` | ACTIVE_NATIVE |
| Torque Assist / diagnostics | `src/app/(tabs)/assist.tsx`, `src/app/diagnostic/[id].tsx` | ACTIVE_NATIVE |
| Live collaboration | `src/app/live-bay/[id].tsx` | ACTIVE_NATIVE |
| DIY marketplace | `src/app/(tabs)/market.tsx` | ACTIVE_NATIVE |
| Profile, settings, notifications | `src/app/profile.tsx`, `settings.tsx`, `notifications.tsx` | ACTIVE_NATIVE |

## Identity and API security

- Browser authorization is performed on the exact TorqueShed OperatorOS host after the existing browser SSO/cookie gate.
- The app creates state, nonce, a device identifier, and an S256 PKCE verifier. The callback contains only a one-use opaque code and state; it never carries a JWT, password, provider credential, or session token.
- Access and refresh credentials are opaque random values. Only SHA-256 hashes are persisted in additive v47 tables; only the opaque values are stored through OS secure storage using `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- Access expires after 15 minutes; refresh expires after 30 days and rotates both credentials. Replay, device mismatch, expired codes, consumed codes, tenant mismatch, entitlement loss, inactive users, token-version revocation, and logout fail closed.
- Native sessions are module-bound to TorqueShed and cannot call another OperatorOS module path. Standard API guards re-check the user, tenant, membership, role/write authority, and entitlement.

## Offline, media, and realtime behavior

- Non-secret queued mutation bodies live in AsyncStorage; credentials never do. File URIs remain local until connectivity returns.
- Queue flush is serial and durable. Stable client mutation IDs back journal entries, attachments, diagnostic entries, and live-bay messages so lost responses/retries reconcile once.
- Native camera/library capture queues base64 upload through the shared attachment service. MIME signature validation, size limits, SHA-256 integrity, scanning, retention, and visibility remain server-authoritative.
- Permanent 4xx failures leave the optimistic surface on reload and are reported; retryable/network/429/5xx failures remain queued. 401 performs a single refresh/re-auth path.
- Live bay history uses persisted sequence cursors and stable client message IDs for reconnect and duplicate suppression.

## Association and release configuration

- Bundle identifier / Android package: `pro.torqueshed.app`.
- Custom scheme: `torqueshed://`.
- Universal/app-link host: `torqueshed.operatoros.net`.
- AASA endpoint: `/.well-known/apple-app-site-association`; requires a syntactically valid real `TORQUESHED_IOS_TEAM_ID`, otherwise returns 503.
- Android endpoint: `/.well-known/assetlinks.json`; requires the real colon-separated `TORQUESHED_ANDROID_SHA256_CERT_FINGERPRINT`, otherwise returns 503.
- `TORQUESHED_RELEASE_CONFIG=1` makes Expo configuration fail unless both association identities and `TORQUESHED_MOBILE_BUILD_ID` are supplied. No placeholder signing or association identifiers are committed.

## Verification evidence

| Gate | Result |
| --- | --- |
| Mobile TypeScript | PASS |
| Mobile unit queue/reconciliation tests | PASS (3/3) |
| Expo SDK dependency compatibility | PASS |
| Expo public configuration / no-placeholder validation | PASS |
| Android and iOS production JS/Hermes bundles | PASS |
| Android Expo prebuild | PASS |
| iOS Expo prebuild on Windows | EXTERNAL: Expo requires macOS or Linux |
| Disposable PostgreSQL native auth/API workflow | PASS (3/3) |
| Additive database release v47 apply + immediate reapply | PASS |
| API/web/mobile TypeScript | PASS |
| Local Android device/emulator | UNAVAILABLE: no Android SDK/device attached |
| Local iOS simulator | UNAVAILABLE: Windows host |
| GitHub native contracts | PASS — run `31817468802`, `contracts` job |
| GitHub Android API-35 emulator | PASS — run `31817468802`; x86_64 APK build, non-streaming install, launch, and `torqueshed://settings` deep link |
| GitHub iOS simulator | PASS — run `31817468802`; native build, install, launch, and `torqueshed://settings` deep link |

The dedicated `.github/workflows/torqueshed-native.yml` contract provides clean-checkout Android emulator and macOS iOS simulator prebuild, native build, install, launch, and deep-link smoke jobs. Corrective run [`31817468802`](https://github.com/shotgunsensei/OperatorOS/actions/runs/31817468802) completed successfully on commit `95d7cae1409ae289475d59898c9a00c7e994260d` with all three jobs green.

### Android CI incident and correction trace

| Run / commit | Result | Evidence and disposition |
| --- | --- | --- |
| `31813537047` / `68d73df` | FAIL | The full four-ABI Gradle build completed successfully; the Ubuntu runner lacked usable KVM acceleration and streamed `adb install` ended with `Broken pipe (32)`. This is retained as failed device-gate evidence, not counted green. |
| `31816492952` / `c91f7c6` | FAIL | The x86_64-only APK build completed successfully in ten minutes, but `udevadm trigger --name-match=kvm` returned exit 1 before emulator startup. This is retained as failed infrastructure-gate evidence, not counted green. |
| `31817468802` / `95d7cae` | PASS | Direct ephemeral-runner `/dev/kvm` permission verification passed; the accelerated API-35 emulator installed the APK with `adb --no-streaming`, launched `pro.torqueshed.app`, opened the settings deep link, and reported the app activity. Contracts and iOS simulator jobs also passed. |

## Required external release gates

1. Supply the real Apple team ID, Android release signing SHA-256 fingerprint, and immutable mobile build ID in protected deployment/EAS environments.
2. Provision the Expo/EAS project, Apple distribution/App Store Connect credentials, Android upload/app-signing keys, package ownership, and store records.
3. Repeat the native workflow on the immutable release candidate and capture signed EAS/store build IDs plus physical-device results for auth, media permission/upload, offline/reconnect, deep links, revocation, and logout.
4. Deploy the exact reviewed OperatorOS API/web commit with additive database release v47, then verify both association documents from the public exact host before submitting either store build.

## Acceptance disposition

The repository-level product, security, persistence, config, dual bundle, Android emulator, and iOS simulator gates are satisfied. Phase 29 is not represented as shipped to Apple/Google or accepted on physical release devices until the owner-controlled signing identities, public association deployment, signed store builds, and physical-device acceptance are attached to this report.
