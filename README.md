# RCC Calculator

A mobile-friendly web app that works offline. It calculates **concrete materials** and **TMT steel** for slabs, beams and pillars/columns, and adds them up into a project bill of materials.

No frameworks and no build step. It is plain HTML, CSS and JavaScript.

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install.

```bash
git clone https://github.com/jubin-ts/RCC-calculator-.git
cd RCC-calculator-
git checkout claude/rcc-calculator-app-lakt7f   # until this branch is merged
npm start
```

Then open **http://localhost:8080** in your browser. To use a different port, run `PORT=3000 npm start`.

To test on your phone, connect it to the same Wi-Fi and open `http://<your-computer-ip>:8080`.

> You don't strictly need Node. You can also double-click `index.html` to open it. Offline/install support only works when the page is served over http(s), for example with `npm start`.

Run the calculation tests:

```bash
npm test
```

## Features

### 1. Concrete calculator
- Grades **M25 (1:1:2), M20 (1:1.5:3), M15 (1:2:4), M10 (1:3:6)**, or a custom ratio
- Input: volume in **m³**, or length × width × depth × quantity
- Output: **cement (bags + kg)**, **fine aggregate (cft)**, **coarse aggregate (cft)**, **water (litres)**
- Advanced: water-cement ratio, wastage %, dry volume factor

### 2. TMT bar calculator
| Member | Inputs |
|---|---|
| **Slab** | length, width, thickness (m), clear cover (cm), one way / two way, bar dia for the shorter and longer span (mm), spacing (m), optional cranked bars |
| **Beam** | length, width, depth (m), cover, top bar dia + number, bottom bar dia + number, stirrup dia (mm) + spacing (m), number of beams |
| **Pillar / Column** | rectangular or circular, size, height, clear cover (cm), number + dia of bars, stirrup dia + spacing, number of columns |

Each result shows:
- the total steel in kg and tonnes, and the steel weight for every bar diameter
- the number of **12 m bars to order**
- a bar schedule: number of bars, cutting length, total length and weight
- stirrup cutting length using the standard bend and hook deductions
- the concrete volume of the member, with its cement, sand, aggregate and water
- **IS 456 checks**: one-way vs two-way slab (Ly/Lx), maximum bar and stirrup spacing, column steel % (0.8 to 4 %), minimum number of bars, and tie diameter

### Extra features
- **Project estimate**: add any result to a project to get a combined bill of materials (cement, sand, aggregate, water, and steel by diameter). You can export it to **CSV**, share it, or print/save it as PDF.
- **Cost estimate**: enter local rates (cement per bag, sand and aggregate per cft, steel per kg) and every result shows the cost
- **Share / Copy** results, which is handy for WhatsApp
- **Unit converter**: length, area (including gunta and acre), volume (m³, cft, brass, litre) and weight
- TMT bar weight chart and a nominal mix reference table
- Results update live as you edit the inputs
- Dark mode, saved data stays on the device, and the app can be installed to the home screen and used offline

## Formulas used

| Item | Formula |
|---|---|
| Dry volume | wet volume × 1.54 |
| Cement (bags) | dry vol × c/(c+s+a) × 1440 ÷ 50 |
| Sand / aggregate (cft) | dry vol × part/(c+s+a) × 35.3147 |
| Water (L) | cement kg × w/c (M25 0.45, M20 0.50, M15 0.55, M10 0.60) |
| Steel weight | d² / 162 kg/m |
| No. of bars / stirrups | (length − 2 × cover) ÷ spacing + 1 |
| Rect. stirrup | 2(a + b) + 2×10d − 3×2d − 2×3d, a = B − 2c − d, b = D − 2c − d |
| Circular tie | π(D − 2c − d) + 14d |
| Crank | + 0.42 D per bend (alternate bars, both ends) |

These results are estimates for planning and ordering. Always follow the structural drawings and the bar bending schedule.

## Project structure

```
index.html            UI
css/styles.css        styles (light/dark, print)
js/calc.js            calculation engine (pure functions, unit-tested)
js/app.js             UI logic, saving, sharing, converter
sw.js                 offline cache
manifest.webmanifest  install-to-home-screen metadata
server.js             zero-dependency local server (npm start)
tests/calc.test.js    tests for the calculations
```
