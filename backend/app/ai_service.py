"""Optimized AI Service for Wake & Learn.

Priority: Local data → Gemini → Ollama 3b fallback
- CC-CEDICT: English word → Chinese + pinyin  
- EN-VI JSON: English → Vietnamese
- EXAMPLES_IT: IT context examples
- Gemini/Ollama: Fallback for missing data
"""
import json
import os
import re
import sqlite3
import requests
from typing import Dict, Tuple, Optional

PINYIN_TONES = {
    'a': {1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à'},
    'e': {1: 'ē', 2: 'é', 3: 'ě', 4: 'è'},
    'i': {1: 'ī', 2: 'í', 3: 'ǐ', 4: 'ì'},
    'o': {1: 'ō', 2: 'ó', 3: 'ǒ', 4: 'ò'},
    'u': {1: 'ū', 2: 'ú', 3: 'ǔ', 4: 'ù'},
}

def numbered_pinyin_to_marks(pinyin_num: str) -> str:
    if not pinyin_num:
        return ""
    syllables = pinyin_num.split()
    result_syllables = []
    for syllable in syllables:
        match = re.match(r'^(.+?)(\d)$', syllable)
        if match:
            base, tone = match.group(1), int(match.group(2))
            for c in reversed(base):
                if c in 'aeiouAEIOU':
                    last_vowel = c
                    break
            if last_vowel in PINYIN_TONES and tone in PINYIN_TONES[last_vowel]:
                pos = base.rfind(last_vowel)
                result_syllables.append(base[:pos] + PINYIN_TONES[last_vowel][tone] + base[pos+1:])
            else:
                result_syllables.append(syllable)
        else:
            result_syllables.append(syllable)
    return ' '.join(result_syllables)


PROD_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "prod-data")
CEDICT_DB = os.path.join(PROD_DATA_DIR, "cedict.db")
ENVI_JSON = os.path.join(PROD_DATA_DIR, "en_vi.json")
EXAMPLES_JSON = os.path.join(PROD_DATA_DIR, "examples_it.json")
TRILINGUAL_JSON = os.path.join(PROD_DATA_DIR, "trilingual_it.json")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class AIService:
    def __init__(self):
        self.en_vi = {}
        if os.path.exists(ENVI_JSON):
            with open(ENVI_JSON, encoding="utf-8") as f:
                self.en_vi = json.load(f)

        self._cedict_conn: sqlite3.Connection | None = None
        if os.path.exists(CEDICT_DB):
            self._cedict_conn = sqlite3.connect(CEDICT_DB, check_same_thread=False)

        self.examples_it = {}
        if os.path.exists(EXAMPLES_JSON):
            with open(EXAMPLES_JSON, encoding="utf-8") as f:
                self.examples_it = json.load(f)
        
        self.trilingual_data = {}
        if os.path.exists(TRILINGUAL_JSON):
            with open(TRILINGUAL_JSON, encoding="utf-8") as f:
                self.trilingual_data = json.load(f)

    def _ai_generate(self, prompt: str, timeout: int = 30) -> str:
        if GEMINI_API_KEY:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
                r = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.7}}, timeout=timeout)
                if r.ok:
                    data = r.json()
                    if data.get("candidates"):
                        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
            except Exception as e:
                print(f"[Gemini] Error: {e}")

        try:
            r = requests.post("http://localhost:11434/api/generate",
                json={"model": "qwen2.5:3b", "prompt": prompt, "stream": False, "options": {"temperature": 0.7, "num_predict": 200}},
                timeout=30)
            if r.ok:
                return r.json().get("response", "").strip()
        except Exception as e:
            print(f"[Ollama] Error: {e}")
        return ""

    def get_chinese_pinyin(self, word_en: str) -> Tuple[str, str]:
        if self._cedict_conn:
            rows = self._cedict_conn.execute("SELECT zh, py, en FROM ces WHERE lower(en) = ?", (word_en.lower(),)).fetchall()
            for zh, py, en_def in rows:
                parts = en_def.lower().split('(')[0].split('[')[0].strip()
                if parts == word_en.lower():
                    return (zh, numbered_pinyin_to_marks(py))

        # Fallback: use examples_it.json
        if word_en.lower() in self.examples_it:
            zh = self.examples_it[word_en.lower()].get("zh", "")
            if zh and "在" in zh:
                words = zh.replace("在软件开发中被广泛应用", "").replace("中应用广泛", "")
                if 0 < len(words) < 20:
                    return (words, "")
        return ("", "")

    def get_vietnamese(self, word_en: str) -> str:
        word_lower = word_en.lower().strip()
        if word_lower in self.en_vi:
            return self.en_vi[word_lower]
        return word_en.capitalize()

    def get_phonetics(self, word: str, lang: str = "en") -> str:
        if lang == "zh":
            try:
                from pypinyin import pinyin, Style
                return " ".join([item[0] for item in pinyin(word, style=Style.TONE)])
            except ImportError:
                return f"[{word}]"
        try:
            import eng_to_ipa as ipa_lib
            ipa = ipa_lib.convert(word)
            return f"/{ipa}/" if not ipa.endswith("*") else f"/{word}/"
        except ImportError:
            return f"/{word}/"

    def _make_example(self, word_en: str, word_zh: str, meaning_vi: str, profession: str) -> Tuple[str, str, str]:
        word_lower = word_en.lower()

        # From examples_it.json
        if word_lower in self.examples_it:
            data = self.examples_it[word_lower]
            ex_en = data.get("en") or ""
            ex_zh = data.get("zh") or ""
            ex_vi = data.get("vi") or ""
            # Prepend word if not in example (for cloze to work)
            if word_en.lower() not in ex_en.lower():
                ex_en = f"{word_en} {ex_en}"
            # Fallback for missing fields
            if not ex_zh:
                ex_zh = f"{word_zh or word_en}是软件开发中的重要概念。"
            if not ex_vi:
                ex_vi = f"{meaning_vi or word_en} là thuật ngữ cần thiết。"
            return (ex_en, ex_zh, ex_vi)

        # Generic template - always returns valid values
        ex_en = f"The {word_en} is important in software development."
        ex_vi = f"{meaning_vi or word_en} là thuật ngữ cần thiết."
        ex_zh = f"{word_zh or word_en}是软件开发中的重要概念。"

        return (ex_en, ex_zh, ex_vi)

    def make_card_complete(self, word: str, lang: str = "trilingual", profession: str = "Tổng quát") -> Dict:
        word_en = word.strip()
        word_lower = word_en.lower()

        # 1. First check trilingual_it.json (highest priority - complete data)
        word_zh, pinyin, vi, ex_en, ex_zh, ex_vi = "", "", "", "", "", ""
        if word_lower in self.trilingual_data:
            data = self.trilingual_data[word_lower]
            word_zh = data.get("zh", "") or data.get("word_zh", "")
            pinyin = data.get("pinyin", "")
            vi = data.get("vi", "") or data.get("meaning", "")
            ex_en = data.get("example_en", "")
            ex_zh = data.get("example_zh", "")
            ex_vi = data.get("example_vi", "")
            if ex_en and word_en.lower() not in ex_en.lower():
                ex_en = f"{word_en} {ex_en}"

        # 2. If still missing, get from local DB
        if not word_zh:
            word_zh, pinyin = self.get_chinese_pinyin(word_en)
        if not vi:
            vi = self.get_vietnamese(word_en)
        
        # 3. Check examples from local JSON (fallback for missing examples)
        if not ex_en or not ex_zh or not ex_vi:
            ex_en, ex_zh, ex_vi = "", "", ""
            if word_lower in self.examples_it:
                data = self.examples_it[word_lower]
                ex_en = data.get("en", "")
                ex_zh = data.get("zh", "")
                ex_vi = data.get("vi", "")
                if ex_en and word_en.lower() not in ex_en.lower():
                    ex_en = f"{word_en} {ex_en}"

        # 4. Check if we need AI (skip if we got complete data from trilingual_data)
        needs_ai = True  # Default to True
        if word_lower in self.trilingual_data:
            data_src = self.trilingual_data[word_lower]
            src_zh = data_src.get("zh", "") or data_src.get("word_zh", "")
            src_vi = data_src.get("vi", "") or data_src.get("meaning", "")
            src_ex_en = data_src.get("example_en", "")
            src_ex_zh = data_src.get("example_zh", "")
            src_ex_vi = data_src.get("example_vi", "")
            # Accept any data that exists (skip AI if we have content in trilingual_data)
            if src_zh and src_ex_en and src_ex_zh and src_ex_vi:
                needs_ai = False
        
