from pydantic import BaseModel
from typing import List, Optional
from datetime import date

class VocabularyGroupCreate(BaseModel):
    name: str
    language: str
    profession: str
    words: List[dict]

class LearningSession(BaseModel):
    vocab_id: int
    is_correct: bool
    pronunciation_score: Optional[float] = None

class AlarmConfig(BaseModel):
    mode: str  # 'soft', 'strict', 'hardcore'
    ringtone: str
    wake_up_hour: int
    wake_up_minute: int

class UserGoal(BaseModel):
    target_words: int
    target_days: int

class CardCreate(BaseModel):
    word: str
    word_en: Optional[str] = None
    word_zh: Optional[str] = None
    pinyin: Optional[str] = None
    meaning: Optional[str] = None
    pronunciation: Optional[str] = None
    example: Optional[str] = None
    example_zh: Optional[str] = None
    example_vi: Optional[str] = None
    conversation: Optional[str] = None
    cloze_text: Optional[str] = None
    image_url: Optional[str] = None

class BatchImportCardRequest(BaseModel):
    cards: List[CardCreate]
    group_name: str
    language: str   # "en", "zh", "trilingual"