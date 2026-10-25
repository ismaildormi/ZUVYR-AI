using UnityEngine; using Velox.Core; using Velox.Audio;
namespace Velox.Player
{
    /// <summary>NEO runner: 3-lane switch, jump, slide. Touch swipe + keyboard, no third-party code.</summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        [SerializeField] private float laneDistance=2.2f, laneSpeed=14f, jumpForce=8.5f, gravity=-22f, slideTime=.75f;
        [SerializeField] private Animator animator; [SerializeField] private VeloxAudioManager audioMgr;
        private CharacterController cc; private int lane=1; private float vy, slideT; private Vector2 touchStart; private bool swiping;
        private static readonly int Run=Animator.StringToHash("Speed"), JumpH=Animator.StringToHash("Jump"), SlideH=Animator.StringToHash("Slide"), Dead=Animator.StringToHash("Dead");
        private void Awake(){ cc=GetComponent<CharacterController>(); if(!audioMgr) audioMgr=FindObjectOfType<VeloxAudioManager>(); }
        private void Update()
        {
            if(GameManager.Instance==null||GameManager.Instance.State!=GameState.Playing) return;
            HandleInput();
            if(slideT>0) slideT-=Time.deltaTime;
            Vector3 target=new Vector3((lane-1)*laneDistance, transform.position.y, transform.position.z);
            float x=Mathf.Lerp(transform.position.x,target.x,laneSpeed*Time.deltaTime);
            if(cc.isGrounded && vy<0) vy=-1f;
            vy+=gravity*Time.deltaTime;
            Vector3 move=new Vector3(x-transform.position.x, vy*Time.deltaTime, GameManager.Instance.Speed*Time.deltaTime);
            cc.Move(move);
            if(animator){ animator.SetFloat(Run,GameManager.Instance.Speed); animator.SetBool(SlideH,slideT>0); }
        }
        private void HandleInput()
        {
            if(Input.GetKeyDown(KeyCode.LeftArrow)||Input.GetKeyDown(KeyCode.A)){MoveLane(-1);}
            if(Input.GetKeyDown(KeyCode.RightArrow)||Input.GetKeyDown(KeyCode.D)){MoveLane(1);}
            if((Input.GetKeyDown(KeyCode.UpArrow)||Input.GetKeyDown(KeyCode.W)||Input.GetKeyDown(KeyCode.Space))) DoJump();
            if(Input.GetKeyDown(KeyCode.DownArrow)||Input.GetKeyDown(KeyCode.S)) DoSlide();
            if(Input.touchCount==1){ var t=Input.GetTouch(0);
                if(t.phase==TouchPhase.Began){touchStart=t.position;swiping=true;}
                if(t.phase==TouchPhase.Ended&&swiping){ Vector2 d=t.position-touchStart; swiping=false;
                    if(d.magnitude<40) return;
                    if(Mathf.Abs(d.x)>Mathf.Abs(d.y)) MoveLane(d.x>0?1:-1); else if(d.y>0) DoJump(); else DoSlide(); } }
        }
        public void MoveLane(int dir){ int n=Mathf.Clamp(lane+dir,0,2); if(n!=lane){lane=n; audioMgr?.Lane();} }
        public void DoJump(){ if(!cc.isGrounded) return; vy=jumpForce; slideT=0; if(animator) animator.SetTrigger(JumpH); audioMgr?.Jump(); }
        public void DoSlide(){ slideT=slideTime; if(!cc.isGrounded) vy=-14f; cc.height=0.9f; audioMgr?.Slide(); Invoke(nameof(ResetHeight),slideTime); }
        private void ResetHeight()=> cc.height=1.8f;
        private void OnControllerColliderHit(ControllerColliderHit hit){ if(hit.gameObject.CompareTag("Obstacle")){ if(animator) animator.SetTrigger(Dead); audioMgr?.Crash(); GameManager.Instance.GameOver(); } }
        private void OnTriggerEnter(Collider o){ if(o.CompareTag("Coin")){ GameManager.Instance.AddCoins(1); audioMgr?.Coin(); o.gameObject.SetActive(false); } }
    }
}
