# NutriLongevity AI

An evidence-based nutrition app that builds and improves personalised meal plans for healthy ageing, heart and metabolic health, gut health and diet quality. It runs as a mobile-first installable web app (PWA), in English and Hebrew (full RTL), with light and dark themes.

> NutriLongevity AI gives general nutrition information. It does not diagnose or treat any condition and does not replace a physician or registered dietitian.

## Quick start

```bash
cd nutrilongevity
npm install            # one dependency: @anthropic-ai/sdk
npm start              # http://localhost:3000
npm test               # 20 unit + API integration tests
```

Requires **Node.js ≥ 22.5** (it uses the built-in `node:sqlite`).

| Environment variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the Claude assistant and label-photo reading. Without it the assistant runs a rule-based offline mode. |
| `NL_MODEL` / `NL_EFFORT` | Override the model (default `claude-opus-5-5`) and effort (default `medium`). |
| `FDC_API_KEY` | Adds live USDA FoodData Central search and enables `npm run sync-usda`. |
| `NL_DB` | SQLite file path (default `data/nutrilongevity.db`). |
| `PORT`, `NODE_ENV=production` | Port. Production mode sets `Secure` cookies, so serve it over HTTPS. |

To install it on Android, open the site in Chrome and choose **Add to Home screen**. Barcode scanning uses the camera through the browser `BarcodeDetector` API, which Chrome on Android supports. In other browsers you can type the barcode instead.

## Published version on claude.ai

`npm run build:artifact` bundles the whole app into `dist/nutrilongevity.html`, with `public/js/api.js` swapped for `artifact/api.js`. That file answers the same API routes inside the page, using the same shared modules. The published page:

- stores each signed-in person's data privately in the artifact database (`data/users/<id>/`), so it follows them across devices
- uses Claude through the page's `sample` capability for the assistant and for reading label photos
- exports data through the `downloads` capability
- uses claude.ai sign-in instead of email/password accounts

