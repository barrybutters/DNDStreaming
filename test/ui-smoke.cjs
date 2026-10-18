const fs = require("node:fs"),
  path = require("node:path");
const { Service } = require("../app/service");
const { JSDOM, VirtualConsole } = require("jsdom");
(async () => {
  const dir = fs.mkdtempSync(
      path.join(require("node:os").tmpdir(), "director-ui-"),
    ),
    svc = new Service(dir);
  const url = await svc.listen(true);
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    errors.push(e.message);
    console.error(e.message, e.cause?.stack || "");
  });
  const dom = await JSDOM.fromURL(url, {
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
      w.confirm = () => true;
      w.structuredClone = structuredClone;
      w.fetch = (url, opts) => fetch(new URL(url, w.location.href), opts);
      w.Audio = class {};
    },
  });
  const w = dom.window,
    d = w.document;
  const wait = () => new Promise((r) => setTimeout(r, 120));
  await new Promise((r) => dom.window.addEventListener("load", r));
  await wait();
  const click = (text) => {
    const b = [...d.querySelectorAll("button")].find(
      (x) => x.textContent === text,
    );
    if (!b) throw Error("Missing button " + text);
    b.click();
  };
  click("Create your campaign");
  d.querySelector("#f-name").value = "The Ashen Crown";
  d.querySelector("#editorForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait();
  for (const page of [
    "Combat & dice",
    "Party & spotlight",
    "Campaign notebook",
    "Cues & hotkeys",
    "Music & media",
    "Maps & reveals",
    "Show preparation",
    "Session timeline",
    "Settings & checks",
  ]) {
    click(page);
    await wait();
    if (!d.querySelector("h1")) throw Error("Page failed " + page);
  }
  click("Party & spotlight");
  click("+ Character");
  d.querySelector("#f-name").value = "Elara";
  d.querySelector("#f-publicName").value = "Elara of the Vale";
  d.querySelector("#editorForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait();
  if (!d.body.textContent.includes("Elara"))
    throw Error("Character save failed");
  click("Cues & hotkeys");
  click("Add starter cues");
  await new Promise((r) => setTimeout(r, 500));
  if (!d.body.textContent.includes("Short rest"))
    throw Error("Starter cues missing");
  click("Run session");
  click("Reveal…");
  d.querySelector("#f-title").value = "Public preview";
  d.querySelector("#f-title").dispatchEvent(
    new w.Event("input", { bubbles: true }),
  );
  if (!d.querySelector("#revealPreview").textContent.includes("Public preview"))
    throw Error("Preview failed");
  click("Cancel");
  click("Campaign notebook");
  click("+ Note / NPC");
  d.querySelector("#f-title").value = "Private secret";
  d.querySelector("#editorForm").dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await wait();
  console.log(
    JSON.stringify({
      pages: 10,
      characterSaved: true,
      starterCues: true,
      revealPreview: true,
      errors,
    }),
  );
  w.close();
  await svc.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (errors.length) process.exit(1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
