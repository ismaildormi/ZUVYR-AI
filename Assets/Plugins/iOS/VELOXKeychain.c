// ============================================================================
// VELOXKeychain.c — Native iOS Keychain integration for VELOX secure
// credential storage.
//
// Stores the Firebase refresh token as a generic-password Keychain item
// (kSecClassGenericPassword). The managed P/Invoke declarations in
// PlatformCredentialStore.cs use [DllImport("__Internal")] and resolve to
// the three functions below.
//
// Security properties:
//   - Refresh tokens are stored as kSecClassGenericPassword items.
//   - kSecAttrAccessibleWhenUnlockedThisDeviceOnly prevents backup/export
//     and sync to other devices.
//   - Tokens are never logged or included in error messages.
//   - Missing items return errSecItemNotFound (non-zero), not a crash.
//   - OS errors are returned as the OSStatus code (non-zero), not a crash.
//   - Delete treats errSecItemNotFound as success (already absent).
//
// BUILD REQUIREMENTS:
//   - This file is compiled directly into the iOS app binary by Unity.
//   - No separate .bundle or library needs to be built.
//   - The Security framework is linked automatically on iOS.
//   - Unity 2022.3.21f1 iOS build target required.
//
// UNVERIFIED IN SANDBOX: This native code has NOT been compiled or tested
// in the current environment (no iOS toolchain available). The managed
// P/Invoke signatures match this file's C signatures exactly. On-device
// verification is required before claiming this works.
// ============================================================================

#include <Security/Security.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>

// ----------------------------------------------------------------------------
// Internal helper: build a query dictionary for a generic-password item.
// Returns a mutable dictionary with kSecClass, kSecAttrService, kSecAttrAccount.
// The caller must CFRelease() it. Returns NULL on failure.
// ----------------------------------------------------------------------------
static CFMutableDictionaryRef BuildQuery(const char* service, const char* account)
{
    CFStringRef serviceCF = CFStringCreateWithCString(kCFAllocatorDefault, service, kCFStringEncodingUTF8);
    CFStringRef accountCF = CFStringCreateWithCString(kCFAllocatorDefault, account, kCFStringEncodingUTF8);

    CFMutableDictionaryRef query = NULL;
    if (serviceCF && accountCF)
    {
        query = CFDictionaryCreateMutable(
            kCFAllocatorDefault, 0,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks);
        if (query)
        {
            CFDictionaryAddValue(query, kSecClass, kSecClassGenericPassword);
            CFDictionaryAddValue(query, kSecAttrService, serviceCF);
            CFDictionaryAddValue(query, kSecAttrAccount, accountCF);
        }
    }

    if (serviceCF) CFRelease(serviceCF);
    if (accountCF) CFRelease(accountCF);
    return query;
}

// ----------------------------------------------------------------------------
// VELOX_KeychainStore
// Stores (or updates) a generic-password Keychain item with the given data.
// Returns 0 on success, non-zero on failure.
// ----------------------------------------------------------------------------
int VELOX_KeychainStore(const char* service, const char* account,
                        const uint8_t* data, int dataLen)
{
    if (service == NULL || account == NULL || data == NULL || dataLen <= 0)
        return -1;

    // Delete any existing item first so SecItemAdd won't hit duplicate.
    VELOX_KeychainDelete(service, account);

    CFMutableDictionaryRef query = BuildQuery(service, account);
    if (!query) return -2;

    CFDataRef dataCF = CFDataCreate(kCFAllocatorDefault, data, (CFIndex)dataLen);
    if (!dataCF)
    {
        CFRelease(query);
        return -3;
    }

    CFDictionaryAddValue(query, kSecValueData, dataCF);
    CFDictionaryAddValue(query, kSecAttrAccessible, kSecAttrAccessibleWhenUnlockedThisDeviceOnly);

    OSStatus status = SecItemAdd(query, NULL);
    CFRelease(dataCF);
    CFRelease(query);

    return (status == errSecSuccess) ? 0 : (int)status;
}

// ----------------------------------------------------------------------------
// VELOX_KeychainRetrieve
// Retrieves the data for a generic-password Keychain item.
// On success: sets *outData (malloc'd — caller/marshaller frees) and *outLen.
// Returns 0 on success, errSecItemNotFound if absent, other OSStatus on error.
// ----------------------------------------------------------------------------
int VELOX_KeychainRetrieve(const char* service, const char* account,
                           uint8_t** outData, int* outLen)
{
    if (outData == NULL || outLen == NULL)
        return -1;

    *outData = NULL;
    *outLen = 0;

    if (service == NULL || account == NULL)
        return -1;

    CFMutableDictionaryRef query = BuildQuery(service, account);
    if (!query) return -2;

    CFTypeRef result = NULL;
    OSStatus status = SecItemCopyMatching(query, &result);

    int rc;
    if (status == errSecSuccess && result)
    {
        CFDataRef dataCF = (CFDataRef)result;
        CFIndex len = CFDataGetLength(dataCF);
        if (len > 0)
        {
            *outLen = (int)len;
            uint8_t* buffer = (uint8_t*)malloc((size_t)len);
            if (buffer)
            {
                memcpy(buffer, CFDataGetBytePtr(dataCF), (size_t)len);
                *outData = buffer;
                rc = 0;
            }
            else
            {
                rc = -4; // malloc failed
            }
        }
        else
        {
            rc = -5; // empty data in keychain
        }
        CFRelease(result);
    }
    else if (status == errSecItemNotFound)
    {
        rc = (int)status; // absent — managed side returns null
    }
    else
    {
        rc = (int)status; // other OS error
    }

    CFRelease(query);
    return rc;
}

// ----------------------------------------------------------------------------
// VELOX_KeychainDelete
// Deletes a generic-password Keychain item.
// Returns 0 on success (including already-absent), non-zero on OS error.
// ----------------------------------------------------------------------------
int VELOX_KeychainDelete(const char* service, const char* account)
{
    if (service == NULL || account == NULL)
        return -1;

    CFMutableDictionaryRef query = BuildQuery(service, account);
    if (!query) return -2;

    OSStatus status = SecItemDelete(query);
    CFRelease(query);

    // errSecItemNotFound means the item was already absent — treat as success.
    return (status == errSecSuccess || status == errSecItemNotFound) ? 0 : (int)status;
}
