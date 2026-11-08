"""Hand-written content for the demo account, so showing StudyMate never depends on the AI or its free quota.

Nothing in this file touches the database or the network. seed_demo.py turns it into rows, and
backend/tests/test_demo_data.py checks it against the app's own rules.
"""
import random
from datetime import date, timedelta

# ======================================================================================================
# Notes
# ======================================================================================================

PHOTO_NOTES = """# Photosynthesis

Photosynthesis is the process by which green plants, algae and some bacteria convert light energy into chemical energy stored in glucose. The overall reaction is 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2. It takes place in chloroplasts, which contain the green pigment chlorophyll.

## Light-dependent reactions
These reactions occur in the thylakoid membranes. Chlorophyll absorbs light, mostly red and blue wavelengths, and reflects green. The absorbed energy splits water molecules in a step called photolysis, releasing oxygen as a by-product. The energy is also used to make ATP and NADPH, two energy carriers that power the next stage.

## The Calvin cycle
Also called the light-independent reactions, the Calvin cycle takes place in the stroma. Using ATP and NADPH, the enzyme RuBisCO fixes carbon dioxide onto a five-carbon sugar called RuBP. The resulting molecules are reduced to G3P, a three-carbon sugar. Some G3P leaves the cycle to build glucose and other carbohydrates, and the rest regenerates RuBP so the cycle can continue. For every glucose molecule made, the cycle must turn six times.

## Limiting factors
The rate of photosynthesis depends on light intensity, carbon dioxide concentration and temperature. At low light, light is the limiting factor; as light increases the rate rises until another factor becomes limiting. Very high temperatures denature enzymes such as RuBisCO and the rate falls sharply. Farmers use greenhouses to control these factors and raise yields.

## Photosynthesis and respiration
Respiration releases energy from glucose using oxygen and produces carbon dioxide and water, so its reactants and products are the reverse of photosynthesis. Plants do both: photosynthesis in the light and respiration all the time. During the day photosynthesis is usually faster than respiration, so plants release oxygen overall. The balance between the two processes keeps carbon dioxide and oxygen levels steady in the atmosphere.
"""

NEWTON_NOTES = """# Newton's Laws of Motion

Isaac Newton described how forces change the motion of objects in three laws published in 1687. Together they explain everything from a football in flight to a rocket leaving Earth.

## First law: inertia
An object stays at rest, or keeps moving in a straight line at constant speed, unless an unbalanced force acts on it. This tendency to resist changes in motion is called inertia, and the more mass an object has, the more inertia it has. Passengers lurch forward when a bus brakes suddenly because their bodies keep moving at the bus's earlier speed.

## Second law: F = ma
The acceleration of an object is directly proportional to the net force on it and inversely proportional to its mass, written F = ma. Force is measured in newtons: one newton accelerates a one kilogram mass at one metre per second squared. Pushing an empty trolley and a full trolley with the same force shows the idea: the full trolley accelerates less.

## Third law: action and reaction
When one object exerts a force on a second object, the second exerts an equal and opposite force on the first. The two forces act on different objects, so they do not cancel each other. A rocket moves upward because it pushes hot gas downward, and the gas pushes the rocket up.
"""


def _topics(notes: str, items: list[tuple[str, str, str]]) -> list[dict]:
    """items: (heading as it appears in the notes, topic title, one-line blurb). Offsets are where each heading starts."""
    return [{"title": title, "blurb": blurb, "offset": notes.index(heading)} for heading, title, blurb in items]


