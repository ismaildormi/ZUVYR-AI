# V2 browser playtest (independent Unity companion)

Run `node server.mjs`, then visit `http://localhost:4173`. No npm install, credentials or internet access needed. `PORT=4173 node server.mjs` accepts a custom port and binds 0.0.0.0 for the Arena live preview.

**This is not a Unity export and does not share Unity PlayerPrefs, accounts, save games or inventory.** It is a small original browser-playable prototype for quickly trying 3-lane running, jumps, slides, obstacles, coin pickups, character silhouettes and cosmetic selection. Browser-only demo credits (360 starter credits) and unlocks are localStorage data, not paid goods or claims on the Unity game. Reset through the page. There are no rankings, real prizes, ads or purchases.

- Keyboard: ← / → (or A/D) to change lanes; ↑ / Space / W to jump; ↓ / S to slide.
- Touch: swipe the game scene or use the four onscreen control buttons.
- Side panels: eight fictional heroes, fourteen original tint concepts, four boards and three browser-demo packs. Locked stage colours can be tried as **temporary visual previews**, without owning them. Cosmetic changes are blocked during a run to keep saved results consistent.
- `node --test engine.test.mjs` executes pure JavaScript simulation, save validation, mission, unlock and collision checks. Browser visual/device QA still requires a human.

The Unity game under `Assets/_Game` remains the authoritative *source project*, not a compiled distribution. Build and test it in Unity 6.3 before claiming parity. Parameters in this companion are representative/provisional, not proof of identical Unity behavior.
