class DirectorAudio {
  constructor(assetUrl, devices = () => ({})) {
    this.items = new Map();
    this.assetUrl = assetUrl;
    this.devices = devices;
    this.master = 0.7;
    this.duck = 1;
    this.playlistGeneration = 0;
    this.sequence = 0;
  }
  async handle(p) {
    if (p.action === "playlist") {
      const generation = ++this.playlistGeneration;
      let index = 0;
      const next = async () => {
        if (generation !== this.playlistGeneration) return;
        const item = await this.handle({
          ...p,
          action: "play",
          id: p.tracks[index],
          loop: false,
        });
        item.audio.addEventListener(
          "ended",
          () => {
            index++;
            if (index >= p.tracks.length) {
              if (!p.loop) return;
              index = 0;
            }
            next().catch((e) => console.error(e));
          },
          { once: true },
        );
      };
      await next();
      return;
    }
    this.master = p.master ?? this.master;
    if (p.action === "play") {
      const a = new Audio(this.assetUrl(p.id));
      a.loop = !!p.loop;
      const destination = p.rehearsal ? "dm" : p.destination || "audience",
        device = this.devices()[destination + "Device"];
      if (device && a.setSinkId) await a.setSinkId(device);
      const item = {
        audio: a,
        base: Math.max(0, Math.min(1, Number(p.volume ?? 0.7))),
        destination,
      };
      this.items.set(p.id + ":" + ++this.sequence, item);
      a.volume = p.fade ? 0 : item.base * this.master * this.duck;
      a.addEventListener("ended", () => {
        for (const [k, v] of this.items) if (v === item) this.items.delete(k);
      });
      await a.play();
      if (p.fade) this.fade(item, item.base * this.master * this.duck, p.fade);
      return item;
    } else if (p.action === "stopAll") {
      this.playlistGeneration++;
      for (const [k, item] of this.items) {
        if (p.fade)
          this.fade(item, 0, p.fade, () => {
            item.audio.pause();
            this.items.delete(k);
          });
        else {
          clearInterval(item.timer);
          item.audio.pause();
          this.items.delete(k);
        }
      }
    } else if (p.action === "stop") {
      for (const [k, item] of this.items)
        if (k.startsWith(p.id + ":")) {
          clearInterval(item.timer);
          item.audio.pause();
          this.items.delete(k);
        }
    } else if (p.action === "duck" || p.action === "volume") {
      if (p.action === "duck") this.duck = p.enabled ? 0.25 : 1;
      if (p.action === "volume")
        this.master = Math.max(0, Math.min(1, Number(p.volume)));
      for (const item of this.items.values())
        this.fade(item, item.base * this.master * this.duck, 300);
    }
  }
  fade(item, target, ms, done) {
    clearInterval(item.timer);
    const initial = item.audio.volume,
      start = Date.now();
    item.timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / Math.max(1, ms));
      item.audio.volume = Math.max(
        0,
        Math.min(1, initial + (target - initial) * t),
      );
      if (t === 1) {
        clearInterval(item.timer);
        done?.();
      }
    }, 30);
  }
}
window.DirectorAudio = DirectorAudio;
