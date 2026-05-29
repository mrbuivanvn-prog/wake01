// snake_game.js - Canvas-based snake games for vocabulary learning
// Game 1: S1 - Snake EN→VI (s1Canvas)
// Game 4: S2 - Snake Sentence building (s2Canvas)

const CELL_SIZE = 30;

// ===== S1 GAME: Snake EN→VI =====
let s1Canvas, s1Ctx;
let s1Snake = [], s1Dir = {x: 1, y: 0}, s1NextDir = {x: 1, y: 0};
let s1Interval, s1Cols, s1Rows;
let s1Score = 0, s1Level = 1, s1Lives = 3, s1Playing = false;
let s1TargetWords = [], s1CurrentTarget = null;

// ===== S2 GAME: Snake Sentence Building =====
let s2Canvas, s2Ctx;
let s2Snake = [], s2Dir = {x: 1, y: 0};
let s2Interval, s2Cols, s2Rows;
let s2Sentences = [], s2SentenceIdx = 0, s2Tokens = [];
let s2Score = 0, s2Level = 1, s2Lives = 3, s2Playing = false;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initCanvases);

function initCanvases() {
    const s1 = document.getElementById('s1Canvas');
    if (s1) {
        s1Canvas = s1;
        s1Ctx = s1.getContext('2d');
        setupS1Canvas();
        s1.setAttribute('tabindex', '0');
    }
    const s2 = document.getElementById('s2Canvas');
    if (s2) {
        s2Canvas = s2;
        s2Ctx = s2.getContext('2d');
        setupS2Canvas();
        s2.setAttribute('tabindex', '0');
    }
}

function setupS1Canvas() {
    s1Canvas.width = 600;
    s1Canvas.height = 400;
    s1Cols = Math.floor(s1Canvas.width / CELL_SIZE);
    s1Rows = Math.floor(s1Canvas.height / CELL_SIZE);
}

function setupS2Canvas() {
    s2Canvas.width = 600;
    s2Canvas.height = 400;
    s2Cols = Math.floor(s2Canvas.width / CELL_SIZE);
    s2Rows = Math.floor(s2Canvas.height / CELL_SIZE);
}

// ===== S1 Game Functions =====
window.startSnake1Game = async function() {
    if (!s1Canvas) {
        if (typeof showToast === 'function') showToast('Canvas chưa sẵn sàng');
        return;
    }
    
    // Reset state
    s1Score = 0; s1Level = 1; s1Lives = 3; s1Playing = true;
    s1Snake = [{x: 8, y: 10}, {x: 7, y: 10}, {x: 6, y: 10}];
    s1Dir = {x: 1, y: 0}; s1NextDir = {x: 1, y: 0};
    
    // Update UI
    const el = (id) => document.getElementById(id);
    if (el('s1Score')) el('s1Score').textContent = '0';
    if (el('s1Level')) el('s1Level').textContent = '1';
    if (el('s1Lives')) el('s1Lives').textContent = '3';
    if (el('s1Msg')) el('s1Msg').innerHTML = '';
    
    // Load vocabulary
    await loadS1Vocab();
    
    if (s1Interval) clearInterval(s1Interval);
    s1Interval = setInterval(s1Loop, 150);
    
    s1Canvas.focus();
};

async function loadS1Vocab() {
    try {
        const res = await fetch('/words/manage', {
            headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
        });
        const words = await res.json();
        s1TargetWords = words.filter(v => v.meaning && v.word_en);
        
        if (s1TargetWords.length === 0) {
            if (document.getElementById('s1Q')) {
                document.getElementById('s1Q').textContent = 'Cần từ vựng có nghĩa tiếng Việt!';
            }
        } else {
            spawnS1Target();
        }
    } catch(e) { console.error('loadS1Vocab error:', e); }
}

function spawnS1Target() {
    if (s1TargetWords.length === 0) return;
    
    const v = s1TargetWords[Math.floor(Math.random() * s1TargetWords.length)];
    s1CurrentTarget = v;
    
    if (document.getElementById('s1Q')) {
        document.getElementById('s1Q').textContent = 'Tìm: ' + v.meaning + ' (EN: ' + v.word_en + ')';
    }
    
    s1Draw(true);
}

