// Shopping and to-do lists. Items are added in the control panel. On the frame, tapping a shopping
// tile marks it bought and tapping a task marks it done (tap again to undo); finished items can be
// cleared with two taps.
import { h } from '../util.js';
import { state, on, frameListOp } from '../data.js';
import { ICON } from '../icons.js';

const itemsCount = (n) => (n === 0 ? 'لا شيء ناقص' : n === 1 ? 'غرض واحد' : n === 2 ? 'غرضان' : n <= 10 ? n + ' أغراض' : n + ' غرضاً');
const tasksCount = (n) => (n === 0 ? 'لا مهام' : n === 1 ? 'مهمة واحدة' : n === 2 ? 'مهمتان' : n <= 10 ? n + ' مهام' : n + ' مهمة');
const boughtLine = (n) => (n === 1 ? 'اشتُري غرض واحد' : n === 2 ? 'اشتُري غرضان' : 'اشتُريت ' + n + ' أغراض');

export function createLists() {
  const shopMeta = h('span', { class: 'l-meta' });
  const tiles = h('div', { class: 'l-tiles l-scroll' });
  const shopFoot = h('div', { class: 'l-foot' });
  const taskMeta = h('span', { class: 'l-meta' });
  const rows = h('div', { class: 'l-rows l-scroll' });

  const el = h('section', { class: 'screen s-lists', 'data-screen': 'lists', style: '--ground:#3A1426' },
    h('div', { class: 'lists-layout' },
      h('div', { class: 'l-panel l-shop' },
        h('div', { class: 'l-head' }, h('h2', { class: 'l-title' }, 'التسوق'), shopMeta),
        tiles,
        shopFoot,
      ),
      h('div', { class: 'rule' }),
      h('div', { class: 'l-panel l-tasks' },
        h('div', { class: 'l-head' }, h('h2', { class: 'l-title' }, 'المهام'), taskMeta),
        rows,
      ),
    ),
    h('div', { class: 'band' }),
  );

  // A button that asks for a second tap before clearing.
  function clearButton(listName, label) {
    let armed = false, timer;
    const b = h('button', { class: 'l-clear', type: 'button' }, label);
    b.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        b.classList.add('is-armed');
        b.textContent = 'اضغط مرة أخرى للتأكيد';
        timer = setTimeout(() => { armed = false; b.classList.remove('is-armed'); b.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer);
      frameListOp({ op: 'clearDone', list: listName });
    });
    return b;
  }

  // Long lists scroll (swipe up and down). A fade at the edge shows there is more to see.
  function edges(box) {
    box.classList.toggle('more-above', box.scrollTop > 2);
    box.classList.toggle('more-below', box.scrollTop + box.clientHeight < box.scrollHeight - 2);
  }
  for (const box of [tiles, rows]) box.addEventListener('scroll', () => edges(box), { passive: true });

  function render() {
    const lists = state.lists || { tasks: [], shopping: [] };
    // Keep the scroll position when the lists change (a tick, or an update from the phone).
    const keep = [tiles.scrollTop, rows.scrollTop];

    // Shopping: tap a tile when the item is bought; bought ones stay, crossed out, until cleared.
    const shop = (lists.shopping || []).slice().sort((a, b) => a.done - b.done);
    const open = shop.filter((x) => !x.done);
    const bought = shop.length - open.length;
    shopMeta.textContent = itemsCount(open.length);
    tiles.textContent = '';
    if (!shop.length) tiles.appendChild(h('p', { class: 'l-empty' }, 'لا شيء ناقص في البيت.'));
    for (const it of shop) {
      const tile = h('button', { class: 'l-tile' + (it.done ? ' is-done' : ''), type: 'button', 'aria-pressed': String(it.done) },
        h('span', { class: 'l-tick', html: it.done ? ICON.check : '' }),
        h('span', { class: 'l-tile-text' }, it.text));
      tile.addEventListener('click', () => frameListOp({ op: 'toggle', list: 'shopping', id: it.id }));
      tiles.appendChild(tile);
    }
    shopFoot.textContent = '';
    if (bought) shopFoot.append(h('span', null, boughtLine(bought)), clearButton('shopping', 'إزالتها من القائمة'));

    // Tasks: open ones, then the done ones folded underneath.
    const tasks = lists.tasks || [];
    const todo = tasks.filter((x) => !x.done);
    const done = tasks.filter((x) => x.done).sort((a, b) => (b.ts || 0) - (a.ts || 0)); // latest first
    taskMeta.textContent = tasksCount(todo.length);
    rows.textContent = '';
    if (!tasks.length) rows.appendChild(h('p', { class: 'l-empty' }, 'لا مهام حالياً.'));
    // Tap a task to mark it done; tap a done one to bring it back.
    const row = (it) => {
      const b = h('button', { class: 'l-row' + (it.done ? ' is-done' : ''), type: 'button', 'aria-pressed': String(it.done) },
        h('span', { class: 'l-circle', html: it.done ? ICON.check : '' }),
        h('span', { class: 'l-row-text' }, it.text),
        it.rid ? h('span', { class: 'l-repeat', title: 'مهمة متكررة', html: ICON.repeat }) : null);
      b.addEventListener('click', () => frameListOp({ op: 'toggle', list: 'tasks', id: it.id }));
      return b;
    };
    todo.forEach((it) => rows.appendChild(row(it)));
    if (done.length) {
      rows.appendChild(h('div', { class: 'l-done-head' }, h('span', null, 'أُنجزت (' + done.length + ')'), clearButton('tasks', 'حذف المنجزة')));
      done.forEach((it) => rows.appendChild(row(it)));
    }
    tiles.scrollTop = keep[0];
    rows.scrollTop = keep[1];
    edges(tiles);
    edges(rows);
  }

  on('lists', render);
  return { name: 'lists', label: 'القوائم', el, tick() {}, show: render };
}
