import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))

import eval_ai as E

NOTES = "Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the thylakoid membranes."


def test_grounding_is_high_for_supported_text_and_low_for_invented_text():
    assert E.grounding("Chlorophyll absorbs light in the thylakoid membranes.", NOTES) == 1.0
    assert E.grounding("Mitochondria generate ATP through oxidative phosphorylation.", NOTES) < 0.3
    assert E.grounding("", NOTES) == 0.0


def test_grounding_tolerates_word_endings_and_markdown():
    assert E.grounding("**Photosynthetic** chemical energy", NOTES) == 1.0


def test_script_share_tells_hindi_from_english():
    assert E.script_share("पौधे सूर्य के प्रकाश से भोजन बनाते हैं", 0x0900, 0x097F) > 0.95
    assert E.script_share("Plants make food using sunlight", 0x0900, 0x097F) == 0.0
    assert 0.3 < E.script_share("प्रकाश संश्लेषण (photosynthesis)", 0x0900, 0x097F) < 0.9


def test_ratio_handles_empty():
    assert E.ratio(0, 0) == 0.0 and E.ratio(3, 4) == 0.75