PHOTO_TOPICS = _topics(PHOTO_NOTES, [
    ("## Light-dependent reactions", "Light-dependent reactions", "How chlorophyll captures light and makes ATP and NADPH."),
    ("## The Calvin cycle", "The Calvin cycle", "How carbon dioxide is fixed into sugar in the stroma."),
    ("## Limiting factors", "Limiting factors", "What slows photosynthesis down and how farmers respond."),
    ("## Photosynthesis and respiration", "Photosynthesis and respiration", "Why the two processes balance each other."),
])
NEWTON_TOPICS = _topics(NEWTON_NOTES, [
    ("## First law: inertia", "First law: inertia", "Objects keep their motion unless a force acts."),
    ("## Second law: F = ma", "Second law: F = ma", "Force, mass and acceleration."),
    ("## Third law: action and reaction", "Third law: action and reaction", "Forces always come in equal, opposite pairs."),
])

DOCS = [
    {"key": "photo", "title": "Photosynthesis", "subject": "Biology", "blurb": "How plants turn light into chemical energy, and what limits the process.",
     "content": PHOTO_NOTES, "topics": PHOTO_TOPICS, "days_ago": 15},
    {"key": "newton", "title": "Newton's Laws of Motion", "subject": "Physics", "blurb": "The three laws that link force, mass and motion.",
     "content": NEWTON_NOTES, "topics": NEWTON_TOPICS, "days_ago": 9},
]

# ======================================================================================================
# Summaries (lesson-wide have topic ""; topic summaries use the outline title)
# ======================================================================================================

PHOTO_BEGINNER = """Plants make their own food using sunlight. This is called photosynthesis.

## Light-dependent reactions
* **Chlorophyll** in the leaf catches light.
* Light splits water and gives off oxygen.

## The Calvin cycle
* The plant builds **glucose** from carbon dioxide.

## Limiting factors
* Light, carbon dioxide and temperature set the speed.

## Photosynthesis and respiration
* Plants do both, and make more oxygen than they use in daylight.

## Quick recap
* Light + water + carbon dioxide gives glucose + oxygen.
* It happens in the chloroplast.
"""

PHOTO_INTERMEDIATE = """Photosynthesis converts light energy into chemical energy that the plant stores as glucose, inside the **chloroplast**.

## Light-dependent reactions
These happen in the thylakoid membranes. **Chlorophyll** absorbs red and blue light and reflects green. The energy splits water in **photolysis**, which releases oxygen. It also makes **ATP** and **NADPH**, the energy carriers for the next stage.

## The Calvin cycle
Also called the light-independent reactions, it runs in the stroma. The enzyme **RuBisCO** fixes carbon dioxide onto RuBP. The product is reduced to **G3P**, which builds glucose or regenerates RuBP. Making one glucose takes six turns.

## Limiting factors
The rate depends on light intensity, carbon dioxide and temperature. Whichever is in shortest supply is the **limiting factor**. Very high temperatures denature enzymes and the rate drops, which is why greenhouses control these conditions.

## Photosynthesis and respiration
Respiration is roughly the reverse of photosynthesis. Plants carry out both, but in daylight photosynthesis wins, so they release oxygen overall.

## Quick recap
* The light reactions make ATP, NADPH and oxygen.
* The Calvin cycle uses them to turn carbon dioxide into sugar.
* Light, carbon dioxide and temperature can all limit the rate.
"""

PHOTO_ADVANCED = """Photosynthesis transduces light into chemical energy: 6CO2 + 6H2O + light -> C6H12O6 + 6O2. It is compartmentalised in the **chloroplast**, with the light reactions on the thylakoid membrane and carbon fixation in the stroma.

## Light-dependent reactions
**Chlorophyll** absorbs mainly red and blue wavelengths. Excited electrons pass along a chain, and **photolysis** of water replaces them while releasing O2. The energy drives synthesis of **ATP** and reduction of NADP+ to **NADPH**. Both are consumed in the stroma and are not stored for long.

## The Calvin cycle
These light-independent reactions have three phases. Fixation: **RuBisCO** attaches CO2 to the five-carbon sugar RuBP. Reduction: ATP and NADPH convert the product to the three-carbon **G3P**. Regeneration: most G3P is used to rebuild RuBP. One glucose requires six turns, so six CO2 are fixed.

## Limiting factors
Rate is governed by the factor in shortest supply: light intensity, CO2 concentration or temperature. Rate rises with light until CO2 or temperature limits it. Above the enzymes' optimum, **denaturation** of RuBisCO collapses the rate. Common mistake: temperature acts mainly through enzyme activity, not light capture.

## Photosynthesis and respiration
Respiration oxidises glucose with oxygen, releasing CO2, water and energy, so its inputs and outputs mirror photosynthesis. Plants respire continuously but photosynthesise only in light. Above the compensation point there is a net release of O2, which helps stabilise atmospheric gas levels.

## Quick recap
* Light reactions: thylakoid, photolysis, ATP and NADPH.
* Calvin cycle: stroma, RuBisCO, G3P, six turns per glucose.
* Limiting factor logic and the photosynthesis-respiration balance are common exam points.
"""

