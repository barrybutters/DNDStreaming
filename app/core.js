"use strict";
const crypto = require("node:crypto");
const id = () => crypto.randomUUID();
const clone = (x) => structuredClone(x);
function campaign(name = "New campaign") {
  return {
    id: id(),
    name,
    system: "D&D / homebrew",
    houseRules: "",
    boundaries: "",
    consent: "",
    avoid: "",
    sessionTitle: "Session 1",
    sessionStarted: null,
    rehearsal: true,
    performance: false,
    notes: [],
    characters: [],
    combat: [],
    turn: 0,
    round: 1,
    encounters: [],
    cues: [],
    rundown: [],
    media: [],
    playlists: [],
    maps: [],
    selectedMap: null,
    public: {
      title: "",
      subtitle: "",
      portrait: null,
      dice: null,
      showInitiative: false,
      showParty: true,
      paused: false,
      breakEnds: null,
    },
    timeline: [],
    spotlight: {},
    hotkeys: [
      { key: "CommandOrControl+Alt+N", action: "nextTurn" },
      { key: "CommandOrControl+Alt+B", action: "break" },
      { key: "CommandOrControl+Alt+P", action: "panic" },
      { key: "CommandOrControl+Alt+M", action: "marker" },
    ],
    obs: { scene: "", breakScene: "", safeScene: "", muteInputs: [] },
    audio: { dmDevice: "", audienceDevice: "", playersDevice: "", master: 0.7 },
    savedRolls: ["1d20+5", "2d6+3"],
  };
}
function initial() {
  return {
    schema: 1,
    active: null,
    campaigns: [],
    settings: {
      obsUrl: "ws://127.0.0.1:4455",
      lan: false,
      lanPort: 18766,
      reduceMotion: false,
    },
    updated: null,
  };
}
function active(s) {
  const c = s.campaigns.find((c) => c.id === s.active);
  if (!c) throw Error("Select or create a campaign first.");
  return c;
}
function log(c, text, type = "action") {
  c.timeline.unshift({ id: id(), at: new Date().toISOString(), text, type });
  c.timeline = c.timeline.slice(0, 2000);
}
function nextTurn(c) {
  if (!c.combat.length) throw Error("Add combatants first.");
  c.turn = (c.turn + 1) % c.combat.length;
  if (c.turn === 0) c.round++;
  log(
    c,
    `Round ${c.round}: ${c.combat[c.turn].publicName || c.combat[c.turn].name}`,
    "combat",
  );
}
function publicState(c) {
  const hp = (x) =>
    x.health === "exact"
      ? `${x.hp}/${x.maxHp}`
      : x.health === "status"
        ? x.hp <= 0
          ? "Down"
          : x.hp <= x.maxHp / 2
            ? "Wounded"
            : "Healthy"
        : "";
  const map = c.maps.find((m) => m.id === c.selectedMap);
  return {
    campaign: c.name,
    session: c.sessionTitle,
    ...clone(c.public),
    party: c.public.showParty
      ? c.characters
          .filter((x) => x.visible && !x.absent)
          .map((x) => ({
            id: x.id,
            name: x.publicName || "Adventurer",
            portrait: x.portrait || null,
            hp: hp(x),
            conditions: x.publicConditions ? x.conditions || "" : "",
          }))
      : [],
    initiative: c.public.showInitiative
      ? c.combat
          .filter((x) => x.visible)
          .map((x) => ({
            id: x.id,
            name: x.publicName || "Unknown creature",
            hp: hp(x),
            conditions: x.publicConditions ? x.conditions : "",
            active: c.combat[c.turn]?.id === x.id,
          }))
      : [],
    round: c.round,
    map:
      map && map.published
        ? {
            media: map.media,
            cols: map.cols,
            rows: map.rows,
            revealed: map.revealed,
            tokens: (map.tokens || [])
              .filter(
                (t) =>
                  t.visible &&
                  map.revealed.includes(
                    Math.min(map.rows - 1, Math.floor((t.y / 100) * map.rows)) *
                      map.cols +
                      Math.min(
                        map.cols - 1,
                        Math.floor((t.x / 100) * map.cols),
                      ),
                  ),
              )
              .map((t) => ({
                name: t.publicName || "Token",
                x: t.x,
                y: t.y,
                color: t.color,
                image: t.image || null,
              })),
          }
        : null,
  };
}
function roll(expression, mode = "normal", random = crypto.randomInt) {
  const match = /^\s*(\d{1,3})d(\d{1,5})(?:\s*([+-])\s*(\d{1,5}))?\s*$/i.exec(
    expression,
  );
  if (!match) throw Error("Use NdS+M, for example 2d6+3.");
  const count = Number(match[1]),
    sides = Number(match[2]),
    mod = Number(match[4] || 0) * (match[3] === "-" ? -1 : 1);
  if (count < 1 || count > 100 || sides < 2 || sides > 10000)
    throw Error("Use 1–100 dice with 2–10,000 sides.");
  if (!["normal", "advantage", "disadvantage"].includes(mode))
    throw Error("Invalid roll mode.");
  if (mode !== "normal" && (count !== 1 || sides !== 20))
    throw Error("Advantage and disadvantage require 1d20.");
  const values = Array.from({ length: mode === "normal" ? count : 2 }, () =>
    random(1, sides + 1),
  );
  const total =
    (mode === "advantage"
      ? Math.max(...values)
      : mode === "disadvantage"
        ? Math.min(...values)
        : values.reduce((a, b) => a + b, 0)) + mod;
  return { expression, mode, values, modifier: mod, total };
}
function validate(s) {
  if (
    s?.schema !== 1 ||
    !Array.isArray(s.campaigns) ||
    s.campaigns.length > 100
  )
    throw Error("Unsupported or invalid campaign file.");
  for (const c of s.campaigns) {
    for (const k of [
      "combat",
      "characters",
      "cues",
      "media",
      "notes",
      "maps",
      "timeline",
      "hotkeys",
      "rundown",
      "encounters",
    ])
      if (!Array.isArray(c[k])) throw Error(`Campaign is missing ${k}.`);
    if (!c.public || !c.obs || !c.audio || !c.id || typeof c.name !== "string")
      throw Error("Invalid campaign data.");
    if (
      c.media.some(
        (m) =>
          !/^[-\w]+\.(png|jpg|jpeg|webp|gif|svg|mp3|wav|ogg|m4a|mp4)$/i.test(
            m.file || "",
          ),
      )
    )
      throw Error("Invalid media path.");
  }
  return s;
}
module.exports = {
  id,
  clone,
  campaign,
  initial,
  active,
  log,
  nextTurn,
  publicState,
  roll,
  validate,
};
