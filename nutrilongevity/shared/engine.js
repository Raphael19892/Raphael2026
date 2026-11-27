// NutriLongevity AI — energy, macronutrient and micronutrient target engine + safety screening.
// All equations and reference values are cited in `basis` so the UI can show where numbers come from.

export const ACTIVITY_FACTORS = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};

export const CONDITIONS = [
  'pregnancy', 'breastfeeding', 'ckd', 'diabetes_meds', 'warfarin', 'ibs', 'celiac',
  'hypertension', 'eating_disorder', 'maoi', 'heart_failure', 'gout',
];

export function bmi(p) {
  const h = p.heightCm / 100;
  return h > 0 ? p.weightKg / (h * h) : null;
}

// Mifflin–St Jeor (1990). For sex 'other' the mean of the male and female constants is used.
export function bmrMifflin({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const k = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + k;
}

const round = (x, d = 0) => { const m = 10 ** d; return Math.round(x * m) / m; };

// Reference intakes (US/Canada DRIs; potassium AI per NASEM 2019; vitamin D RDA 2011).
export function microTargets({ sex, age, conditions = [] }) {
  const male = sex === 'male';
  const preg = conditions.includes('pregnancy');
  const lact = conditions.includes('breastfeeding');
  const t = {
    potassium: male ? 3400 : 2600,
    calcium: (male ? age > 70 : age > 50) ? 1200 : 1000,
    iron: male ? 8 : (age <= 50 ? 18 : 8),
    magnesium: male ? (age <= 30 ? 400 : 420) : (age <= 30 ? 310 : 320),
    vitC: male ? 90 : 75,
    folate: 400,
    vitB12: 2.4,
    vitD: age > 70 ? 20 : 15,
  };
  if (preg) { t.iron = 27; t.folate = 600; t.potassium = 2900; t.vitC = 85; t.magnesium += 40; t.vitB12 = 2.6; }
  if (lact) { t.iron = 9; t.folate = 500; t.potassium = 2800; t.vitC = 120; t.vitB12 = 2.8; }
  return t;
}

/**
 * Compute personalised targets.
 * profile: { age, sex, heightCm, weightKg, activity, goal ('maintain'|'lose'|'gain'|'longevity'),
 *            strengthTraining (sessions/week), conditions[], diet, allergies[] }
 */
export function computeTargets(profile) {
  const p = { conditions: [], strengthTraining: 0, goal: 'longevity', activity: 'light', ...profile };
  const bmrV = bmrMifflin(p);
  const af = ACTIVITY_FACTORS[p.activity] || 1.375;
  const tdee = bmrV * af;
  const b = bmi(p);
  const basis = [];
  const flags = safetyScreen(p);

  // Energy target
  let kcal = tdee;
  let goal = p.goal;
  const noDeficit = p.conditions.includes('pregnancy') || p.conditions.includes('breastfeeding') ||
    p.conditions.includes('eating_disorder') || (b !== null && b < 18.5) || p.age < 18;
  if (goal === 'lose' && noDeficit) goal = 'maintain';
  if (goal === 'lose') kcal = tdee * 0.85; // ~15% deficit (≈ 300–600 kcal/day for most adults)
  if (goal === 'gain') kcal = tdee * 1.10;
  if (p.conditions.includes('pregnancy')) { kcal = tdee + 340; basis.push('pregnancy_energy'); } // 2nd-trimester average; clinician should individualise
  if (p.conditions.includes('breastfeeding')) kcal = tdee + 330;
  const floor = p.sex === 'male' ? 1500 : 1200;
  if (kcal < floor) kcal = Math.max(floor, Math.min(tdee, floor));

  // Protein (g/kg). Uses an adjusted weight (weight at BMI 25) when BMI > 30, a common clinical convention.
  const refWeight = b && b > 30 ? 25 * (p.heightCm / 100) ** 2 : p.weightKg;
  let gPerKg = 1.0; let proteinRef = 'iom2005';
  if (p.age >= 65) { gPerKg = 1.2; proteinRef = 'bauer2013'; }
  if (goal === 'lose') { gPerKg = Math.max(gPerKg, 1.2); }
  if ((p.strengthTraining || 0) >= 2) { gPerKg = 1.6; proteinRef = 'morton2018'; }
  if (p.conditions.includes('pregnancy') || p.conditions.includes('breastfeeding')) gPerKg = Math.max(gPerKg, 1.1);
  if (p.conditions.includes('ckd')) { gPerKg = 0.8; proteinRef = 'iom2005'; }
  const protein = refWeight * gPerKg;

  // Fat: 35% of energy (upper AMDR; reflects a Mediterranean pattern rich in olive oil and nuts).
  const fatPct = 0.35;
  const fat = (kcal * fatPct) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  const satFatMax = (kcal * 0.10) / 9; // DGA: <10% of energy
  const fiber = Math.max(25, (kcal / 1000) * 14); // IOM AI 14 g/1000 kcal; ≥25 g (Reynolds 2019)
  const sodiumMax = p.conditions.includes('hypertension') || p.conditions.includes('heart_failure') ? 1500 : 2000;
  const addedSugarMax = (kcal * 0.10) / 4; // WHO <10% (ideally <5%)
  const micros = microTargets(p);

  return {
    bmr: round(bmrV), tdee: round(tdee), kcal: round(kcal / 10) * 10, bmi: b ? round(b, 1) : null,
    goalApplied: goal,
    protein: round(protein), proteinPerKg: gPerKg, carbs: round(carbs), fat: round(fat),
    satFatMax: round(satFatMax), fiber: round(fiber), sodiumMax, addedSugarMax: round(addedSugarMax),
    micros,
    weekly: { plants: 30, legumeServings: 4, fishServings: p.diet === 'vegan' || p.diet === 'vegetarian' ? 0 : 2 },
    daily: { fruitVegG: 400, fruitVegStretchG: 800, wholeGrainServings: 3, nutsG: 28, oliveOilG: 20 },
    basis: {
      bmr: { ref: 'mifflin1990', text: 'Mifflin–St Jeor equation' },
      tdee: { ref: 'mifflin1990', text: `BMR × activity factor ${af}` },
      protein: { ref: proteinRef, text: `${gPerKg} g/kg${refWeight !== p.weightKg ? ' of adjusted body weight (BMI 25)' : ''}` },
      fat: { ref: 'iom2005', text: '35% of energy (upper end of AMDR, Mediterranean-style)' },
      fiber: { ref: 'reynolds2019', text: '14 g/1000 kcal (IOM), minimum 25 g' },
      satFat: { ref: 'dga2020', text: '<10% of energy' },
      sodium: { ref: sodiumMax === 1500 ? 'sacks2001' : 'he2013', text: `< ${sodiumMax} mg/day` },
      sugar: { ref: 'who2015sugars', text: '<10% of energy from free sugars' },
      micros: { ref: 'iom2005', text: 'US/Canada Dietary Reference Intakes (RDA/AI)' },
    },
    flags,
  };
}

/**
 * Safety screening. Returns [{ level: 'stop'|'warn'|'info', code, en, he }].
 * The app never diagnoses; flags direct people to professionals when relevant.
 */
export function safetyScreen(p) {
  const f = [];
  const c = p.conditions || [];
  const b = bmi(p);
  const add = (level, code, en, he) => f.push({ level, code, en, he });
  if (p.age < 18) add('stop', 'minor', 'This app is designed for adults. Children and adolescents have different needs — please consult a paediatric dietitian.', 'האפליקציה מיועדת למבוגרים. לילדים ובני נוער צרכים שונים — יש להתייעץ עם דיאטנית ילדים.');
  if (c.includes('eating_disorder')) add('stop', 'ed', 'Because of a history of eating disorders, calorie targets and weight-loss goals are disabled. Please work with your treatment team.', 'בשל היסטוריה של הפרעת אכילה, יעדי קלוריות וירידה במשקל מושבתים. מומלץ לעבוד עם צוות המטפל.');
  if (b !== null && b < 18.5) add('warn', 'underweight', 'Your BMI is below 18.5. Weight-loss plans are disabled; consider seeing a physician or dietitian.', 'ה-BMI שלך מתחת ל-18.5. תוכניות ירידה במשקל מושבתות; מומלץ לפנות לרופא/ה או דיאטנית.');
  if (c.includes('pregnancy') || c.includes('breastfeeding')) add('warn', 'pregnancy', 'Pregnancy/breastfeeding: avoid high-mercury fish, unpasteurised cheese and limit caffeine. Prenatal supplements (folic acid, iodine, often iron/vitamin D) are usually needed — follow your obstetric care team.', 'הריון/הנקה: להימנע מדגים עתירי כספית וגבינות לא מפוסטרות ולהגביל קפאין. בדרך כלל נדרשים תוספים (חומצה פולית, יוד, לעיתים ברזל/ויטמין D) — לפי הנחיית הצוות המטפל.');
  if (c.includes('ckd')) add('warn', 'ckd', 'Chronic kidney disease: protein, potassium, phosphorus and sodium may need restriction. Protein is capped at 0.8 g/kg here, but a renal dietitian must individualise your plan. High-potassium foods (legumes, potatoes, bananas, nuts) are flagged.', 'מחלת כליות כרונית: ייתכן שנדרשת הגבלת חלבון, אשלגן, זרחן ונתרן. החלבון מוגבל כאן ל-0.8 ג׳/ק״ג, אך התוכנית חייבת להיות מותאמת ע״י דיאטנית כליה.');
  if (c.includes('diabetes_meds')) add('warn', 'hypo', 'You take glucose-lowering medication. Changing carbohydrate intake can cause hypoglycaemia — monitor glucose and discuss changes with your clinician.', 'את/ה נוטל/ת תרופות להורדת סוכר. שינוי בפחמימות עלול לגרום להיפוגליקמיה — יש לנטר ולהתייעץ עם הרופא/ה.');
  if (c.includes('warfarin')) add('warn', 'vitk', 'Warfarin: keep vitamin K intake consistent day to day (leafy greens such as spinach and kale are very high). Do not make large changes without your anticoagulation clinic.', 'וורפרין: יש לשמור על צריכת ויטמין K יציבה (עלים ירוקים כמו תרד וקייל עשירים מאוד). אין לבצע שינויים גדולים ללא מרפאת הקרישה.');
  if (c.includes('maoi')) add('warn', 'tyramine', 'MAO inhibitors: aged/fermented foods (aged cheese, sauerkraut, kimchi, miso, soy sauce) can contain tyramine. Fermented foods are excluded from your plans.', 'מעכבי MAO: מזונות מותססים/מיושנים עלולים להכיל טירמין. מזונות מותססים הוסרו מהתפריטים שלך.');
  if (c.includes('ibs')) add('info', 'ibs', 'IBS: legumes, onion, garlic, wheat and some fruits are high-FODMAP. Increase fibre gradually; a low-FODMAP approach should be supervised by a dietitian.', 'IBS: קטניות, בצל, שום, חיטה וחלק מהפירות עתירי FODMAP. יש להעלות סיבים בהדרגה; דיאטת low-FODMAP בליווי דיאטנית.');
  if (c.includes('celiac')) add('info', 'celiac', 'Coeliac disease: gluten-containing grains are excluded and oats are only suggested if certified gluten-free.', 'צליאק: דגנים עם גלוטן הוסרו; שיבולת שועל רק אם מסומנת ללא גלוטן.');
  if (c.includes('gout')) add('info', 'gout', 'Gout: limit sardines and other high-purine fish, and alcohol; plant purines appear less problematic.', 'גאוט: להגביל סרדינים ודגים עתירי פורינים ואלכוהול.');
  if (c.includes('heart_failure')) add('warn', 'hf', 'Heart failure: sodium and fluid limits should be set by your cardiology team.', 'אי ספיקת לב: מגבלות נתרן ונוזלים ייקבעו ע״י הצוות הקרדיולוגי.');
  if (b !== null && b >= 40) add('info', 'bmi40', 'With a BMI of 40 or more, medical weight management support is recommended alongside diet.', 'ב-BMI של 40 ומעלה מומלץ ליווי רפואי לצד התזונה.');
  return f;
}

// Foods to avoid or flag for specific conditions (used by the planner and scanner).
export function conditionFoodRules(conditions = []) {
  const exclude = new Set();
  const caution = {};
  if (conditions.includes('maoi')) ['sauerkraut', 'kimchi', 'miso', 'feta'].forEach((id) => exclude.add(id));
  if (conditions.includes('pregnancy')) { caution.tuna = 'mercury'; caution.coffee = 'caffeine'; caution.green_tea = 'caffeine'; caution.feta = 'pasteurised only'; }
  if (conditions.includes('warfarin')) { caution.spinach = 'vitamin K'; caution.kale = 'vitamin K'; caution.arugula = 'vitamin K'; caution.parsley = 'vitamin K'; }
  if (conditions.includes('ckd')) ['potato', 'banana', 'dates', 'prunes', 'figs_dried', 'avocado'].forEach((id) => { caution[id] = 'potassium'; });
  if (conditions.includes('celiac')) exclude.add('oats');
  if (conditions.includes('gout')) caution.sardines = 'purines';
  return { exclude, caution };
}