PHOTO_CALVIN_INTERMEDIATE = """The Calvin cycle builds sugar from carbon dioxide, using the energy that the light reactions stored.

It runs in the **stroma** and does not need light directly. The enzyme **RuBisCO** attaches carbon dioxide to a five-carbon sugar called **RuBP**. The result is reduced to **G3P**, a three-carbon sugar, using **ATP** and **NADPH**. Some G3P leaves to make glucose; the rest regenerates RuBP so the cycle repeats.

## Quick recap
* Location: the stroma.
* Key enzyme: RuBisCO.
* Six turns are needed for one glucose.
"""

PHOTO_LIGHT_BEGINNER = """The light reactions are the first stage of photosynthesis.

* **Chlorophyll** catches light energy.
* The energy splits water and releases oxygen.
* It also makes two energy carriers, **ATP** and **NADPH**.

## Quick recap
* Where: thylakoid membranes.
* Output: oxygen, ATP and NADPH.
"""

PHOTO_HINDI = """पौधे सूर्य के प्रकाश से अपना भोजन खुद बनाते हैं। इसे **प्रकाश संश्लेषण** कहते हैं।

## प्रकाश-निर्भर अभिक्रियाएँ
* पत्ती में मौजूद **क्लोरोफिल** प्रकाश को सोखता है।
* प्रकाश से पानी टूटता है और ऑक्सीजन निकलती है।

## कैल्विन चक्र
* पौधा कार्बन डाइऑक्साइड से **ग्लूकोज़** बनाता है।

## सारांश
* प्रकाश + पानी + कार्बन डाइऑक्साइड से ग्लूकोज़ और ऑक्सीजन बनते हैं।
* यह क्रिया क्लोरोप्लास्ट में होती है।
"""

PHOTO_TELUGU = """మొక్కలు సూర్యకాంతి సహాయంతో తమ ఆహారాన్ని తామే తయారు చేసుకుంటాయి. దీనిని **కిరణజన్య సంయోగక్రియ** అంటారు.

## కాంతిపై ఆధారపడే చర్యలు
* ఆకులోని **క్లోరోఫిల్** కాంతిని గ్రహిస్తుంది.
* కాంతి నీటిని విడగొట్టి ఆక్సిజన్‌ను విడుదల చేస్తుంది.

## కాల్విన్ చక్రం
* మొక్క కార్బన్ డయాక్సైడ్ నుండి **గ్లూకోజ్**ను తయారు చేస్తుంది.

## సారాంశం
* కాంతి + నీరు + కార్బన్ డయాక్సైడ్ నుండి గ్లూకోజ్, ఆక్సిజన్ తయారవుతాయి.
* ఈ చర్య క్లోరోప్లాస్ట్‌లో జరుగుతుంది.
"""

