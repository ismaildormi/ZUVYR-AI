# VELOX — Secure Credential Storage Documentation

This document describes the actual credential storage implementation, its
security properties, failure behavior, and what remains to be verified on
real devices.

---

## 1. Credential lifecycle

### Token receipt

After successful authentication (Google Sign-In or anonymous), the
`AccountSession` receives an `AuthTokens` object containing:

- **ID token** — authenticates RTDB requests. Lives in memory only
  (`_tokens.idToken`). Expires in ~1 hour.
- **Refresh token** — bearer credential that renews the ID token. This
  is the token that must be stored securely.
- **Profile fields** (localId, displayName, email, photoUrl, provider) —
  display data stored in PlayerPrefs (not credentials).

`AccountSession.ApplyTokensAsync()` stores:
- The refresh token via `CredentialPersistence.StoreRefreshTokenAsync()`
  → `ICredentialStore.StoreAsync()` (platform secure storage only).
- The `localId` identifier in PlayerPrefs (not a credential).
- Profile display fields in PlayerPrefs (not credentials).

### Persistence

The refresh token is stored ONLY via `ICredentialStore`:
- **Android**: `PlatformCredentialStore` → Android Keystore AES-GCM
  encryption. The 256-bit AES key lives inside the Keystore (never leaves
  secure hardware). The encrypted IV+ciphertext blob is stored in
  SharedPreferences (useless without the Keystore key).
- **iOS**: `PlatformCredentialStore` → native Keychain plugin
  (`VELOXKeychain.c`). The refresh token is stored as a
  `kSecClassGenericPassword` item with
  `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (not backed up, not synced).
- **Unity Editor / other platforms**: `CredentialStoreFactory.Create()`
  returns null. `CredentialPersistence.StoreRefreshTokenAsync()` returns
  false. The token lives in memory only for the current session. **No
  plaintext fallback exists.**

### Session restoration

`AccountSession.RestoreSessionAsync()` calls
`CredentialPersistence.LoadRefreshTokenAsync()`:

1. **Try secure store**: `ICredentialStore.RetrieveAsync()`.
   - If a token is found, return it.
   - If the store throws (corrupted data), return null with an error log.
     **No plaintext fallback.**
2. **Try legacy plaintext migration**: Read the old PlayerPrefs key
   (`VELOX.Account.RefreshToken`).
   - If absent, return null.
   - If secure storage is unavailable, return null (blocked — no plaintext
     use). The legacy key is retained.
   - If secure storage is available, migrate: write to secure store,
     re-read to verify, THEN delete the plaintext key. On any failure,
     retain the plaintext and return null.
3. If a refresh token is found, restore `_tokens` and trigger a background
   token refresh.

### Token refresh

`AccountSession.RefreshSessionAsync()` uses the refresh token to obtain a
new ID token. Bounded by `MaxRefreshAttempts` (default 1, finite loop —
never an infinite loop). On failure, raises `OnAuthError` and returns
false. The old ID token is retained in memory (no silent replacement).

### Sign-out

`AccountSession.SignOut()`:
1. Clears `_tokens` and `_profile` in memory.
2. Fires `OnProfileChanged(null)` and `OnLoginChanged` immediately (UI
   updates without waiting on async cleanup).
3. Calls `ClearPersistedAsync()` in the background:
   - `CredentialPersistence.ClearRefreshTokenAsync()` removes the refresh
     token from secure storage and deletes the legacy plaintext key.
     Returns `Task<bool>` — true only if secure store removal succeeded.
   - Clears profile display fields from PlayerPrefs.
4. If cleanup fails, an error is logged. The session IS signed out in
   memory, but the refresh token may still be on disk. Re-authentication
   is required on next launch.

---

## 2. Android implementation

### File

`Assets/_Game/Scripts/Backend/PlatformCredentialStore.cs` (the
`#if UNITY_ANDROID` section).

### Encryption

- **Algorithm**: AES-GCM (authenticated encryption).
- **Key**: 256-bit AES key generated inside the Android Keystore. The key
  never leaves secure hardware. Key alias: `velox.account.refresh`.
- **Key generation**: `KeyGenParameterSpec.Builder` with
  `PURPOSE_ENCRYPT | PURPOSE_DECRYPT`, `GCM`, `NoPadding`, 256-bit key
  size. Key generator: `KeyGenerator.getInstance("AES", "AndroidKeyStore")`.
