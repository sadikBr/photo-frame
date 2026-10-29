// Night: the screen dims, or goes fully dark if «إطفاء الشاشة كلياً» is on. Fully dark asks the
// kiosk app (window.HomeHQ, the frame's Home HQ app with ScreenControl.java) to switch the
// backlight off through root; a touch turns it on again. Without the app the page just goes black.
import { setScreenStatus } from './data.js';

const bridge = () => {
  const b = typeof window !== 'undefined' ? window.HomeHQ : null;
  return b && typeof b.screen === 'function' ? b : null;
};
let lit = null; // unknown until the first call, so a reload at night still tells the app

// 'backlight' (light switched off), 'dim' (lowest light only), 'page' (no app support).
export function screenKind() {
  const b = bridge();
  if (!b) return 'page';
  try { return b.info() === 'backlight' ? 'backlight' : 'dim'; } catch (e) { return 'dim'; }
}

export function setScreen(on) {
  if (on === lit) return;
  lit = on;
  const b = bridge();
  if (b) { try { b.screen(!!on); } catch (e) { /* old app: the black page still covers it */ } }
}
export const screenLit = () => lit;

// Tell the control panel what this frame can do (the app needs a moment to find the light).
setTimeout(() => setScreenStatus(screenKind()), 8000);
setInterval(() => setScreenStatus(screenKind()), 10 * 60000);