NEWTON_INTERMEDIATE = """Newton's three laws describe how **forces** change the motion of objects.

## First law: inertia
An object keeps its state of rest or constant motion unless an unbalanced force acts. This resistance to change is **inertia**, and it grows with mass.

## Second law: F = ma
Acceleration is proportional to the net force and inversely proportional to mass. One **newton** accelerates one kilogram at one metre per second squared.

## Third law: action and reaction
Forces come in equal and opposite pairs that act on different objects, so they never cancel each other.

## Quick recap
* No net force means no change in motion.
* F = ma links force, mass and acceleration.
* Every action has an equal and opposite reaction.
"""

# (doc key, level, topic, lang, text)
SUMMARIES = [
    ("photo", "beginner", "", "en", PHOTO_BEGINNER),
    ("photo", "intermediate", "", "en", PHOTO_INTERMEDIATE),
    ("photo", "advanced", "", "en", PHOTO_ADVANCED),
    ("photo", "intermediate", "The Calvin cycle", "en", PHOTO_CALVIN_INTERMEDIATE),
    ("photo", "beginner", "Light-dependent reactions", "en", PHOTO_LIGHT_BEGINNER),
    ("photo", "beginner", "", "hi", PHOTO_HINDI),
    ("photo", "beginner", "", "te", PHOTO_TELUGU),
    ("newton", "intermediate", "", "en", NEWTON_INTERMEDIATE),
]

# ======================================================================================================
# Flashcards: (doc, topic, front, back, schedule) with schedule = (interval_days, ease, streak, lapses, reviews, due_in_days)
# due_in_days <= 0 means the card is due now
# ======================================================================================================

PHOTO_CARDS = [
    ("Light-dependent reactions", "Where do the light reactions take place?", "In the thylakoid membranes of the chloroplast.", (15, 2.6, 4, 0, 5, 9)),
    ("Light-dependent reactions", "What does photolysis do?", "It splits water molecules, releasing oxygen as a by-product.", (6, 2.5, 3, 0, 3, 2)),
    ("Light-dependent reactions", "Which two energy carriers do the light reactions make?", "ATP and NADPH.", (2, 2.5, 1, 0, 1, 0)),
    ("The Calvin cycle", "Which enzyme fixes carbon dioxide in the Calvin cycle?", "RuBisCO.", (0, 2.3, 0, 1, 3, 0)),
    ("The Calvin cycle", "What is G3P?", "A three-carbon sugar made in the Calvin cycle. Some becomes glucose, the rest regenerates RuBP.", (1, 2.4, 1, 1, 2, 0)),
    ("The Calvin cycle", "How many turns of the Calvin cycle make one glucose?", "Six.", (6, 2.5, 2, 0, 2, 3)),
    ("Limiting factors", "Name the three factors that can limit photosynthesis.", "Light intensity, carbon dioxide concentration and temperature.", (15, 2.7, 4, 0, 5, 11)),
    ("Limiting factors", "Why does the rate fall at very high temperatures?", "Enzymes such as RuBisCO denature.", (2, 2.5, 1, 0, 1, 1)),
    ("Photosynthesis and respiration", "How are respiration's reactants and products related to photosynthesis?", "They are the reverse: respiration uses glucose and oxygen and releases carbon dioxide and water.", (6, 2.5, 3, 0, 3, 4)),
    ("Photosynthesis and respiration", "Why do plants release oxygen overall during the day?", "Photosynthesis is faster than respiration in daylight.", (0, 2.5, 0, 0, 0, 0)),
]
NEWTON_CARDS = [
    ("First law: inertia", "What is inertia?", "The tendency of an object to resist changes in its motion. It increases with mass.", (6, 2.5, 3, 0, 3, 3)),
    ("First law: inertia", "Why do passengers lurch forward when a bus brakes?", "Their bodies keep moving at the bus's earlier speed.", (2, 2.5, 1, 0, 1, 1)),
    ("Second law: F = ma", "State Newton's second law.", "Acceleration is proportional to the net force and inversely proportional to mass: F = ma.", (0, 2.5, 0, 0, 0, 0)),
    ("Second law: F = ma", "What is one newton?", "The force that accelerates a one kilogram mass at one metre per second squared.", (1, 2.4, 1, 0, 1, 0)),
    ("Third law: action and reaction", "Why do action and reaction forces not cancel?", "They act on different objects.", (15, 2.6, 4, 0, 5, 8)),
    ("Third law: action and reaction", "How does a rocket move upward?", "It pushes hot gas downward and the gas pushes the rocket up.", (6, 2.5, 3, 0, 3, 2)),
]
CARDS = [("photo",) + c for c in PHOTO_CARDS] + [("newton",) + c for c in NEWTON_CARDS]

