from app.database import init_db, SessionLocal
from app.models import User, UserSettings, VocabularyGroup, Vocabulary, UserLearning
from datetime import date, datetime
import json
import os

def seed():
    init_db()
    db = SessionLocal()
    
    db.query(UserLearning).delete()
    db.query(Vocabulary).delete()
    db.query(VocabularyGroup).delete()
    db.query(UserSettings).delete()
    db.query(User).delete()
    
    from app.main import get_password_hash
    demo = User(username="demo", password=get_password_hash("demo123"), created_at=datetime.now())
    db.add(demo)
    db.flush()
    
    settings = UserSettings(user_id=demo.id, daily_goal=5, profession="Công nghệ thông tin (IT)")
    db.add(settings)
    
    group = VocabularyGroup(name="Default_EN", language="trilingual", profession="IT", created_by_user=False)
    db.add(group)
    db.flush()
    
    examples_path = os.path.join(os.path.dirname(__file__), "..", "prod-data", "trilingual_it.json")
    with open(examples_path, encoding="utf-8") as f:
        examples = json.load(f)
    
    sample_words = ["algorithm", "api", "database", "docker", "kubernetes", 
                    "cache", "server", "frontend", "backend", "debug",
                    "git", "cloud", "encryption", "firewall", "redis",
                    "promise", "async", "await", "branch", "deploy",
                    "scaling", "scalability", "migration", "pipeline", "endpoint",
                    "macos", "linux", "python", "nodejs", "react"]
    
    for word in sample_words:
        ex = examples.get(word, {})
        if not ex:
            ex = examples.get(word.capitalize(), {})
        vocab = Vocabulary(
            group_id=group.id,
            word=word,
            word_en=ex.get("en", word),
            word_zh=ex.get("zh", word),
            pinyin=ex.get("pinyin", ""),
            meaning=ex.get("vi", word),
            pronunciation=f"/{word}/",
            mode="trilingual",
            level="A1",
            example=ex.get("example_en", f"The {word} is used in IT."),
            example_zh=ex.get("example_zh", ""),
            example_vi=ex.get("example_vi", ""),
            cloze_text=ex.get("example_en", "").replace(word, "_____") if word in ex.get("example_en", "").lower() else "",
            image_url=f"https://image.pollinations.ai/prompt/clean%203D%20render%20of%20{word}%20technology%20icon?width=400&height=400"
        )
        db.add(vocab)
        db.flush()
        learning = UserLearning(vocab_id=vocab.id, user_id=demo.id, next_review=date.today())
        db.add(learning)
    
    db.commit()
    print(f"✅ Seeded database with demo user: demo/demo123 ({len(sample_words)} trilingual cards)")
    db.close()

if __name__ == "__main__":
    seed()