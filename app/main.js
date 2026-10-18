const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  screen,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { Service } = require("./service");
const { active } = require("./core");
let service, window, audienceWindow;
const smokeTest = app.commandLine.hasSwitch("smoke-test");
let smokeDirectory;
if (smokeTest) {
  smokeDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "director-desktop-test-"),
  );
  app.setPath("userData", smokeDirectory);
}
if (!app.requestSingleInstanceLock()) app.quit();
function register() {
  globalShortcut.unregisterAll();
  service.hotkeyStatus = [];
  if (!service.store.state.active) return;
  const seen = new Set();
  for (const h of active(service.store.state).hotkeys) {
    let ok = false,
      error = "";
    try {
      if (seen.has(h.key)) throw Error("Duplicate shortcut");
      seen.add(h.key);
      if (
        !["nextTurn", "break", "panic", "marker", "resume", "cue"].includes(
          h.action,
        )
      )
        throw Error("Unsupported shortcut action");
      ok = globalShortcut.register(h.key, () =>
        service
          .command(h.action, h.action === "cue" ? { id: h.cueId } : {})
          .catch((e) => window?.webContents.send("error", e.message)),
      );
      if (!ok) error = "Shortcut is unavailable or already used.";
    } catch (e) {
      error = e.message;
    }
    service.hotkeyStatus.push({ ...h, ok, error });
  }
}
app.whenReady().then(async () => {
  try {
    service = new Service(app.getPath("userData"));
    await service.listen(smokeTest);
    window = new BrowserWindow({
      show: !smokeTest,
      width: 1500,
      height: 980,
      minWidth: 1050,
      minHeight: 700,
      backgroundColor: "#0b1018",
      title: "Dungeon Director",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(service.url + "/")) e.preventDefault();
    });
    register();
    let keySignature = "";
    service.on("change", () => {
      const sig = service.store.state.active
        ? JSON.stringify([
            service.store.state.active,
            active(service.store.state).hotkeys,
          ])
        : "";
      if (sig !== keySignature) {
        register();
        keySignature = sig;
      }
      window?.webContents.send("change", service.snapshot());
    });
    service.on("audio", (p) => window?.webContents.send("audio", p));
    service.on("stopAudio", () =>
      window?.webContents.send("audio", { action: "stopAll" }),
    );
    ipcMain.handle("director", async (event, type, p = {}) => {
      if (event.sender !== window.webContents)
        throw Error("Unauthorized window.");
      if (type === "snapshot") return service.snapshot();
      if (type === "importMedia") {
        const r = await dialog.showOpenDialog(window, {
          properties: ["openFile", "multiSelections"],
          filters: [
            {
              name: "Media",
              extensions: [
                "png",
                "jpg",
                "jpeg",
                "gif",
                "webp",
                "mp3",
                "wav",
                "ogg",
                "m4a",
                "mp4",
              ],
            },
          ],
        });
        if (r.canceled) return [];
        return r.filePaths.map((f) => service.importMedia(f));
      }
      if (type === "saveDerived") return service.saveDerived(p);
      if (type === "exportFile") {
        const r = await dialog.showSaveDialog(window, {
          defaultPath: "campaign.ddcampaign",
          filters: [
            { name: "Dungeon Director campaign", extensions: ["ddcampaign"] },
          ],
        });
        if (!r.canceled) {
          fs.writeFileSync(r.filePath, service.exportCampaign());
          return r.filePath;
        }
        return null;
      }
      if (type === "importFile") {
        const r = await dialog.showOpenDialog(window, {
          properties: ["openFile"],
          filters: [
            { name: "Dungeon Director campaign", extensions: ["ddcampaign"] },
          ],
        });
        if (!r.canceled)
          return service.importCampaign(fs.readFileSync(r.filePaths[0]));
        return null;
      }
      if (type === "saveCredits") {
        const r = await dialog.showSaveDialog(window, {
          defaultPath: "episode-credits.txt",
        });
        if (!r.canceled) fs.writeFileSync(r.filePath, service.credits());
        return r.filePath;
      }
      if (type === "lan") {
        await service.enableLan(!!p.enabled);
        const interfaces = Object.values(os.networkInterfaces())
          .flat()
          .filter((x) => x?.family === "IPv4" && !x.internal)
          .map(
            (x) =>
              `http://${x.address}:${service.store.state.settings.lanPort}/?token=${service.lanToken}`,
          );
        return { urls: interfaces, enabled: !!service.lanServer };
      }
      if (type === "audienceWindow") {
        if (audienceWindow) {
          audienceWindow.focus();
          return;
        }
        const second = screen
          .getAllDisplays()
          .find((d) => d.id !== screen.getPrimaryDisplay().id);
        audienceWindow = new BrowserWindow({
          width: 1280,
          height: 720,
          ...(second ? { x: second.bounds.x, y: second.bounds.y } : {}),
          backgroundColor: "#000000",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        audienceWindow.setMenuBarVisibility(false);
        audienceWindow.loadURL(service.url + "/overlay?screen=1");
        audienceWindow.on("closed", () => (audienceWindow = null));
        return;
      }
      const allowed = [
        "createCampaign",
        "switchCampaign",
        "settings",
        "undo",
        "patchCampaign",
        "mode",
        "saveEntity",
        "deleteEntity",
        "nextTurn",
        "sortCombat",
        "hp",
        "spotlight",
        "public",
        "roll",
        "marker",
        "startSession",
        "break",
        "panic",
        "resume",
        "mapSelect",
        "mapCell",
        "mapPublish",
        "loadEncounter",
        "saveEncounter",
        "reorderRundown",
        "cue",
        "audio",
        "obsAction",
        "obsConnect",
        "obsRefresh",
        "preflight",
        "preview",
      ];
      if (!allowed.includes(type)) throw Error("Unknown operation.");
      return service.command(type, p);
    });
    await window.loadURL(service.url + "/");
    if (smokeTest) {
      const result = await window.webContents.executeJavaScript(`(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        for(let i=0; i<50 && !document.querySelector('h1'); i++) await wait(100);
        if(!document.querySelector('h1')) throw Error('Initial screen did not render');
        await window.director.invoke('createCampaign', {name:'Desktop smoke test'});
        await wait(100);
        const pages = [...document.querySelectorAll('[data-page]')].map(x=>x.dataset.page);
        for(const page of pages) { document.querySelector('[data-page="'+page+'"]').click(); await wait(30); if(!document.querySelector('h1')) throw Error('Page failed: '+page); }
        return {pages:pages.length, preload:true, campaign:true};
      })()`);
      console.log("DESKTOP_SMOKE_OK " + JSON.stringify(result));
      globalShortcut.unregisterAll();
      await service.close();
      window.destroy();
      app.exit(0);
    }
  } catch (e) {
    if (smokeTest) {
      console.error(e);
      app.exit(1);
      return;
    }
    dialog.showErrorBox("Dungeon Director could not start", e.message);
    app.quit();
  }
});
app.on("second-instance", () => {
  window?.show();
  window?.focus();
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  service?.close();
});