# Detect completely garbage templates and force AI
        template_patterns = [
            "is fundamental in modern software",
            "is important in software development and IT systems",
            "is commonly used in IT and software development",
            "是在软件开发中被广泛应用",
            "是软件开发中的重要概念",
            "是 công nghệ thường xuyến được sử dụng trong IT",
            "là công nghệ thường xuyên được sử dụng trong IT",
            "là thuật ngữ cần thiết",
        ]
        if any(p in ex_en.lower() or p in ex_zh for p in template_patterns):
            needs_ai = True
            
        if needs_ai:
            prompt = f"""You are a professional dictionary and language teacher. Provide a JSON response for the word '{word_en}' in the context of '{profession}'.
Return ONLY a valid JSON object. No markdown, no intro text, no trailing commas.
Required JSON format:
{{
  "word_zh": "Chinese translation (simplified)",
  "pinyin": "pinyin with tone marks",
  "meaning": "Vietnamese translation",
  "example_en": "A practical English example sentence containing '{word_en}'",
  "example_zh": "Chinese translation of the example sentence",
  "example_vi": "Vietnamese translation of the example sentence"
}}"""
            # Increase timeout drastically (120s) because local Ollama inference can be slow
            ai_resp = self._ai_generate(prompt, timeout=120)
            if ai_resp:
                try:
                    # Robust JSON extraction
                    match = re.search(r'\{[\s\S]*\}', ai_resp)
                    if match:
                        clean_resp = match.group(0)
                        data = json.loads(clean_resp)
                        
                        if not word_zh or word_zh == word_en:
                            word_zh = data.get("word_zh", word_en)
                            pinyin = data.get("pinyin", "")
                        if not vi or vi == word_en.capitalize():
                            vi = data.get("meaning", word_en.capitalize())
                        
                        if not ex_en:
                            ex_en = data.get("example_en", "")
                            ex_zh = data.get("example_zh", "")
                            ex_vi = data.get("example_vi", "")
                    else:
                        print(f"[AI Parse Error]: No JSON found in response - Raw: {ai_resp}")
                except Exception as e:
                    print(f"[AI Parse Error]: {e} - Raw: {ai_resp}")

        # 4. Final Fallbacks
        if not word_zh: word_zh = word_en
        if not pinyin and word_zh == word_en:
            try:
                from pypinyin import pinyin as py_func, Style
                pinyin = " ".join([item[0] for item in py_func(word_en, style=Style.TONE)])
            except:
                pinyin = ""
        if not vi: vi = word_en.capitalize()
        
        if not ex_en:
            ex_en = f"The {word_en} is important in {profession}."
            ex_zh = f"{word_zh}在{profession}中很重要。"
            ex_vi = f"{vi} rất quan trọng trong {profession}."

        pronunciation = self.get_phonetics(word_en, "en")

        # Cloze text - try word_en
        cloze = re.sub(re.escape(word_en), "_____", ex_en, count=1, flags=re.IGNORECASE) if ex_en and word_en.lower() in ex_en.lower() else ""

        return {
            "mode": lang if lang in ("en", "zh", "trilingual") else "trilingual",
            "word_en": word_en,
            "word_zh": word_zh,
            "pinyin": pinyin,
            "meaning": vi,
            "pronunciation": pronunciation,
            "example_en": ex_en,
            "example_zh": ex_zh,
            "example_vi": ex_vi,
            "cloze_text": cloze,
        }

    def translate(self, word: str, lang: str = "en", profession: str = "Tổng quát") -> str:
        if lang == "zh":
            zh, _ = self.get_chinese_pinyin(word)
            return zh or ""
        return self.get_vietnamese(word) or word

    def example_trilingual(self, word_en: str, word_zh: str, meaning_vi: str, profession: str = "Tổng quát") -> Dict:
        ex_en, ex_zh, ex_vi = self._make_example(word_en, word_zh, meaning_vi, profession)
        return {"en": ex_en, "zh": ex_zh, "vi": ex_vi}

    def example(self, word: str, meaning: str = "", lang: str = "en", profession: str = "Tổng quát") -> Dict:
        ex_en, _, ex_vi = self._make_example(word, "", meaning or word, profession)
        return {"en": ex_en, "vi": ex_vi}

    def cloze(self, word: str, example: str, lang: str = "en") -> str:
        if not example or not word:
            return example or ""
        return re.compile(re.escape(word), re.IGNORECASE).sub("_____", example, count=1)


ai_service = AIService()