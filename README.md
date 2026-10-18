# DNDStreaming — Dungeon Director

A local Windows desktop companion for running streamed tabletop RPG sessions alongside OBS Studio. Version 0.1.0 is an early working build, not a finished production broadcast system.

## Install / build on Windows

Use the `Dungeon-Director-Setup-0.1.0.exe` installer when available. The initial installer is unsigned. All core runtime features are local; downloading development dependencies requires internet.

To build from source, install Node.js 24 (64-bit), then run in this directory:

```powershell
npm ci
npx install-electron
npm test
npm run dist:win
```

The installer is created in `dist/`. Run the app during development with `npm start`. Electron 44 installs its runtime separately through `install-electron`; this step is needed for development, not for users of the packaged installer.

The **Windows installer** GitHub Actions workflow builds and uploads the installer. It can be run manually from the repository's Actions tab; pushes also run the build. No signing certificate or cloud account is needed for the local app.

## First session

1. Create a campaign. New campaigns start in rehearsal.
2. In OBS, open **Tools → WebSocket Server Settings**, enable the server, and note its port and password. In the app's Settings, connect to `ws://127.0.0.1:4455` (or your configured port). The password is held in memory, not written to campaign files.
3. Configure break and emergency privacy scenes, and the exact input names to mute.
4. Add an OBS Browser Source using `http://127.0.0.1:18765/overlay`, with a 1920 × 1080 canvas. Keep the app running. The local port is stable between app launches.
5. Import your images and local audio files. Configure output devices and verify their capture in OBS.
6. Add characters, notes, combatants, cues, and your running order. Audience cards start disabled.
7. Run the pre-stream checks. Check actual microphone meters, headphones, audio destinations, and the OBS program output yourself.
8. Rehearse, inspect reveals, then arm live controls. Hotkeys execute immediately when triggered.

## Implemented areas

- Session dashboard, OBS scenes and recording controls, connection / stream / recording status.
- Global shortcuts, conflict feedback, ordered multi-action cues with step history and failure reporting.
- Rehearsal mode, preview-and-reveal dialog, emergency privacy pause, break countdown, undo into rehearsal.
- Private campaign notes, NPC voice / pronunciation / relationship reminders, session-zero boundaries, consent notes, house rules, searchable notebook.
- Party cards, player attendance, public names, health visibility, custom conditions, spotlight tracking.
- Initiative, rounds, damage / healing / temporary HP, concentration reminders, saved encounters.
- Local dice with modifiers, advantage / disadvantage, saved expressions, private or public results.
- Managed media, layered and looping audio, ordered playlists, fades, ducking, per-destination output devices, image cropping, WAV trimming and gain adjustment, rights and credit metadata.
- Image battle maps, grid-based fog reveals, positioned tokens, audience display window.
- Running order, attached cues, completion tracking, session timeline and text export, highlight markers.
- Atomic workspace saving, automatic rotating snapshots, damaged-workspace recovery, campaign ZIP-based exports with managed media, non-destructive imports.
- Optional token-protected local-network producer controls, disabled by default.
- Reduced motion, keyboard focus indicators, scalable interface, reduced-animation performance mode.

## Important behaviour and current limits

- This is an alpha. Live OBS operation, Windows global hotkeys, hardware audio outputs, multi-monitor behaviour, and installation still require testing on an actual Windows streaming PC.
- An OBS failure cannot undo OBS actions that already completed. Cue errors identify the step that failed. Privacy pause cancels subsequent cue steps, but cannot retract an OBS request already sent or a secret viewers already saw.
- Arming live controls discards rehearsed title / portrait changes and requires maps to be explicitly published again. Entering rehearsal holds audience output; it does not stop an existing stream or automatically mute existing OBS sources. Rehearsal audio routes to the selected DM device. Verify that OBS is not capturing this output if it must remain private.
- Undo restores local data and enters rehearsal; it does not rewind OBS, un-reveal information, or undo sound already played.
- Resume clears the local pause screen; it deliberately does not unmute microphones or choose a return scene. Restore these explicitly in OBS / scene controls.
- Maps use rectangular cell reveals and percentage-position tokens. They are not a full VTT, rules engine, dynamic-lighting system, or automated character-sheet integration. The map image stretches to the audience canvas; use matching aspect ratios.
- D&D rules and paid books / art / music are not bundled. The app accepts user-owned media and custom rules notes.
- Separate audio destinations require separate physical or virtual output devices and OBS capture configuration. No audio driver is installed. Media playback is performed by the desktop app; the visual overlay does not replay audio, avoiding duplicate playback.
- Producer controls use HTTP on a trusted LAN and a rotating bearer link. Anyone with the link can trigger the limited allowed controls. Do not expose the port to the internet. The full DM workspace and media are not served by the LAN control endpoint.
- The application does not auto-update during sessions. Updates are manual; export campaigns before installing a newer build. Automatic schema migration and rollback installers are not implemented.
- Cue and shortcut editing use visual forms. Basic overlay accent/panel colours, font size, and initiative position are configurable. Full drag-and-drop overlay layout editing, chat integrations, and automatic OBS reconnection remain follow-up work.