- **IV**: 12 bytes (standard for GCM), retrieved via `cipher.getIV()`
  after `init(ENCRYPT_MODE)`. Stored alongside the ciphertext as
  `Base64(IV || ciphertext+tag)` in SharedPreferences.
- **Authentication tag**: AES-GCM appends a 128-bit tag to the ciphertext.
  Tampered data fails decryption.

### Storage

- **Ciphertext location**: SharedPreferences (`velox_secure` file),
  key = `velox.account.refresh`, value = Base64 blob.
- **Why this is safe**: The blob is encrypted with a Keystore key. Even
  if SharedPreferences is exported or rooted, the blob is useless without
  the Keystore key (which cannot be extracted).

### Error handling

All three methods (`StoreAndroidAsync`, `RetrieveAndroidAsync`,
`RemoveAndroidAsync`) wrap Keystore operations in try/catch:
- **Store**: Keystore failure → return false. No plaintext fallback.
- **Retrieve**: Corrupted blob, wrong key, or tampered ciphertext →
  return null. No plaintext fallback. Forces re-login.
- **Remove**: Keystore delete failure → log error, still clear
  SharedPreferences. Returns true (key is gone from SharedPreferences).
  If SharedPreferences removal also fails, returns false.

### Backup/export risk

- The ciphertext blob in SharedPreferences is encrypted. Safe.
- The Keystore key is NOT exportable. Safe.
- `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (iOS equivalent) prevents
  backup. Android Keystore keys are device-bound by default.

### Key invalidation / reinstall

- App uninstall: Keystore key is removed. SharedPreferences is also
  cleared. On reinstall, `IsKeyPresent` returns false → new key generated.
  No stale data.
- App update (not uninstall): Keystore key persists. SharedPreferences
  persists. Old blob is still decryptable with the same key. Correct.

### Plaintext fallback

**None.** The Android implementation has no plaintext fallback. If
Keystore operations fail, the methods return false/null. The
`CredentialPersistence` layer also has no plaintext fallback.

---

## 3. iOS implementation

### Files

| File | Purpose |
|---|---|
| `Assets/_Game/Scripts/Backend/PlatformCredentialStore.cs` | Managed P/Invoke declarations + C# integration (the `#if UNITY_IOS` section) |
| `Assets/Plugins/iOS/VELOXKeychain.c` | Native Keychain implementation (compiled into the iOS app binary by Unity) |
| `Assets/Plugins/iOS/VELOXKeychain.c.meta` | Unity plugin import settings (iOS-only inclusion) |

### P/Invoke contract

The managed side declares three functions with `[DllImport("__Internal")]`:

```csharp
int VELOX_KeychainStore(string service, string account, byte[] data, int dataLen);
int VELOX_KeychainRetrieve(string service, string account, out byte[] data, out int dataLen);
int VELOX_KeychainDelete(string service, string account);
```

The native C signatures in `VELOXKeychain.c` match exactly:

```c
int VELOX_KeychainStore(const char* service, const char* account,
                        const uint8_t* data, int dataLen);
int VELOX_KeychainRetrieve(const char* service, const char* account,
                           uint8_t** outData, int* outLen);
int VELOX_KeychainDelete(const char* service, const char* account);
```

### Keychain item

- **Class**: `kSecClassGenericPassword`
- **Service**: `velox.account`
- **Account**: `refresh`
- **Accessibility**: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
  (accessible when device is unlocked, NOT backed up, NOT synced to other
  devices)
- **Data**: The refresh token as UTF-8 bytes

### Error handling

- **Store**: `SecItemAdd` returns `errSecSuccess` (0) on success.
  Existing item is deleted first (update semantics). Non-zero OSStatus on
  failure → managed side catches and returns false.
- **Retrieve**: `SecItemCopyMatching` returns `errSecSuccess` → data
  returned. `errSecItemNotFound` → non-zero (managed side returns null).
  Other errors → non-zero (managed side returns null). All exceptions are
  caught.
- **Delete**: `SecItemDelete` returns `errSecSuccess` or
  `errSecItemNotFound` (already absent) → 0 (success). Other errors →
  non-zero (managed side returns false).

### No sensitive logging

The native code does not log token values. Error messages use OSStatus
codes only. The managed code logs exception messages but never the token
value itself.

### Unity plugin integration

