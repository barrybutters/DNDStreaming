const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  vm = require("node:vm");
function player() {
  const created = [];
  class Audio {
    constructor(url) {
      this.url = url;
      this.events = {};
      this.volume = 1;
      created.push(this);
    }
    addEventListener(name, fn) {
      (this.events[name] ??= []).push(fn);
    }
    async play() {}
    pause() {
      this.paused = true;
    }
    async setSinkId(id) {
      this.device = id;
    }
    end() {
      for (const fn of this.events.ended || []) fn();
    }
  }
  const ctx = { window: {}, Audio, console, setInterval, clearInterval };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../app/audio.js"), "utf8"),
    ctx,
  );
  return {
    audio: new ctx.window.DirectorAudio(
      (id) => id,
      () => ({ dmDevice: "private", audienceDevice: "broadcast" }),
    ),
    created,
  };
}
test("rehearsal routes audio to the DM device and duplicate tracks remain separate", async () => {
  const { audio, created } = player();
  await audio.handle({ action: "play", id: "a", rehearsal: true });
  await audio.handle({ action: "play", id: "a", rehearsal: true });
  assert.equal(created[0].device, "private");
  assert.equal(audio.items.size, 2);
  await audio.handle({ action: "stopAll" });
  assert.equal(audio.items.size, 0);
});
test("playlist advances in order and privacy stop prevents later tracks", async () => {
  const { audio, created } = player();
  await audio.handle({
    action: "playlist",
    tracks: ["a", "b", "c"],
    destination: "audience",
  });
  assert.equal(created[0].url, "a");
  created[0].end();
  await new Promise((r) => setImmediate(r));
  assert.equal(created[1].url, "b");
  assert.equal(created[1].device, "broadcast");
  await audio.handle({ action: "stopAll" });
  created[1].end();
  await new Promise((r) => setImmediate(r));
  assert.equal(created.length, 2);
  assert.equal(created[1].paused, true);
});