## Data and security model

On Windows the workspace is under `%APPDATA%/dungeon-director/` (Electron's application data directory). It contains `workspace.json`, managed `media/`, and rotating `backups/`. Campaign exports have the `.ddcampaign` extension and are ZIP archives with campaign data and media. Treat exports as private DM material.

The main UI uses Electron context isolation, sandboxing, a narrow IPC bridge, no Node integration, blocked navigation, and a restrictive content security policy. The overlay service binds to loopback only; the separately enabled producer endpoint exposes limited controls and no notes. Public output is projected from explicit audience fields, excluding notes, hidden enemies, private conditions, absent characters, and tokens inside fog.

## Development checks

```powershell
npm test
npm run test:ui
npm run test:desktop
npm run preview
```

The browser preview is a development aid with a private API token and temporary port. File dialogs, native hotkeys, output-window handling, and device routing should be checked in the Electron app. It is not the Windows executable.

## Version 0.2 streaming workflow

1. Start Dungeon Director and OBS. Under OBS → Tools → WebSocket Server Settings, enable the server; connect in **Settings & checks**.
2. Under **Show preparation**, choose **Add overlay source to OBS**, select a scene and confirm. Alternatively add a Browser Source yourself, 1920 × 1080, using `http://127.0.0.1:18765/overlay`.
3. **Enable OBS output** in the header. Rehearsal holds existing output; publishing a map, reveal or public roll explicitly offers to enable output.
4. For dice alone, use `http://127.0.0.1:18765/dice`. In **Combat & dice**, enter an expression and a public NPC/monster label, then check **Animate this roll for viewers in OBS**. The animation settles on the server's actual result and clears after 14 seconds. Reconnecting does not replay expired rolls.
5. For maps alone, use `http://127.0.0.1:18765/battlemap`. Choose a map from **Starter maps & tokens**, place tokens, reveal cells, then publish. Imported starter maps begin private, with all cells revealed in the DM preview. Tokens begin hidden and remain concealed under fog.
6. Keep the app open during the stream. Empty sources are transparent. Disable OBS's **Shutdown source when not visible** option. Place the source above any full-screen camera or game source.

The starter tokens are original, editable generic SVG portraits with the exact included species/lineage names listed in the app. They are not official D&D artwork and do not include game statistics. Creature tokens are generic fallbacks. Additional homebrew species can use imported portraits. Bundled artwork may be used in your campaigns and streams.

OBS reconnects automatically after a connection loss. Failed actions are never queued or replayed. Credentials remain only in memory. Privacy pause stops local audio, clears audience content and attempts the configured OBS privacy scene/mutes even when rehearsal is holding output. Resume does not unmute microphones.

### Portable ZIP

Extract the entire portable ZIP into a writable folder and run **Start-Portable.cmd**. On first launch choose data beside the app or a custom folder. Keep the full extracted folder together; the executable depends on its bundled files. Normal installed launches continue to use the Windows profile data folder. To move an existing campaign, export/import it rather than deleting its old data. Advanced users can set `DIRECTOR_DATA_DIR` to an explicit data directory.

**Show preparation → Arrange overlay** lets you drag layer positions and enter exact sizes or hide layers. Separate `/dice` and `/battlemap` sources retain their dedicated full-source layouts. In Settings, the shortcut test checks global hotkeys and keyboard-emulating foot pedals without triggering cues for 60 seconds. Privacy pause is always active.