# ======================================================================================================
# Quizzes. Question helpers match what the quiz generator stores.
# ======================================================================================================


def mcq(topic, q, options, correct, why, hint=""):
    return {"type": "mcq", "topic": topic, "question": q, "hint": hint, "options": options, "correct_index": correct, "answer": "", "explanation": why}


def tf(topic, q, is_true, why, hint=""):
    return {"type": "tf", "topic": topic, "question": q, "hint": hint, "options": [], "correct_index": 0 if is_true else 1, "answer": "", "explanation": why}


def fill(topic, q, answer, why, hint=""):
    return {"type": "fill", "topic": topic, "question": q, "hint": hint, "options": [], "correct_index": 0, "answer": answer, "explanation": why}


def short(topic, q, model, why, hint=""):
    return {"type": "short", "topic": topic, "question": q, "hint": hint, "options": [], "correct_index": 0, "answer": model, "explanation": why}


LIGHT, CALVIN, LIMIT, RESP = "Light-dependent reactions", "The Calvin cycle", "Limiting factors", "Photosynthesis and respiration"

LESSON_QUESTIONS = [
    mcq(LIGHT, "Where do the light-dependent reactions occur?", ["Stroma", "Thylakoid membranes", "Cell wall", "Nucleus"], 1, "The light reactions happen in the thylakoid membranes, where chlorophyll is embedded.", "Think of the stacked membranes inside the chloroplast."),
    tf(LIGHT, "Photolysis releases oxygen by splitting water molecules.", True, "Water is split during photolysis, and oxygen is the by-product."),
    mcq(LIGHT, "Which pair of molecules do the light reactions produce for the next stage?", ["Glucose and oxygen", "ATP and NADPH", "RuBP and G3P", "CO2 and water"], 1, "ATP and NADPH carry the energy to the Calvin cycle."),
    fill(CALVIN, "The enzyme _____ fixes carbon dioxide onto RuBP.", "RuBisCO", "RuBisCO catalyses carbon fixation at the start of the Calvin cycle."),
    mcq(CALVIN, "How many turns of the Calvin cycle are needed to make one glucose molecule?", ["One", "Three", "Six", "Twelve"], 2, "Each turn fixes one carbon dioxide and glucose has six carbons, so six turns."),
    tf(LIMIT, "Very high temperatures speed photosynthesis up without limit.", False, "High temperatures denature enzymes such as RuBisCO, so the rate falls sharply."),
    short(LIMIT, "Explain what a limiting factor is.", "The factor in shortest supply, such as light, carbon dioxide or temperature, which sets the maximum rate of photosynthesis.", "Whichever factor is lowest holds the rate down until it is increased."),
    mcq(RESP, "Why do plants release oxygen overall during the day?", ["They stop respiring", "Photosynthesis is faster than respiration", "Chlorophyll makes oxygen from sugar", "Respiration produces oxygen"], 1, "Plants respire all the time, but in light photosynthesis is faster, so oxygen is released overall."),
]

