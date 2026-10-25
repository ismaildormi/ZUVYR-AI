#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace UltimateFootballChase.TrashDashAddOn.Editor
{
    /// <summary>Validate only newly authored prefabs; this tool does not copy or alter sample assets.</summary>
    public static class SampleIdentityValidator
    {
        [MenuItem("Tools/Football Chase Add-On/Validate Selected Humanoid")]
        public static void Validate()
        {
            GameObject selected = Selection.activeGameObject;
            if (selected == null)
            {
                Debug.LogWarning("Select the new humanoid prefab in the Project window first.");
                return;
            }
            Character character = selected.GetComponent<Character>();
            SampleCharacterIdentity appearance = selected.GetComponent<SampleCharacterIdentity>();
            if (character == null || appearance == null)
            {
                Debug.LogError("The new prefab needs both the sample Character and our SampleCharacterIdentity components.", selected);
                return;
            }
            if (appearance.Palette == null)
                Debug.LogWarning("Assign an original RunnerIdentityPalette before using the wardrobe.", selected);
            if (string.IsNullOrWhiteSpace(character.characterName))
                Debug.LogError("Give the prefab a new unique fictional Character.characterName before Addressables indexing.", selected);
            if (character.animator == null || character.animator.runtimeAnimatorController == null)
                Debug.LogError("Assign a cleared humanoid Animator Controller. The sample's movement script invokes it.", selected);
            else
            {
                string[] names = { "Dead", "Moving", "Jumping", "JumpSpeed", "Sliding" };
                foreach (string name in names)
                {
                    bool found = false;
                    foreach (AnimatorControllerParameter parameter in character.animator.parameters)
                        if (parameter.name == name) { found = true; break; }
                    if (!found) Debug.LogWarning("Animator parameter missing: " + name, selected);
                }
            }
            Debug.Log("Prefab inspection completed. Also set the sample's Addressables label 'characters', a new identity/icon, collider fit and cleared animations; then test the full run in Unity.", selected);
        }
    }
}
#endif
