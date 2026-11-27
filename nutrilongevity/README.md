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

## AI Food Analyzer (core feature)

Describe what you ate in Hebrew or English, for example "I ate two slices of pizza and drank a Coca-Cola" or "אכלתי שתי פרוסות לחם מלא עם אבוקדו וחביתה". You can also add a photo.

1. **Recognition.** Claude maps each food to the reference database and estimates amounts, using a JSON schema for the output (`shared/assistant.js`). It splits home-made dishes into their ingredients and adds frying oil. Foods outside the database get an estimate per 100 g, labelled **AI estimate**. Without AI, `shared/mealParser.js` recognises about 120 foods by their Hebrew/English names, including Hebrew prefixes, number words ("שתי", "half a"), units and cooking words. It also reports any part of the description it couldn't recognise.
2. **Amounts.** Every amount is marked as stated or assumed. Assumed amounts that matter come with one-tap options.
3. **Nutrition.** Values are calculated from grams × the reference composition, and the source is shown for every item.
4. **Meal Quality Score, 0–100** (`shared/mealScore.js`). Eight components, each measured per 1000 kcal against WHO, DGA and IOM reference values, so portion size doesn't change the score. Each component shows its points and the reason. It is a descriptive index, not a validated medical measure.
5. **Scientific evaluation.** What is beneficial, less beneficial and missing, each with references. It also shows how well the meal fits the Mediterranean, Green-Med, DASH, NOVA, gut-health and cardiometabolic patterns.
6. **Improvements.** Concrete swaps and additions, re-scored with before/after differences and an Apply button. They are filtered by your diet and allergies.
7. **Food Diary.** Every analysis is saved automatically, grouped by meal and day, with daily totals (calories, protein, fibre, polyphenols, plant diversity, added sugar, sodium). You can edit, move or delete entries.

The Research library also has a live **PubMed** search for recent meta-analyses, RCTs and guidelines (self-hosted version). Those results are marked "not yet appraised".

## Nutrition research agent

The research agent is the user's own pipeline (`shared/researchAgent.js`). A coordinator runs three roles:

1. **Searcher.** Finds 5–8 recent studies from professional sources, including both sides of a controversy, and never invents anything.
2. **Verifier.** Opens every link and checks the study type, the sample, whether the claim matches the source, and causation versus association. It notes contradictions without choosing a side and gives each study a verdict: approved, needs correction or rejected. It also gives an overall confidence level.
3. **Writer.** Writes 6–8 lines from approved studies only, each with a citation. It adds one menu suggestion that respects the exclusions in your profile, followed by the sources.

The coordinator **stops if fewer than 3 studies are approved**. It ends with a count line (found / approved / rejected) and always says when links were not opened. The output is reading material only: the agent never changes the menu.

- **Server version:** the searcher uses PubMed, and the verifier re-opens each PubMed record and checks the claim against the actual abstract.
- **claude.ai page:** there is no internet access, so the agent searches the curated library and reports that the links were not opened live.

Claude plays the roles when it is available; otherwise rule-based versions run. Reports are saved per user.

## Weekly menu builder

Screen: **More → Weekly menu builder** (also a card on Home and a button on "My menu"). Built from the weekly-menu-builder skill, in `shared/menuBuilder.js`, and runs fully offline:

- **Fixed rules, editable and saved on the profile (`menuRules`):** Mediterranean/DASH; 30–45 g fibre/day; every day includes legumes, whole grains, vegetables, fruit, a handful of nuts and olive oil. It never includes fish, seafood, leafy greens, processed meat, white bread or processed breakfast cereals. Also kosher (no meat and dairy in one meal), simple preparation (≤25 min, assembled from shop-bought products), and favourite foods are preferred.
- **Optional special requests** in free text (Shabbat, an event day, "without broccoli", "more tahini"). Read by the AI when a key is set, otherwise by rules (Hebrew and English). The menu is built without asking questions.
- **Output:** 7 days × 4 meals with one alternative per meal, a daily fibre estimate calculated from the food database, the weekly plant count, and a shopping list by department.
- **QA before showing:** no forbidden food, fibre in range every day, required groups every day, every shopping item used, and kosher. A failed check is shown, never hidden.
- **"Use as my weekly plan"** imports it as the current plan (`POST /api/plan/import`), so the diary and dashboard use it.
- Quantities and fibre are estimates. The menu is a suggestion, not medical or dietetic advice.

## Product & Link Intelligence

Paste up to four product links (manufacturer pages, supermarkets, online grocers, label images or PDF specifications) from the **Product link** card on Home. You can also upload a label photo or paste the label text.

- **Reading.** `server/productFetch.js` fetches the page safely: http(s) only, and every hostname and redirect hop must resolve to a public IP address. Limits: 5 redirects, 12 s, 4 MB. The app records the final URL, HTTP status and retrieval time. If a page can't be read, the result says so and asks for a label photo or the pasted ingredient list. It never pretends to have read the page.
- **Extraction** (`shared/productExtract.js`). Claude copies the ingredients and nutrition table verbatim from the retrieved content, using a JSON schema, and returns null for anything absent. Without AI, a heuristic reader handles JSON-LD and Hebrew/English nutrition tables. Unit conversions (kJ→kcal, salt→sodium, per serving→per 100 g) are done in code and labelled **Calculated**. Every value shows its provenance: Label, Calculated, Estimated or Interpretation.
- **NOVA** (`shared/novaAssess.js`). The group is assessed only from the actual ingredient list, never from the name, brand or category. Each ingredient is classified by purpose:
  - preservatives, antioxidants, acidity regulators, fortificants and processing aids are not ultra-processing markers;
  - cosmetic additives and industrial substances are, weighed by strength;
  - each purpose counts only once.

  The output gives the proposed group, the explanation, the supporting ingredients, processing indicators, missing information and a High/Medium/Low confidence, and flags borderline cases. With too little information it shows: "לא ניתן לקבוע סיווג NOVA באופן אמין על סמך המידע הזמין."
- **Nutritional score, 0–100** (`shared/productEval.js`). Per 100 kcal: fibre, protein, saturated fat, sugar, sodium and ingredient quality. **NOVA is deliberately not part of the score.** Missing data lowers the reliability rating and is listed among the limitations.
- **Advantages, disadvantages, better alternatives, verification and comparison.** Advantages and disadvantages come with references. When a barcode is found, values are checked against Open Food Facts as a supplementary source. For 2–4 products, the comparison is weighted for your health goals.

On the claude.ai page, links can't be opened, because the sandbox blocks other websites. The page says so and offers label photos (read by Claude) or pasted text instead.

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
