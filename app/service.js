"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { Store } = require("./store");
const { Obs } = require("./obs");
const stock = require("./stock");
const {
  id,
  clone,
  campaign,
  active,
  log,
  nextTurn,
  publicState,
  roll,
  validate,
} = require("./core");
const TYPES = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
};
const EMPTY = {
  title: "",
  subtitle: "",
  portrait: null,
  dice: null,
  party: [],
  initiative: [],
  map: null,
  paused: false,
};
class Service extends EventEmitter {
  constructor(dir) {
    super();
    this.store = new Store(dir);
    this.obs = new Obs();
    this.token = crypto.randomBytes(32).toString("hex");
    this.lanToken = crypto.randomBytes(24).toString("hex");
    this.undo = [];
    this.audience = clone(EMPTY);
    this.clients = new Set();
    this.audioEvents = [];
    this.hotkeyStatus = [];
    this.busy = false;
    this.cueGeneration = 0;
    this.obs.on("status", () => this.emit("change"));
  }
  snapshot() {
    return {
      state: clone(this.store.state),
      obs: clone(this.obs.status),
      audience: clone(this.audience),
      catalog: stock.catalog(),
      recovery: this.store.recovery,
      hotkeys: this.hotkeyStatus,
      url: this.url,
      lan: this.lanServer
        ? { port: this.store.state.settings.lanPort, token: this.lanToken }
        : null,
    };
  }
  send(kind, data) {
    const msg = `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const r of this.clients) r.write(msg);
  }
  broadcast() {
    const c = active(this.store.state);
    if (!c.rehearsal) {
      this.audience = publicState(c);
      this.send("state", this.audience);
    }
  }
  async command(type, p = {}) {
    if (type === "panic") {
      this.cueGeneration++;
      return this.execute(type, p);
    }
    if (this.busy) throw Error("A cue is running; wait for it to finish.");
    this.busy = true;
    try {
      return await this.execute(type, p);
    } finally {
      this.busy = false;
    }
  }
  async execute(type, p = {}) {
    const s = this.store.state;
    const nonMutating = [
      "obsConnect",
      "obsRefresh",
      "obsDisconnect",
      "setupOverlay",
      "preflight",
      "export",
      "credits",
      "preview",
    ];
    if (nonMutating.includes(type)) {
      if (type === "obsConnect")
        return this.obs.connect(s.settings.obsUrl, p.password || "");
      if (type === "obsRefresh") return this.obs.refresh();
      if (type === "obsDisconnect") return this.obs.disconnect();
      if (type === "setupOverlay") {
        if (!p.confirmed) throw Error("Confirm adding the browser source to OBS.");
        await this.obs.refresh();
        const scene = String(p.scene || this.obs.status.scene || "");
        if (!this.obs.status.scenes.includes(scene)) throw Error("Choose an existing OBS scene.");
        const name = "Dungeon Director Overlay";
        if (this.obs.status.inputs.includes(name)) {
          const existing = await this.obs.call("GetInputSettings", {inputName:name});
          if (existing.inputSettings?.url !== this.url + "/overlay")
            throw Error("An input with this name already exists with another URL. Rename it in OBS before adding the overlay.");
          return {existing:true, name};
        }
        await this.obs.call("CreateInput", {sceneName:scene,inputName:name,inputKind:"browser_source",
          inputSettings:{url:this.url+"/overlay",width:1920,height:1080,shutdown:false},sceneItemEnabled:true});
        await this.obs.refresh();return {name,scene};
      }
      if (type === "preflight") return this.preflight();
      if (type === "export") return this.exportCampaign();
      if (type === "credits") return this.credits();
      return publicState(active(s));
    }
    const before = clone(s);
    const operationGeneration = this.cueGeneration;
    let result;
    try {
      if (type === "createCampaign") {
        const c = campaign(String(p.name || "New campaign").slice(0, 100));
        s.campaigns.push(c);
        s.active = c.id;
        this.audience = clone(EMPTY);
        this.send("state", this.audience);
      } else if (type === "switchCampaign") {
        if (!s.campaigns.some((c) => c.id === p.id))
          throw Error("Campaign not found.");
        s.active = p.id;
        active(s).rehearsal = true;
        this.audience = clone(EMPTY);
        this.send("state", this.audience);
        this.emit("stopAudio");
        this.send("audio", { action: "stopAll" });
      } else if (type === "settings") {
        if (p.obsUrl !== undefined) s.settings.obsUrl = String(p.obsUrl);
        if (p.reduceMotion !== undefined)
          s.settings.reduceMotion = !!p.reduceMotion;
      } else if (type === "undo") {
        const old = this.undo.pop();
        if (!old) throw Error("Nothing to undo.");
        s.campaigns = old.campaigns;
        s.active = old.active;
        s.settings = old.settings;
        active(s).rehearsal = true;
        log(
          active(s),
          "Restored previous workspace in rehearsal; audience output unchanged.",
          "recovery",
        );
      } else {
        const c = active(s);
        if (type === "stockAdd") {
          const item = stock.asset(p.id);
          const media = this.importMedia(item.path);
          media.title = item.name;
          media.source = "Dungeon Director original starter art";
          media.terms = "Bundled artwork may be used in your campaigns and streams.";
          if (item.kind === "map") {
            const map = {id:id(),name:item.name,media:media.id,cols:24,rows:16,
              revealed:Array.from({length:384},(_,i)=>i),tokens:[],published:false};
            c.maps.push(map); c.selectedMap = map.id; result = map;
          } else if (p.mapId) {
            const map = c.maps.find(x=>x.id===p.mapId);
            if (!map) throw Error("Select a map before placing a token.");
            const token = {id:id(),name:item.name,publicName:item.name,image:media.id,
              x:50,y:50,color:"#546c8b",visible:false};
            map.tokens.push(token); result = token;
          } else result = media;
        } else if (type === "mapFog") {
          const map = c.maps.find(x=>x.id===p.id);
          if (!map) throw Error("Map missing.");
          map.revealed = p.reveal ? Array.from({length:map.cols*map.rows},(_,i)=>i) : [];
        } else if (type === "patchCampaign") {
          for (const k of [
            "name",
            "system",
            "houseRules",
            "boundaries",
            "consent",
            "avoid",
            "sessionTitle",
            "performance",
            "obs",
            "audio",
            "hotkeys",
            "savedRolls",
            "playlists",
          ])
            if (k in p) c[k] = clone(p[k]);
        } else if (type === "mode") {
          if (c.rehearsal && !p.rehearsal) {
            for (const key of [
              "title",
              "subtitle",
              "portrait",
              "dice",
              "paused",
              "breakEnds",
            ])
              c.public[key] = clone(
                this.audience[key] ??
                  { title: "", subtitle: "", paused: false }[key] ??
                  null,
              );
            // Fog and token edits made during rehearsal require an explicit map publish.
            for (const map of c.maps) map.published = false;
          }
          c.rehearsal = !!p.rehearsal;
          log(
            c,
            c.rehearsal
              ? "Rehearsal enabled; live output held."
              : "Live controls armed.",
          );
        } else if (type === "saveEntity") {
          const allowed = [
            "characters",
            "notes",
            "combat",
            "cues",
            "rundown",
            "media",
            "maps",
            "encounters",
          ];
          if (!allowed.includes(p.collection))
            throw Error("Invalid collection.");
          const entity = clone(p.entity);
          if (!entity.id) entity.id = id();
          if (
            p.collection === "media" &&
            !c.media.some((m) => m.id === entity.id)
          )
            throw Error("Import media through the file picker.");
          const idx = c[p.collection].findIndex((x) => x.id === entity.id);
          if (idx < 0) c[p.collection].push(entity);
          else c[p.collection][idx] = entity;
          result = entity;
        } else if (type === "deleteEntity") {
          if (
            ![
              "characters",
              "notes",
              "combat",
              "cues",
              "rundown",
              "maps",
              "encounters",
            ].includes(p.collection)
          )
            throw Error("Invalid collection.");
          c[p.collection] = c[p.collection].filter((x) => x.id !== p.id);
          if (p.collection === "combat")
            c.turn = Math.min(c.turn, Math.max(0, c.combat.length - 1));
        } else if (type === "nextTurn") nextTurn(c);
        else if (type === "sortCombat") {
          c.combat.sort((a, b) => b.initiative - a.initiative);
          c.turn = 0;
          c.round = 1;
          log(c, "Initiative sorted.", "combat");
        } else if (type === "hp") {
          const x = c[
            p.collection === "characters" ? "characters" : "combat"
          ].find((x) => x.id === p.id);
          if (!x) throw Error("Combatant missing.");
          const change = Number(p.delta);
          if (!Number.isFinite(change)) throw Error("Invalid HP adjustment.");
          if (change < 0) {
            const absorbed = Math.min(x.tempHp || 0, -change);
            x.tempHp = Math.max(0, (x.tempHp || 0) - absorbed);
            x.hp = Math.max(0, x.hp + change + absorbed);
          } else x.hp = Math.min(x.maxHp, x.hp + change);
          if (change < 0 && x.concentration)
            log(
              c,
              `${x.name}: concentration check reminder (DC ${Math.max(10, Math.floor(-change / 2))}).`,
              "reminder",
            );
        } else if (type === "spotlight") {
          c.spotlight[p.id] = (c.spotlight[p.id] || 0) + 1;
          log(c, "Player spotlight marked.", "spotlight");
        } else if (type === "public") {
          for (const k of [
            "title",
            "subtitle",
            "portrait",
            "showInitiative",
            "showParty",
            "paused",
            "dice",
            "theme",
          ])
            if (k in p) c.public[k] = clone(p[k]);
          // Clearing one public layer remains available while rehearsing other content.
          for (const [key, value] of Object.entries(p)) {
            if ((key === "dice" && value === null) ||
                (["showParty", "showInitiative"].includes(key) && value === false)) {
              this.audience[key === "showParty" ? "party" : key === "showInitiative" ? "initiative" : key] = key === "dice" ? null : [];
              this.send("state", this.audience);
            }
          }
        } else if (type === "roll") {
          if (p.publish && c.rehearsal)
            throw Error("OBS output is held. Enable OBS output before publishing a dice roll.");
          result = {...roll(p.expression, p.mode), rollId: id(), at: Date.now(),
            label: String(p.label || "NPC / monster roll").slice(0, 100)};
          log(
            c,
            `${result.expression}: ${result.values.join(", ")} → ${result.total}${p.publish ? " (public)" : " (private)"}`,
            "dice",
          );
          if (p.publish) c.public.dice = result;
        } else if (type === "marker")
          log(c, String(p.text || "Highlight marker").slice(0, 1000), "marker");
        else if (type === "startSession") {
          c.sessionStarted = new Date().toISOString();
          log(c, "Session started.", "session");
        } else if (type === "break") {
          await this.runSteps(
            c,
            [
              { type: "break", minutes: Number(p.minutes) || 10 },
              { type: "scene", name: c.obs.breakScene },
            ],
            true,
          );
        } else if (type === "panic") {
          await this.panic(c);
        } else if (type === "resume") {
          c.public.paused = false;
          c.public.breakEnds = null;
        } else if (type === "mapSelect") {
          c.selectedMap = p.id;
        } else if (type === "mapCell") {
          const m = c.maps.find((x) => x.id === p.id);
          if (!m) throw Error("Map missing.");
          const cell = Number(p.cell);
          if (!Number.isInteger(cell) || cell < 0 || cell >= m.cols * m.rows)
            throw Error("Invalid cell.");
          m.revealed = m.revealed || [];
          m.revealed = p.reveal
            ? [...new Set([...m.revealed, cell])]
            : m.revealed.filter((x) => x !== cell);
        } else if (type === "mapPublish") {
          const m = c.maps.find((x) => x.id === p.id);
          if (!m) throw Error("Map missing.");
          if (p.published && c.rehearsal)
            throw Error("OBS output is held. Enable OBS output before publishing the map.");
          c.selectedMap = m.id;
          if (!p.published) { this.audience.map = null; this.send("state", this.audience); }
          m.published = !!p.published;
          log(
            c,
            m.published ? "Audience map published." : "Audience map hidden.",
            "reveal",
          );
        } else if (type === "loadEncounter") {
          const enc = c.encounters.find((x) => x.id === p.id);
          if (!enc) throw Error("Encounter missing.");
          c.combat = clone(enc.combat).map((x) => ({ ...x, id: id() }));
          c.round = 1;
          c.turn = 0;
          log(c, `Loaded encounter: ${enc.name}`);
        } else if (type === "reorderRundown") {
          if (
            !Array.isArray(p.items) ||
            p.items.length !== c.rundown.length ||
            p.items.some((x) => !c.rundown.some((r) => r.id === x.id))
          )
            throw Error("Invalid running order.");
          c.rundown = p.items;
        } else if (type === "saveEncounter") {
          c.encounters.push({
            id: id(),
            name: p.name || "Encounter",
            combat: clone(c.combat),
          });
        } else if (type === "cue") {
          const cue = c.cues.find((x) => x.id === p.id);
          if (!cue) throw Error("Cue missing.");
          await this.runSteps(c, cue.steps);
          log(
            c,
            `${c.rehearsal ? "Rehearsed" : "Ran"} cue: ${cue.name}`,
            "cue",
          );
        } else if (type === "audio") {
          this.audio(c, p);
        } else if (type === "obsAction") {
          if (c.rehearsal) log(c, `Rehearsal: ${p.request}`);
          else await this.obs.call(p.request, p.data || {});
        } else throw Error("Unknown action.");
      }
      if (
        type !== "undo" &&
        !["audio", "mode", "switchCampaign", "createCampaign"].includes(type)
      ) {
        this.undo.push(before);
        this.undo = this.undo.slice(-30);
      }
      this.store.save();
      if (!["undo", "mode", "settings"].includes(type) && s.active)
        this.broadcast();
      this.emit("change");
      return result ?? this.snapshot();
    } catch (e) {
      // OBS actions cannot be rolled back; retain cue progress and report it.
      if (type === "cue" || type === "panic" || type === "break") {
        if (s.active) {
          log(active(s), `${type} stopped: ${e.message}`, "error");
          this.store.save();
          this.broadcast();
          this.emit("change");
        }
      } else if (operationGeneration === this.cueGeneration)
        this.store.state = before;
      throw e;
    }
  }
  audio(c, p) {
    if (
      !["play", "playlist", "stop", "stopAll", "volume", "duck"].includes(
        p.action,
      )
    )
      throw Error("Invalid audio action.");
    if (
      p.action === "play" &&
      !c.media.some((m) => m.id === p.id && m.kind === "audio")
    )
      throw Error("Audio asset missing.");
    if (
      p.action === "playlist" &&
      (!Array.isArray(p.tracks) ||
        !p.tracks.length ||
        p.tracks.some(
          (id) => !c.media.some((m) => m.id === id && m.kind === "audio"),
        ))
    )
      throw Error("Playlist contains missing audio.");
    const event = { ...p, rehearsal: c.rehearsal, master: c.audio.master };
    this.emit("audio", event);
    if (!c.rehearsal) this.send("audio", event);
  }
  async panic(c) {
    c.public.paused = true;
    c.public.title = "We’ll be right back";
    c.public.subtitle = "";
    c.public.portrait = null;
    c.public.dice = null;
    c.public.showInitiative = false;
    c.public.showParty = false;
    c.public.breakEnds = null;
    for (const m of c.maps) m.published = false;
    this.audio(c, { action: "stopAll" });
    {
      this.audience = publicState(c);
      this.send("state", this.audience);
      this.emit("stopAudio");
      this.send("audio", {action: "stopAll"});
      const errors = [];
      if (c.obs.safeScene)
        try {
          await this.obs.call("SetCurrentProgramScene", {
            sceneName: c.obs.safeScene,
          });
        } catch (e) {
          errors.push(e.message);
        }
      for (const inputName of c.obs.muteInputs || [])
        try {
          await this.obs.call("SetInputMute", { inputName, inputMuted: true });
        } catch (e) {
          errors.push(`${inputName}: ${e.message}`);
        }
      if (errors.length)
        throw Error(
          "Local output paused; OBS actions failed: " + errors.join("; "),
        );
    }
    log(
      c,
      "Privacy pause activated. Resume does not automatically unmute OBS.",
      "privacy",
    );
  }
  async runSteps(c, steps, skipEmpty = false) {
    const generation = this.cueGeneration;
    if (!Array.isArray(steps) || steps.length > 50)
      throw Error("A cue supports up to 50 steps.");
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      try {
        if (generation !== this.cueGeneration)
          throw Error("Cancelled by privacy pause");
        if (step.type === "title") {
          c.public.title = step.title || "";
          c.public.subtitle = step.subtitle || "";
        } else if (step.type === "portrait")
          c.public.portrait = step.id || null;
        else if (step.type === "initiative")
          c.public.showInitiative = step.show !== false;
        else if (step.type === "nextTurn") nextTurn(c);
        else if (step.type === "scene") {
          if (!step.name) {
            if (skipEmpty) continue;
            throw Error("Choose an OBS scene.");
          }
          if (!c.rehearsal)
            await this.obs.call("SetCurrentProgramScene", {
              sceneName: step.name,
            });
        } else if (step.type === "mute") {
          if (!c.rehearsal)
            await this.obs.call("SetInputMute", {
              inputName: step.name,
              inputMuted: step.muted !== false,
            });
        } else if (step.type === "source") {
          if (!c.rehearsal)
            await this.obs.call("SetSceneItemEnabled", {
              sceneName: step.scene,
              sceneItemId: Number(step.itemId),
              sceneItemEnabled: step.show !== false,
            });
        } else if (step.type === "audio")
          this.audio(c, {
            action: "play",
            id: step.id,
            volume: step.volume ?? 0.7,
            loop: !!step.loop,
            destination: step.destination || "audience",
            fade: Number(step.fade) || 0,
          });
        else if (step.type === "stopAudio")
          this.audio(c, { action: "stopAll", fade: Number(step.fade) || 0 });
        else if (step.type === "wait") {
          const ms = Number(step.ms);
          if (!Number.isFinite(ms) || ms < 0 || ms > 10000)
            throw Error("Wait must be 0–10,000 ms.");
          await new Promise((r) => setTimeout(r, ms));
        } else if (step.type === "break") {
          c.public.paused = true;
          c.public.title = "Taking a short rest";
          c.public.breakEnds =
            Date.now() +
            Math.max(1, Math.min(120, Number(step.minutes) || 10)) * 60000;
        } else if (step.type === "marker")
          log(c, step.text || "Cue marker", "marker");
        else throw Error(`Unknown step ${step.type}`);
        if (generation !== this.cueGeneration)
          throw Error("Cancelled by privacy pause");
        this.broadcast();
        log(
          c,
          `${c.rehearsal ? "Rehearsal" : "Live"}: step ${i + 1} ${step.type} complete`,
          "cue-step",
        );
        this.emit("change");
      } catch (e) {
        throw Error(
          `Step ${i + 1} (${step.type}): ${e.message}. Earlier steps may already have run.`,
        );
      }
    }
  }
  preflight() {
    const s = this.store.state,
      c = active(s);
    return [
      {
        ok: this.obs.status.connected,
        label: "OBS connection",
        detail: this.obs.status.connected
          ? this.obs.status.scene
          : "Connect OBS in Settings.",
      },
      {
        ok:
          !!c.obs.safeScene && this.obs.status.scenes.includes(c.obs.safeScene),
        label: "Privacy scene",
        detail: c.obs.safeScene || "Assign a safe scene.",
      },
      {
        ok: c.obs.muteInputs.length > 0,
        label: "Privacy mute targets",
        detail: c.obs.muteInputs.join(", ") || "Assign microphones to mute.",
      },
      {
        ok: !this.hotkeyStatus.some((h) => !h.ok),
        label: "Global shortcuts",
        detail: this.hotkeyStatus.length
          ? JSON.stringify(this.hotkeyStatus)
          : "Not registered in browser preview.",
      },
      {
        ok: c.media.every((m) =>
          fs.existsSync(path.join(this.store.dir, "media", m.file)),
        ),
        label: "Media files",
        detail: `${c.media.length} managed assets`,
      },
      { ok: true, label: "Overlay endpoint", detail: this.url + "/overlay" },
      {
        ok: false,
        label: "Microphone sound check",
        detail: "Listen in OBS and check meters manually before going live.",
      },
      {
        ok: !c.rehearsal,
        label: "Live controls",
        detail: c.rehearsal ? "Rehearsal enabled." : "Live controls armed.",
      },
    ];
  }
  importMedia(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (!TYPES[ext])
      throw Error("Supported: PNG, JPG, WEBP, GIF, MP3, WAV, OGG, M4A, MP4.");
    const c = active(this.store.state),
      file = id() + ext;
    fs.copyFileSync(filename, path.join(this.store.dir, "media", file));
    const entity = {
      id: id(),
      file,
      title: path.basename(filename, ext),
      kind: TYPES[ext].split("/")[0],
      source: "",
      terms: "",
      credit: "",
    };
    c.media.push(entity);
    this.store.save();
    this.emit("change");
    return entity;
  }
  saveDerived(p) {
    const c = active(this.store.state);
    if (!["png", "wav"].includes(p.ext))
      throw Error("Unsupported derived asset.");
    const bytes = Buffer.from(p.base64, "base64");
    if (bytes.length > 100 * 1024 * 1024) throw Error("Asset too large.");
    const file = id() + "." + p.ext;
    fs.writeFileSync(path.join(this.store.dir, "media", file), bytes);
    const asset = {
      id: id(),
      file,
      title: p.title || "Prepared asset",
      kind: p.ext === "png" ? "image" : "audio",
      source: "",
      terms: "",
      credit: "",
    };
    c.media.push(asset);
    this.store.save();
    this.emit("change");
    return asset;
  }
  exportCampaign() {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    const c = clone(active(this.store.state));
    c.rehearsal = true;
    zip.addFile(
      "campaign.json",
      Buffer.from(
        JSON.stringify(
          { schema: 1, active: c.id, campaigns: [c], settings: {} },
          null,
          2,
        ),
      ),
    );
    for (const m of c.media) {
      const file = path.join(this.store.dir, "media", m.file);
      if (fs.existsSync(file)) zip.addLocalFile(file, "media");
    }
    return zip.toBuffer();
  }
  importCampaign(buffer) {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);
    let size = 0;
    for (const e of zip.getEntries()) {
      size += e.header.size;
      if (size > 1024 * 1024 * 1024)
        throw Error("Campaign expands beyond 1 GB.");
      if (
        e.entryName !== "campaign.json" &&
        !/^media\/[-\w]+\.[a-zA-Z0-9]+$/.test(e.entryName)
      )
        throw Error("Unexpected archive path.");
    }
    const entry = zip.getEntry("campaign.json");
    if (!entry) throw Error("No campaign.json found.");
    const imported = validate(JSON.parse(entry.getData().toString("utf8")));
    if (imported.campaigns.length !== 1)
      throw Error("Import one campaign at a time.");
    const c = imported.campaigns[0];
    for (const m of c.media) {
      const e = zip.getEntry("media/" + m.file);
      if (!e) throw Error("Missing asset: " + m.title);
    }
    c.id = id();
    c.name += " (imported)";
    c.rehearsal = true;
    const mediaIds = new Map();
    for (const m of c.media) {
      const bytes = zip.getEntry("media/" + m.file).getData();
      const file = id() + path.extname(m.file);
      fs.writeFileSync(path.join(this.store.dir, "media", file), bytes);
      m.file = file;
      mediaIds.set(m.id, id());
    }
    const remap = (value) => {
      if (typeof value === "string") return mediaIds.get(value) || value;
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === "object") {
        for (const key of Object.keys(value)) value[key] = remap(value[key]);
      }
      return value;
    };
    remap(c);
    this.store.state.campaigns.push(c);
    this.store.state.active = c.id;
    this.store.save();
    this.audience = clone(EMPTY);
    this.send("state", this.audience);
    this.emit("stopAudio");
    this.send("audio", { action: "stopAll" });
    this.emit("change");
    return c;
  }
  credits() {
    return active(this.store.state)
      .media.map(
        (m) =>
          `${m.title}\n${m.credit || "Credit not recorded"}\nSource: ${m.source || "Not recorded"}\nTerms: ${m.terms || "Not recorded"}`,
      )
      .join("\n\n");
  }
  asset(idValue) {
    for (const c of this.store.state.campaigns) {
      const m = c.media.find((x) => x.id === idValue);
      if (m)
        return {
          file: path.join(this.store.dir, "media", m.file),
          mime: TYPES[path.extname(m.file)],
        };
    }
    return null;
  }
  async listen(preview = false) {
    this.server = http.createServer((req, res) =>
      this.route(req, res, preview),
    );
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(preview ? 0 : 18765, "127.0.0.1", resolve);
    });
    this.url = `http://127.0.0.1:${this.server.address().port}`;
    return this.url;
  }
  route(req, res, preview) {
    const u = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method === "GET" && u.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: state\ndata: ${JSON.stringify(this.audience)}\n\n`);
      this.clients.add(res);
      const timer = setInterval(() => res.write(":keepalive\n\n"), 15000);
      req.on("close", () => {
        clearInterval(timer);
        this.clients.delete(res);
      });
      return;
    }
    if (req.method === "GET" && u.pathname === "/audience") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(this.audience));
      return;
    }
    if (req.method === "GET" && u.pathname.startsWith("/stock/")) {
      try {
        const item = stock.asset(decodeURIComponent(u.pathname.slice(7)));
        res.setHeader("Content-Type", TYPES[path.extname(item.path)]);
        res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
        fs.createReadStream(item.path).pipe(res);
      } catch {res.writeHead(404);res.end();}
      return;
    }
    if (req.method === "GET" && u.pathname.startsWith("/media/")) {
      const a = this.asset(u.pathname.slice(7));
      if (!a || !fs.existsSync(a.file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const stat = fs.statSync(a.file),
        range = req.headers.range;
      res.setHeader("Content-Type", a.mime);
      if (a.mime === "image/svg+xml") res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader("Accept-Ranges", "bytes");
      if (range) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!m) {
          res.writeHead(416);
          res.end();
          return;
        }
        const start = Number(m[1]),
          end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
        if (start > end || start >= stat.size) {
          res.writeHead(416);
          res.end();
          return;
        }
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Content-Length": end - start + 1,
        });
        fs.createReadStream(a.file, { start, end }).pipe(res);
      } else {
        res.setHeader("Content-Length", stat.size);
        fs.createReadStream(a.file).pipe(res);
      }
      return;
    }
    if (
      preview &&
      u.pathname === "/dev-api" &&
      req.headers.authorization === "Bearer " + this.token
    ) {
      let body = "";
      req.on("data", (d) => {
        body += d;
        if (body.length > 2000000) req.destroy();
      });
      req.on("end", async () => {
        try {
          const { type, payload } = JSON.parse(body);
          const result =
            type === "snapshot"
              ? this.snapshot()
              : await this.command(type, payload);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    const files = {
      "/": "index.html",
      "/style.css": "style.css",
      "/renderer.js": "renderer.js",
      "/overlay": "overlay.html",
      "/dice": "overlay.html",
      "/battlemap": "overlay.html",
      "/dice-view.js": "dice-view.js",
      "/overlay.js": "overlay.js",
      "/audio.js": "audio.js",
    };
    if (files[u.pathname] && req.method === "GET") {
      let body = fs.readFileSync(path.join(__dirname, files[u.pathname]));
      res.setHeader(
        "Content-Type",
        u.pathname.endsWith(".js")
          ? "text/javascript"
          : u.pathname.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      res.end(body);
      return;
    }
    if (u.pathname === "/preview-bridge.js") {
      if (!preview) {
        res.setHeader("Content-Type", "text/javascript");
        res.end("/* Desktop API is provided by the isolated preload. */");
        return;
      }
      res.setHeader("Content-Type", "text/javascript");
      res.end(
        `window.director={invoke:async(type,payload)=>{const r=await fetch('/dev-api',{method:'POST',headers:{'Authorization':'Bearer ${this.token}','Content-Type':'application/json'},body:JSON.stringify({type,payload})});const v=await r.json();if(v.error)throw Error(v.error);return v.result;},on:()=>{}};`,
      );
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  }
  async enableLan(enabled) {
    if (this.lanServer) {
      await new Promise((r) => this.lanServer.close(r));
      this.lanServer = null;
    }
    if (!enabled) return;
    this.lanToken = crypto.randomBytes(24).toString("hex");
    this.lanServer = http.createServer((req, res) => {
      const u = new URL(req.url, "http://localhost");
      const token =
        req.headers.authorization?.replace("Bearer ", "") ||
        u.searchParams.get("token");
      if (token !== this.lanToken) {
        res.writeHead(403);
        res.end("Invalid access token");
        return;
      }
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("Cache-Control", "no-store");
      if (req.method === "GET") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<!doctype html><meta name="viewport" content="width=device-width"><title>Dungeon Director remote</title><style>body{background:#111827;color:white;font:20px system-ui;padding:25px}button{display:block;padding:20px;margin:16px;width:90%}</style><h1>Producer controls</h1><p>Trusted local network only. Actions affect the armed campaign.</p>${["nextTurn", "break", "panic", "marker", "resume"].map((a) => `<button onclick="fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'${a}'})}).then(async r=>alert(r.ok?'Done':await r.text()))">${a}</button>`).join("")}`,
        );
      } else if (req.method === "POST") {
        let body = "";
        req.on("data", (d) => {
          body += d;
          if (body.length > 2048) req.destroy();
        });
        req.on("end", async () => {
          try {
            const p = JSON.parse(body);
            if (
              !["nextTurn", "break", "panic", "marker", "resume"].includes(
                p.action,
              )
            )
              throw Error("Action not allowed.");
            await this.command(p.action);
            res.end("Done");
          } catch (e) {
            res.writeHead(400);
            res.end(e.message);
          }
        });
      } else {
        res.writeHead(405);
        res.end();
      }
    });
    await new Promise((resolve, reject) => {
      this.lanServer.once("error", reject);
      this.lanServer.listen(
        this.store.state.settings.lanPort,
        "0.0.0.0",
        resolve,
      );
    });
    this.emit("change");
  }
  async close() {
    for (const r of this.clients) r.end();
    await this.obs.disconnect();
    if (this.lanServer) await new Promise((r) => this.lanServer.close(r));
    if (this.server) await new Promise((r) => this.server.close(r));
  }
}
module.exports = { Service };