Not available there: barcode lookup (no camera access, and Open Food Facts can't be reached from the page) and live USDA search. The self-hosted server version keeps both.

## Features

- **Onboarding and profile.** Collects age, sex, height and weight, activity, strength training, schedule, number of meals, diet, allergies, budget, cooking time, health goals, conditions and medications. You can edit all of it later.
- **Target engine** (`shared/engine.js`):
  - BMR and TDEE from Mifflin–St Jeor
  - Calorie target with safety floors
  - Protein from 1.0 to 1.6 g/kg, chosen by age, training, goal and kidney disease
  - Fat 35% of energy, with carbohydrates making up the rest
  - Fibre at 14 g per 1000 kcal, at least 25 g
  - Limits: saturated fat under 10% of energy, sodium under 2000 mg (1500 mg with hypertension), added sugar under 10% of energy
  - Vitamin and mineral targets from the DRIs, adjusted for pregnancy and breastfeeding

  Every target links to its source.
- **Safety screening.** No calorie deficit is set for people with a history of eating disorders, people who are underweight, or during pregnancy. Plans flag warfarin and vitamin K, kidney disease and potassium, glucose-lowering drugs, MAOIs and tyramine (fermented foods are left out), IBS and FODMAPs, and coeliac disease. Allergens are filtered strictly.
- **Meal planner** (`shared/planner.js`, 39 templates). It builds a 7-day plan with breakfast, lunch, dinner and snacks scaled to your energy target, and balances protein, fibre, plant variety and your preferred eating styles. You can:
  - swap an ingredient for one of equal calories (with nutrient differences shown)
  - change grams by hand
  - replace a whole meal or make it 10% larger or smaller
  - generate a new week
  - save favourites
  - get a shopping list that converts cooked grains to dry weight

  All nutrition is calculated from grams × the per-100 g composition.
- **Longevity dashboard.** Today, week, 28-day trends, NOVA processing share, plant diversity, fruit and vegetables, legumes, whole grains, nuts and seeds, olive oil, polyphenol-rich foods, limits and micronutrients. Each indicator is shown on its own against its reference. There is deliberately no composite "longevity score", because none has been validated.
- **Gut microbiome module.** Tracks fibre amount and sources, prebiotic foods, resistant starch, fermented foods, legumes and whole grains. It explains the mechanism behind each one and labels it *established* or *emerging*.
- **Food scanner:**
  - search the local reference foods, plus Open Food Facts and USDA FDC
  - look up barcodes (Open Food Facts)
  - read label photos with Claude vision, using structured JSON output
  - enter labels manually
  - rule-based NOVA estimate and added-sugar detection that lists the matched ingredients
  - nutrient density using an adapted NRF index
  - side-by-side comparison per 100 g and per 100 kcal, with reasons in plain language
- **AI assistant.** Claude gets your profile, targets, today's meals, your week's results and the food table. It may only cite references from the curated library (`[ref:id]`), and unknown IDs are removed on the server. It must separate association from causation and established from emerging findings. Without an API key, offline answers cover the 7 example questions.
- **Weekly optimisation.** Analyses the last 7 days of logged food (days with nothing logged don't count as zero), finds gaps and excesses, gives suggestions with references, and builds next week's plan weighted towards the foods that close those gaps. Reports are saved.
- **Research library.** Compares 8 nutrition frameworks by strength of evidence and holds 39 references. Each has its DOI, study design, n, findings, strengths, limitations, and whether it shows causation or association. It also includes a guide on how to read the evidence.
- **Platform:**
  - accounts with scrypt passwords and HttpOnly session cookies
  - login rate limiting and CSRF protection
  - SQLite persistence
  - JSON and CSV export
  - account deletion
  - offline app shell through a service worker

## Data provenance: what's measured and what's estimated

| Source | Status label in app | Notes |
|---|---|---|
| USDA FoodData Central SR Legacy (86 foods) | `usda-transcribed` | Analytical reference values typed in by hand, with the exact SR Legacy description stored. FDC was not reachable from the build environment, so run `FDC_API_KEY=… npm run sync-usda` to check them against the API and correct any differences. |
| Typical label values | `label-estimate` | Used only for soy yogurt, which has no USDA entry. |
| Open Food Facts | `label-declared` | Values declared by the manufacturer. NOVA comes from OFF when available, otherwise from our ingredient analysis. |
| Label photo via AI | `ai-extracted` | Transcribed values. You are asked to check them against the label. |
| Polyphenols | marked `≈` | Approximate Phenol-Explorer values (Pérez-Jiménez 2010). Shown only where data exist, with coverage given as a percentage. |

**References.** Every entry is a real publication with a DOI or official URL. Crossref could not be reached during the build, so run `npm run verify-refs` with network access to check every DOI and title automatically.

## Architecture

```
nutrilongevity/
  shared/        Pure ES modules used by BOTH server and browser
    foods.js       food composition table + provenance
    engine.js      BMR/TDEE/targets + safety screening
    nutrition.js   gram-based nutrient math + longevity/gut indicators
    templates.js   meal templates
    planner.js     plan generation, swaps, scaling, shopping list
    nova.js        ingredient/NOVA analysis, NRF density, comparison
    analysis.js    weekly analysis & optimisation signals
    evidence.js    references, frameworks, gut topics
  server/        node:http API, SQLite (node:sqlite), auth, Open Food Facts/FDC, Claude
  public/        PWA: vanilla JS views, SVG charts, i18n (en/he), service worker
  scripts/       verify-refs.mjs, sync-usda.mjs
  test/          node:test unit + API integration tests
```

There is no build step. The browser imports `/shared/*.js` directly, so calculations on the client and the server always match.

## Known limitations

- Food values are hand-transcribed until `sync-usda` has been run, and DOIs are unverified until `verify-refs` has been run (both need network access).
- Meal images are illustrated plates made from ingredient emoji. No stock food photography is bundled.
- Open Food Facts coverage of Israeli products varies, and product data quality depends on whoever contributed it.
- The planner builds menus from curated templates, so variety is limited to 39 meals before ingredient swaps.
