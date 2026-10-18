# Original starter artwork

The maps were generated for Dungeon Director with the built-in image generation tool. No official D&D artwork was used. Bundled artwork may be used in campaigns and streams. Images are WebP exports of the generated originals, optimized at quality 85. The generic tokens are original editable SVG portraits produced by `scripts/build-tokens.py`.

Map prompt set: `map-scenes.json` records each scene. Each scene used this shared specification:

> Use case: stylized-concept. One detailed D&D encounter battle map: [scene]. Landscape 3:2 1536x1024, strict 90 degree overhead orthographic top down, finely detailed painterly realistic terrain and materials, broad playable spaces and legible tactical routes. No people, creatures, grid, labels, text, border or watermark.

The dockside warehouse was generated in the preceding development session using the same top-down, detailed, gridless specification. Species names were checked against https://www.dndbeyond.com/species on 2026-10-18. This library covers named official species and selected lineages with generic portraits; it does not include every cosmetic variant, homebrew, third-party species, or monster. It contains no official rules text or stat blocks.
