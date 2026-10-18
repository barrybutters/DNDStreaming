"use strict";
const api = window.director,
  $ = (s) => document.querySelector(s),
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
let snap,
  page = "session",
  search = "",
  selectedMap = null,
  editorSave,
  devices = [],
  lanUrls = [];
const audio = new DirectorAudio(
  (id) => "/media/" + encodeURIComponent(id),
  () => current()?.audio || {},
);
function current() {
  return snap?.state.campaigns.find((c) => c.id === snap.state.active);
}
function toast(message, error = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = error ? "error" : "";
  t.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => (t.style.display = "none"),
    error ? 10000 : 4500,
  );
}
async function call(type, p = {}, quiet = false) {
  try {
    const r = await api.invoke(type, p);
    snap = await api.invoke("snapshot");
    render();
    return r;
  } catch (e) {
    toast(e.message, true);
    if (!quiet) throw e;
  }
}
const btn = (label, action, extra = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const options = (items, value, blank = "None") =>
  `<option value="">${esc(blank)}</option>` +
  items
    .map(
      (x) =>
        `<option value="${esc(x.id ?? x)}" ${(x.id ?? x) === value ? "selected" : ""}>${esc(x.title ?? x.name ?? x)}</option>`,
    )
    .join("");
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
const area = (name, label, value = "") =>
  `<label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea>`;
const select = (name, label, items, value, blank) =>
  `<label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options(items, value, blank)}</select>`;
const check = (name, label, value) =>
  `<label class="check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${label}</label>`;
function modal(title, html, save) {
  $("#editorForm").oninput = null;
  $("#editorBody").innerHTML = `<h2>${esc(title)}</h2>${html}`;
  editorSave = save;
  $("#editor").showModal();
}
function form() {
  const data = Object.fromEntries(new FormData($("#editorForm")));
  for (const el of $("#editorForm").querySelectorAll("input[type=checkbox]"))
    data[el.name] = el.checked;
  return data;
}
$("#cancelEditor").onclick = () => $("#editor").close();
$("#editorForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await editorSave(form());
    $("#editor").close();
  } catch (e) {
    toast(e.message, true);
  }
};
function heading(title, subtitle, actions = "") {
  return `<div class="pagehead"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="actions">${actions}</div></div>`;
}
function empty(text) {
  return `<div class="empty">${text}</div>`;
}
function card(title, content, actions = "", cls = "") {
  return `<section class="card ${cls}"><div class="cardhead"><h2>${title}</h2><div class="actions">${actions}</div></div>${content}</section>`;
}
function preview(s) {
  return `<div class="audience-preview">${s.portrait ? `<img src="/media/${esc(s.portrait)}" alt="Audience portrait">` : ""}<div class="caption"><h2>${esc(s.title || "Your next story starts here")}</h2><span class="muted">${esc(s.subtitle || "Reveal a title, portrait, or encounter")}</span>${s.paused ? "<p>PAUSED</p>" : ""}</div></div><p class="tiny muted" style="margin:10px 0 0">${s.party?.length || 0} party cards · ${s.initiative?.length || 0} initiative entries${s.map ? " · Map visible" : ""}</p>`;
}
function render() {
  const c = current();
  document.body.className = [
    snap.state.settings.reduceMotion ? "reduce" : "",
    c?.performance ? "performance" : "",
  ].join(" ");
  const nav = [
    ["session", "Run session"],
    ["combat", "Combat & dice"],
    ["party", "Party & spotlight"],
    ["campaign", "Campaign notebook"],
    ["cues", "Cues & hotkeys"],
    ["media", "Music & media"],
    ["maps", "Maps & reveals"],
    ["library", "Starter maps & tokens"],
    ["show", "Show preparation"],
    ["timeline", "Session timeline"],
    ["settings", "Settings & checks"],
  ];
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="brand">◈ Dungeon Director<span>YOUR TABLE. ON AIR.</span></div><label>CAMPAIGN</label><select id="campaignSwitch"><option value="">Select campaign</option>${snap.state.campaigns.map((x) => `<option value="${x.id}" ${x.id === snap.state.active ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><nav>${nav.map(([key, label]) => `<button data-page="${key}" class="${page === key ? "active" : ""}">${label}</button>`).join("")}</nav><div class="bottom">${btn("+ New campaign", "newCampaign", "", "small ghost")}<p>Local workspace · v0.2.0<br>Autosaved after every action</p></div></aside><main class="main"><header class="topbar"><div class="status"><span><i class="dot ${snap.obs.connected ? "on" : ""}"></i>OBS ${snap.obs.connected ? "connected" : snap.obs.reconnecting ? "reconnecting…" : "disconnected"}</span>${c ? `<span class="pill ${c.rehearsal ? "gold" : "live"}">${c.rehearsal ? "REHEARSAL · OBS HELD" : "OBS OUTPUT ON"}</span>` : ""}</div><div class="actions">${c ? btn(c.rehearsal ? "Enable OBS output" : "Hold OBS output", "toggleMode", "", "small") + btn("Undo", "undo", "", "small") + btn("Privacy pause", "panic", "", "small danger") : ""}</div></header>${snap.recovery ? `<div class="banner">${esc(snap.recovery)}</div>` : ""}${c ? renderPage(c) : welcome()}</main></div>`;
}
function welcome() {
  return `<div class="welcome"><span class="pill gold">LOCAL D&D BROADCAST WORKSTATION</span><h1 style="margin-top:20px">Prepare the adventure.<br>Direct the show.</h1><p>Campaign notes, encounters, audience reveals, sound cues, and OBS controls together. Your private DM workspace stays separate from the audience output.</p><div class="actions">${btn("Create your campaign", "newCampaign", "", "primary")}${btn("Import a campaign", "importFile")}</div>${card("Start safely", "<p>New campaigns open in rehearsal. Connect OBS, import your media, configure your privacy scene, and run the pre-stream checks before arming live controls.</p><p>No account or cloud service is needed to run the installed application.</p>")}</div>`;
}
function combatRows(c, compact = false) {
  return c.combat.length
    ? c.combat
        .map(
          (x, i) =>
            `<div class="row ${i === c.turn ? "active" : ""}"><span class="stat" style="font-size:20px">${esc(x.initiative)}</span><div class="grow"><strong>${esc(x.name)} ${!x.visible ? '<span class="pill">PRIVATE</span>' : ""}</strong><span class="tiny muted">${esc(x.conditions || "No conditions")}${x.concentration ? " · Concentrating" : ""}</span></div><div><span class="hp">${x.hp}/${x.maxHp}</span>${x.tempHp ? ` <span class="tiny">+${x.tempHp}</span>` : ""}<div class="actions">${btn("−", "damage", `data-id="${x.id}" data-collection="combat"`, "small")}${btn("+", "heal", `data-id="${x.id}" data-collection="combat"`, "small")}${!compact ? btn("Edit", "editEntity", `data-collection="combat" data-id="${x.id}"`, "small") : ""}</div></div></div>`,
        )
        .join("")
    : empty("Add combatants or load a saved encounter.");
}
function timeline(c, limit = 100) {
  return `<div class="timeline">${
    c.timeline
      .slice(0, limit)
      .map(
        (x) =>
          `<div class="row"><time>${new Date(x.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><div class="grow">${esc(x.text)}<div class="tiny muted">${esc(x.type)}</div></div></div>`,
      )
      .join("") || empty("Your session events will appear here.")
  }</div>`;
}
function cueCards(c) {
  return (
    c.cues
      .map(
        (q) =>
          `<div class="card cue"><h3>${esc(q.name)}</h3><span class="tiny muted">${q.steps.length} steps · ${esc(q.description || "")}</span><div class="actions">${btn(c.rehearsal ? "Rehearse" : "Run cue", "runCue", `data-id="${q.id}"`, "primary small")}${btn("Edit", "editEntity", `data-collection="cues" data-id="${q.id}"`, "small")}</div></div>`,
      )
      .join("") || empty("Create your first cue to coordinate the show.")
  );
}
function renderPage(c) {
  switch (page) {
    case "library": {
      const filter = search.toLowerCase();
      const assets = (snap.catalog || []).filter(x=>x.name.toLowerCase().includes(filter));
      return heading("Starter maps & tokens", "Original starter artwork. Maps open privately; placed tokens start hidden.") +
        `<input id="stockSearch" placeholder="Search maps or species…" value="${esc(search)}"><p>${(snap.catalog || []).filter(x=>x.kind==='map').length} maps · ${(snap.catalog || []).filter(x=>x.kind==='token').length} generic tokens. Coverage is listed by name; homebrew species are not included.</p><div class="stock-grid">${assets.map(x=>`<section class="card"><img loading="lazy" src="/stock/${encodeURIComponent(x.id)}" alt="${esc(x.name)}"><h3>${esc(x.name)}</h3><div class="actions">${btn(x.kind==='map'?'Use map':'Add portrait','stockAdd',`data-id="${esc(x.id)}" data-kind="${x.kind}"`,'small primary')}${x.kind==='token' && c.selectedMap ? btn('Place on selected map','stockToken',`data-id="${esc(x.id)}"`,'small'):''}</div></section>`).join('')}</div>`;
    }
    case "session":
      return (
        heading(
          "Run session",
          `${esc(c.sessionTitle)} · ${esc(c.name)}`,
          btn("Start session", "startSession") +
            btn("Add marker", "marker") +
            btn("Break · 10 min", "break") +
            btn("Resume", "resume"),
        ) +
        `<div class="grid dashboard">${card("Encounter · Round " + c.round, combatRows(c, true), btn("Next turn →", "nextTurn", "", "primary small"))}${card("Audience output · currently live", preview(snap.audience), btn("Reveal…", "reveal", "", "small"))}${card("Quick cues", `<div class="grid">${cueCards(c)}</div>`, btn("+ Cue", "addEntity", 'data-collection="cues"', "small"))}${card("Recent activity", timeline(c, 8))}${card("OBS scene controls", `<div class="actions">${snap.obs.scenes.map((name) => btn(esc(name), "scene", `data-name="${esc(name)}"`, snap.obs.scene === name ? "primary" : "")).join("") || "<p>Connect OBS in Settings to load scenes.</p>"}</div><div class="row"><span>Recording: ${snap.obs.recording ? "ACTIVE" : "Stopped"} · Stream: ${snap.obs.streaming ? "ACTIVE" : "Stopped"}</span>${btn(snap.obs.recording ? "Stop recording" : "Start recording", "record")}</div>`, "", "wide")}</div>`
      );
    case "combat":
      return (
        heading(
          "Combat & dice",
          "Run encounters privately; choose what the audience sees.",
          btn(
            "+ Combatant",
            "addEntity",
            'data-collection="combat"',
            "primary",
          ) +
            btn("Sort initiative", "sortCombat") +
            btn("Save encounter", "saveEncounter"),
        ) +
        `<div class="grid">${card("Initiative · Round " + c.round, combatRows(c), btn("Next turn →", "nextTurn", "", "primary small"))}${card("Dice roller", `<form id="diceForm">${input("expression", "Dice expression", "1d20+5")}${select("mode", "Roll mode", ["normal", "advantage", "disadvantage"], "normal")}${input("label", "Public roll label", "NPC / monster roll")}${check("publish", "Animate this roll for viewers in OBS", false)}<p class="tiny">OBS Browser Source (1920 × 1080): ${esc(snap.url)}/dice. Rolls clear after 14 seconds.</p><button class="primary" style="margin-top:15px">Roll dice</button></form><div class="actions" style="margin-top:10px">${btn("Hide dice result", "clearDice")}</div><h3 style="margin-top:25px">Saved rolls</h3><div class="actions">${c.savedRolls.map((r) => btn(esc(r), "savedRoll", `data-expression="${esc(r)}"`, "small")).join("")}</div>`)}${card("Saved encounters", c.encounters.map((e) => `<div class="row"><span>${esc(e.name)} · ${e.combat.length} combatants</span>${btn("Load", "loadEncounter", `data-id="${e.id}"`, "small")}</div>`).join("") || empty("Save the current encounter to reuse it."))}${card("Audience combat settings", `<p>Hidden enemies never appear in the public initiative list. Edit each combatant to set its public name, health display, and public conditions.</p>${btn(c.public.showInitiative ? "Hide initiative" : "Show initiative", "initiative")}`)}</div>`
      );
    case "party":
      return (
        heading(
          "Party & spotlight",
          "Private character details with independent audience controls.",
          btn(
            "+ Character",
            "addEntity",
            'data-collection="characters"',
            "primary",
          ) +
            btn(
              c.public.showParty ? "Hide party overlay" : "Show party overlay",
              "toggleParty",
            ),
        ) +
        `<div class="grid three">${c.characters.map((x) => card(esc(x.name), `${x.portrait ? `<img class="media-thumb" src="/media/${esc(x.portrait)}" alt="Portrait">` : ""}<p>${esc(x.player || "")} · ${esc(x.classLevel || "")}</p><span class="hp">${x.hp}/${x.maxHp} HP</span><div class="progress"><i style="width:${Math.max(0, Math.min(100, (x.hp / Math.max(1, x.maxHp)) * 100))}%"></i></div><p class="tiny" style="margin-top:10px">${esc(x.conditions || "No conditions")} · ${x.absent ? "Absent" : x.visible ? "Public card enabled" : "Private card"}</p><div class="row"><span>Spotlight: ${c.spotlight[x.id] || 0}</span>${btn("Mark moment", "spotlight", `data-id="${x.id}"`, "small")}</div><div class="actions">${btn("Damage", "damage", `data-id="${x.id}" data-collection="characters"`, "small")}${btn("Heal", "heal", `data-id="${x.id}" data-collection="characters"`, "small")}${btn("Edit", "editEntity", `data-id="${x.id}" data-collection="characters"`, "small")}</div>`)).join("") || empty("Add the party to track health, attendance, and spotlight.")}</div>`
      );
    case "campaign":
      return (
        heading(
          "Campaign notebook",
          "Search NPCs, locations, quests, session notes, and private reminders.",
          btn(
            "+ Note / NPC",
            "addEntity",
            'data-collection="notes"',
            "primary",
          ) + btn("Session zero", "sessionZero"),
        ) +
        `<input id="searchNotes" placeholder="Search title, content, tags, or pronunciation…" value="${esc(search)}" aria-label="Search notes" style="margin-bottom:20px"><div class="grid">${
          c.notes
            .filter((x) =>
              JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
            )
            .map((n) =>
              card(
                esc(n.title),
                `<span class="pill">${esc(n.kind || "Note")}</span><p class="tiny">${esc(n.tags || "")}</p>${n.pronunciation ? `<p>Pronunciation: ${esc(n.pronunciation)}</p>` : ""}<div class="note-text">${esc(n.body)}</div>${n.voice ? `<p class="tiny">Voice: ${esc(n.voice)}</p>` : ""}${n.relationships ? `<p class="tiny">Relationships: ${esc(n.relationships)}</p>` : ""}`,
                btn(
                  "Edit",
                  "editEntity",
                  `data-id="${n.id}" data-collection="notes"`,
                  "small",
                ) +
                  (n.portrait
                    ? btn(
                        "Preview reveal",
                        "revealNote",
                        `data-id="${n.id}"`,
                        "small",
                      )
                    : ""),
              ),
            )
            .join("") || empty("Create searchable notes for your campaign.")
        }</div>`
      );
    case "cues":
      return (
        heading(
          "Cues & hotkeys",
          "Coordinate scene changes, public reveals, audio, and encounter actions.",
          btn("+ Cue", "addEntity", 'data-collection="cues"', "primary") +
            btn("Hotkey bindings", "hotkeys") +
            btn("Add starter cues", "starterCues"),
        ) +
        `<div class="grid three">${cueCards(c)}</div><div style="margin-top:20px">${card("Registered global shortcuts", snap.hotkeys.map((h) => `<div class="row"><code>${esc(h.key)}</code><span>${esc(h.action)} ${h.ok ? "✓" : "⚠ " + esc(h.error)}</span></div>`).join("") || "<p>Global hotkeys are available in the desktop app. Configure bindings above.</p>")}</div>`
      );
    case "media":
      return (
        heading(
          "Music & media",
          "Managed local assets, layered ambience, audio destinations, and credits.",
          btn("Import media", "importMedia", "", "primary") +
            btn("Playlists", "playlists") +
            btn("Stop all audio", "stopAudio") +
            btn("Duck / restore", "duck") +
            btn("Audio routing", "audioRouting") +
            btn("Export credits", "saveCredits"),
        ) +
        `<div class="grid three">${c.media.map((m) => card(esc(m.title), `${m.kind === "image" ? `<img class="media-thumb" src="/media/${esc(m.id)}" alt="${esc(m.title)}">` : m.kind === "audio" ? '<div class="media-thumb" style="display:grid;place-items:center;font-size:40px">♫</div>' : `<video class="media-thumb" controls src="/media/${esc(m.id)}"></video>`}<span class="pill">${esc(m.kind)}</span><p class="tiny">${esc(m.credit || "No credit recorded")}</p><div class="actions">${m.kind === "audio" ? btn("Play / layer", "playMedia", `data-id="${m.id}"`, "small primary") + btn("Trim", "trimMedia", `data-id="${m.id}"`, "small") : m.kind === "image" ? btn("Preview reveal", "revealMedia", `data-id="${m.id}"`, "small primary") + btn("Crop", "cropMedia", `data-id="${m.id}"`, "small") : ""}${btn("Edit / rights", "editEntity", `data-id="${m.id}" data-collection="media"`, "small")}</div>`)).join("") || empty("Import images, local music, ambience, and sound effects.")}</div>`
      );
    case "maps": {
      const m =
        c.maps.find((x) => x.id === (selectedMap || c.selectedMap)) ||
        c.maps[0];
      return (
        heading(
          "Maps & reveals",
          "Click cells to change fog. Starter maps open privately with all cells revealed. Imported maps start concealed.",
          btn("+ Map", "addEntity", 'data-collection="maps"', "primary"),
        ) +
        `<div class="grid">${card("Map controls", `<select id="mapSwitch">${options(c.maps, m?.id, "Select map")}</select>${m ? `<div class="actions" style="margin-top:15px">${btn("Edit map", "editEntity", `data-id="${m.id}" data-collection="maps"`)}${btn(m.published ? "Hide audience map" : "Publish audience map", "mapPublish", `data-id="${m.id}"`, "primary")}${btn("+ Token", "addToken", `data-id="${m.id}"`)}${btn("Reveal all", "mapFog", `data-id="${m.id}" data-reveal="true"`)}${btn("Conceal all", "mapFog", `data-id="${m.id}" data-reveal="false"`)}</div><p class="tiny" style="margin-top:15px">${m.cols} × ${m.rows} cells · ${m.revealed.length} revealed. Click concealed cells to reveal, visible cells to conceal.</p>${(m.tokens || []).map((t, i) => `<div class="row"><span>${esc(t.name)} ${t.visible ? "· Public" : "· Private"}</span>${btn("Edit", "editToken", `data-id="${m.id}" data-index="${i}"`, "small")}</div>`).join("")}` : empty("Import a map image in Music & media, then create a map.")} `)}${card("DM map preview", m ? `<div class="mapwrap"><img src="/media/${esc(m.media)}" alt="DM map"><div class="foggrid" style="grid-template-columns:repeat(${m.cols},1fr);grid-template-rows:repeat(${m.rows},1fr)">${Array.from({ length: m.cols * m.rows }, (_, i) => `<button aria-label="${m.revealed.includes(i) ? "Conceal" : "Reveal"} cell ${i + 1}" class="fogcell ${m.revealed.includes(i) ? "clear" : ""}" data-action="mapCell" data-id="${m.id}" data-cell="${i}"></button>`).join("")}</div>${(m.tokens || []).map((t) => `<span class="token" style="left:${Number(t.x)}%;top:${Number(t.y)}%;background:${/^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#384b68"}">${t.image ? `<img src="/media/${encodeURIComponent(t.image)}" alt="">` : ""}${esc(t.name)}</span>`).join("")}</div>` : empty("No map selected."))}</div>`
      );
    }
    case "show":
      return (
        heading(
          "Show preparation",
          "Plan the episode and rehearse its sequence.",
          btn(
            "+ Running-order item",
            "addEntity",
            'data-collection="rundown"',
            "primary",
          ) +
            btn("Episode settings", "episode") +
            btn("Pre-stream checks", "checks"),
        ) +
        `<div class="grid">${card("Running order", c.rundown.map((r, i) => `<div class="row"><span class="stat" style="font-size:20px">${i + 1}</span><div class="grow"><strong>${esc(r.title)}</strong><span class="tiny muted">${esc(r.notes)} · ${esc(r.minutes || 0)} min ${r.done ? "· DONE" : ""}</span></div><div class="actions">${r.cueId ? btn("Run cue", "runCue", `data-id="${r.cueId}"`, "small primary") : ""}${btn(r.done ? "Reset" : "Done", "rundownDone", `data-id="${r.id}"`, "small")}${btn("↑", "rundownUp", `data-id="${r.id}"`, "small")}${btn("Edit", "editEntity", `data-id="${r.id}" data-collection="rundown"`, "small")}</div></div>`).join("") || empty("Plan the opening, recap, encounters, break, and closing."))}${card("Broadcast setup", `<p>Add an OBS Browser Source using this URL:</p><pre>${esc(snap.url)}/overlay</pre><p>Dice only: <code>${esc(snap.url)}/dice</code><br>Map only: <code>${esc(snap.url)}/battlemap</code></p><p class="tiny">Enable OBS output in the header before publishing. Empty output is transparent. Use a 1920 × 1080 source. Keep “Shutdown source when not visible” disabled for continuous updates. Capture desktop audio or your selected output devices in OBS.</p>${btn("Open audience display", "audienceWindow") + btn("Overlay appearance", "overlayTheme") + btn("Arrange overlay", "overlayLayout") + btn("Add overlay source to OBS", "setupOverlay")}<p class="tiny" style="margin-top:15px">Audience display can be moved to a table screen or captured in OBS. Maps retain their original proportions; fog and tokens stay aligned with the map.</p>`)}</div>`
      );
    case "timeline":
      return (
        heading(
          "Session timeline",
          "Timestamped cues, combat turns, dice, highlights, and recovery events.",
          btn("+ Highlight marker", "marker") +
            btn("Export timeline", "exportTimeline"),
        ) + card("Recorded activity", timeline(c, 2000))
      );
    case "settings":
      return settings(c);
  }
}
function settings(c) {
  return (
    heading(
      "Settings & pre-stream checks",
      "Local connections, campaign backups, hotkeys, and private-session controls.",
      btn("Run checks", "checks", "", "primary") +
        btn("Export campaign", "exportFile") +
        btn("Import campaign", "importFile"),
    ) +
    `<div class="grid">${card("OBS connection", `<form id="obsForm">${input("url", "Local WebSocket URL", snap.state.settings.obsUrl)}${input("password", "OBS WebSocket password (kept in memory only)", "", "password")}<p class="tiny">In OBS: Tools → WebSocket Server Settings → enable the server. Copy its port and password.</p><button class="primary">Connect to OBS</button></form>${snap.obs.connected ? `<p style="margin-top:15px">Connected · ${esc(snap.obs.scene)}</p>${btn("Refresh scenes & inputs", "obsRefresh")}` : ""}`)}${card("Keyboard & foot pedal test", `<p>Test configured global shortcuts for 60 seconds. Keyboard-emulating pedals use the same shortcuts. During the test, shortcuts are reported without running their actions; Privacy pause remains active.</p>${btn(snap.hotkeyTest ? "Stop shortcut test" : "Test hotkeys / pedal", "hotkeyTest")}<p>${esc(snap.hotkeyTest?.last || "Test inactive")}</p>`)}${card("Privacy & scene mappings", `<p>Configure the scene and microphones used by Privacy pause. Resume leaves microphones muted until you deliberately restore them.</p>${btn("Configure OBS mappings", "obsMappings")}`)}${card("Local data & recovery", `<p>Every action is saved atomically. Up to 30 automatic snapshots are retained. Campaign exports include managed media.</p><p>Importing an export creates a separate campaign and starts it in rehearsal.</p>${btn("Export campaign with media", "exportFile")}${btn("Import backup / campaign", "importFile")}`)}${card("Display & accessibility", `${btn(snap.state.settings.reduceMotion ? "Enable animations" : "Reduce motion", "reduceMotion")}${btn(c.performance ? "Disable performance mode" : "Enable performance mode", "performance")}<p class="tiny" style="margin-top:12px">Use Ctrl + / Ctrl − to scale the interface. Status labels accompany colour indicators.</p>`)}${card("Phone / producer controls", `<p>Optional control panel for devices on your trusted local network. Anyone with its temporary link can advance turns, trigger breaks, add markers, resume, or activate privacy pause.</p><p class="tiny">Uses local HTTP. Keep it on your trusted network; do not forward its port. Tokens rotate when enabled and are not saved.</p>${btn(snap.lan ? "Disable remote controls" : "Enable remote controls", "lan")}${lanUrls.map((x) => `<pre>${esc(x)}</pre>`).join("")}`)}${card("Audio outputs", `<p>Assign separate output devices for DM monitoring, audience audio, and players. Physical or virtual audio devices determine where sound actually goes.</p>${btn("Configure routing", "audioRouting")}<p class="tiny" style="margin-top:12px">Rehearsal routes cues to your DM output. Verify actual capture and monitoring in OBS before streaming.</p>`)}</div>`
  );
}
function entityEditor(collection, entity) {
  const c = current(),
    x = entity ? structuredClone(entity) : {};
  const images = c.media.filter((m) => m.kind === "image");
  let html = "";
  if (["characters", "combat"].includes(collection)) {
    Object.assign(x, {
      maxHp: x.maxHp ?? 20,
      hp: x.hp ?? 20,
      tempHp: x.tempHp ?? 0,
      initiative: x.initiative ?? 10,
      visible: x.visible ?? false,
      health: x.health || "hidden",
    });
    html = `<div class="formgrid"><div>${input("name", "Private name", x.name, "text", 'required maxlength="120"')}</div><div>${input("publicName", "Public name", x.publicName)}</div><div>${input("hp", "Current HP", x.hp, "number", 'min="0" required')}</div><div>${input("maxHp", "Maximum HP", x.maxHp, "number", 'min="1" required')}</div><div>${input("tempHp", "Temporary HP", x.tempHp, "number", 'min="0"')}</div><div>${input("initiative", "Initiative", x.initiative, "number")}</div><div>${input("conditions", "Conditions (custom text)", x.conditions)}</div><div>${select("health", "Audience health", ["hidden", "status", "exact"], x.health)}</div><div>${input("player", "Player", x.player)}</div><div>${input("classLevel", "Class / level / rules notes", x.classLevel)}</div><div class="full">${select("portrait", "Portrait", images, x.portrait)}${check("visible", "Enable audience card / initiative entry", x.visible)}${check("publicConditions", "Publish conditions", x.publicConditions)}${check("concentration", "Concentrating", x.concentration)}${check("absent", "Player absent (hides party card)", x.absent)}${area("privateNotes", "Private notes", x.privateNotes)}</div></div>`;
  } else if (collection === "notes")
    html =
      input("title", "Private title", x.title, "text", "required") +
      input("publicName", "Public title for reveals", x.publicName) +
      select(
        "kind",
        "Type",
        ["Note", "NPC", "Location", "Quest", "Session", "Handout"],
        x.kind || "Note",
      ) +
      input("tags", "Tags", x.tags) +
      input("pronunciation", "Pronunciation", x.pronunciation) +
      input("voice", "Voice reminders", x.voice) +
      input("relationships", "Relationships", x.relationships) +
      select("portrait", "Public image", images, x.portrait) +
      area("body", "Private content / secrets", x.body);
  else if (collection === "cues")
    html =
      input("name", "Cue name", x.name, "text", "required") +
      input("description", "Description", x.description) +
      cueBuilderHTML(x.steps);
  else if (collection === "media")
    html =
      input("title", "Public display title", x.title, "text", "required") +
      input("source", "Source / creator URL", x.source) +
      input("terms", "Usage terms / licence", x.terms) +
      area("credit", "Required credit text", x.credit);
  else if (collection === "maps")
    html =
      input("name", "Map name", x.name, "text", "required") +
      select("media", "Map image", images, x.media) +
      input(
        "cols",
        "Columns",
        x.cols || 16,
        "number",
        'min="1" max="50" required',
      ) +
      input(
        "rows",
        "Rows",
        x.rows || 10,
        "number",
        'min="1" max="50" required',
      ) +
      '<p class="tiny">Changing grid size clears the fog reveals. Publishing is a separate action.</p>';
  else if (collection === "rundown")
    html =
      input("title", "Segment title", x.title, "text", "required") +
      input(
        "minutes",
        "Planned minutes",
        x.minutes || 10,
        "number",
        'min="0"',
      ) +
      area("notes", "DM / producer notes", x.notes) +
      select("cueId", "Attached cue", c.cues, x.cueId) +
      check("done", "Completed", x.done);
  modal(
    (entity ? "Edit " : "Add ") +
      {
        characters: "character",
        combat: "combatant",
        notes: "note / NPC",
        cues: "cue",
        media: "media details",
        maps: "map",
        rundown: "running-order item",
      }[collection],
    html +
      (entity && collection !== "media"
        ? `<div style="margin-top:20px">${btn("Delete item", "deleteEntity", `data-collection="${collection}" data-id="${x.id}"`, "danger small")}</div>`
        : ""),
    async (d) => {
      const item = { ...x, ...d };
      if (["characters", "combat"].includes(collection)) {
        for (const k of ["hp", "maxHp", "tempHp", "initiative"])
          item[k] = Number(d[k]);
        if (item.hp > item.maxHp)
          throw Error("Current HP cannot exceed maximum HP.");
      }
      if (collection === "cues") {
        item.steps = collectCueSteps();
        if (!Array.isArray(item.steps) || item.steps.length > 50)
          throw Error("Enter an array of up to 50 steps.");
      }
      if (collection === "maps") {
        item.cols = Math.max(1, Math.min(50, Number(d.cols)));
        item.rows = Math.max(1, Math.min(50, Number(d.rows)));
        if (!d.media) throw Error("Choose a map image.");
        item.tokens = x.tokens || [];
        item.revealed =
          x.cols === item.cols && x.rows === item.rows ? x.revealed || [] : [];
        item.published = x.published || false;
      }
      if (collection === "rundown") item.minutes = Number(d.minutes);
      await call("saveEntity", { collection, entity: item });
    },
  );
  if (collection === "cues") mountCueBuilder();
}
function revealDialog(p = {}) {
  const c = current(),
    images = c.media.filter((m) => m.kind === "image");
  modal(
    "Preview & reveal",
    `<div class="banner">${c.rehearsal ? "OBS output is held. Publishing this reveal will enable it." : "LIVE: publishing makes this visible to your audience."}</div>${input("title", "Public title", p.title ?? c.public.title)}${input("subtitle", "Public subtitle", p.subtitle ?? c.public.subtitle)}${select("portrait", "Public image", images, p.portrait ?? c.public.portrait)}<div id="revealPreview" style="margin-top:15px"></div>${check("confirmed", "I have checked this audience reveal", false)}`,
    async (d) => {
      if (!d.confirmed)
        throw Error("Check the reveal preview before publishing.");
      if (c.rehearsal) await call("mode", {rehearsal:false});
      await call("public", {
        title: d.title,
        subtitle: d.subtitle,
        portrait: d.portrait || null,
        paused: false,
      });
    },
  );
  const update = () => {
    $("#revealPreview").innerHTML = preview(form());
  };
  $("#editorForm").oninput = update;
  update();
}
let ducked = false;
document.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-page]");
  if (nav) {
    page = nav.dataset.page;
    render();
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action,
    c = current(),
    x = b.dataset.id;
  try {
    if (a === "newCampaign")
      modal(
        "Create campaign",
        input("name", "Campaign name", "", "text", 'required maxlength="100"'),
        async (d) => {
          await call("createCampaign", d);
          page = "session";
          render();
        },
      );
    else if (a === "hotkeyTest") await call("hotkeyTest",{enabled:!snap.hotkeyTest});
    else if (a === "overlayLayout") {
      const layout=DirectorLayout.normalize(c.public.layout);
      modal("Arrange overlay", `<p>Drag a layer to move it. Set its size below. Values are percentages of the OBS canvas. Output follows rehearsal/live mode.</p><div class="layout-stage">${Object.entries(layout).map(([key,v])=>`<div data-layer="${key}" style="left:${v.x}%;top:${v.y}%;width:${v.w}%;height:${v.h}%">${key}</div>`).join('')}</div>`+
        Object.entries(layout).map(([key,v])=>`<fieldset><legend>${key}</legend><div class="layout-fields">${['x','y','w','h'].map(n=>input(key+'_'+n,n.toUpperCase(),v[n],'number','min="0" max="100" step="0.5"')).join('')}${check(key+'_hidden','Hide layer',v.hidden)}</div></fieldset>`).join(''), async d=>{
          const boxes={};for(const key of Object.keys(layout)){boxes[key]={};for(const n of ['x','y','w','h'])boxes[key][n]=Number(d[key+'_'+n]);boxes[key].hidden=!!d[key+'_hidden'];}
          await call('public',{layout:DirectorLayout.normalize(boxes)});
        });
      const stage=$('.layout-stage');
      stage.onpointerdown=e=>{
        const box=e.target.closest('[data-layer]');if(!box)return;e.preventDefault();
        const rect=stage.getBoundingClientRect(),key=box.dataset.layer;
        const start={x:e.clientX,y:e.clientY,left:parseFloat(box.style.left),top:parseFloat(box.style.top)};
        box.setPointerCapture(e.pointerId);
        box.onpointermove=move=>{
          const x=Math.max(0,Math.min(100-parseFloat(box.style.width),start.left+(move.clientX-start.x)/rect.width*100));
          const y=Math.max(0,Math.min(100-parseFloat(box.style.height),start.top+(move.clientY-start.y)/rect.height*100));
          box.style.left=x+'%';box.style.top=y+'%';$('#f-'+key+'_x').value=x.toFixed(1);$('#f-'+key+'_y').value=y.toFixed(1);
        };
        box.onpointerup=()=>{box.onpointermove=null;};
      };
      $('#editorForm').oninput=()=>{const d=form();for(const [key,v] of Object.entries(layout)){for(const n of ['x','y','w','h'])v[n]=Number(d[key+'_'+n]);v.hidden=!!d[key+'_hidden'];}for(const [key,v] of Object.entries(DirectorLayout.normalize(layout))){const box=stage.querySelector('[data-layer="'+key+'"]');Object.assign(box.style,{left:v.x+'%',top:v.y+'%',width:v.w+'%',height:v.h+'%',opacity:v.hidden?'.2':'1'});}};
    }
    else if (a === "setupOverlay") {
      if (!snap.obs.connected) throw Error("Connect OBS in Settings & checks first.");
      modal("Add OBS browser source", select("scene", "Scene", snap.obs.scenes, snap.obs.scene) + check("confirmed", "Add the live overlay source to this OBS scene", false), async d=>{
        const result=await call("setupOverlay",{scene:d.scene,confirmed:!!d.confirmed});
        toast(result.existing ? "Overlay source already configured. Check its visibility in OBS." : "Overlay source added to OBS.");
      });
    }
    else if (a === "stockAdd" || a === "stockToken") {
      const added = await call("stockAdd", {id:x, mapId:a === "stockToken" ? c.selectedMap : undefined});
      if (b.dataset.kind === "map") selectedMap = added.id;
      if (b.dataset.kind === "map" || a === "stockToken") {page="maps";render();}
      toast(a === "stockToken" ? "Token placed hidden. Edit it on the map to reveal it." : "Added to this campaign.");
    }
    else if (a === "mapFog") await call("mapFog", {id:x,reveal:b.dataset.reveal === "true"});
    else if (a === "addEntity") entityEditor(b.dataset.collection);
    else if (a === "editEntity")
      entityEditor(
        b.dataset.collection,
        c[b.dataset.collection].find((v) => v.id === x),
      );
    else if (a === "deleteEntity") {
      if (confirm("Delete this item?")) {
        await call("deleteEntity", { collection: b.dataset.collection, id: x });
        $("#editor").close();
      }
    } else if (a === "toggleMode") {
      if (
        c.rehearsal &&
        !confirm(
          "Arm LIVE controls? Future cues, reveals, audio, and OBS actions will affect your broadcast.",
        )
      )
        return;
      await call("mode", { rehearsal: !c.rehearsal });
    } else if (a === "undo") {
      await call("undo");
      toast("Restored previous state in rehearsal. Audience output held.");
    } else if (a === "damage" || a === "heal") {
      modal(
        a === "damage" ? "Apply damage" : "Restore HP",
        input("amount", "Amount", 1, "number", 'min="1" required'),
        async (d) =>
          call("hp", {
            id: x,
            collection: b.dataset.collection,
            delta: Number(d.amount) * (a === "damage" ? -1 : 1),
          }),
      );
    } else if (a === "spotlight") await call(a, { id: x });
    else if (a === "marker")
      modal(
        "Add session marker",
        input("text", "Highlight / editing note", "Highlight marker"),
        async (d) => call("marker", d),
      );
    else if (a === "runCue") {
      const cue = c.cues.find((q) => q.id === x);
      modal(
        c.rehearsal ? "Rehearse cue" : "Run live cue",
        `<h3>${esc(cue.name)}</h3><pre>${esc(JSON.stringify(cue.steps, null, 2))}</pre>${check("confirmed", "I have checked these steps and audience content", false)}`,
        async (d) => {
          if (!d.confirmed) throw Error("Review the steps first.");
          await call("cue", { id: x });
        },
      );
    } else if (a === "reveal") revealDialog();
    else if (a === "revealMedia") {
      const m = c.media.find((m) => m.id === x);
      revealDialog({ title: m.title, portrait: m.id, subtitle: "" });
    } else if (a === "revealNote") {
      const n = c.notes.find((n) => n.id === x);
      revealDialog({
        title: n.publicName || "Unknown figure",
        portrait: n.portrait,
        subtitle: "",
      });
    } else if (a === "toggleParty")
      await call("public", { showParty: !c.public.showParty });
    else if (a === "clearDice") await call("public", { dice: null });
    else if (a === "initiative")
      await call("public", { showInitiative: !c.public.showInitiative });
    else if (a === "savedRoll") {
      const r = await call("roll", {
        expression: b.dataset.expression,
        mode: "normal",
        publish: false,
      });
      toast(`${r.expression}: ${r.values.join(", ")} → ${r.total}`);
    } else if (a === "scene")
      await call("obsAction", {
        request: "SetCurrentProgramScene",
        data: { sceneName: b.dataset.name },
      });
    else if (a === "record") {
      if (snap.obs.recording && !confirm("Stop the OBS recording?")) return;
      await call("obsAction", {
        request: snap.obs.recording ? "StopRecord" : "StartRecord",
      });
    } else if (a === "saveEncounter")
      modal(
        "Save encounter preset",
        input("name", "Encounter name", "", "text", "required"),
        async (d) => call(a, d),
      );
    else if (a === "loadEncounter") {
      if (
        c.combat.length &&
        !confirm("Replace the current encounter with this preset?")
      )
        return;
      await call(a, { id: x });
    } else if (a === "hotkeys") editHotkeys();
    else if (a === "starterCues") {
      for (const q of [
        {
          name: "Opening titles",
          description: "Show the episode title",
          steps: [{ type: "title", title: c.name, subtitle: c.sessionTitle }],
        },
        {
          name: "Start encounter",
          description: "Publish initiative",
          steps: [
            { type: "initiative", show: true },
            { type: "marker", text: "Encounter started" },
          ],
        },
        {
          name: "Short rest",
          description: "Ten-minute break",
          steps: [
            { type: "stopAudio", fade: 1200 },
            { type: "break", minutes: 10 },
          ],
        },
      ])
        await call("saveEntity", { collection: "cues", entity: q });
    } else if (a === "sessionZero")
      modal(
        "Private session zero & house rules",
        input("system", "Rules system", c.system) +
          area("houseRules", "House rules / homebrew", c.houseRules) +
          area("boundaries", "Agreed boundaries", c.boundaries) +
          area("consent", "Recording consent notes", c.consent) +
          area("avoid", "Topics to avoid", c.avoid),
        async (d) => call("patchCampaign", d),
      );
    else if (a === "overlayTheme") {
      const theme = c.public.theme || {};
      modal(
        "Audience overlay appearance",
        input("accent", "Accent colour", theme.accent || "#e9bd73", "color") +
          input("panel", "Panel colour", theme.panel || "#101b2e", "color") +
          input(
            "fontSize",
            "Base font size (16–36)",
            theme.fontSize || 22,
            "number",
            'min="16" max="36"',
          ) +
          select(
            "position",
            "Initiative position",
            ["right", "left"],
            theme.position || "right",
          ),
        async (d) =>
          call("public", { theme: { ...d, fontSize: Number(d.fontSize) } }),
      );
    } else if (a === "episode")
      modal(
        "Episode settings",
        input("sessionTitle", "Episode / session title", c.sessionTitle) +
          input("name", "Campaign name", c.name) +
          area(
            "savedRolls",
            "Saved rolls (one per line)",
            c.savedRolls.join("\n"),
          ),
        async (d) =>
          call("patchCampaign", {
            ...d,
            savedRolls: d.savedRolls
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
          }),
      );
    else if (a === "obsMappings")
      modal(
        "OBS scene and privacy mappings",
        select("scene", "Gameplay scene", snap.obs.scenes, c.obs.scene) +
          select(
            "breakScene",
            "Break scene",
            snap.obs.scenes,
            c.obs.breakScene,
          ) +
          select(
            "safeScene",
            "Emergency privacy scene",
            snap.obs.scenes,
            c.obs.safeScene,
          ) +
          area(
            "muteInputs",
            "Inputs to mute (one exact OBS input name per line)",
            c.obs.muteInputs.join("\n"),
          ) +
          `<p>Available inputs: ${esc(snap.obs.inputs.join(", "))}</p>`,
        async (d) =>
          call("patchCampaign", {
            obs: {
              scene: d.scene,
              breakScene: d.breakScene,
              safeScene: d.safeScene,
              muteInputs: d.muteInputs
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
            },
          }),
      );
    else if (a === "checks") {
      const checks = await api.invoke("preflight");
      modal(
        "Pre-stream checks",
        checks
          .map(
            (ch) =>
              `<div class="checkitem ${ch.ok ? "ok" : ""}"><b>${ch.ok ? "PASS" : "CHECK"} · ${esc(ch.label)}</b><div class="muted">${esc(ch.detail)}</div></div>`,
          )
          .join(""),
        async () => {},
      );
    } else if (a === "reduceMotion")
      await call("settings", {
        reduceMotion: !snap.state.settings.reduceMotion,
      });
    else if (a === "performance")
      await call("patchCampaign", { performance: !c.performance });
    else if (a === "lan") {
      const r = await call("lan", { enabled: !snap.lan });
      lanUrls = r.urls || [];
      render();
    } else if (a === "audioRouting") {
      try {
        await navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => stream.getTracks().forEach((t) => t.stop()));
      } catch {}
      devices = await navigator.mediaDevices.enumerateDevices();
      const outs = devices
        .filter((x) => x.kind === "audiooutput")
        .map((x) => ({ id: x.deviceId, name: x.label || x.deviceId }));
      modal(
        "Audio routing & master volume",
        select(
          "dmDevice",
          "DM monitor output",
          outs,
          c.audio.dmDevice,
          "System default",
        ) +
          select(
            "audienceDevice",
            "Audience output (capture this in OBS)",
            outs,
            c.audio.audienceDevice,
            "System default",
          ) +
          select(
            "playersDevice",
            "Players output",
            outs,
            c.audio.playersDevice,
            "System default",
          ) +
          input(
            "master",
            "Master volume (0–1)",
            c.audio.master,
            "number",
            'min="0" max="1" step="0.05"',
          ) +
          '<p class="tiny">Destinations need separate physical or virtual devices to stay separate. The app does not install virtual audio drivers.</p>',
        async (d) => {
          await call("patchCampaign", {
            audio: { ...d, master: Number(d.master) },
          });
          await api.invoke("audio", {
            action: "volume",
            volume: Number(d.master),
          });
        },
      );
    } else if (a === "playlists") editPlaylists();
    else if (a === "playMedia")
      modal(
        "Play / layer audio",
        select(
          "destination",
          "Destination",
          ["dm", "audience", "players"],
          "audience",
        ) +
          input(
            "volume",
            "Volume",
            0.7,
            "number",
            'min="0" max="1" step="0.05"',
          ) +
          input(
            "fade",
            "Fade in (milliseconds)",
            800,
            "number",
            'min="0" max="30000"',
          ) +
          check("loop", "Loop ambience", false),
        async (d) =>
          call("audio", {
            action: "play",
            id: x,
            ...d,
            volume: Number(d.volume),
            fade: Number(d.fade),
          }),
      );
    else if (a === "stopAudio")
      await call("audio", { action: "stopAll", fade: 500 });
    else if (a === "duck") {
      ducked = !ducked;
      await call("audio", { action: "duck", enabled: ducked });
    } else if (a === "cropMedia") await cropDialog(x);
    else if (a === "trimMedia") await trimDialog(x);
    else if (a === "mapPublish") {
      const m = c.maps.find((m) => m.id === x);
      if (
        !m.published &&
        !confirm(
          "Publish the revealed cells and public tokens to the audience?",
        )
      )
        return;
      if (!m.published && c.rehearsal) {
        if (!confirm("Enable OBS output and publish this map now? Future live cues will also affect OBS.")) return;
        await call("mode", {rehearsal:false});
      }
      await call(a, { id: x, published: !m.published });
    } else if (a === "mapCell") {
      const m = c.maps.find((m) => m.id === x);
      await call(a, {
        id: x,
        cell: Number(b.dataset.cell),
        reveal: !m.revealed.includes(Number(b.dataset.cell)),
      });
    } else if (a === "addToken" || a === "editToken") {
      const m = c.maps.find((m) => m.id === x),
        index = a === "editToken" ? Number(b.dataset.index) : -1,
        t = index >= 0 ? m.tokens[index] : {};
      modal(
        "Map token",
        input("name", "Private label", t.name) +
          input("publicName", "Public label", t.publicName) +
          input(
            "x",
            "Horizontal position (%)",
            t.x ?? 50,
            "number",
            'min="0" max="100"',
          ) +
          input(
            "y",
            "Vertical position (%)",
            t.y ?? 50,
            "number",
            'min="0" max="100"',
          ) +
          input("color", "Colour", t.color || "#657ea3", "color") +
          check("visible", "Visible to audience", t.visible),
        async (d) => {
          const tokens = structuredClone(m.tokens || []),
            token = { ...t, ...d, x: Number(d.x), y: Number(d.y) };
          if (index < 0) tokens.push(token);
          else tokens[index] = token;
          await call("saveEntity", {
            collection: "maps",
            entity: { ...m, tokens },
          });
        },
      );
    } else if (a === "rundownDone") {
      const r = c.rundown.find((r) => r.id === x);
      await call("saveEntity", {
        collection: "rundown",
        entity: { ...r, done: !r.done },
      });
    } else if (a === "rundownUp") {
      const idx = c.rundown.findIndex((r) => r.id === x);
      if (idx > 0) {
        const ordered = structuredClone(c.rundown);
        [ordered[idx - 1], ordered[idx]] = [ordered[idx], ordered[idx - 1]];
        await call("reorderRundown", { items: ordered });
      }
    } else if (a === "exportTimeline") {
      const text = c.timeline
        .slice()
        .reverse()
        .map((t) => `${t.at}\t${t.type}\t${t.text}`)
        .join("\n");
      download("session-timeline.txt", text);
    } else if (
      [
        "importMedia",
        "importFile",
        "exportFile",
        "saveCredits",
        "audienceWindow",
      ].includes(a)
    ) {
      if (!window.director || !api.invoke)
        throw Error("Use the desktop application for file access.");
      await call(a);
      toast(a === "exportFile" ? "Campaign export completed." : "Done.");
    } else if (
      [
        "nextTurn",
        "sortCombat",
        "startSession",
        "break",
        "resume",
        "panic",
        "obsRefresh",
      ].includes(a)
    )
      await call(a);
  } catch (e) {
    toast(e.message, true);
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "campaignSwitch" && e.target.value)
      await call("switchCampaign", { id: e.target.value });
    if (e.target.id === "mapSwitch") {
      selectedMap = e.target.value;
      if (selectedMap) await call("mapSelect", {id:selectedMap});
      else render();
    }
  } catch (e) {
    toast(e.message, true);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "searchNotes") {
    const pos = e.target.selectionStart;
    search = e.target.value;
    render();
    $("#searchNotes").focus();
    $("#searchNotes").setSelectionRange(pos, pos);
  }
});
document.addEventListener("submit", async (e) => {
  if (!["diceForm", "obsForm"].includes(e.target.id)) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  try {
    if (e.target.id === "diceForm") {
      if (d.publish === "on" && current().rehearsal) {
        if (!confirm("Enable OBS output and show this dice roll to viewers now?")) return;
        await call("mode", {rehearsal:false});
      }
      const r = await call("roll", {
        expression: d.expression,
        mode: d.mode,
        publish: d.publish === "on",
        label: d.label,
      });
      toast(`${r.expression}: ${r.values.join(", ")} → ${r.total}`);
    } else {
      await call("settings", { obsUrl: d.url });
      await call("obsConnect", { password: d.password });
      toast("Connected to OBS.");
    }
  } catch (e) {
    toast(e.message, true);
  }
});
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function cropDialog(id) {
  const m = current().media.find((m) => m.id === id),
    image = new Image();
  image.src = "/media/" + id;
  await image.decode();
  modal(
    "Crop image (creates a new asset)",
    `<img class="media-thumb" src="/media/${id}" alt="Crop source">` +
      input("title", "New display title", m.title + " crop") +
      input("x", "Left (pixels)", 0, "number", 'min="0"') +
      input("y", "Top (pixels)", 0, "number", 'min="0"') +
      input("width", "Width", image.naturalWidth, "number", 'min="1"') +
      input("height", "Height", image.naturalHeight, "number", 'min="1"') +
      `<p>Original: ${image.naturalWidth} × ${image.naturalHeight}</p>`,
    async (d) => {
      const w = Number(d.width),
        h = Number(d.height),
        x = Number(d.x),
        y = Number(d.y);
      if (
        w < 1 ||
        h < 1 ||
        x < 0 ||
        y < 0 ||
        x + w > image.naturalWidth ||
        y + h > image.naturalHeight
      )
        throw Error("Crop must fit within the original image.");
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(image, x, y, w, h, 0, 0, w, h);
      await call("saveDerived", {
        title: d.title,
        ext: "png",
        base64: canvas.toDataURL("image/png").split(",")[1],
      });
    },
  );
}
async function trimDialog(id) {
  const m = current().media.find((m) => m.id === id),
    ctx = new AudioContext(),
    data = await ctx.decodeAudioData(
      await (await fetch("/media/" + id)).arrayBuffer(),
    );
  await ctx.close();
  modal(
    "Trim and balance audio (creates WAV asset)",
    input("title", "New display title", m.title + " trimmed") +
      input("start", "Start (seconds)", 0, "number", 'min="0" step="0.01"') +
      input(
        "end",
        "End (seconds)",
        data.duration.toFixed(2),
        "number",
        'min="0.01" step="0.01"',
      ) +
      input(
        "gain",
        "Gain multiplier",
        1,
        "number",
        'min="0" max="4" step="0.05"',
      ),
    async (d) => {
      const start = Number(d.start),
        end = Number(d.end),
        gain = Number(d.gain);
      if (start < 0 || end <= start || end > data.duration + 0.01)
        throw Error("Choose a valid range within the audio file.");
      const first = Math.floor(start * data.sampleRate),
        length = Math.min(
          data.length - first,
          Math.floor((end - start) * data.sampleRate),
        ),
        channels = data.numberOfChannels,
        bytes = length * channels * 2;
      if (bytes > 100 * 1024 * 1024) throw Error("Trimmed WAV exceeds 100 MB.");
      const buffer = new ArrayBuffer(44 + bytes),
        view = new DataView(buffer);
      const write = (offset, text) =>
        [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      write(0, "RIFF");
      view.setUint32(4, 36 + bytes, true);
      write(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, data.sampleRate, true);
      view.setUint32(28, data.sampleRate * channels * 2, true);
      view.setUint16(32, channels * 2, true);
      view.setUint16(34, 16, true);
      write(36, "data");
      view.setUint32(40, bytes, true);
      const channelData = Array.from({ length: channels }, (_, i) =>
        data.getChannelData(i),
      );
      for (let i = 0; i < length; i++)
        for (let ch = 0; ch < channels; ch++) {
          const value = Math.max(
            -1,
            Math.min(1, channelData[ch][first + i] * gain),
          );
          view.setInt16(
            44 + (i * channels + ch) * 2,
            value * (value < 0 ? 32768 : 32767),
            true,
          );
        }
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(new Blob([buffer]));
      });
      await call("saveDerived", { title: d.title, ext: "wav", base64 });
    },
  );
}
api.on("change", (data) => {
  snap = data;
  if (!$("#editor").open) render();
});
api.on("audio", (p) =>
  audio
    .handle(p)
    .catch((e) => toast("Audio output failed: " + e.message, true)),
);
api.on("error", (message) => toast(message, true));
api
  .invoke("snapshot")
  .then((data) => {
    snap = data;
    render();
  })
  .catch((e) => toast(e.message, true));
