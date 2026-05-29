from sqlalchemy import Column, Integer, String, Float, Boolean, Date, ForeignKey, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import date, datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)
    password = Column(String(200), nullable=False)
    email = Column(String(200))
    created_at = Column(DateTime, default=datetime.now)

class UserSettings(Base):
    __tablename__ = "user_settings"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    alarm_mode = Column(String(20), default="soft")
    daily_goal = Column(Integer, default=5)
    profession = Column(String(100), default="Công nghệ thông tin (IT)")
    learning_language = Column(String(10), default="en")
    streak_days = Column(Integer, default=0)
    last_learned = Column(Date)

class VocabularyGroup(Base):
    __tablename__ = "vocabulary_groups"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    language = Column(String(10), nullable=False)
    profession = Column(String(100))
    created_by_user = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

class Vocabulary(Base):
    __tablename__ = "vocabularies"
    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("vocabulary_groups.id"))
    word = Column(String(200), nullable=False) # Tiêu đề chính
    word_en = Column(String(200))
    word_zh = Column(String(200))
    pinyin = Column(String(200))
    meaning = Column(Text)
    pronunciation = Column(String(200))
    mode = Column(String(20), default="en") # en, zh, trilingual
    level = Column(String(20))
    example = Column(Text) # Câu ví dụ EN hoặc ZH
    example_zh = Column(Text) # Câu ví dụ ZH nếu học 3 ngôn ngữ
    example_vi = Column(Text) # Câu ví dụ VI
    conversation = Column(Text)
    cloze_text = Column(Text)
    image_url = Column(Text)

class UserLearning(Base):
    __tablename__ = "user_learning"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    vocab_id = Column(Integer, ForeignKey("vocabularies.id"))
    mastery = Column(Float, default=0.0)
    review_interval = Column(Integer, default=1)
    next_review = Column(Date, default=date.today)
    is_mastered = Column(Boolean, default=False)
    consecutive_correct = Column(Integer, default=0)
    last_reviewed = Column(DateTime, default=datetime.now)

class GameScore(Base):
    __tablename__ = "game_scores"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    score = Column(Integer, default=0)
    level = Column(Integer, default=1)
    game_mode = Column(String(50), default="snake")  # snake | balloon | sentence
    played_at = Column(DateTime, default=datetime.now)
