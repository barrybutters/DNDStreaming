/* Server results are authoritative; animation never changes a roll. */
(function (root) {
  function create(node, clock = {}) {
    const now = clock.now || Date.now;
    const schedule = clock.setTimeout || setTimeout;
    const cancel = clock.clearTimeout || clearTimeout;
    let key, settle, hide;
    function clear() { cancel(settle); cancel(hide); node.replaceChildren(); node.hidden = true; }
    function show(roll) {
      if (!roll) { key = null; clear(); return; }
      const next = roll.rollId || JSON.stringify(roll);
      if (next === key) return;
      key = next; clear();
      const age = Math.max(0, now() - (roll.at || now()));
      if (age >= 14000) return;
      node.hidden = false;
      const doc = node.ownerDocument;
      const label = doc.createElement('div'); label.className = 'roll-label';
      label.textContent = roll.label || 'NPC / monster roll';
      const tray = doc.createElement('div'); tray.className = 'dice-tray';
      const dice = (roll.values || []).slice(0, 12).map(value => {
        const die = doc.createElement('span'); die.className = 'visual-die rolling';
        die.textContent = '?'; tray.append(die); return {die, value};
      });
      const total = doc.createElement('b'); total.textContent = 'Rolling…';
      const detail = doc.createElement('small'); detail.textContent = roll.expression;
      node.append(label, tray, total, detail);
      function finish() {
        for (const {die, value} of dice) { die.classList.remove('rolling'); die.textContent = value; }
        total.textContent = String(roll.total);
        detail.textContent = `${roll.expression} · ${(roll.values || []).join(', ')}`;
      }
      if (age > 1800 || root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finish();
      else settle = schedule(finish, 1600 - age);
      hide = schedule(clear, 14000 - age);
    }
    return {show, clear};
  }
  root.DirectorDice = {create};
  if (typeof module !== 'undefined') module.exports = {create};
})(typeof window !== 'undefined' ? window : globalThis);
