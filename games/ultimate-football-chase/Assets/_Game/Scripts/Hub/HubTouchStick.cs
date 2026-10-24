using UnityEngine;
using UnityEngine.EventSystems;

namespace UltimateFootballChase.Hub
{
    /// <summary>Single finger portrait joystick; world movement is not restricted to 3 lanes.</summary>
    public sealed class HubTouchStick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        [SerializeField] private RectTransform thumb;
        private RectTransform area;
        public Vector2 Direction { get; private set; }
        private void Awake() { area = (RectTransform)transform; }
        public void SetThumb(RectTransform handle) { thumb = handle; }
        public void OnPointerDown(PointerEventData data) { OnDrag(data); }
        public void OnDrag(PointerEventData data)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(area, data.position,
                    data.pressEventCamera, out Vector2 local)) return;
            float radius = Mathf.Max(1f, Mathf.Min(area.rect.width, area.rect.height) * .42f);
            Direction = Vector2.ClampMagnitude(local / radius, 1f);
            if (thumb != null) thumb.anchoredPosition = Direction * radius;
        }
        public void OnPointerUp(PointerEventData data)
        {
            Direction = Vector2.zero;
            if (thumb != null) thumb.anchoredPosition = Vector2.zero;
        }
    }
}
