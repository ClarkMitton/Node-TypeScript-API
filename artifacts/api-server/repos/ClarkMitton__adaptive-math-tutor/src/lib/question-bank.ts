export type Grade = 1 | 2 | 3 | 4;

export type QuestionEntry = {
  prompt: string;
  answers: string[];
};

export type SubTopicDef = {
  key: string;
  displayName: string;
  category: "number";
  questions: Record<Grade, QuestionEntry>;
};

// Normalise an answer for comparison
export function normaliseAnswer(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/[£$€]/g, "");
  s = s.replace(/,(\d)/g, "$1");
  s = s.replace(
    /\s*(litres?|l\b|metres?|m\b|km|cm|mm|kg|g\b|°c|°f|kw|units?\b|trips?\b|boxes?\b|sections?\b|hours?\b|minutes?\b|days?\b|revolutions?\b|rpm)\s*$/i,
    "",
  );
  // standard form: normalise × and ⁻ superscripts
  s = s
    .replace(/×/g, "x")
    .replace(/[⁻]/g, "-")
    .replace(/[⁰]/g, "0")
    .replace(/[¹]/g, "1")
    .replace(/[²]/g, "2")
    .replace(/[³]/g, "3")
    .replace(/[⁴]/g, "4")
    .replace(/[⁵]/g, "5")
    .replace(/[⁶]/g, "6")
    .replace(/[⁷]/g, "7")
    .replace(/[⁸]/g, "8")
    .replace(/[⁹]/g, "9");
  s = s.replace(/\s+/g, "");
  return s;
}

export function checkAnswer(given: string, entry: QuestionEntry): boolean {
  const norm = normaliseAnswer(given);
  return entry.answers.some((a) => normaliseAnswer(a) === norm);
}

