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
- Managed media, layered and looping audio, fades, ducking, per-destination output devices, image cropping, WAV trimming and gain adjustment, rights and credit metadata.
- Image battle maps, grid-based fog reveals, positioned tokens, audience display window.
- Running order, attached cues, completion tracking, session timeline and text export, highlight markers.
- Atomic workspace saving, automatic rotating snapshots, damaged-workspace recovery, campaign ZIP-based exports with managed media, non-destructive imports.
- Optional token-protected local-network producer controls, disabled by default.
- Reduced motion, keyboard focus indicators, scalable interface, reduced-animation performance mode.

## Important behaviour and current limits

- This is an alpha. Live OBS operation, Windows global hotkeys, hardware audio outputs, multi-monitor behaviour, and installation still require testing on an actual Windows streaming PC.
- An OBS failure cannot undo OBS actions that already completed. Cue errors identify the step that failed. Privacy pause cancels subsequent cue steps, but cannot retract an OBS request already sent or a secret viewers already saw.
- Entering rehearsal holds audience output; it does not stop an existing stream or automatically mute existing OBS sources. Rehearsal audio routes to the selected DM device. Verify that OBS is not capturing this output if it must remain private.
- Undo restores local data and enters rehearsal; it does not rewind OBS, un-reveal information, or undo sound already played.
- Resume clears the local pause screen; it deliberately does not unmute microphones or choose a return scene. Restore these explicitly in OBS / scene controls.
- Maps use rectangular cell reveals and percentage-position tokens. They are not a full VTT, rules engine, dynamic-lighting system, or automated character-sheet integration. The map image stretches to the audience canvas; use matching aspect ratios.
- D&D rules and paid books / art / music are not bundled. The app accepts user-owned media and custom rules notes.
- Separate audio destinations require separate physical or virtual output devices and OBS capture configuration. No audio driver is installed. Media playback is performed by the desktop app; the visual overlay does not replay audio, avoiding duplicate playback.
- Producer controls use HTTP on a trusted LAN and a rotating bearer link. Anyone with the link can trigger the limited allowed controls. Do not expose the port to the internet. The full DM workspace and media are not served by the LAN control endpoint.
- The application does not auto-update during sessions. Updates are manual; export campaigns before installing a newer build. Automatic schema migration and rollback installers are not implemented.
- Cue and shortcut editing in the first build includes advanced structured configuration. Additional polished editors, theme/layout editing, audio playlists, chat integrations, and automatic reconnection remain follow-up work unless explicitly added in a later commit.

## Data and security model

On Windows the workspace is under `%APPDATA%/dungeon-director/` (Electron's application data directory). It contains `workspace.json`, managed `media/`, and rotating `backups/`. Campaign exports have the `.ddcampaign` extension and are ZIP archives with campaign data and media. Treat exports as private DM material.

The main UI uses Electron context isolation, sandboxing, a narrow IPC bridge, no Node integration, blocked navigation, and a restrictive content security policy. The overlay service binds to loopback only; the separately enabled producer endpoint exposes limited controls and no notes. Public output is projected from explicit audience fields, excluding notes, hidden enemies, private conditions, absent characters, and tokens inside fog.

## Development checks

```powershell
npm test
npm run preview
```

The browser preview is a development aid with a private API token and temporary port. File dialogs, native hotkeys, output-window handling, and device routing should be checked in the Electron app. It is not the Windows executable.
