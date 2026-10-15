# 수식로드 시네마틱 디자인

Built-in image generation (`image_gen`) was used for the title artwork and stone material. The supplied television screenshot was a visual reference. Interactive cards, road directions, numbers and board remain code-rendered for accuracy.

## Saved assets

- `public/art/formula-road-title.png`: original generated title artwork.
- `public/art/formula-road-title.webp`: web delivery version, 217,468 bytes.
- `public/art/charcoal-stone.png`: original generated stone material.
- `public/art/charcoal-stone.webp`: web delivery version, 83,388 bytes, 768 × 768.

Sharp was used only for web compression/resizing. Original PNG images are retained.

## Exact prompt: title artwork

Use case: stylized-concept. Create a production-quality wide cinematic title artwork for a Korean classroom math mystery game website called 수식로드. The attached image is STYLE REFERENCE ONLY, not an edit target. Take inspiration from its weathered charcoal stone, crimson geometry, antique paper typography and distant mansion silhouettes. Compose a sophisticated 16:9 landscape title screen, charcoal-black distressed stone wall filling background, fine crimson geometric road lines extending from upper center towards the corners, very subtle warm light at top center, a distant old manor and palm silhouettes along the bottom edge, atmospheric dark maroon haze. Center a wide irregular torn ivory paper strip, realistic subtle paper fibers and shadow, on which the exact Korean text '수식로드' is painted in large sophisticated dark-crimson calligraphic serif strokes, perfectly legible and spelled exactly 수 식 로 드. Just above the paper in modest elegant ivory serif capitals write exactly 'FORMULA ROAD'. Premium cinematic television puzzle challenge art, restrained drama, exquisite material detail, deep blacks, a hint of antique silver. Keep all typography inside center 65% width and center 50% height so it survives responsive cropping. No people, no gore, no blood splatters, no TV network logos, no watermarks, no extra words, no buttons, no interface screenshot. Deliver a complete high resolution landscape raster artwork ready for a website hero.

Reference: user attachment `codex-clipboard-250f7642-602f-4a8c-9ea3-cd7be9d5ab95.png`. Transparency: false.

## Exact prompt: stone material

Use case: stylized-concept. Asset type: background material texture for a premium Korean mathematics mystery game website. Generate a square, uniformly lit, very dark charcoal slate and weathered black plaster material photographed straight on, exquisitely subtle stone grain and hairline scratches, restrained dusty warm silver patina at low contrast. Matte tactile cinematic game-table surface, almost black (#141313 to #262321), neutral dark grey with faint warm undertone. Flat even lighting, seamless edges if possible. NO writing, no symbols, no borders, no vignette, no cracks larger than hairlines, no objects, no blood, no red accents. This is a subdued raster surface texture behind legible user interface text, not a scene. High quality sophisticated natural material detail, large scale subtle grain.

No reference image. Transparency: false.

## Integration and checks

- Dark stone, ivory text and crimson accents across setup, teacher, student and tablet board screens.
- Black cards with white upper-right numbers and thin crimson roads, including AR reward rendering.
- Responsive home-page checks at desktop and phone widths, plus teacher AR setup screen.
- Existing AR tracking, math image question, wrong/correct answer gates, exclusive collection and exact-100 board flow tested locally with zero browser errors. Real-device outdoor tracking conditions remain dependent on lighting and target quality.
## 수식판·카드와 모둠 연습판 업데이트

Built-in image generation (`image_gen`) created two additional assets. Originals are retained in `design/board-tray.png` and `design/card-slate.png`; web-ready files are `public/art/board-tray.webp` (1200 square) and `public/art/card-slate.webp` (512 square). Sharp only resized/compressed the generated raster images. Numbers and connecting roads are rendered in code so card rules stay exact.

### Board prompt

Use case: stylized-concept. Asset type: square production raster background for a premium Korean mathematics mystery board game website. Create a perfectly orthographic top-down square game board tray, filling the whole image edge to edge, no perspective and no surrounding table. Dark almost-black obsidian and charcoal slate central playing surface occupying the inner 88 percent, completely empty and uniformly subdued, very fine tactile stone grain. Around the outer 6 percent on each side is a beautifully crafted narrow antique pewter and muted bronze frame, double beveled rim, engraved delicate geometric corner ornaments, tiny restrained crimson enamel inlays, luxurious physical tabletop craftsmanship. Four corners are crisp and square, symmetric, slightly worn believable materials. Moody cinematic light but center must be evenly lit. A subtle burgundy undertone, charcoal black, warm silver and faded bronze, no bright gold. This image will sit behind a real 6 by 6 interactive grid drawn by code. NO grid, NO squares inside, NO numbers, NO letters, NO tokens, NO roads, NO objects, NO symbols in the center, NO watermark, NO blood. High fidelity material detail. Keep the inner playing area quiet enough for clear readable cards and UI.

### Card prompt

Use case: stylized-concept. Asset type: production game card face material for a Korean cinematic math puzzle website. A single square black game tile viewed exactly orthographically straight from above, filling the image edge to edge, no perspective, no surroundings, no cast shadow outside. The entire square is a finely crafted blackened metal and dark slate tile, a thin exquisitely beveled antique silver rim at the very edge and tiny restrained engraved corner flourishes, faint burgundy reflected highlights, luxurious tactile worn material. The central 90 percent is almost-black low contrast slate with delicate natural grain, clean empty space. The upper right quadrant must be quiet and dark to hold a large white number later. This asset will have red roads and white numbers rendered on top by software. NO writing, NO numbers, NO letters, NO road lines, NO symbols, NO logos, NO watermark, NO blood, NO central ornament. Sophisticated premium television mystery game prop, crisp square silhouette, realistic material detail, balanced soft illumination.

Both calls used no image reference and `transparent_background: false`.

### Typography

Site text uses locally hosted Nanum Myeongjo Regular and Bold, visually matching the serif/calligraphic direction of the raster title. The title art itself is not an installable font. Fonts downloaded from the [official Google Fonts repository](https://github.com/google/fonts/tree/main/ofl/nanummyeongjo). Original TTFs are retained under `design/fonts/`; WOFF delivery files and the unmodified SIL OFL license are in `public/fonts/`. FontTools compressed the TTF files into WOFF with no glyph edits.

### Practice mode

Students open their own practice board from their inventory or AR screen. Teachers can inspect each team's practice board. Practice uses only owned cards and the same exact-arithmetic road validator, persists separately as optional team draft fields for compatibility with existing classes, and has an optimistic version check to prevent overwriting another device's newer draft. It does not change the official board, solving timer, result or searching state. A cloned class starts with empty practice boards.