- The `.c` file is in `Assets/Plugins/iOS/` — Unity compiles it into the
  iOS app binary automatically.
- The `.meta` file specifies iOS-only inclusion (iPhone + iPad).
- `[DllImport("__Internal")]` resolves to functions in the compiled binary.
- The Security framework is linked automatically on iOS.
- No separate `.bundle` or library build is needed.

### BUILD VERIFICATION REQUIRED

**This native code has NOT been compiled or tested.** The sandbox has no
iOS toolchain (Xcode, iOS SDK). The P/Invoke signatures match the C
signatures exactly, but this must be verified by building the iOS player
target in Unity on a macOS host with Xcode installed.

---

## 4. Failure behavior and migration policy

### Secure storage unavailable (Editor, unsupported platforms)

- `StoreRefreshTokenAsync()` returns false. Token lives in memory only.
- `LoadRefreshTokenAsync()` returns null. No plaintext fallback.
- Legacy plaintext is NOT used. Re-login required.

### Secure storage write failure

- `StoreRefreshTokenAsync()` returns false. No plaintext fallback.
- Token lives in memory only for this session.

### Secure storage read failure (corrupted data)

- `LoadRefreshTokenAsync()` returns null. No plaintext fallback.
- Legacy plaintext is NOT used (the secure store may hold a newer,
  tampered token). Re-login required.

### Legacy plaintext migration

- Write to secure store → re-read to verify → delete plaintext.
- On write failure: retain plaintext, return null. Do NOT claim success.
- On verification failure: retain plaintext, return null. Do NOT claim
  success.
- On success: plaintext deleted, secure store has the verified token.

### Sign-out failure

- `ClearRefreshTokenAsync()` returns `Task<bool>` — true only if secure
  store removal succeeded.
- `ClearPersistedAsync()` returns `Task<bool>` — propagates the result.
- `SignOut()` fires profile change events immediately (UI updates), then
  attempts cleanup in the background. On failure, an error is logged.
- The session IS signed out in memory, but the refresh token may still
  be on disk. Re-authentication is required on next launch.

### Token refresh failure

- Bounded retry (`MaxRefreshAttempts`, default 1, finite loop).
- On final failure: raise `OnAuthError`, return false.
- Old ID token retained in memory (no silent replacement).
- If the refresh token is invalid/expired, the user must sign in again.

---

## 5. Verification status

### Verified in source code

| Behavior | Status |
|---|---|
| Refresh token stored via `ICredentialStore` only (not PlayerPrefs) | ✅ Verified in source |
| No plaintext fallback when secure storage unavailable | ✅ Verified in source + tests |
| No plaintext fallback when secure store write fails | ✅ Verified in source + tests |
| No plaintext fallback when secure store read throws | ✅ Verified in source + tests |
| Legacy migration: write → verify → delete | ✅ Verified in source + tests |
| Migration failure retains plaintext | ✅ Verified in source + tests |
| Sign-out removes from secure store + deletes plaintext | ✅ Verified in source + tests |
| Sign-out reports incomplete deletion on failure | ✅ Verified in source + tests |
| Bounded refresh retry (finite loop) | ✅ Verified in source + tests |
| Android AES-GCM with Keystore key | ✅ Verified in source (API usage correct) |
| Android corrupted-data handling (returns null) | ✅ Verified in source |
| Android remove uses `remove()` (not `putString("")`) | ✅ Verified in source |
| iOS P/Invoke signatures match native C signatures | ✅ Verified by inspection |
| iOS Keychain: generic-password, ThisDeviceOnly | ✅ Verified in source |
| No sensitive data in logs | ✅ Verified in source |

### Verified by managed-code tests (MemoryCredentialStore)

| Test | Status |
|---|---|
| Store in secure store succeeds | ✅ 115/0 |
| Store blocked when unavailable | ✅ 115/0 |
| Store blocked when write fails | ✅ 115/0 |
| Store blocked when store throws | ✅ 115/0 (new) |
| Load from secure store | ✅ 115/0 |
| Load returns null when nothing stored | ✅ 115/0 |
| Load returns null when retrieve throws | ✅ 115/0 (new) |
| Migration success (plaintext deleted) | ✅ 115/0 |
| Migration failure (plaintext retained) | ✅ 115/0 |
| Migration blocked (plaintext not used) | ✅ 115/0 |
| Sign-out removes from secure store | ✅ 115/0 |
| Sign-out deletes plaintext | ✅ 115/0 |
| Clear returns false when remove throws | ✅ 115/0 (new) |
| ClearPersistedAsync returns false on remove failure | ✅ 115/0 (new) |
| AccountSession stores refresh token in secure store | ✅ 115/0 |
| AccountSession does NOT write refresh token to PlayerPrefs | ✅ 115/0 |
| Bounded refresh retry | ✅ 115/0 |

