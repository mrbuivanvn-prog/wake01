#!/bin/bash
# ── Wake & Learn — system start-up ───────────────────────────────────────────
# Starts FastAPI backend (port 8000) + Next.js/static frontend (port 3000)

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$HOME/new/wake-and-learn"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# ── Load environment variables from .env (nếu có) ─────────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}📄 Đang load biến môi trường từ .env...${NC}"
    set -a
    source "$PROJECT_DIR/.env"
    set +a

    if [ -n "$GEMINI_API_KEY" ] || [ -n "$GOOGLE_API_KEY" ]; then
        echo -e "${GREEN}✅ Đã load Gemini API key → Sẽ dùng Gemini cho chất lượng thẻ cao${NC}"
    fi
fi

# ── 1. Stop existing processes ────────────────────────────────────────────────
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}   🚀 Wake and Learn — Khởi động${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "${YELLOW}📌 Dừng process cũ...${NC}"
pkill -9 -f uvicorn    2>/dev/null
pkill -9 -f "next start" 2>/dev/null
pkill -9 -f "http.server" 2>/dev/null
fuser -k 8000/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
sleep 1
echo -e "${GREEN}✅ Đã dọn dẹp${NC}"

# ── 2. Virtual-env check ─────────────────────────────────────────────────────
if [ ! -d "$PROJECT_DIR/venv" ]; then
    echo -e "${YELLOW}📦 Tạo virtual environment...${NC}"
    python3 -m venv "$PROJECT_DIR/venv"
fi

# ── 3. Install Python deps ───────────────────────────────────────────────────
echo -e "${YELLOW}📦 Cài đặt Python dependencies...${NC}"
source "$PROJECT_DIR/venv/bin/activate"
pip install -q -r "$BACKEND_DIR/requirements.txt" 2>/dev/null || \
pip install -q fastapi uvicorn sqlalchemy requests bcrypt PyJWT python-dotenv google-generativeai 2>/dev/null

# ── Gemini API (optional but recommended for high quality cards) ─────────────
if [ -z "$GEMINI_API_KEY" ] && [ -z "$GOOGLE_API_KEY" ]; then
    echo -e "${YELLOW}💡 Tip: Tạo file .env ở thư mục gốc và thêm dòng:${NC}"
    echo -e "${YELLOW}   GEMINI_API_KEY=your_key_here${NC}"
    echo -e "${YELLOW}   → Script sẽ tự động load khi chạy lại${NC}"
fi

# ── 4. DB init + ensure demo user (demo/demo123) ─────────────────────────────
cd "$BACKEND_DIR"
python3 -c "
from app.database import engine, Base, SessionLocal
from app.models import User, UserSettings
import bcrypt
Base.metadata.create_all(bind=engine)
db = SessionLocal()
demo = db.query(User).filter(User.username == 'demo').first()
pwd_hash = bcrypt.hashpw(b'demo123', bcrypt.gensalt()).decode('utf-8')
if not demo:
    demo = User(username='demo', email='demo@example.com', password=pwd_hash)
    db.add(demo)
    db.flush()
    db.add(UserSettings(user_id=demo.id, daily_goal=5))
    print('✅ Demo user created (demo/demo123)')
else:
    if not demo.password or not bcrypt.checkpw(b'demo123', demo.password.encode()):
        demo.password = pwd_hash
        print('✅ Demo password reset to demo123')
db.commit()
db.close()
print('✅ DB ready')
" 2>&1 || echo '⚠️ DB init warning - check manually'

# ── 5. Start FastAPI backend ─────────────────────────────────────────────────
echo -e "${YELLOW}🚀 Khởi động Backend (port 8000)...${NC}"
cd "$BACKEND_DIR"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
sleep 3

if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend hoạt động (PID: $BACKEND_PID)${NC}"
else
    echo -e "${RED}❌ Backend không khởi động được — xem /tmp/backend.log${NC}"
fi

# ── 6. Start Next.js frontend (already built) ────────────────────────────────
echo -e "${YELLOW}🚀 Khởi động Frontend (port 3000)...${NC}"
cd "$FRONTEND_DIR"

# Source NVM if it exists to ensure Node/Next is found
[ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"

npx next start -p 3000 > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 2
echo -e "${GREEN}✅ Frontend Next.js đã chạy (PID: $FRONTEND_PID)${NC}"

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✨ HỆ THỐNG ĐÃ SẴN SÀNG!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}📍 Frontend: ${GREEN}http://localhost:3000${NC}"
echo -e "${YELLOW}📍 Backend  : ${GREEN}http://localhost:8000/api/docs${NC}"
echo -e "${YELLOW}📍 Ollama   : ${GREEN}http://localhost:11434${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "$BACKEND_PID$FRONTEND_PID" > /tmp/wake_pids

# ── trap Ctrl+C ──────────────────────────────────────────────────────────────
trap "echo ''; echo -e '${RED}🛑 Đang dừng...${NC}'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm -f /tmp/wake_pids; exit" INT
wait
