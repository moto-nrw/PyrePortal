# Device bezels

Frames for the product screenshots. `frame.ts` puts the raw image under the
bezel; `devices.ts` holds each bezel's size and its screen rectangle.

| File                   | Device                                    | Bezel size | Screen rectangle (left, top, width, height) |
| ---------------------- | ----------------------------------------- | ---------- | ------------------------------------------- |
| `gkt-tablet.png`       | GKT kiosk with NFC reader                 | 1688×1390  | 109, 113, 1472, 908                         |
| `ipad-pro-11-quer.png` | iPad Pro 11" (M5), Space Black, landscape | 2640×1880  | 110, 106, 2420, 1668                        |

- `gkt-tablet.png` comes from moto's Canva design "Mockup-Vorlage-Tablet",
  exported as 2000×2000 PNG without background. The grey screen area was
  punched out by brightness with a soft edge, because the screen in the source
  image is slightly skewed (2-4 px over its height), and the image was cropped
  to the device.
- `ipad-pro-11-quer.png` is the official Apple Product Bezel, byte-identical to
  `frontend/scripts/product-screenshots/bezels/ipad-pro-11-quer.png` in
  project-phoenix. Apple's guidelines do not allow changing it.

The screen rectangle is the transparent area of the bezel. A different image
under the same name fails `frame.test.ts`, because size or screen no longer
match. To add a bezel: copy the file here, add size and screen rectangle to
`devices.ts`, run `pnpm exec vitest run screenshots/`.