export const NUMBER_SUB_TOPICS: SubTopicDef[] = [
  {
    key: "place_value",
    displayName: "Place Value",
    category: "number",
    questions: {
      1: {
        prompt: "What is the value of the digit 3 in the number 305?",
        answers: ["300"],
      },
      2: {
        prompt: "Write the number four thousand, two hundred and six in digits.",
        answers: ["4206"],
      },
      3: {
        prompt: "A steel rod is measured at 3.75 m. Round 3.75 to one decimal place.",
        answers: ["3.8"],
      },
      4: {
        prompt: "Write 0.065 in standard form.",
        answers: ["6.5x10^-2", "6.5×10⁻²", "6.5 x 10^-2", "6.5x10-2"],
      },
    },
  },
  {
    key: "addition",
    displayName: "Addition",
    category: "number",
    questions: {
      1: {
        prompt:
          "A mechanic uses 14 bolts in the morning and 23 bolts in the afternoon. How many bolts in total?",
        answers: ["37"],
      },
      2: {
        prompt:
          "A garage orders £346 of parts and £278 of oil. What is the total cost?",
        answers: ["624", "£624"],
      },
      3: {
        prompt:
          "Three steel beams measure 2.45 m, 1.87 m and 3.2 m. What is the total length in metres?",
        answers: ["7.52"],
      },
      4: {
        prompt:
          "A construction job costs £12,450 in labour, £8,375 in materials and £1,200 in equipment hire. What is the total project cost?",
        answers: ["22025", "£22025", "22,025", "£22,025"],
      },
    },
  },
  {
    key: "subtraction",
    displayName: "Subtraction",
    category: "number",
    questions: {
      1: {
        prompt:
          "A car had 48 litres of fuel. After a journey it has 19 litres. How much fuel was used?",
        answers: ["29"],
      },
      2: {
        prompt:
          "A workshop had 500 rivets. After a job, 187 were used. How many remain?",
        answers: ["313"],
      },
      3: {
        prompt:
          "A beam is 6.4 m long. A 2.85 m section is cut off. How long is the remaining piece in metres?",
        answers: ["3.55"],
      },
      4: {
        prompt:
          "A motor vehicle budget is £15,000. Costs so far: £4,750 parts, £2,380 labour, £890 paint. How much remains?",
        answers: ["6980", "£6980", "6,980", "£6,980"],
      },
    },
  },
  {
    key: "multiplication",
    displayName: "Multiplication",
    category: "number",
    questions: {
      1: {
        prompt:
          "A mechanic earns £12 per hour. How much does she earn in 6 hours?",
        answers: ["72", "£72"],
      },
      2: {
        prompt:
          "A factory produces 245 components per day. How many are produced in 5 days?",
        answers: ["1225", "1,225"],
      },
      3: {
        prompt:
          "A pipe is 1.8 m long. How long are 14 identical pipes laid end to end? Give your answer in metres.",
        answers: ["25.2"],
      },
      4: {
        prompt:
          "An engineering firm charges £47.50 per hour. A job takes 38 hours. What is the total charge?",
        answers: ["1805", "£1805", "1,805", "£1,805"],
      },
    },
  },
  {
    key: "division",
    displayName: "Division",
    category: "number",
    questions: {
      1: {
        prompt:
          "Share 36 bolts equally between 4 mechanics. How many does each get?",
        answers: ["9"],
      },
      2: {
        prompt:
          "A 240 cm length of pipe needs to be cut into equal sections of 15 cm. How many sections?",
        answers: ["16"],
      },
      3: {
        prompt:
          "A batch of 1,350 components is packaged into boxes of 18. How many boxes are needed?",
        answers: ["75"],
      },
      4: {
        prompt:
          "Fuel costs £892.50 for a fleet of 15 vehicles for one week. What is the average cost per vehicle?",
        answers: ["59.5", "£59.5", "59.50", "£59.50"],
      },
    },
  },
  {
    key: "negative_numbers",
    displayName: "Negative Numbers",
    category: "number",
    questions: {
      1: {
        prompt:
          "The temperature in a cold storage unit is -8°C. It rises by 5°C. What is the new temperature?",
        answers: ["-3", "-3°c"],
      },
      2: {
        prompt:
          "A bank account is overdrawn by £240. A payment of £175 goes in. What is the new balance?",
        answers: ["-65", "-£65"],
      },
      3: {
        prompt:
          "Order these from smallest to largest (type with commas, no spaces): -12, 4, -3, 0, -9",
        answers: ["-12,-9,-3,0,4"],
      },
      4: {
        prompt:
          "A component reading is -2.5 units. After calibration it changes by +7.3 units. What is the new reading?",
        answers: ["4.8"],
      },
    },
  },
  {
    key: "rounding_estimation",
    displayName: "Rounding & Estimation",
    category: "number",
    questions: {
      1: {
        prompt: "Round 347 to the nearest 10.",
        answers: ["350"],
      },
      2: {
        prompt:
          "Estimate the cost of 38 components at £49 each by rounding both to the nearest 10.",
        answers: ["1900", "£1900", "2000", "£2000"],
      },
      3: {
        prompt:
          "A fuel tank holds 52.7 litres. Round this to the nearest whole number.",
        answers: ["53"],
      },
      4: {
        prompt:
          "A machined part must be 8.463 mm. Round to 2 decimal places.",
        answers: ["8.46"],
      },
    },
  },
  {
    key: "factors_multiples",
    displayName: "Factors & Multiples",
    category: "number",
    questions: {
      1: {
        prompt: "Write all the factors of 12 (separated by commas, no spaces).",
        answers: ["1,2,3,4,6,12"],
      },
      2: {
        prompt:
          "A machine produces parts in batches of 6 or 8. What is the smallest batch size both machines can share? (LCM of 6 and 8)",
        answers: ["24"],
      },
      3: {
        prompt: "Find the HCF of 48 and 36.",
        answers: ["12"],
      },
      4: {
        prompt:
          "Two CNC machines cycle every 15 minutes and 20 minutes respectively. How long until they are both at the start of a cycle together? Give your answer in minutes.",
        answers: ["60"],
      },
    },
  },
  {
    key: "prime_numbers",
    displayName: "Prime Numbers",
    category: "number",
    questions: {
      1: {
        prompt: "Is 11 a prime number? Type yes or no.",
        answers: ["yes"],
      },
      2: {
        prompt:
          "List all prime numbers between 10 and 30 (separated by commas, no spaces).",
        answers: ["11,13,17,19,23,29"],
      },
      3: {
        prompt:
          "How many factors does a prime number have? Type the number.",
        answers: ["2"],
      },
      4: {
        prompt:
          "A security code uses a prime number between 50 and 60. List all options (commas, no spaces).",
        answers: ["53,59"],
      },
    },
  },
  {
    key: "prime_factor_decomposition",
    displayName: "Prime Factors",
    category: "number",
    questions: {
      1: {
        prompt:
          "Write 12 as a product of its prime factors (e.g. 2x2x3).",
        answers: ["2x2x3", "2×2×3", "2*2*3"],
      },
      2: {
        prompt:
          "Write 60 as a product of prime factors (e.g. 2x2x3x5). No index notation.",
        answers: ["2x2x3x5", "2×2×3×5", "2*2*3*5"],
      },
      3: {
        prompt:
          "Use prime factor decomposition to find the HCF of 84 and 56.",
        answers: ["28"],
      },
      4: {
        prompt:
          "Use prime factor decomposition to find the LCM of 90 and 126.",
        answers: ["630"],
      },
    },
  },
  {
    key: "square_cube_numbers",
    displayName: "Square & Cube Numbers",
    category: "number",
    questions: {
      1: {
        prompt: "What is 7 squared?",
        answers: ["49"],
      },
      2: {
        prompt:
          "A storage room is a cube with sides of 4 m. What is its volume in m³?",
        answers: ["64"],
      },
      3: {
        prompt: "Find the value of √144.",
        answers: ["12"],
      },
      4: {
        prompt:
          "A cubic tank holds 512,000 cm³. What is the length of one side in cm?",
        answers: ["80"],
      },
    },
  },
  {
    key: "indices",
    displayName: "Indices",
    category: "number",
    questions: {
      1: {
        prompt: "What is 3⁴? (3 to the power of 4)",
        answers: ["81"],
      },
      2: {
        prompt: "Simplify 2⁵ × 2³. Give the numerical value.",
        answers: ["256"],
      },
      3: {
        prompt: "Evaluate 5⁶ ÷ 5². Give the numerical value.",
        answers: ["625"],
      },
      4: {
        prompt: "Evaluate (3²)³ × 3⁰. Give the numerical value.",
        answers: ["729"],
      },
    },
  },
  {
    key: "ordering_numbers",
    displayName: "Ordering Numbers",
    category: "number",
    questions: {
      1: {
        prompt:
          "Put these in order, smallest first (commas, no spaces): 45, 12, 78, 34, 9",
        answers: ["9,12,34,45,78"],
      },
      2: {
        prompt:
          "Order these decimals smallest to largest (commas, no spaces): 3.7, 3.07, 3.72, 3.702",
        answers: ["3.07,3.7,3.702,3.72"],
      },
      3: {
        prompt:
          "Order these from largest to smallest as decimals (commas, no spaces): 3/4, 0.8, 65%, 7/10",
        answers: ["0.8,0.75,0.7,0.65"],
      },
      4: {
        prompt:
          "Order these in ascending order (commas, no spaces): -3.2, 3/8, 0.4, -1/2, 0",
        answers: ["-3.2,-0.5,0,0.375,0.4"],
      },
    },
  },
  {
    key: "significant_figures",
    displayName: "Significant Figures",
    category: "number",
    questions: {
      1: {
        prompt: "Round 6,847 to 1 significant figure.",
        answers: ["7000"],
      },
      2: {
        prompt: "Round 0.004728 to 2 significant figures.",
        answers: ["0.0047"],
      },
      3: {
        prompt:
          "A car engine produces 183.47 kW of power. Round to 3 significant figures.",
        answers: ["183"],
      },
      4: {
        prompt:
          "A component weighs 0.002463 kg. Write this to 3 significant figures.",
        answers: ["0.00246"],
      },
    },
  },
  {
    key: "standard_form",
    displayName: "Standard Form",
    category: "number",
    questions: {
      1: {
        prompt: "Write 4,000 in standard form (e.g. 4x10^3).",
        answers: ["4x10^3", "4×10³", "4 x 10^3"],
      },
      2: {
        prompt: "Write 0.00056 in standard form (e.g. 5.6x10^-4).",
        answers: ["5.6x10^-4", "5.6×10⁻⁴", "5.6 x 10^-4"],
      },
      3: {
        prompt:
          "Calculate (3 × 10⁴) × (2 × 10³). Give your answer in standard form (e.g. 6x10^7).",
        answers: ["6x10^7", "6×10⁷", "6 x 10^7"],
      },
      4: {
        prompt:
          "A motor operates at 1.2 × 10⁶ revolutions per year. How many revolutions in 3.5 years? Give in standard form.",
        answers: ["4.2x10^6", "4.2×10⁶", "4.2 x 10^6"],
      },
    },
  },
  {
    key: "problem_solving",
    displayName: "Problem Solving",
    category: "number",
    questions: {
      1: {
        prompt:
          "A van can carry 8 boxes. A garage needs to move 50 boxes. How many trips are needed?",
        answers: ["7"],
      },
      2: {
        prompt:
          "Three mechanics each work 37.5 hours per week. Their combined hourly rate is £45. What is the weekly wage bill?",
        answers: ["5062.5", "£5062.5", "5062.50", "£5062.50"],
      },
      3: {
        prompt:
          "A garage increases its hourly rate from £48 to £54. What is the percentage increase?",
        answers: ["12.5", "12.5%"],
      },
      4: {
        prompt:
          "A construction team must complete 840 m of fencing at 35 m per day. After 12 days, how many more full days are needed?",
        answers: ["12"],
      },
    },
  },
];

export const SUB_TOPIC_MAP = Object.fromEntries(
  NUMBER_SUB_TOPICS.map((st) => [st.key, st]),
) as Record<string, SubTopicDef>;

export function getQuestion(subTopicKey: string, grade: Grade): QuestionEntry | null {
  const st = SUB_TOPIC_MAP[subTopicKey];
  if (!st) return null;
  return st.questions[grade] ?? null;
}