function s1Loop() {
    if (!s1Playing) return;
    
    s1Dir = s1NextDir;
    const head = {x: s1Snake[0].x + s1Dir.x, y: s1Snake[0].y + s1Dir.y};
    
    // Wall wrap
    if (head.x < 0) head.x = s1Cols - 1;
    if (head.x >= s1Cols) head.x = 0;
    if (head.y < 0) head.y = s1Rows - 1;
    if (head.y >= s1Rows) head.y = 0;
    
    // Self collision
    if (s1Snake.some(s => s.x === head.x && s.y === head.y)) {
        s1GameOver();
        return;
    }
    
    s1Snake.unshift(head);
    
    // Draw target area (cell 35, 15)
    const targetX = 35, targetY = 15;
    if (head.x === targetX && head.y === targetY) {
        s1Score += 20;
        if (document.getElementById('s1Score')) document.getElementById('s1Score').textContent = s1Score;
        if (document.getElementById('s1Msg')) document.getElementById('s1Msg').innerHTML = '<span style="color:#10b981">✅ Đúng!</span>';
        s1Snake.pop();
        setTimeout(spawnS1Target, 800);
    } else {
        s1Snake.pop();
    }
    
    s1Draw();
}

function s1Draw(clear = false) {
    if (!s1Ctx) return;
    s1Ctx.clearRect(0, 0, s1Canvas.width, s1Canvas.height);
    
    // Draw grid background
    s1Ctx.fillStyle = '#f0f9ff';
    s1Ctx.fillRect(0, 0, s1Canvas.width, s1Canvas.height);
    
    // Draw target cell
    const targetX = 35, targetY = 15;
    s1Ctx.fillStyle = 'rgba(16,185,129,0.3)';
    s1Ctx.fillRect(targetX * CELL_SIZE, targetY * CELL_SIZE, CELL_SIZE - 2, CELL_SIZE - 2);
    
    // Draw target word
    s1Ctx.fillStyle = '#059669';
    s1Ctx.font = 'bold 14px Outfit';
    s1Ctx.textAlign = 'center';
    s1Ctx.fillText(s1CurrentTarget ? s1CurrentTarget.word_en : '', 
        targetX * CELL_SIZE + CELL_SIZE/2, targetY * CELL_SIZE + CELL_SIZE/2 + 5);
    
    // Draw snake
    s1Snake.forEach((s, i) => {
        s1Ctx.fillStyle = i === 0 ? '#2563eb' : '#60a5fa';
        s1Ctx.fillRect(s.x * CELL_SIZE + 1, s.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    });
}

function s1GameOver() {
    s1Playing = false;
    clearInterval(s1Interval);
    if (document.getElementById('s1Msg')) {
        document.getElementById('s1Msg').innerHTML = '<span style="color:#ef4444">Game Over! Điểm: ' + s1Score + '</span>';
    }
}

// Keyboard controls for S1 - attach to canvas for proper capture
document.addEventListener('keydown', (e) => {
    // Only handle S1 keys when S1 is playing and canvas has focus
    if (s1Playing && document.activeElement && document.activeElement.id === 's1Canvas') {
        if (e.key === 'ArrowUp' && s1Dir.y === 0) { s1NextDir = {x: 0, y: -1}; e.preventDefault(); }
        else if (e.key === 'ArrowDown' && s1Dir.y === 0) { s1NextDir = {x: 0, y: 1}; e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && s1Dir.x === 0) { s1NextDir = {x: -1, y: 0}; e.preventDefault(); }
        else if (e.key === 'ArrowRight' && s1Dir.x === 0) { s1NextDir = {x: 1, y: 0}; e.preventDefault(); }
    }
});

// Keyboard controls for S2
document.addEventListener('keydown', (e) => {
    // Only handle S2 keys when S2 is playing and canvas has focus
    if (s2Playing && document.activeElement && document.activeElement.id === 's2Canvas') {
        if (e.key === 'ArrowUp' && s2Dir.y === 0) { s2Dir = {x: 0, y: -1}; e.preventDefault(); }
        else if (e.key === 'ArrowDown' && s2Dir.y === 0) { s2Dir = {x: 0, y: 1}; e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && s2Dir.x === 0) { s2Dir = {x: -1, y: 0}; e.preventDefault(); }
        else if (e.key === 'ArrowRight' && s2Dir.x === 0) { s2Dir = {x: 1, y: 0}; e.preventDefault(); }
    }
});

// ===== S2 Game Functions (Sentence Building) =====
window.startSnake2Game = async function() {
    if (!s2Canvas) return;
    
    // Reset
    s2Score = 0; s2Level = 1; s2Lives = 3; s2Playing = true;
    s2SentenceIdx = 0; s2Tokens = [];
    s2Snake = [{x: 5, y: 5}, {x: 4, y: 5}, {x: 3, y: 5}];
    s2Dir = {x: 1, y: 0};
    
    // Update UI
    const el = (id) => document.getElementById(id);
    if (el('s2Score')) el('s2Score').textContent = '0';
    if (el('s2Level')) el('s2Level').textContent = '1';
    if (el('s2Lives')) el('s2Lives').textContent = '3';
    
    // Load sentences
    await loadS2Sentences();
    
    if (s2Interval) clearInterval(s2Interval);
    s2Interval = setInterval(s2Loop, 150);
    
    s2Canvas.focus();
};

async function loadS2Sentences() {
    try {
        const res = await fetch('/game/sentence-build/session', {
            headers: {'Authorization': 'Bearer ' + localStorage.getItem('token')}
        });
        const data = await res.json();
        s2Sentences = data.sentences || [];
        
        if (s2Sentences.length > 0) {
            startS2Sentence();
        }
    } catch(e) { console.error('loadS2Sentences error:', e); }
}

function startS2Sentence() {
    if (s2SentenceIdx >= s2Sentences.length) {
        s2GameOver('win');
        return;
    }
    
    // Reset eaten state on all tokens
    const s = s2Sentences[s2SentenceIdx];
    s2Tokens = s.tokens.map((t, i) => ({text: t, eaten: false, idx: i}));
    
    if (document.getElementById('s2QTarget')) {
        document.getElementById('s2QTarget').textContent = s.example_vi || s.example_en || '';
    }
    
    s2SpawnTokens();
}

function s2SpawnTokens() {
    if (!s2Ctx) return;
    
    // Position tokens as a horizontal line near the top
    // 20 cols × 30 = 600px wide — fit tokens in one row
    const cW = s2Canvas.width || 600;
    const totalTokenW = s2Tokens.length * CELL_SIZE;
    const startX = Math.max(2, Math.floor((cW - totalTokenW) / (2 * CELL_SIZE)));
    
    s2Tokens.forEach((t, i) => {
        t.x = startX + i * 3;   // 3 cells apart
        t.y = 10;               // near top
    });
}

function s2Loop() {
    if (!s2Playing) return;
    
    const head = {x: s2Snake[0].x + s2Dir.x, y: s2Snake[0].y + s2Dir.y};
    
    // Wall wrap
    if (head.x < 0) head.x = s2Cols - 1;
    if (head.x >= s2Cols) head.x = 0;
    if (head.y < 0) head.y = s2Rows - 1;
    if (head.y >= s2Rows) head.y = 0;
    
    // Check collision with tokens
    let hitToken = -1;
    for (let i = 0; i < s2Tokens.length; i++) {
        if (!s2Tokens[i].eaten && s2Tokens[i].x === head.x && s2Tokens[i].y === head.y) {
            hitToken = i;
            break;
        }
    }
    
    if (hitToken >= 0) {
        s2Tokens[hitToken].eaten = true;
        s2Snake.unshift(head);
        s2Score += 15;
        
        if (document.getElementById('s2Score')) document.getElementById('s2Score').textContent = s2Score;
        
        // Check if all tokens eaten
        if (s2Tokens.every(t => t.eaten)) {
            s2SentenceIdx++;
            setTimeout(startS2Sentence, 500);
        }
    } else {
        // Self collision
        if (s2Snake.some(s => s.x === head.x && s.y === head.y)) {
            s2GameOver('lose');
            return;
        }
        s2Snake.unshift(head);
        s2Snake.pop();
    }
    
    s2Draw();
}

function s2Draw() {
    if (!s2Ctx) return;
    s2Ctx.clearRect(0, 0, s2Canvas.width, s2Canvas.height);
    
    // Background
    s2Ctx.fillStyle = '#1e293b';
    s2Ctx.fillRect(0, 0, s2Canvas.width, s2Canvas.height);
    
    // Draw tokens
    s2Tokens.forEach(t => {
        if (!t.eaten) {
            s2Ctx.fillStyle = '#60a5fa';
            s2Ctx.fillRect(t.x * CELL_SIZE + 1, t.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            s2Ctx.fillStyle = 'white';
            s2Ctx.font = 'bold 12px Arial';
            s2Ctx.textAlign = 'center';
            const txt = t.text.length > 5 ? t.text.substring(0, 4) : t.text;
            s2Ctx.fillText(txt, t.x * CELL_SIZE + CELL_SIZE/2, t.y * CELL_SIZE + CELL_SIZE/2 + 4);
        }
    });
    
    // Draw snake
    s2Snake.forEach((s, i) => {
        s2Ctx.fillStyle = i === 0 ? '#fbbf24' : '#f59e0b';
        s2Ctx.fillRect(s.x * CELL_SIZE + 1, s.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    });
}

function s2GameOver(result) {
    s2Playing = false;
    clearInterval(s2Interval);
    if (result === 'win') {
        if (document.getElementById('s2Feedback')) {
            document.getElementById('s2Feedback').innerHTML = '<span style="color:#10b981">Hoàn thành! Điểm: ' + s2Score + '</span>';
        }
    } else {
        if (document.getElementById('s2Feedback')) {
            document.getElementById('s2Feedback').innerHTML = '<span style="color:#ef4444">Game Over! Điểm: ' + s2Score + '</span>';
        }
    }
    
    // Submit score
    fetch('/game/snake/score', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('token')
        },
        body: JSON.stringify({score: s2Score, level: s2Level, game_mode: 'snake2'})
    }).catch(() => {});
}

// Keyboard controls for S2
document.addEventListener('keydown', (e) => {
    if (!s2Playing) return;
    if (e.target.id !== 's2Canvas' && e.target.id !== 's1Canvas') return;
    
    if (e.key === 'ArrowUp' && s2Dir.y === 0) { s2Dir = {x: 0, y: -1}; e.preventDefault(); }
    else if (e.key === 'ArrowDown' && s2Dir.y === 0) { s2Dir = {x: 0, y: 1}; e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && s2Dir.x === 0) { s2Dir = {x: -1, y: 0}; e.preventDefault(); }
    else if (e.key === 'ArrowRight' && s2Dir.x === 0) { s2Dir = {x: 1, y: 0}; e.preventDefault(); }
});

window._s1_skipQ = function() {
    if (s1Playing) {
        s1Snake.pop();
        spawnS1Target();
    }
};

async function loadLeaderboard() {
    try {
        const res = await fetch('/game/snake/leaderboard');
        const data = await res.json();
        const ul = document.getElementById('snakeLeaderboard') || document.getElementById('s2Leaderboard') || document.getElementById('gameLeaderboard');
        if (!ul) return;
        
        ul.innerHTML = '';
        if (data.length === 0) {
            ul.innerHTML = '<li style="color:#64748b">Chưa có ai chơi. Hãy là người đầu tiên!</li>';
            return;
        }
        
        const medals = ['🥇', '🥈', '🥉'];
        data.forEach((item, index) => {
            const li = document.createElement('li');
            li.style = 'padding:8px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;';
            li.innerHTML = `<span>${index < 3 ? medals[index] : '🏅'} <strong>${item.username}</strong> (Lv.${item.level})</span> <span style="color:#10b981;font-weight:bold;">${item.score}</span>`;
            ul.appendChild(li);
        });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', loadLeaderboard);