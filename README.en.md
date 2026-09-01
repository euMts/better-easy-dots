<p align="center">
  <img src="icons/easy-easy-dots.png" alt="Better Easy Dots" width="128">
</p>

<h1 align="center">Better Easy Dots</h1>

<p align="center">
  <strong>Chrome</strong> and <strong>Firefox</strong> extension that improves time-clock registration on <strong>Easydots</strong> (<code>sys.easydots.com.br</code>).
</p>

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/README-Português_(BR)-green" alt="README in Portuguese"></a>
  <img src="https://img.shields.io/badge/version-1.9.0-purple" alt="Version 1.9.0">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-supported-green" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-supported-orange" alt="Firefox">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="MIT License"></a>
</p>

---

## About

**Better Easy Dots** is an unofficial extension that adds visual and productivity features to the Easydots time registration page. Everything runs in your browser: settings and calculations are stored in the extension's local storage, with no data sent to external servers.

> **Disclaimer:** this extension is not affiliated with, endorsed by, or maintained by Easydots or ACS Pontodigital.

## Features

### Daily balance

Shows a row at the bottom of the records table with the day's hour balance:

- **Incomplete day:** shows how much work time is still missing (e.g. only clock-in → `-09:00:00`)
- **Complete day:** accounts for worked hours, expected schedule, and punch punctuality
- **Not configured:** displays a reminder to set your schedule via the gear icon

### Time colors

Each recorded time is colored according to your configured tolerance:

| Color | Meaning |
|-------|---------|
| Green | Within expected range |
| Yellow | Near the tolerance limit |
| Red | Late beyond tolerance |

### Punch suggestions

While the day is incomplete, **suggestion** rows show the next expected punches (clock-in, lunch break, etc.), adjusted for any delay on the first clock-in of the day.

### Settings

Dedicated page (`settings.html`) accessible via:

- Gear icon in the Easydots navbar
- Extension popup → **Settings**
- Browser options page (Chrome / Firefox)

Configurable fields:

| Field | Description | Default |
|-------|-------------|---------|
| Clock-in | Workday start time | `08:00` |
| Clock-out | Workday end time | `18:10` |
| Break start | Lunch break start | `12:00` |
| Break end | Lunch break end | `13:30` |
| Late tolerance | Accepted minutes on clock-in | `5` |
| Easydots URL | Your company's URL | Auto-detected |

The Easydots URL is detected from the page you use — you do not need to be on `/site/login`.

### Icon badge

The extension icon in the browser toolbar shows the number of records for the day when an Easydots tab is open.

---

## Screenshots

### Punch suggestion and balance outside tolerance

**Difference** column, status colors, and a clock-out suggestion with raw balance outside tolerance:

<p align="center">
  <img src="screenshots/en/1.jpg" alt="Records table with clock-out suggestion and daily balance outside tolerance" width="720">
</p>

### Complete day within tolerance

Four recorded punches and a daily balance cleared after applying daily tolerance:

<p align="center">
  <img src="screenshots/en/2.jpg" alt="Records table with a complete day and balance within tolerance" width="720">
</p>

### Settings

Work hours, break times, daily tolerance, safety margin, and language:

<p align="center">
  <img src="screenshots/en/3.jpg" alt="Better Easy Dots settings page" width="720">
</p>

---

## Installation

### Development — Chrome

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project root folder

### Development — Firefox

1. Clone or download this repository
2. Run `npm run firefox:dev`
3. Open `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on…**
5. Select `load-in-firefox/manifest.json`

Details: [`docs/firefox.md`](docs/firefox.md).

### Chrome Web Store

[Chrome Web Store](https://chromewebstore.google.com/detail/better-easy-dots/cfnehkkbmplomaianjpfiaoonmpekbbb)

### Firefox Add-ons (AMO)

Listing pending. After the first publish, the URL lives in `config.js` (`EED_FIREFOX_STORE_URL`).

### Package for the stores

```bash
npm install
npm run package
```

Creates:

- `builds/better-easy-dots-chrome-vX.Y.Z.zip`
- `builds/better-easy-dots-firefox-vX.Y.Z.zip`

Each ZIP has `manifest.json` at the archive root and passes automatic validation. Follow [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) before uploading.

```bash
npm run package:chrome    # Chrome only
npm run package:firefox   # Firefox only
npm test                  # validate:json + package
npm run lint:firefox      # package Firefox + web-ext lint
```

---

## Quick start

1. Install the extension and open your company's Easydots
2. Click the **better easy dots** gear in the navbar (or open the popup → **Settings**)
3. Enter your work hours, break times, and tolerance
4. Click **Save**
5. In the records table, see colors, suggestions, and the daily balance

---

## Project structure

```
better-easy-dots/
├── manifest.json                 # Chrome (dev, with localhost)
├── manifest.prod.json            # Chrome (store)
├── manifest.firefox.json         # Firefox (dev)
├── manifest.firefox.prod.json    # Firefox (AMO)
├── browser-compat.js             # Shared chrome/browser bridge for Chrome + Firefox
├── config.js                     # Store URLs + default Easydots URL
├── background.js                 # Badge, open settings/changelog
├── content.js                    # Logic on the Easydots page
├── scripts/
│   ├── package-extension.js
│   └── validate-extension-package.js
├── .github/workflows/            # CI + Release
├── docs/
│   └── firefox.md
└── …
```

The `website/` folder contains a local mirror of the Easydots page for testing with Live Server (`127.0.0.1:5500`) and **must not** be included in the production package. Generated `dist/` and `builds/` folders are gitignored.

---

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Save schedule and Easydots URL locally |
| `tabs` | Find an open Easydots tab to update the badge |
| `windows` | Focus the window when reopening settings/changelog (Chrome permission; permissionless API in Firefox) |
| `*.easydots.com.br` | Inject enhancements on the page you already opened |
| `*.acspontodigital.com.br` | Legacy domain compatibility |

No data is sent to extension servers.

---

## Privacy

- Settings stored only in the extension's local storage on your device
- The extension reads the records table **only** on the Easydots tab you opened
- No analytics, telemetry, or user accounts
- No access to sites other than those configured in the manifest

---

## Compatibility

- **Browsers:** Google Chrome and Mozilla Firefox (Manifest V3)
- **Sites:** `https://*.easydots.com.br/*` (default: `https://sys.easydots.com.br/`), `https://*.acspontodigital.com.br/*` (legacy)
- **Current version:** `1.9.0`
- **Gecko ID:** `better-easy-dots@matheuspass.dev`

The extension depends on the current Easydots HTML structure (`#table_registro_horario`, `#btnRegister`, navbar). Site updates may require selector adjustments.

Every new implementation must keep Chrome and Firefox in parity: same UI, same styles, same functionality, and validation in both packages. Asynchronous browser APIs must go through `browser-compat.js`.

---

## Contributing

1. Fork the repository
2. Create a branch for your change
3. Test on real Easydots or the local mirror in Chrome and Firefox
4. Open a pull request describing the change

---

## License

Distributed under the [MIT License](LICENSE).