EXAM_QUESTIONS = [
    mcq(LIGHT, "What happens to chlorophyll's absorbed light energy in the light reactions?", ["It is stored as starch", "It makes ATP and NADPH and splits water", "It is reflected as green light", "It fixes carbon dioxide"], 1, "The energy drives photolysis and the synthesis of ATP and NADPH."),
    fill(CALVIN, "The three-carbon sugar produced in the Calvin cycle is called _____.", "G3P", "G3P either leaves to build glucose or regenerates RuBP."),
    short(CALVIN, "Describe what happens to G3P in the Calvin cycle.", "Some G3P leaves the cycle to build glucose and other carbohydrates, and the rest regenerates RuBP so the cycle continues.", "G3P has two fates: carbohydrate synthesis and regeneration of RuBP."),
    tf(LIMIT, "If light intensity is increased and the rate stays the same, another factor must be limiting.", True, "When more light no longer helps, carbon dioxide or temperature is the limiting factor."),
    mcq(LIMIT, "Which is NOT a factor that limits photosynthesis?", ["Light intensity", "Carbon dioxide concentration", "Temperature", "Soil colour"], 3, "Soil colour does not directly limit the rate."),
    mcq(RESP, "Respiration compared with photosynthesis has:", ["The same products", "Reversed reactants and products", "No oxygen involved", "Only occurs at night"], 1, "Respiration uses glucose and oxygen and releases carbon dioxide and water."),
]

CALVIN_QUESTIONS = [
    mcq(CALVIN, "Where does the Calvin cycle take place?", ["Thylakoid membrane", "Stroma", "Mitochondrion", "Cell membrane"], 1, "The Calvin cycle runs in the stroma."),
    fill(CALVIN, "RuBisCO attaches carbon dioxide to a five-carbon sugar called _____.", "RuBP", "RuBP is the five-carbon acceptor that is regenerated each turn."),
    tf(CALVIN, "The Calvin cycle uses ATP and NADPH made in the light reactions.", True, "These carriers supply the energy and reducing power for sugar synthesis."),
    short(CALVIN, "Why is the Calvin cycle called the light-independent reactions?", "It does not use light directly. It uses the ATP and NADPH that the light reactions made.", "It depends on the products of the light reactions, not on light itself."),
    mcq(CALVIN, "What is the main enzyme of carbon fixation?", ["Amylase", "RuBisCO", "ATP synthase", "Catalase"], 1, "RuBisCO fixes carbon dioxide onto RuBP."),
]

MIXED_QUESTIONS = [
    mcq(LIGHT, "Which gas is released during photolysis?", ["Carbon dioxide", "Nitrogen", "Oxygen", "Hydrogen"], 2, "Splitting water releases oxygen."),
    mcq("First law: inertia", "A passenger lurches forward when a bus brakes because of:", ["Gravity", "Inertia", "Friction", "Reaction force"], 1, "The body keeps its earlier motion: inertia."),
    fill("Second law: F = ma", "In F = ma, the letter m stands for _____.", "mass", "m is the mass of the object."),
    tf("Third law: action and reaction", "Action and reaction forces act on the same object.", False, "They act on different objects, so they do not cancel."),
    short(CALVIN, "Name the enzyme that fixes carbon dioxide and say where it works.", "RuBisCO, in the stroma of the chloroplast.", "RuBisCO catalyses carbon fixation in the stroma."),
    mcq("Second law: F = ma", "A larger mass pushed with the same force has:", ["Greater acceleration", "Smaller acceleration", "No acceleration", "Constant speed"], 1, "a = F/m, so more mass means less acceleration."),
]

# key, docs, title, scope, topic, mode, questions
QUIZZES = [
    {"key": "lesson", "docs": ["photo"], "title": "Photosynthesis: full lesson quiz", "scope": "lesson", "topic": "", "mode": "practice", "questions": LESSON_QUESTIONS},
    {"key": "exam", "docs": ["photo"], "title": "Photosynthesis: mock exam", "scope": "lesson", "topic": "", "mode": "exam", "questions": EXAM_QUESTIONS},
    {"key": "calvin", "docs": ["photo"], "title": "The Calvin cycle: topic quiz", "scope": "topic", "topic": CALVIN, "mode": "practice", "questions": CALVIN_QUESTIONS},
    {"key": "mixed", "docs": ["photo", "newton"], "title": "Mixed quiz: Photosynthesis + Newton's Laws of Motion", "scope": "mixed", "topic": "", "mode": "practice", "questions": MIXED_QUESTIONS},
]

