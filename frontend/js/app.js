let token = localStorage.getItem("token");
let currentUser = null;
let dueCards = [];
let currentCardIndex = 0;

function escapeJS(str) {
    if (!str) return "";
    return str.toString().replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, " ");
}

async function apiFetch(endpoint, options = {}) {
    if (!options.headers) options.headers = {};
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.body && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }
    let timeout = options.timeout || 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;
    try {
        const res = await fetch(`${location.protocol}//${location.hostname}:8000${endpoint}`, options);
        clearTimeout(timeoutId);
        if (res.status === 401) {
            logout();
            throw new Error("Unauthorized");
        }
        return res;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

let authMode = 'login';
window.toggleAuthMode = function() {
    authMode = authMode === 'login' ? 'register' : 'login';
    document.getElementById('authTitle').innerText = authMode === 'login' ? 'Đăng nhập' : 'Đăng ký';
    document.getElementById('authSwitchText').innerText = authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập';
}

window.handleAuth = async function() {
    let username = document.getElementById('authUsername').value;
    let password = document.getElementById('authPassword').value;
    if (!username || !password) {
        showToast('Vui lòng nhập đủ thông tin');
        return;
    }
    try {
        let res = await fetch(`${location.protocol}//${location.hostname}:8000/auth/${authMode}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        if (res.ok) {
            let data = await res.json();
            token = data.token;
            localStorage.setItem('token', token);
            currentUser = data.username;
            document.getElementById('loginOverlay').classList.remove('active');
            document.getElementById('username').innerText = currentUser;
            showToast('Đăng nhập thành công');
            init();
        } else {
            let err = await res.json();
            showToast(err.detail || 'Lỗi đăng nhập');
        }
    } catch (e) {
        showToast('Không kết nối được server');
    }
}

window.logout = function() {
    token = null;
    currentUser = null;
    localStorage.removeItem('token');
    document.getElementById('loginOverlay').classList.add('active');
}

async function init() {
    if (!token) {
        document.getElementById('loginOverlay').classList.add('active');
        return;
    }
    // Pre-trigger SpeechSynthesis voice caching immediately
    if (window.speechSynthesis) {
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }
    }
    try {
        let res = await apiFetch('/auth/me');
        let data = await res.json();
        currentUser = data.username;
        document.getElementById('username').innerText = currentUser;
        
        await loadSettings();
        await loadStats();
        await loadStudyCards();
        setupTabs();
    } catch (e) {
        logout();
    }
}

window.loadSettings = async function() {
    try {
        let res = await apiFetch('/settings');
        let data = await res.json();
        if (data.settings) {
            document.getElementById('settingDailyGoal').value = data.settings.daily_goal;
            document.getElementById('settingProfession').value = data.settings.profession || 'Tổng quát';
            document.getElementById('settingLang').value = data.settings.learning_language || 'en';
            
            let lang = data.settings.learning_language || 'en';
            let prof = data.settings.profession || 'Tổng quát';
            let langText = lang === 'trilingual' ? '🌍 3 Ngôn ngữ' : (lang === 'zh' ? '🇨🇳 Tiếng Trung' : '🇬🇧 Tiếng Anh');
            
            document.getElementById('activeGoalDisplay').innerText = langText;
            document.getElementById('aiStatusDisplay').innerText = `💼 Ngành: ${prof}`;
        }
    } catch (e) { console.log(e); }
}

window.saveUserSettings = async function() {
    let goal = document.getElementById('settingDailyGoal').value;
    let prof = document.getElementById('settingProfession').value;
    let lang = document.getElementById('settingLang').value;
    
    let res = await apiFetch('/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ daily_goal: goal, profession: prof, learning_language: lang })
    });
    
    if (res.ok) {
        showToast('✅ Đã lưu cấu hình học tập!');
        init();
    }
}

window.loadStats = async function() {
    try {
        let res = await apiFetch(`/stats/dashboard`);
        let data = await res.json();
        document.getElementById('totalCards').innerText = data.progress.total;
        document.getElementById('countEN').innerText = data.counts.en;
        document.getElementById('countZH').innerText = data.counts.zh;
        document.getElementById('countTRI').innerText = data.counts.trilingual;
        document.getElementById('userStats').innerText = `${data.progress.total} thẻ`;
        
        let modeText = data.settings.learning_language === 'trilingual' ? '3 Ngôn ngữ' : (data.settings.learning_language === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh');
        let profession = data.settings.profession || 'Tổng quát';
        
        document.getElementById('activeGoalDisplay').innerText = modeText;
        document.getElementById('aiStatusDisplay').innerText = `💼 Ngành: ${profession}`;
    } catch(e){}
}

window.showTab = function(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    const navLink = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
    if (navLink) navLink.classList.add('active');
    if (tabId === 'study') loadStudyCards();
    if (tabId === 'manage') renderManageCards();
    if (tabId === 'exercises') loadExercises();
    if (tabId === 'scenarios') loadScenarios();
};

function setupTabs() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.onclick = (e) => {
            showTab(link.dataset.tab);
        };
    });
}

window.loadStudyCards = async function() {
    try {
        let res = await apiFetch(`/words/today`);
        if (!res.ok) throw new Error("Error");
        let data = await res.json();
        dueCards = data.words || [];
        
        if (dueCards.length === 0) {
            // Play a warm, relaxing major chord sequence using Web Audio API
            try {
                let ctx = new (window.AudioContext || window.webkitAudioContext)();
                let playNote = (freq, startTime, duration) => {
                    let osc = ctx.createOscillator();
                    let gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
                    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + startTime + 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
                    osc.start(ctx.currentTime + startTime);
                    osc.stop(ctx.currentTime + startTime + duration);
                };
                playNote(261.63, 0, 2.5); // C4
                playNote(329.63, 0.15, 2.5); // E4
                playNote(392.00, 0.3, 2.5); // G4
                playNote(523.25, 0.45, 3.5); // C5
            } catch(e) {}

            // Trigger beautiful celebration confetti
            if (typeof confetti === 'function') {
                confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
            }

            document.getElementById('studyContent').innerHTML = `
                <div class="ai-box" style="text-align: center; padding: 2.5rem; border-radius: 28px;">
                    <h2 style="color: #10b981; margin-bottom: 1rem; font-size: 2rem;">🎉 Tuyệt vời!</h2>
                    <p style="font-size: 1.15rem; margin-bottom: 1.8rem; line-height: 1.6; color: #475569;">
                        Bạn đã hoàn thành toàn bộ các thẻ học ngày hôm nay! <br>
                        Hãy thư giãn đầu óc một chút trước khi tiếp tục nhé. ✨
                    </p>
                    <button class="btn btn-primary" onclick="showTab('create')">➕ Tạo thêm thẻ mới</button>
                </div>
            `;
            return;
        }
        currentCardIndex = 0;
        showStudyCard();
    } catch(e){
        document.getElementById('studyContent').innerHTML = `<div class="ai-box">Không có thẻ nào hôm nay.</div>`;
    }
}

window.showStudyCard = function() {
    if (currentCardIndex >= dueCards.length) {
        loadStudyCards();
        return;
    }
    let card = dueCards[currentCardIndex];
    let langCode = card.language || 'en';
    let imgKeyword = card.word_en || card.word;
    let wordClean = imgKeyword ? imgKeyword.trim().toLowerCase().replace(/[^\w\s]/gi, '') : "object";
    
    // Translate profession nicely to Vietnamese for user aesthetic
    let rawProf = document.getElementById('settingProfession').value || 'general';
    let profTranslation = {
        'general': 'Đại cương / Tổng quát',
        'it': 'Công nghệ thông tin (IT)',
        'business': 'Kinh doanh & Thương mại',
        'medical': 'Y học & Chăm sóc sức khỏe',
        'engineering': 'Kỹ thuật & Công nghệ'
    };
    let profText = profTranslation[rawProf.toLowerCase()] || rawProf;

    let seed = Math.floor(Math.random() * 1000);
    let imgUrl = `https://image.pollinations.ai/prompt/professional%20clean%203D%20render%20of%20${encodeURIComponent(wordClean)}%20related%20to%20${encodeURIComponent(rawProf)},%20modern%20style,%20white%20background?width=400&height=400&seed=${seed}`;

    let phoneticsHtml = '';
    let badgeClass = '';
    let badgeText = '';
    // Ưu tiên dùng mode từ API (luôn có giá trị: 'en' | 'zh' | 'trilingual')
    let cardMode = card.mode || 'en';

    if (cardMode === 'trilingual') {
        badgeClass = 'badge badge-trilingual';
        badgeText = '🌍 3 Ngôn ngữ';
        phoneticsHtml = `
            <div style="font-size: 1.15rem; color: #475569; margin-bottom: 5px; font-weight: 500; line-height: 1.6;">
                ${card.pronunciation ? `🇬🇧 <span style="font-family: 'Outfit', sans-serif; color: #4f46e5;">${card.pronunciation}</span>` : (card.word_en ? `🇬🇧 /${card.word_en}/` : '')}
                ${card.pinyin ? `<br>🇨🇳 <span style="color: #ea580c; font-weight: 600;">[ ${card.pinyin} ]</span>` : ''}
            </div>
        `;
    } else if (cardMode === 'zh') {
        badgeClass = 'badge badge-zh';
        badgeText = '🇨🇳 Tiếng Trung';
        phoneticsHtml = `
            <div style="font-size: 1.3rem; color: #ea580c; margin-bottom: 10px; font-weight: 700; line-height: 1.5;">
                ${card.pinyin ? `📖 [ ${card.pinyin} ]` : (card.word_zh || card.word)}
            </div>
        `;
    } else {
        badgeClass = 'badge badge-en';
        badgeText = '🇬🇧 Tiếng Anh';
        phoneticsHtml = `
            <div style="font-size: 1.15rem; color: #4f46e5; margin-bottom: 10px; font-weight: 500; font-family: 'Outfit', sans-serif; line-height: 1.6;">
                ${card.pronunciation ? card.pronunciation : (card.word_en ? `/${card.word_en}/` : `/${card.word}/`)}
            </div>
        `;
    }

    let html = `
        <div class="flashcard-container">
            <div class="flashcard" id="studyFlashcard" style="height: 520px;" onclick="this.classList.toggle('flipped')">
                <div class="flashcard-inner">
                    <!-- MẶT TRƯỚC -->
                    <div class="flashcard-front" style="position: relative;">
                        <!-- Chuyên ngành tag -->
                        <div style="position: absolute; top: 18px; left: 18px;">
                            <span class="badge" style="background: rgba(99, 102, 241, 0.1); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.2); font-size: 11px; padding: 6px 12px; border-radius: 12px;">
                                🎓 Chuyên ngành: ${profText}
                            </span>
                        </div>
                        
                        <!-- Image Container with Smooth Shimmer Loading -->
                        <div style="position: relative; width: 140px; height: 140px; margin-bottom: 15px; margin-top: 1.8rem;">
                            <div class="image-skeleton" style="position: absolute; top:0; left:0; width:100%; height:100%; border-radius:50%; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border: 5px solid #f3f4f6;"></div>
                            <img src="${card.image_url || imgUrl}" class="flashcard-image" alt="Hình ảnh" 
                                 onload="this.style.opacity=1; this.previousElementSibling.style.display='none';" 
                                 onerror="this.onerror=null; this.src='https://img.icons8.com/color/200/${encodeURIComponent(wordClean)}.png'; this.previousElementSibling.style.display='none';"
                                 style="opacity: 0; transition: opacity 0.3s; margin-top: 0; position: absolute; top:0; left:0; width:100%; height:100%; z-index: 2;">
                        </div>
                        
                        <div class="card-text" style="color: #1e293b; font-weight: 800; font-size: 2.2rem; margin-top: 1.5rem; line-height: 1.3;">
                            ${cardMode === 'trilingual' ? `<span style="color: #4f46e5;">🇬🇧 ${card.word_en || card.word}</span><br><span style="color:#ea580c; font-size: 1.8rem;">🇨🇳 ${card.word_zh || ''}</span>` : cardMode === 'zh' ? `<span style="color:#ea580c;">🇨🇳 ${card.word_zh || card.word}</span>` : `<span style="color: #4f46e5;">🇬🇧 ${card.word_en || card.word}</span>`}
                        </div>
                        
                        <!-- Ví dụ gợi ý trên mặt trước -->
                        <div style="margin-top: 1rem; padding: 0 15px; text-align: center; width: 100%;">
                            ${card.example ? `<div style="font-size: 0.95rem; color: #4f46e5; font-style: italic; line-height: 1.5; margin-bottom: 6px;">🇬🇧 "${card.example}"</div>` : ''}
                            ${card.example_zh ? `<div style="font-size: 0.95rem; color: #ea580c; font-style: italic; line-height: 1.5; margin-bottom: 6px;">🇨🇳 "${card.example_zh}"</div>` : ''}
                            ${card.example_vi ? `<div style="font-size: 0.95rem; color: #10b981; font-style: italic; line-height: 1.5;">🇻🇳 "${card.example_vi}"</div>` : ''}
                        </div>
                        
                        <p style="color: #94a3b8; margin-top: auto; font-size: 0.9rem; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase;">Chạm để lật thẻ ↺</p>
                    </div>

                    <!-- MẶT SAU -->
                    <div class="flashcard-back">
                        <div style="font-size: 2rem; font-weight: 800; color: #10b981; margin-bottom: 5px; line-height: 1.3;">🇻🇳 ${card.meaning}</div>
                        
                        <div style="font-size: 0.95rem; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 4px 12px; border-radius: 20px; margin-bottom: 15px; display: inline-block;">${card.level || 'A1'}</div>
                        
                        ${phoneticsHtml}
                        
                        <!-- Nội dung ví dụ chi tiết -->
                        <div style="width: 100%; max-height: 220px; overflow-y: auto; text-align: left; background: #ffffff; padding: 18px; border-radius: 16px; margin-bottom: 15px; border: 1px solid #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                            ${card.example ? `
                                <div style="margin-bottom: 12px;">
                                    <div style="font-weight: 700; color: #4f46e5; font-size: 1.1rem; margin-bottom: 4px;">🇬🇧 ${card.example}</div>
                                    <span style="cursor: pointer; color: #818cf8; font-size: 0.95rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); speakText('en', '${escapeJS(card.example)}')">🔊 Nghe</span>
                                </div>
                            ` : ''}
                            ${card.example_zh ? `
                                <div style="margin-bottom: 12px;">
                                    <div style="font-weight: 700; color: #ea580c; font-size: 1.1rem; margin-bottom: 4px;">🇨🇳 ${card.example_zh}</div>
                                    <span style="cursor: pointer; color: #fb923c; font-size: 0.95rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); speakText('zh', '${escapeJS(card.example_zh)}')">🔊 听</span>
                                </div>
                            ` : ''}
                            ${card.example_vi ? `
                                <div style="color: #475569; font-size: 1rem; border-top: 1px solid #f1f5f9; padding-top: 10px; margin-top: 6px;">
                                    <div style="font-weight: 600; margin-bottom: 4px;">🇻🇳 ${card.example_vi}</div>
                                    <span style="cursor: pointer; color: #34d399; font-size: 0.95rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); speakText('vi', '${escapeJS(card.example_vi)}')">🔊 Đọc</span>
                                </div>
                            ` : ``}
                        </div>
                        
                        <div style="display: flex; gap: 12px; width: 100%; margin-bottom: 15px;">
                            ${card.word_en ? `<button class="audio-btn" style="flex:1; margin-top:0; border: 2px solid #e0e7ff; background: #eef2ff; color: #4f46e5; font-weight: 700; border-radius: 12px; padding: 10px; transition: all 0.2s;" onclick="event.stopPropagation(); speakText('en', '${escapeJS(card.word_en)}')">🔊 Tiếng Anh</button>` : ''}
                            ${card.word_zh ? `<button class="audio-btn" style="flex:1; margin-top:0; border: 2px solid #ffedd5; background: #fff7ed; color: #ea580c; font-weight: 700; border-radius: 12px; padding: 10px; transition: all 0.2s;" onclick="event.stopPropagation(); speakText('zh', '${escapeJS(card.word_zh)}')">🔊 Tiếng Trung</button>` : ''}
                            ${card.meaning ? `<button class="audio-btn" style="flex:1; margin-top:0; border: 2px solid #d1fae5; background: #ecfdf5; color: #059669; font-weight: 700; border-radius: 12px; padding: 10px; transition: all 0.2s;" onclick="event.stopPropagation(); speakText('vi', '${escapeJS(card.meaning.replace(/🇻🇳\s*/g, ''))}')">🔊 Tiếng Việt</button>` : ''}
                        </div>
                        
                        <div class="rating-buttons" onclick="event.stopPropagation();" style="margin-top: auto; width: 100%; display: flex; gap: 10px;">
                            <button class="rating-btn hard" onclick="rateCard(0)" style="flex: 1; border-radius: 12px; font-weight: 700; font-size: 1.1rem; padding: 12px;">😫 Khó</button>
                            <button class="rating-btn medium" onclick="rateCard(1)" style="flex: 1; border-radius: 12px; font-weight: 700; font-size: 1.1rem; padding: 12px;">😊 Tạm</button>
                            <button class="rating-btn easy" onclick="rateCard(2)" style="flex: 1; border-radius: 12px; font-weight: 700; font-size: 1.1rem; padding: 12px;">🎉 Dễ</button>
                        </div>
                    </div>
                </div>
            </div>
            <div style="text-align: center; margin-top: 1.2rem; font-weight: 600; color: #475569; font-size: 1.05rem;">${currentCardIndex + 1} / ${dueCards.length}</div>
        </div>
    `;
    document.getElementById('studyContent').innerHTML = html;
}

async function rateCard(mastery) {
    let card = dueCards[currentCardIndex];
    let isCorrect = mastery > 0;
    try {
        await apiFetch(`/words/learn?vocab_id=${card.id}&is_correct=${isCorrect}`, {
            method: 'POST'
        });
        currentCardIndex++;
        showStudyCard();
        loadStats();
    } catch(e){}
}

window.createManualCard = async function() {
    let word = document.getElementById('newQuestion').value;
    let meaning = document.getElementById('newAnswer').value;
    if (!word || !meaning) {
        showToast('Vui lòng nhập đủ từ và nghĩa');
        return;
    }
    try {
        let res = await apiFetch('/words', {
            method: 'POST',
            body: JSON.stringify({ word: word, meaning: meaning })
        });
        if (res.ok) {
            showToast('✅ Đã tạo thẻ thành công!');
            document.getElementById('newQuestion').value = '';
            document.getElementById('newAnswer').value = '';
            document.getElementById('newTopic').value = '';
            loadStats();
        } else {
            showToast('Lỗi khi tạo thẻ');
        }
    } catch(e) {
        showToast('Không kết nối được server');
    }
}

window.deleteCurrentCard = async function() {
    if (currentCardIndex >= dueCards.length) return;
    let card = dueCards[currentCardIndex];
    if (!confirm('Xoá thẻ này?')) return;
    try {
        let res = await apiFetch(`/words/${card.id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('✅ Đã xoá');
            dueCards.splice(currentCardIndex, 1);
            showStudyCard();
            loadStats();
        }
    } catch(e) {}
}

window.generateAICard = async function() {
    let word = document.getElementById('aiWord').value.trim();
    if (!word) { showToast('Nhập từ!'); return; }
    showLoading();
    let timeoutId = setTimeout(() => showToast('⏳ Đang xử lý, vui lòng chờ...'), 5000);
    try {
        let lang = document.getElementById('settingLang').value;
        let res = await apiFetch('/words/batch-ai', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ words: [word], language: lang }),
            timeout: 90000
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            let data = await res.json();
            if (data.added > 0) {
                showToast(`✅ Đã tạo thẻ "${word}"!`);
                loadStats();
                showTab('study');
            } else {
                showToast(`❌ Không tạo được "${word}". Thử lại!`);
            }
        } else {
            showToast('❌ Lỗi server, thử lại sau');
        }
    } catch(e) {
        clearTimeout(timeoutId);
        showToast('❌ Không kết nối được server - kiểm tra Ollama');
    }
    hideLoading();
}

window.generateBatchCards = async function() {
    let text = document.getElementById('batchWords').value;
    let words = text.split(/[\n,]+/).map(w => w.trim()).filter(w => w);
    if (words.length === 0) { showToast('Nhập từ trước!'); return; }
    
    let progressEl = document.getElementById('batchProgress');
    let lang = document.getElementById('settingLang').value;
    let total = words.length;
    let successCount = 0;
    let failCount = 0;
    
    // Show initial state
    function renderProgress() {
        let bars = '';
        for (let i = 0; i < total; i++) {
            let pct = i < successCount ? 100 : i < successCount + failCount ? 0 : 0;
            let color = i < successCount ? '#10b981' : i < successCount + failCount ? '#ef4444' : '#e5e7eb';
            let status = i < successCount ? '✅' : i < successCount + failCount ? '❌' : '⬜';
            bars += `<div style="flex:1; height:8px; background:${color}; border-radius:4px; margin:2px; display:inline-block; width:${100/total}%;" title="${i+1}/${total}"></div>`;
        }
        progressEl.innerHTML = `
            <div style="margin-bottom:12px;">
                <div style="font-size:13px; color:#374151; margin-bottom:6px; font-weight:600;">
                    ⏳ Đang tạo thẻ... <span style="color:#6366f1;">${successCount + failCount}/${total}</span>
                </div>
                <div style="display:flex; width:100%;">${bars}</div>
                <div id="batchStatus" style="font-size:12px; color:#6b7280; margin-top:6px; font-style:italic;"></div>
            </div>
        `;
    }
    
    renderProgress();
    showLoading();
    
    for (let i = 0; i < words.length; i++) {
        let word = words[i];
        document.getElementById('batchStatus').textContent = `Đang xử lý: "${word}"...`;
        try {
            let res = await apiFetch('/words/batch-ai', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ words: [word], language: lang }),
                timeout: 90000
            });
            if (res.ok) {
                let data = await res.json();
                if (data.added > 0) {
                    successCount++;
                    document.getElementById('batchStatus').textContent = `✅ "${word}" OK!`;
                } else {
                    failCount++;
                    document.getElementById('batchStatus').textContent = `❌ "${word}" lỗi: không thể dịch`;
                }
            } else {
                failCount++;
                document.getElementById('batchStatus').textContent = `❌ "${word}" lỗi server`;
            }
        } catch(e) {
            failCount++;
            document.getElementById('batchStatus').textContent = `❌ "${word}" lỗi kết nối`;
        }
        renderProgress();
    }
    
    hideLoading();
    
    if (failCount === 0) {
        showToast(`✅ Đã tạo tất cả ${successCount} thẻ thành công!`);
    } else if (successCount === 0) {
        showToast(`❌ Tất cả ${failCount} thẻ đều lỗi. Kiểm tra Ollama AI!`);
    } else {
        showToast(`⚠️ ${successCount} thành công, ${failCount} thất bại`);
    }
    
    loadStats();
    renderManageCards();
}

window.renderManageCards = async function() {
    try {
        let res = await apiFetch('/words/manage');
        if (!res.ok) throw new Error("Error");
        let data = await res.json();
        let cards = data || [];
        let searchTerm = document.getElementById('manageSearch').value.toLowerCase();
        let container = document.getElementById('manageCardsContainer');
        container.innerHTML = '';
        let filtered = cards.filter(c => 
            c.word.toLowerCase().includes(searchTerm) || 
            (c.word_en && c.word_en.toLowerCase().includes(searchTerm)) ||
            (c.word_zh && c.word_zh.includes(searchTerm))
        );
        filtered.forEach(c => {
            let cardDiv = document.createElement('div');
            cardDiv.className = 'ai-box';
            cardDiv.style.position = 'relative';
            let badgeClass = `badge badge-${c.mode || 'en'}`;
            let modeText = c.mode === 'trilingual' ? '🌍 3 Ngôn ngữ' : (c.mode === 'zh' ? '🇨🇳 Tiếng Trung' : '🇬🇧 Tiếng Anh');
            let pinyinRaw = (c.pinyin || '').trim();
            let pinyinDisplay = (pinyinRaw && !pinyinRaw.startsWith('[')) ? pinyinRaw : '';
            let pinyinLine = pinyinDisplay ? `<div style="color: #ea580c; font-size: 12px; margin-bottom: 5px; margin-top: 3px;">📖 [ ${pinyinDisplay} ]</div>` : '';
            cardDiv.innerHTML = `
                <span class="${badgeClass}">${modeText}</span>
                <div style="font-weight: 700; color: #1e293b; margin-bottom: 2px;">
                    ${c.word_en ? '🇬🇧 '+c.word_en : '📝 '+c.word}${c.word_zh ? `<br>🇨🇳 ${c.word_zh}` : ''}
                </div>
                ${pinyinLine}
                ${c.pronunciation ? `<div style="color: #64748b; font-size: 11px; margin-bottom: 5px;">IPA: ${c.pronunciation}</div>` : ''}
                <div style="color: #475569; font-size: 13px;">Nghĩa: ${c.meaning}</div>
                ${c.example_vi ? `<div style="color: #94a3b8; font-size: 11px; margin-top: 5px;">VD: ${c.example_vi}</div>` : ''}
                <button onclick="deleteCardDirect(${c.id})" style="position: absolute; top: 10px; right: 10px; background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1.1rem;" title="Xóa thẻ">🗑️</button>
            `;
            container.appendChild(cardDiv);
        });
    } catch(e) { console.error(e); }
}

window.deleteCardDirect = async function(id) {
    if (!confirm('Xoá thẻ này?')) return;
    try {
        let res = await apiFetch(`/words/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('✅ Đã xoá');
            renderManageCards();
            loadStats();
        }
    } catch(e) {}
}

window.deleteAllCards = async function() {
    if (!confirm('Xoá TẤT CẢ thẻ?')) return;
    try {
        let res = await apiFetch('/words/all', { method: 'DELETE' });
        if (res.ok) {
            showToast('✅ Đã xoá sạch');
            renderManageCards();
            loadStats();
        }
    } catch(e) {}
}

window.sendChat = async function() {
    let input = document.getElementById('chatInput');
    let question = input.value;
    if (!question) return;
    let messagesDiv = document.getElementById('chatMessages');
    messagesDiv.innerHTML += `<div class="message user"><strong>Bạn:</strong> ${question}</div>`;
    input.value = '';
    let res = await apiFetch('/ai/chat', { method: 'POST', body: JSON.stringify({ prompt: question }) });
    let data = await res.json();
    messagesDiv.innerHTML += `<div class="message ai"><strong>🤖 AI:</strong> ${data.response}</div>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

window.speakText = function(lang, text) {
    // Ensure speaking doesn't overlap/stutter
    window.speechSynthesis.cancel();
    
    let utterance = new SpeechSynthesisUtterance(text);
    
    // Determine language and voice properly
    if (lang === 'zh') {
        utterance.lang = 'zh-CN';
    } else if (lang === 'vi') {
        utterance.lang = 'vi-VN';
    } else if (lang === 'en') {
        utterance.lang = 'en-US';
    } else {
        utterance.lang = lang;
    }
    
    // Attempt to load and set high-quality speech voices
    let voices = window.speechSynthesis.getVoices();
    let bestVoice = null;
    
    if (lang === 'zh') {
        bestVoice = voices.find(v => v.name.includes('Google 普通话') || v.name.includes('Microsoft Yahei') || v.lang.startsWith('zh-CN'));
        if (!bestVoice) {
            bestVoice = voices.find(v => v.lang.startsWith('zh'));
        }
    } else if (lang === 'vi') {
        bestVoice = voices.find(v => v.name.includes('Google tiếng Việt') || v.lang.startsWith('vi'));
    } else if (lang === 'en') {
        bestVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Google UK English') || v.name.includes('Natural') || v.lang.startsWith('en-US') || v.lang.startsWith('en-GB'));
    }
    
    if (bestVoice) {
        utterance.voice = bestVoice;
    }
    
    utterance.rate = lang === 'zh' ? 0.85 : 0.9; // Slightly slower, optimal for language learning
    utterance.pitch = 1.05; // Friendly pitch
    
    window.speechSynthesis.speak(utterance);
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

window.showLoading = function() { document.getElementById('loadingOverlay').style.display = 'flex'; }
window.hideLoading = function() { document.getElementById('loadingOverlay').style.display = 'none'; }

document.addEventListener('DOMContentLoaded', init);

window.loadExercises = async function() {
    try {
        let res = await apiFetch('/exercises/fill-blank');
        let questions = await res.json();
        let container = document.getElementById('exercisesContainer');
        container.innerHTML = '';
        
        if (questions.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">Bạn chưa có từ vựng nào có câu ví dụ để làm bài tập!</p>';
            return;
        }
        
        questions.forEach(q => {
            let div = document.createElement('div');
            div.className = 'exercise-card ai-box';
            div.style.background = '#ffffff';
            div.style.padding = '25px';
            div.style.borderRadius = '16px';
            div.style.marginBottom = '20px';
            div.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)';
            div.style.border = '1px solid #e2e8f0';
            div.style.position = 'relative';
            
            let text = q.cloze_text.replace('_____', `<input type="text" id="ex-in-${q.vocab_id}" placeholder="?" style="border:none; border-bottom: 3px solid #6366f1; width: 120px; font-weight: bold; color: #4f46e5; text-align: center; outline: none; background: transparent; transition: all 0.2s;" onfocus="this.style.borderBottomColor='#10b981'" onblur="this.style.borderBottomColor='#6366f1'">`);
            
            div.innerHTML = `
                <div style="position: absolute; top: 15px; right: 15px; font-size: 1.5rem; color: #cbd5e1;">✍️</div>
                <div style="font-size: 1.25rem; font-weight: 500; color: #1e293b; margin-bottom: 15px; line-height: 1.6;">${text}</div>
                <div style="color: #64748b; font-size: 1rem; margin-bottom: 20px; font-style: italic; display: flex; align-items: flex-start; gap: 8px;">
                    <span style="font-style: normal; margin-top: 2px;">🇻🇳</span>
                    <span>${q.example_vi}</span>
                </div>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <button class="btn btn-primary" onclick="checkExercise(${q.vocab_id})" style="padding: 10px 25px; border-radius: 12px; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3);">🔍 Kiểm tra</button>
                    <div id="ex-res-${q.vocab_id}" style="font-weight: bold; font-size: 1.1rem;"></div>
                </div>
            `;
            container.appendChild(div);
        });
    } catch(e) {}
}

window.checkExercise = async function(vocab_id) {
    let input = document.getElementById(`ex-in-${vocab_id}`);
    let answer = input.value.trim();
    if (!answer) return;
    
    try {
        let res = await apiFetch('/exercises/fill-blank/submit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ vocab_id: vocab_id, answer: answer })
        });
        let data = await res.json();
        let resDiv = document.getElementById(`ex-res-${vocab_id}`);
        if (data.correct) {
            resDiv.innerHTML = '✅ Chính xác!';
            resDiv.style.color = '#16a34a';
            input.style.borderColor = '#16a34a';
        } else {
            resDiv.innerHTML = `❌ Sai rồi! Đáp án: ${data.correct_answer}`;
            resDiv.style.color = '#dc2626';
            input.style.borderColor = '#dc2626';
        }
        loadStats();
    } catch(e) {}
}

// Role-play conversation scenarios — loaded dynamically from backend endpoints
let allScenarioFiles = [];

window.loadScenarios = function() {
    let container = document.getElementById('scenariosContainer');
    if (!container) return;
    container.innerHTML = '<p style="color:#64748b;">Đang tải danh sách scenario...</p>';
    apiFetch('/scenarios/list')
    .then(res => res.json())
    .then(data => {
        allScenarioFiles = data.scenarios || [];
        container.innerHTML = '';
        if (allScenarioFiles.length === 0) {
            container.innerHTML = '<p style="color:#64748b;">Chưa có scenario nào.</p>';
            return;
        }
        allScenarioFiles.forEach(s => {
            let div = document.createElement('div');
            div.className = 'ai-box';
            div.style.cursor = 'pointer';
            div.innerHTML = `<h4>${s.name}</h4><p style="color:#64748b; font-size:0.9rem;">Practice IT English conversations</p>`;
            div.onclick = () => startRolePlay(s.key);
            container.appendChild(div);
        });
    })
    .catch(() => {
        container.innerHTML = '<p style="color:#ef4444;">Không tải được danh sách scenario.</p>';
    });
}

window.startRolePlay = async function(scenarioKey) {
    showLoading();
    let filename = (scenarioKey.endsWith('.txt') ? scenarioKey : scenarioKey + '.txt');
    try {
        let res = await apiFetch(`/scenarios/it/${encodeURIComponent(filename)}`);
        if (!res.ok) throw new Error("Scenario not found");
        let text = await res.text();
        currentScenarioLines = text.split('\n').filter(l => l.trim());
        currentLineIndex = 0;
        
        let modal = document.getElementById('rolePlayModal');
        if (modal) modal.style.display = 'flex';
        
        nextScenarioLine();
    } catch(e) {
        showToast('Không tải được đoạn hội thoại: ' + scenarioKey);
    }
    hideLoading();
}

window.nextScenarioLine = function() {
    let dialog = document.getElementById('rolePlayDialog');
    if (currentLineIndex >= currentScenarioLines.length) {
        dialog.innerHTML += '<p style="color:#16a34a; font-weight:bold;">🎉 Hoàn thành role-play!</p>';
        return;
    }
    
    let line = currentScenarioLines[currentLineIndex];
    let speaker = line.includes('[AI]') ? 'AI' : 'User';
    let text = line.replace(/\[AI\]|\[User\]:?/g, '').trim();
    
    dialog.innerHTML += `<div style="margin:10px 0; ${speaker==='AI'?'color:#4f46e5;':'color:#1e293b;'}"><strong>${speaker === 'AI' ? '🤖 AI' : 'Bạn'}:</strong> ${text}</div>`;
    
    if (speaker === 'AI') {
        speakText('en', text);
    }
    
    dialog.scrollTop = dialog.scrollHeight;
    currentLineIndex++;
    
    if (speaker === 'User') {
        let input = document.getElementById('rolePlayInput');
        if (input) {
            input.style.display = 'flex';
            input.focus();
        }
    }
}

window.endRolePlay = function() {
    document.getElementById('rolePlayModal').style.display = 'none';
    document.getElementById('rolePlayDialog').innerHTML = '';
    document.getElementById('rolePlayInput').style.display = 'none';
    currentScenarioLines = [];
    currentLineIndex = 0;
}