### NOT verified (requires real device)

| Behavior | Status |
|---|---|
| Android Keystore: actual key generation | ❌ NOT VERIFIED — needs Android device |
| Android Keystore: actual AES-GCM encrypt/decrypt | ❌ NOT VERIFIED — needs Android device |
| Android Keystore: corrupted blob handling on device | ❌ NOT VERIFIED — needs Android device |
| Android Keystore: key invalidation on reinstall | ❌ NOT VERIFIED — needs Android device |
| Android Keystore: backup/export exclusion | ❌ NOT VERIFIED — needs Android device |
| iOS Keychain: plugin compiles in Unity iOS build | ❌ NOT VERIFIED — needs macOS + Xcode |
| iOS Keychain: actual SecItemAdd/Retrieve/Delete | ❌ NOT VERIFIED — needs iOS device |
| iOS Keychain: ThisDeviceOnly backup exclusion | ❌ NOT VERIFIED — needs iOS device |
| iOS Keychain: P/Invoke marshalling correctness | ❌ NOT VERIFIED — needs iOS device |
| Native plugin: Unity plugin import settings correct | ❌ NOT VERIFIED — needs Unity Editor on macOS |

---

## 6. Exact device tests required

### Android

1. **Build**: `UNITY_EXE=... VELOX_BUILD_TARGET=Android bash velox-verify/unity-build.sh build`
   (requires Android SDK + NDK installed)
2. **Install and sign in**: Install the APK, sign in with Google.
   Verify the refresh token is stored encrypted in SharedPreferences
   (not plaintext).
3. **Restart**: Restart the app. Verify the session is restored from
   secure storage.
4. **Sign out**: Sign out. Verify the Keystore alias is deleted and the
   SharedPreferences blob is removed.
5. **Corrupted data**: Manually tamper with the SharedPreferences blob.
   Verify the app handles it gracefully (returns null, forces re-login).
6. **Reinstall**: Uninstall and reinstall. Verify no stale data.
7. **Backup**: Check that the app's backup does not include the
   refresh token in plaintext.

### iOS

1. **Build**: Open the project in Unity 2022.3.21f1 on macOS. Verify
   the native plugin compiles (no errors in the Unity Console). Build
   the iOS player target.
2. **Install and sign in**: Install the IPA, sign in with Google.
   Verify the refresh token is in the Keychain (not PlayerPrefs).
3. **Restart**: Restart the app. Verify the session is restored from
   the Keychain.
4. **Sign out**: Sign out. Verify the Keychain item is deleted.
5. **iCloud backup**: Verify the Keychain item is NOT included in
   iCloud backup (ThisDeviceOnly).
6. **Corrupted data**: Simulate a Keychain failure. Verify the app
   handles it gracefully.

---

## 7. Security properties summary

| Property | Implementation |
|---|---|
| Refresh token never in PlayerPrefs | ✅ Enforced by code (only `ICredentialStore` writes it) |
| No plaintext fallback | ✅ All paths return false/null when secure storage fails |
| Legacy token migration verified before deletion | ✅ Write → re-read → compare → delete |
| Sign-out reports incomplete deletion | ✅ `ClearRefreshTokenAsync` returns `Task<bool>` |
| No credentials in exceptions/logs | ✅ Exception messages use OSStatus codes, not token values |
| Bounded refresh retry | ✅ `MaxRefreshAttempts` (default 1, finite loop) |
| Android: key in Keystore (not extractable) | ✅ `AndroidKeyStore` provider |
| Android: AES-GCM authenticated encryption | ✅ Tamper detection via authentication tag |
| Android: corrupted data → graceful failure | ✅ try/catch returns null |
| iOS: Keychain generic-password | ✅ `kSecClassGenericPassword` |
| iOS: Not backed up | ✅ `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` |
| iOS: Native plugin matches P/Invoke | ✅ C signatures match exactly |
| Profile display fields separate from secrets | ✅ Profile in PlayerPrefs, refresh token in secure store |