# quiz key, days ago, indexes of questions answered wrongly, seconds taken
ATTEMPTS = [
    ("lesson", 11, [1, 4, 6], 410),
    ("lesson", 5, [6], 330),
    ("exam", 3, [2, 4], 540),
    ("calvin", 1, [1, 3, 4], 180),
]

# ======================================================================================================
# Extras, highlights, exams, podcast, share, group
# ======================================================================================================

MINDMAP = {"center": "Photosynthesis", "branches": [
    {"title": "Light reactions", "children": ["Thylakoid membranes", "Chlorophyll absorbs light", "Photolysis releases oxygen", "Makes ATP and NADPH"]},
    {"title": "Calvin cycle", "children": ["Happens in the stroma", "RuBisCO fixes carbon dioxide", "G3P builds glucose", "Six turns per glucose"]},
    {"title": "Limiting factors", "children": ["Light intensity", "Carbon dioxide level", "Temperature and enzymes"]},
    {"title": "Respiration link", "children": ["Reverse reactants and products", "Plants do both", "Net oxygen in daylight"]},
    {"title": "Where", "children": ["Chloroplast", "Green plants and algae"]},
]}

CHEATSHEET = """## Key terms

* **Photosynthesis**: light energy converted to chemical energy stored in glucose.
* **Chlorophyll**: green pigment that absorbs red and blue light.
* **Photolysis**: splitting of water in the light reactions, releasing oxygen.
* **ATP and NADPH**: energy carriers made in the light reactions.
* **RuBisCO**: enzyme that fixes carbon dioxide onto RuBP.
* **G3P**: three-carbon sugar made in the Calvin cycle.

## Facts, formulas and dates

* 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2
* Light reactions: thylakoid membranes. Calvin cycle: stroma.
* Six turns of the Calvin cycle make one glucose.

## How things connect

* The light reactions make ATP and NADPH, and the Calvin cycle spends them to build sugar.
* Respiration is the reverse in terms of reactants and products.

## Common mistakes

* Saying the Calvin cycle needs no light at all: it needs the products of the light reactions.
* Blaming high-temperature slowdown on light: it is enzyme denaturation.
"""

# doc key, level, topic, exact text that sits inside one plain paragraph of that summary, note
HIGHLIGHTS = [
    ("photo", "intermediate", "", "Whichever is in shortest supply is the", "Exam favourite: limiting factor logic."),
    ("photo", "intermediate", "", "Making one glucose takes six turns.", "Six turns because glucose has six carbons."),
]

EXAMS = [
    {"name": "Biology unit test", "in_days": 6, "docs": ["photo"]},
    {"name": "Physics class quiz", "in_days": 13, "docs": ["newton"]},
]

PODCAST_SCRIPT = [
    ("Alex", "curious", "Today we are talking about photosynthesis. I know plants use sunlight, but how does that become food?"),
    ("Sam", "warm", "Think of it as two stages. The first stage catches light, and the second stage uses that energy to build sugar from carbon dioxide."),
    ("Alex", "interested", "So what is happening in the first stage?"),
    ("Sam", "clear", "Chlorophyll in the thylakoid membranes absorbs light and uses it to split water. That releases oxygen, and it makes two energy carriers called ATP and NADPH."),
    ("Alex", "surprised", "So the oxygen we breathe is basically a by-product of splitting water?"),
    ("Sam", "amused", "Exactly. Then in the stroma, the Calvin cycle spends the ATP and NADPH. An enzyme called RuBisCO grabs carbon dioxide and the cycle ends up making a three-carbon sugar called G3P."),
    ("Alex", "thoughtful", "And that sugar becomes glucose?"),
    ("Sam", "encouraging", "Some of it does. The rest rebuilds the starting molecule so the cycle keeps going. It takes six turns to make one glucose."),
    ("Alex", "curious", "What slows the whole thing down?"),
    ("Sam", "clear", "Light intensity, carbon dioxide and temperature. Whichever one is in shortest supply is the limiting factor."),
    ("Alex", "summarising", "So light reactions make the energy carriers, the Calvin cycle builds the sugar, and the shortest supply sets the speed."),
    ("Sam", "warm", "Perfect. Remember those three ideas and you have the chapter."),
]

