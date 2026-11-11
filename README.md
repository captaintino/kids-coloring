# Color Splash Party 🎨

A bright, happy coloring game for kids, built for phones and tablets. It has 36 simple pictures
to color: animals, nature, yummy food and fun stuff like rockets, trains and castles.

It's an installable **Progressive Web App**: once it has loaded, it works fully offline.

## Coloring modes

- 🪣 **Tap & Fill**: pick a color and tap a part of the picture. The color splashes in from where you tapped.
- 🖌️ **Paint**: paint with a brush (thin, medium or fat). The brush stays inside the lines of the part
  where you started, so it always looks neat. You can switch between the brush and the fill bucket at any time.
- 🔢 **Color by Number**: each part shows a number. Pick the matching numbered color and tap. If you pick
  the wrong one, the number wiggles, and after two tries the right color bounces to help.
- ✨ **Magic Reveal**: the picture starts blank. Rub it with your finger and the real colors appear, with sparkles!

Tap & Fill and Paint also have **magic paints**: rainbow, glitter, polka dots, candy stripes and stars.

**Themes:** pick a world for the background: Paint Party (its colors change with each mode), Under the Sea,
Wild West, Knights & Castles, or Outer Space. Each one has a few moving details (fish, a tumbleweed,
waving flags, a rocket...). The worlds are shared with the Bubble Pop Party game.

Other things you can do:
- ↩️ Undo, and 🗑️ start a picture over.
- 📷 Save your picture as a PNG (on phones this opens the share sheet, so you can save it to Photos;
  on older iPads you press and hold the picture and tap *Save Image*).
- Your coloring is saved on the device, so you can come back to it later. Finished pictures get a ⭐.

## Tech

- No build step and no dependencies: plain HTML, CSS and ES modules.
- Pictures are SVG shapes defined in `js/pictures.js`. Every part you can color is its own shape, so
  tapping fills exactly that part, and brush strokes are clipped to it.
- Color by Number finds the roomiest spot in each part for its number automatically
  (a small distance-transform pass in `js/art.js`). Parts too small for a number are colored in for you.
- The animated background and confetti are drawn on `<canvas>`.
- All sounds are made live with the Web Audio API, so there are no audio files.
- The [Fredoka](https://github.com/hafontia/Fredoka-One) font is included in `fonts/` (SIL Open Font License), so it works offline.
- `sw.js` caches every file the first time the app loads.
- Works back to iOS 12 / Safari 12 (e.g. the original iPad Air): touch-event fallback when Pointer Events
  are missing, no newer JS/CSS syntax (`??`, `?.`, `clamp()`, flex `gap`, `inset`, `aspect-ratio`), and on
  older iPads the 📷 button shows the picture so it can be saved with a long press.
- Made for phones and tablets in both orientations: the palette resizes to fit the screen, Android's back
  button steps back through the screens instead of closing the app, and in Color by Number a tap near a
  tiny numbered part still counts.
- Built to stay smooth on older tablets: background blobs are pre-drawn sprites, the background canvas
  runs at 1x resolution, and the effects layer has a pixel budget and sits idle when nothing is moving.

### Adding a picture

Add an entry to `PICTURES` in `js/pictures.js`. Shapes are drawn in order on a 400 × 400 sheet:

```js
{
  id: 'balloon', name: 'Balloon', cat: 'things',
  shapes: [
    BG('sky'),                         // background you can color
    S(ellipse(200, 170, 80, 100), 'red'), // a colorable part, with its "real" color
    ...eye(200, 160, 8),               // fixed ink details
    D('M200 270V380'),                 // a fixed line (the string)
  ],
}
```

## Hosting on GitHub Pages

1. Go to **Settings → Pages** in this repository.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, then pick `main` and the `/ (root)` folder.
3. The game will be published at `https://<user>.github.io/kids-coloring/`.

Every path is relative, so the game works from a subfolder like this. Pages serves it over HTTPS,
which service workers need.

**Installing it:** open the page on your phone or tablet.
- Android/Chrome: tap the **Install** button on the title screen, or use *Add to Home screen* in the menu.
- iPhone/iPad: Safari has no install prompt, so the **Install** button shows step-by-step instructions
  (Share, then **Add to Home Screen**). Once the game is opened from the home screen, the button hides itself.

### Updating

When you change any file, raise `VERSION` in `sw.js` (for example `v1` to `v2`).
Installed copies will then download the new files. If you add a new file, add it to the `ASSETS` list in `sw.js` too.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Service workers work on `localhost` without HTTPS.
