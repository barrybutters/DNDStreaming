const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = {};
const diceView = DirectorDice.create($("dice"));
if (location.pathname === "/dice") document.body.classList.add("dice-only");
if (location.pathname === "/battlemap") document.body.classList.add("map-only");
if (new URLSearchParams(location.search).has("screen"))
  document.body.classList.add("screen");
function render(s) {
  state = s;
  const theme = s.theme || {};
  const accent = /^#[0-9a-f]{6}$/i.test(theme.accent)
      ? theme.accent
      : "#e9bd73",
    panel = /^#[0-9a-f]{6}$/i.test(theme.panel) ? theme.panel : "#101b2e";
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--panel", panel);
  document.body.style.fontSize =
    Math.max(16, Math.min(36, Number(theme.fontSize) || 22)) + "px";
  $("initiative").style.right = theme.position === "left" ? "auto" : "20px";
  $("initiative").style.left = theme.position === "left" ? "20px" : "auto";
  $("title").innerHTML = `<h1>${esc(s.title)}</h1><p>${esc(s.subtitle)}</p>`;
  $("portrait").innerHTML = s.portrait
    ? `<img src="/media/${encodeURIComponent(s.portrait)}" alt="">`
    : "";
  $("party").innerHTML = (s.party || [])
    .map(
      (x) =>
        `<div class="card">${x.portrait ? `<img class="avatar" src="/media/${encodeURIComponent(x.portrait)}" alt="">` : ""}${esc(x.name)}<small>${esc(x.hp)} ${esc(x.conditions)}</small></div>`,
    )
    .join("");
  $("initiative").innerHTML = (s.initiative || [])
    .map(
      (x) =>
        `<div class="card ${x.active ? "active" : ""}">${esc(x.name)}<small>${esc(x.hp)} ${esc(x.conditions)}</small></div>`,
    )
    .join("");
  diceView.show(s.paused ? null : s.dice);
  $("pause").style.display = s.paused ? "flex" : "none";
  $("pauseTitle").textContent = s.title || "We’ll be right back";
  if (s.layout && location.pathname === "/overlay") {
    for (const [key,b] of Object.entries(DirectorLayout.normalize(s.layout))) {
      Object.assign($(key).style,{left:b.x+'%',top:b.y+'%',width:b.w+'%',height:b.h+'%',right:'auto',bottom:'auto',visibility:b.hidden?'hidden':'visible',boxSizing:'border-box',overflow:'hidden'});
    }
  }
  const m = s.map;
  $("map").innerHTML = m
    ? `<img src="/media/${encodeURIComponent(m.media)}" alt="Battle map">` +
      Array.from({ length: m.cols * m.rows }, (_, i) =>
        m.revealed.includes(i)
          ? ""
          : `<div class="fog" style="left:${((i % m.cols) * 100) / m.cols}%;top:${(Math.floor(i / m.cols) * 100) / m.rows}%;width:${100 / m.cols + 0.05}%;height:${100 / m.rows + 0.05}%"></div>`,
      ).join("") +
      (m.tokens || [])
        .map(
          (t) =>
            `<div class="token" style="left:${Math.max(0, Math.min(100, Number(t.x)))}%;top:${Math.max(0, Math.min(100, Number(t.y)))}%;background:${/^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#384b68"}">${t.image ? `<img class="token-image" src="/media/${encodeURIComponent(t.image)}" alt="">` : ""}${esc(t.name)}</div>`,
        )
        .join("")
    : "";
}
const events = new EventSource("/events");
events.addEventListener("state", (e) => render(JSON.parse(e.data)));
setInterval(() => {
  const seconds = Math.ceil(
    Math.max(0, (state.breakEnds || 0) - Date.now()) / 1000,
  );
  $("countdown").textContent = state.breakEnds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
    : "";
}, 250);