SHARE_TOKEN = "demo-photosynthesis"
GROUP = {"name": "Demo study group", "code": "STUDY7"}
FRIENDS = [
    {"email": "riya.demo@studymate.app", "name": "Riya", "xp": 135},
    {"email": "arjun.demo@studymate.app", "name": "Arjun", "xp": 95},
]
DEMO = {"email": "demo@studymate.app", "name": "Demo Student", "goal": 100, "subjects": ["Biology", "Physics"]}

# ======================================================================================================
# Activity history: sixteen days, a twelve-day streak, a few quiet days earlier
# ======================================================================================================

ACTIVITY_KINDS = {"summary", "flashcard", "quiz", "focus", "bonus", "explain"}


def answers_for(questions: list[dict], wrong: list[int]) -> list:
    """The answers a student who got exactly the questions in `wrong` wrong would have given."""
    out = []
    for i, q in enumerate(questions):
        bad = i in wrong
        if q["type"] == "mcq":
            out.append((q["correct_index"] + 1) % 4 if bad else q["correct_index"])
        elif q["type"] == "tf":
            out.append(1 - q["correct_index"] if bad else q["correct_index"])
        else:
            out.append("I am not sure" if bad else q["answer"])
    return out


def activity_events(today: date) -> list[dict]:
    """[{days_ago, minute_of_day (UTC), kind, xp, minutes}]. Deterministic. Quiz XP matches ATTEMPTS."""
    rnd = random.Random(2026)
    quiz_by_day = {}
    by_key = {q["key"]: q for q in QUIZZES}
    for key, days_ago, wrong, seconds in ATTEMPTS:
        total = len(by_key[key]["questions"])
        quiz_by_day.setdefault(days_ago, []).append((10 * (total - len(wrong)), seconds / 60))

    events = []

    def add(d, minute, kind, xp, minutes=0.0):
        events.append({"days_ago": d, "minute": minute, "kind": kind, "xp": xp, "minutes": round(minutes, 2)})

    for d in range(0, 16):
        if d == 12:
            continue  # one quiet day, so the streak shows a clear start at twelve
        base = 300 + rnd.randint(0, 120)  # 05:00 to 07:00 UTC is 10:30 to 12:30 in India
        if d in (0, 2, 4, 6, 8, 10, 13, 15) or d == 1:
            add(d, base, "summary", 5, 4)
        n_cards = 12 if d == 0 else rnd.randint(7, 16)
        for i in range(n_cards):
            add(d, base + 20 + i, "flashcard", rnd.choice([2, 3, 3, 3]), 0.5)
        if d == 0 or d % 3 == 1:
            add(d, base + 60, "focus", 25, 25)
        if d in (7, 2):
            add(d, base + 90, "explain", rnd.choice([9, 12]), 2)
        for xp, minutes in quiz_by_day.get(d, []):
            add(d, base + 120, "quiz", xp, minutes)
    return events


def friend_events(xp: int) -> list[dict]:
    """A few events inside this week for a friend, so the group leaderboard has something to rank."""
    parts = [xp // 3, xp // 3, xp - 2 * (xp // 3)]
    return [{"kind": k, "xp": x, "minutes": m} for k, x, m in zip(["quiz", "flashcard", "focus"], parts, [12, 6, 25])]
