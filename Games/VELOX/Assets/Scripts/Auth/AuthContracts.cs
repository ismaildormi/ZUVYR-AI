using System; using UnityEngine;
namespace Velox.Auth
{
    [Serializable] public sealed class VeloxUser { public string userId, displayName, email, photoUrl, idToken; }
    /// <summary>Platform auth provider. Implementations: Play Games (Android), Game Center / Sign in with Apple (iOS), EditorMock (dev builds only).</summary>
    public interface IVeloxAuthProvider
    {
        bool IsAvailable { get; }
        void SignIn(Action<VeloxUser> onSuccess, Action<string> onError);
        void SignOut();
    }
    [Serializable] public sealed class SessionDto { public string accessToken; public long expiresAtUnix; public UserDto user; }
    [Serializable] public sealed class UserDto { public string id, displayName, email, photoUrl; }
}