// Visual cue editor. Existing advanced steps remain editable without exposing IDs.
const STEP_LABELS = {
  title: "Show title",
  portrait: "Show image",
  initiative: "Show / hide initiative",
  nextTurn: "Advance turn",
  scene: "Switch OBS scene",
  mute: "Mute / unmute input",
  source: "Show / hide OBS source",
  audio: "Play audio",
  stopAudio: "Stop all audio",
  wait: "Wait",
  break: "Start break countdown",
  marker: "Add timeline marker",
};
let builderSteps = [];
function cueBuilderHTML(steps) {
  builderSteps = structuredClone(
    steps || [{ type: "title", title: "A new adventure", subtitle: "" }],
  );
  return '<label>Action sequence</label><p class="tiny">Steps run from top to bottom. A failure stops later steps. Rehearse before using a live hotkey.</p><div id="cueSteps"></div><button type="button" id="addCueStep" style="margin-top:12px">+ Add action</button>';
}
function collectCueSteps() {
  return [...document.querySelectorAll("#cueSteps .step-editor")].map((row) => {
    const step = { type: row.dataset.type };
    for (const field of row.querySelectorAll("[data-field]"))
      step[field.dataset.field] =
        field.type === "checkbox"
          ? field.checked
          : field.type === "number"
            ? Number(field.value)
            : field.value;
    return step;
  });
}
function drawCueSteps() {
  const c = current();
  const f = (key, label, value, type = "text") =>
      `<label>${label}</label><input data-field="${key}" type="${type}" value="${esc(value ?? "")}">`,
    s = (key, label, items, value) =>
      `<label>${label}</label><select data-field="${key}">${options(items, value, "Choose…")}</select>`,
    b = (key, label, value) =>
      `<label class="check"><input type="checkbox" data-field="${key}" ${value ? "checked" : ""}>${label}</label>`;
  $("#cueSteps").innerHTML = builderSteps
    .map((step, i) => {
      let fields = "";
      switch (step.type) {
        case "title":
          fields =
            f("title", "Public title", step.title) +
            f("subtitle", "Public subtitle", step.subtitle);
          break;
        case "portrait":
          fields = s(
            "id",
            "Public image",
            c.media.filter((m) => m.kind === "image"),
            step.id,
          );
          break;
        case "initiative":
          fields = b("show", "Show initiative", step.show !== false);
          break;
        case "scene":
          fields = s("name", "OBS scene", snap.obs.scenes, step.name);
          break;
        case "mute":
          fields =
            s("name", "OBS input", snap.obs.inputs, step.name) +
            b("muted", "Mute input", step.muted !== false);
          break;
        case "source":
          fields =
            s("scene", "OBS scene", snap.obs.scenes, step.scene) +
            f("itemId", "OBS scene item number", step.itemId || 1, "number") +
            b("show", "Show source", step.show !== false);
          break;
        case "audio":
          fields =
            s(
              "id",
              "Audio asset",
              c.media.filter((m) => m.kind === "audio"),
              step.id,
            ) +
            s(
              "destination",
              "Output",
              ["dm", "audience", "players"],
              step.destination || "audience",
            ) +
            f("volume", "Volume (0–1)", step.volume ?? 0.7, "number") +
            f("fade", "Fade in (ms)", step.fade || 0, "number") +
            b("loop", "Loop", step.loop);
          break;
        case "stopAudio":
          fields = f("fade", "Fade out (ms)", step.fade || 0, "number");
          break;
        case "wait":
          fields = f(
            "ms",
            "Wait duration (0–10,000 ms)",
            step.ms || 500,
            "number",
          );
          break;
        case "break":
          fields = f(
            "minutes",
            "Break duration (minutes)",
            step.minutes || 10,
            "number",
          );
          break;
        case "marker":
          fields = f("text", "Marker text", step.text);
          break;
      }
      return `<section class="card step-editor" data-type="${step.type}" style="margin-top:10px;padding:14px"><div class="actions"><strong>${i + 1}.</strong><select class="stepType" data-index="${i}" style="width:auto;flex:1">${Object.entries(
        STEP_LABELS,
      )
        .map(
          ([k, v]) =>
            `<option value="${k}" ${step.type === k ? "selected" : ""}>${v}</option>`,
        )
        .join(
          "",
        )}</select><button type="button" class="small stepUp" data-index="${i}" aria-label="Move step up">↑</button><button type="button" class="small stepRemove" data-index="${i}">Remove</button></div><div class="formgrid"><div class="full">${fields}</div></div></section>`;
    })
    .join("");
}
function mountCueBuilder() {
  drawCueSteps();
  $("#addCueStep").onclick = () => {
    builderSteps = collectCueSteps();
    if (builderSteps.length >= 50)
      return toast("A cue supports up to 50 steps.", true);
    builderSteps.push({ type: "title", title: "", subtitle: "" });
    drawCueSteps();
  };
  $("#cueSteps").onchange = (e) => {
    if (e.target.classList.contains("stepType")) {
      builderSteps = collectCueSteps();
      builderSteps[Number(e.target.dataset.index)] = { type: e.target.value };
      drawCueSteps();
    }
  };
  $("#cueSteps").onclick = (e) => {
    const index = Number(e.target.dataset.index);
    if (e.target.classList.contains("stepRemove")) {
      builderSteps = collectCueSteps();
      builderSteps.splice(index, 1);
      drawCueSteps();
    }
    if (e.target.classList.contains("stepUp") && index > 0) {
      builderSteps = collectCueSteps();
      [builderSteps[index - 1], builderSteps[index]] = [
        builderSteps[index],
        builderSteps[index - 1],
      ];
      drawCueSteps();
    }
  };
}
function editHotkeys() {
  const c = current();
  modal(
    "Global hotkeys",
    '<p>Shortcuts work while another app has focus. A cue hotkey executes immediately; rehearse and review its content before going live.</p><div id="hotkeyRows"></div><button type="button" id="addHotkey">+ Add shortcut</button>',
    async () => {
      const hotkeys = [...document.querySelectorAll(".hotkey-edit")].map(
        (row) => ({
          key: row.querySelector("[data-key]").value,
          action: row.querySelector("[data-hotaction]").value,
          cueId: row.querySelector("[data-cue]").value,
        }),
      );
      if (new Set(hotkeys.map((h) => h.key)).size !== hotkeys.length)
        throw Error("Each shortcut must be unique.");
      await call("patchCampaign", { hotkeys });
    },
  );
  const add = (h) => {
    const row = document.createElement("div");
    row.className = "card hotkey-edit";
    row.style.marginBottom = "10px";
    row.innerHTML = `<label>Shortcut (example: CommandOrControl+Alt+N)</label><input data-key value="${esc(h.key || "")}"><label>Action</label><select data-hotaction>${["nextTurn", "break", "panic", "marker", "resume", "cue"].map((k) => `<option ${h.action === k ? "selected" : ""}>${k}</option>`).join("")}</select><label>Cue (for cue action)</label><select data-cue>${options(c.cues, h.cueId)}</select><button type="button" class="small" style="margin-top:8px">Remove</button>`;
    row.querySelector("button").onclick = () => row.remove();
    $("#hotkeyRows").append(row);
  };
  c.hotkeys.forEach(add);
  $("#addHotkey").onclick = () => add({ action: "marker" });
}
function editPlaylists() {
  const c = current(),
    playlists = structuredClone(c.playlists || []);
  modal(
    "Local audio playlists",
    '<div id="playlistList"></div><h3 style="margin-top:20px">Create playlist</h3>' +
      input("playlistName", "Playlist name") +
      '<label>Tracks (select in playback order)</label><div id="playlistTracks"></div>' +
      check("playlistLoop", "Loop playlist", true) +
      select(
        "playlistDestination",
        "Destination",
        ["audience", "players", "dm"],
        "audience",
      ) +
      '<button type="button" id="addPlaylist" style="margin-top:12px">Save playlist</button>',
    async () => {},
  );
  const renderList = () => {
    $("#playlistList").innerHTML =
      playlists
        .map(
          (p, i) =>
            `<div class="row"><div class="grow"><strong>${esc(p.name)}</strong><span class="tiny muted">${p.tracks.length} tracks · ${esc(p.destination)}${p.loop ? " · Loop" : ""}</span></div><button type="button" class="small" data-playlist-play="${i}">Play</button><button type="button" class="small" data-playlist-delete="${i}">Delete</button></div>`,
        )
        .join("") || "<p>No playlists saved yet.</p>";
  };
  renderList();
  $("#playlistTracks").innerHTML =
    c.media
      .filter((m) => m.kind === "audio")
      .map(
        (m) =>
          `<label class="check"><input type="checkbox" data-track="${m.id}">${esc(m.title)}</label>`,
      )
      .join("") || "<p>Import local audio first.</p>";
  $("#playlistList").onclick = async (e) => {
    try {
      if (e.target.dataset.playlistPlay !== undefined) {
        const p = playlists[Number(e.target.dataset.playlistPlay)];
        await call("audio", {
          action: "playlist",
          tracks: p.tracks,
          loop: p.loop,
          destination: p.destination,
          volume: 0.7,
          fade: 500,
        });
        toast("Playlist started.");
      }
      if (e.target.dataset.playlistDelete !== undefined) {
        playlists.splice(Number(e.target.dataset.playlistDelete), 1);
        await call("patchCampaign", { playlists });
        renderList();
      }
    } catch (e) {
      toast(e.message, true);
    }
  };
  const chosen = [];
  $("#playlistTracks").onchange = (e) => {
    const id = e.target.dataset.track;
    if (!id) return;
    if (e.target.checked) chosen.push(id);
    else chosen.splice(chosen.indexOf(id), 1);
  };
  $("#addPlaylist").onclick = async () => {
    try {
      const d = form();
      if (!d.playlistName.trim() || !chosen.length)
        throw Error("Name the playlist and select at least one track.");
      playlists.push({
        id: crypto.randomUUID(),
        name: d.playlistName.trim(),
        tracks: [...chosen],
        loop: d.playlistLoop,
        destination: d.playlistDestination,
      });
      await call("patchCampaign", { playlists });
      renderList();
      toast("Playlist saved.");
    } catch (e) {
      toast(e.message, true);
    }
  };
}

document.addEventListener("input", e=>{if(e.target.id === "stockSearch"){const pos=e.target.selectionStart;search=e.target.value;render();const field=$("#stockSearch");field.focus();field.setSelectionRange(pos,pos);}});
