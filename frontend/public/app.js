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
        await loadLearningFlow();
        setupTabs();
    } catch (e) {
        logout();
    }
}

// =============== LEARNING FLOW: Học thẻ → Bài tập → Game ===============
let todayProgress = null;

window.loadLearningFlow = async function() {
    try {
        let res = await apiFetch('/progress/today');
        todayProgress = await res.json();
        renderLearningFlow(todayProgress);
    } catch(e) { console.log("Flow error:", e); }
}

function renderLearningFlow(p) {
    let container = document.getElementById('learningFlowSteps');
    if (!container) return;
    
    let html = '';
    let colors = ['#3b82f6', '#f59e0b', '#10b981'];
    let tabs = ['study', 'exercises', 'game'];
    
    p.flow.forEach((step, idx) => {
        let isLocked = step.locked;
        let isDone = step.done;
        let bg = isDone ? colors[idx] : (isLocked ? '#94a3b8' : '#e2e8f0');
        let textColor = isDone ? 'white' : (isLocked ? '#cbd5e1' : '#1e293b');
        let cursor = isLocked ? 'not-allowed' : 'pointer';
        let opacity = isLocked ? '0.6' : '1';
        let lockIcon = isLocked ? '🔒 ' : '';
        let checkIcon = isDone ? '✅ ' : '';
        
        html += `
            <div onclick="${isLocked ? '' : "showTab('" + tabs[idx] + "')"}" 
                 style="flex:1; min-width:140px; background:${bg}; color:${textColor}; padding:15px; border-radius:12px; text-align:center; cursor:${cursor}; opacity:${opacity}; transition: all 0.3s; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="font-size:2rem;">${step.icon}</div>
                <div style="font-weight:700; font-size:0.95rem; margin-top:5px;">${lockIcon}${checkIcon}${step.name}</div>
                <div style="font-size:0.8rem; margin-top:3px; opacity:0.9;">
                    ${step.required > 0 ? step.count + '/' + step.required : (isDone ? 'Hoàn thành' : 'Sẵn sàng')}
                </div>
            </div>
        `;
        
        // Arrow between steps
        if (idx < p.flow.length - 1) {
            html += `<div style="display:flex;align-items:center;font-size:1.5rem;color:#94a3b8;">→</div>`;
        }
    });
    
    container.innerHTML = html;
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
    // Check learning flow locks
    if (todayProgress) {
        if (tabId === 'exercises' && !todayProgress.exercises_unlocked) {
            showToast(`🔒 Bạn cần học ít nhất ${todayProgress.min_cards_for_exercise} thẻ trước khi làm bài tập!`);
            return;
        }
        if (tabId === 'game' && !todayProgress.game_unlocked) {
            const needCards = todayProgress.min_cards_for_game || todayProgress.min_cards_for_exercise || 5;
            if (!todayProgress.exercises_unlocked) {
                showToast(`🔒 Học ít nhất ${needCards} thẻ + làm bài tập để mở game (liên quan thẻ đã học)!`);
            } else {
                showToast(`🔒 Hoàn thành ${todayProgress.min_exercises_for_game} bài tập trên thẻ đã học để chơi game!`);
            }
            return;
        }
    }
    
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
    if (tabId === 'home') loadLearningFlow();
    if (tabId === 'study') { _studyDateOffset = 0; }
};

// ---------- Study date navigation ----------
let _studyDateOffset = 0; // days offset from today: 0=today, 1=tomorrow, -1=yesterday

window.changeStudyDate = function(delta) {
    _studyDateOffset = (_studyDateOffset || 0) + delta;
    let base = new Date();
    base.setDate(base.getDate() + _studyDateOffset);
    let dateStr = base.toISOString().split('T')[0];
    let dateLabel = document.getElementById('studyDateLabel');
    if (dateLabel) {
        let m = base.getMonth() + 1;
        let d = base.getDate();
        let wd = ['CN','T2','T3','T4','T5','T6','T7'][base.getDay()];
        dateLabel.textContent = `${d}/${m}/${base.getFullYear()} ${wd}`;
    }
    loadStudyCards(dateStr);
};

window.resetStudyDate = function() {
    _studyDateOffset = 0;
    let dateLabel = document.getElementById('studyDateLabel');
    if (dateLabel) dateLabel.textContent = '';
    loadStudyCards(null);
};

function setupTabs() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.onclick = (e) => {
            showTab(link.dataset.tab);
        };
    });
}

window.loadStudyCards = async function(explicitDate) {
    let studyDate = explicitDate || null;
    try {
        let url = `/words/today`;
        if (studyDate) url += `?study_date=${encodeURIComponent(studyDate)}`;
        let res = await apiFetch(url);
        if (!res.ok) throw new Error("Error");
        let data = await res.json();
        dueCards = data.words || [];

        if (dueCards.length === 0) {
            if (studyDate) {
                // No cards on a different day — just empty state
                document.getElementById('studyContent').innerHTML = `
                    <div class="ai-box" style="text-align: center; padding: 2rem; border-radius: 28px;">
                        <div style="font-size:2.5rem;margin-bottom:1rem;">🌙</div>
                        <h3 style="color:#475569;margin-bottom:.5rem;">Không còn thẻ cần ôn hôm nay</h3>
                        <p style="font-size:.95rem;color:#94a3b8;">Quay lại <b>Hôm nay</b> để tiếp tục học, hoặc tạo thẻ mới ở tab Tạo thẻ.</p>
                    </div>
                `;
            } else {
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
                    playNote(392.00, 0.3, 2.5); // C4
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
    let badgeClass = 'badge badge-trilingual';
    let badgeText = '🌍 3 Ngôn ngữ';
    let cardMode = card.mode || 'trilingual';

    // LUÔN hiển thị đầy đủ phiên âm: IPA (Anh) + Pinyin (Trung) trên MỌI thẻ
    phoneticsHtml = `
        <div style="font-size: 1.15rem; color: #475569; margin-bottom: 5px; font-weight: 500; line-height: 1.8;">
            ${card.pronunciation ? `🇬🇧 <span style="font-family: 'Outfit', sans-serif; color: #4f46e5;">${card.pronunciation}</span>` : (card.word_en ? `🇬🇧 /${card.word_en}/` : '')}
            ${card.pinyin ? `<br>🇨🇳 <span style="color: #ea580c; font-weight: 600;">[ ${card.pinyin} ]</span>` : ''}
        </div>
    `;

    // Mặt trước luôn hiển thị cả tiếng Anh + tiếng Trung
    let frontWordHtml = `<span>🇬🇧 ${card.word_en || card.word}</span>`;
    if (card.word_zh) {
        frontWordHtml += `<br><span style="color:#dc2626;">🇨🇳 ${card.word_zh}</span>`;
    }

    let html = `
        <div class="flashcard-container">
            <div class="flashcard" id="studyFlashcard" style="height: 520px;" onclick="this.classList.toggle('flipped')">
                <div class="flashcard-inner">
                    <!-- MẶT TRƯỚC -->
                    <div class="flashcard-front" style="position: relative;">
                        <!-- Chuyên ngành tag + số thẻ hôm nay -->
                        <div style="position: absolute; top: 18px; left: 18px; right: 18px; display: flex; justify-content: space-between; align-items: center;">
                            <span class="badge" style="background: rgba(99, 102, 241, 0.1); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.2); font-size: 11px; padding: 6px 12px; border-radius: 12px;">🎓 ${profText}</span>
                            <span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #166534; border: 1px solid rgba(16, 185, 129, 0.2); font-size: 11px; padding: 6px 12px; border-radius: 12px;">${currentCardIndex + 1}/${dueCards.length}</span>
                        </div>
                        
                        <!-- Image Container with Smooth Shimmer Loading -->
                        <div style="position: relative; width: 140px; height: 140px; margin: 1.8rem auto 14px;">
                            <div class="image-skeleton" style="position: absolute; top:0; left:0; width:100%; height:100%; border-radius:50%; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border: 5px solid #f3f4f6;"></div>
                            <img src="${card.image_url || imgUrl}" class="flashcard-image" alt="Hình ảnh" 
                                 onload="this.style.opacity=1; this.previousElementSibling.style.display='none';" 
                                 onerror="this.onerror=null; this.src='https://img.icons8.com/color/200/${encodeURIComponent(wordClean)}.png'; this.previousElementSibling.style.display='none';"
                                 style="opacity: 0; transition: opacity 0.3s; position: absolute; top:0; left:0; width:100%; height:100%; z-index: 2;">
                        </div>
                        
                        <div class="card-text" style="color: #000; font-weight: bold; font-size: 1.8rem; margin-top: .5rem; line-height: 1.5;">
                            ${cardMode === 'trilingual' ? `<span>🇬🇧 ${card.word_en || card.word}</span><br><span style="color:#dc2626;">🇨🇳 ${card.word_zh || ''}</span>` : cardMode === 'zh' ? `<span style="color:#dc2626;">🇨🇳 ${card.word_zh || card.word}</span>` : `<span>🇬🇧 ${card.word_en || card.word}</span>`}
                        </div>
                        
                        <!-- Phiên âm IPA + Pinyin -->
                        <div style="margin-top: .6rem; font-size: .95rem; color: #64748b; font-weight: 500; line-height: 1.7;">
                            ${card.pronunciation ? `🇬🇧 <span style="font-family:'Outfit',sans-serif;color:#4f46e5;font-weight:600;">${card.pronunciation}</span>` : (card.word_en ? `🇬🇧 /${card.word_en}/` : '')}
                            ${card.pinyin ? `<br>🇨🇳 <span style="color:#ea580c;font-weight:600;">[ ${card.pinyin} ]</span>` : ''}
                        </div>

                        <!-- Ví dụ gợi ý trên mặt trước -->
                         <div style="margin-top: 1rem; padding: 0 10px; text-align: center; width: 100%;">
                             ${card.example ? `<div style="font-size: 0.85rem; color: #4f46e5; font-style: italic; line-height: 1.4; margin-bottom: 4px;">🇬🇧 "${card.example}"</div>` : ''}
                             ${card.example_zh ? `<div style="font-size: 0.85rem; color: #ea580c; font-style: italic; line-height: 1.4; margin-bottom: 4px;">🇨🇳 "${card.example_zh}"</div>` : ''}
                             ${card.example_vi ? `<div style="font-size: 0.85rem; color: #10b981; font-style: italic; line-height: 1.4;">🇻🇳 "${card.example_vi}"</div>` : ''}
                         </div>

                         <!-- Auto sequential audio button (user vision: EN → ZH → VI → example) -->
                         <button onclick="event.stopPropagation(); playFullSequence(${JSON.stringify(card).replace(/"/g, '&quot;')})" 
                                 style="margin-top: 12px; padding: 10px 18px; border-radius: 9999px; background: linear-gradient(90deg, #4f46e5, #d946ef); color: white; border: none; font-weight: 700; cursor: pointer; box-shadow: 0 4px 15px rgba(79,70,229,0.3);">
                             ▶️ Phát âm tuần tự (EN → ZH → VI → Ví dụ)
                         </button>
                         
                         <p style="color: #64748b; margin-top: auto; font-size: 0.9rem; font-weight: 500; letter-spacing: 0.2px;">(Chạm vào thẻ để lật xem nghĩa & nghe phát âm)</p>
                    </div>

                    <!-- MẶT SAU -->
                    <div class="flashcard-back">
                        <div style="font-size: 1.8rem; font-weight: 800; color: #10b981; margin-bottom: 3px; line-height: 1.3;">🇻🇳 ${card.meaning || card.word_en || card.word || '(chưa có dịch)'}</div>
                        
                        <span class="badge" style="background:rgba(16,185,129,.1);color:#166534;border-color:rgba(16,185,129,.2);font-size:10px;margin-bottom:6px;">📍 Nghĩa tiếng Việt</span>
                        <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 10px;">${card.level || 'A1'}</div>
                        
                        ${phoneticsHtml}
                        
                        <!-- Ví dụ gợi ý --->
                        <div style="width: 100%; max-height: 200px; overflow-y: auto; text-align: left; background: #f8fafc; padding: 16px; border-radius: 14px; margin-bottom: 10px; border: 1px solid #f1f5f9;">
                            ${card.example ? `
                                <div style="margin-bottom: 10px;">
                                    <div style="font-weight: 700; color: #4f46e5; font-size: 1.05rem; margin-bottom: 2px;">🇬🇧 ${card.example}</div>
                                    <span style="cursor: pointer; color: #4470ff; font-size: 1.05rem;" onclick="event.stopPropagation(); speakText('en', '${escapeJS(card.example)}')">🔊 Nghe</span>
                                </div>
                            ` : ''}
                            ${card.example_zh ? `
                                <div style="margin-bottom: 10px;">
                                    <div style="font-weight: 700; color: #ea580c; font-size: 1.05rem; margin-bottom: 2px;">🇨🇳 ${card.example_zh}</div>
                                    <span style="cursor: pointer; color: #4470ff; font-size: 1.05rem;" onclick="event.stopPropagation(); speakText('zh', '${escapeJS(card.example_zh)}')">🔊 听</span>
                                </div>
                            ` : ''}
                            ${card.example_vi ? `<div style="color: #64748b; font-size: 0.95rem; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 4px;">🇻🇳 ${card.example_vi}</div>` : ``}
                        </div>
                        
                        <div style="display: flex; gap: 10px; width: 100%; margin-bottom: 10px;">
                            ${card.word_en ? `<button class="audio-btn" style="flex:1; margin-top:0; border: 1px solid rgba(79, 70, 229, 0.2); background: rgba(79, 70, 229, 0.05); font-weight: 600;" onclick="event.stopPropagation(); speakText('en', '${escapeJS(card.word_en)}')">🔊 Tiếng Anh</button>` : ''}
                            ${card.word_zh ? `<button class="audio-btn" style="flex:1; margin-top:0; border: 1px solid rgba(217, 70, 239, 0.2); background: rgba(217, 70, 239, 0.05); font-weight: 600;" onclick="event.stopPropagation(); speakText('zh', '${escapeJS(card.word_zh)}')">🔊 Tiếng Trung</button>` : ''}
                            ${!card.word_en && !card.word_zh ? `<button class="audio-btn" style="flex:1; margin-top:0; border: 1px solid rgba(99, 102, 241, 0.2); background: rgba(99, 102, 241, 0.05); font-weight: 600;" onclick="event.stopPropagation(); speakText('${langCode}', '${escapeJS(card.word)}')">🔊 Đọc từ</button>` : ''}
                        </div>
                        
                        <div class="rating-buttons" onclick="event.stopPropagation();" style="margin-top: auto; width: 100%;">
                            <button class="rating-btn hard" onclick="rateCard(0)" style="flex: 1;">😫 Khó</button>
                            <button class="rating-btn medium" onclick="rateCard(1)" style="flex: 1;">😊 Tạm</button>
                            <button class="rating-btn easy" onclick="rateCard(2)" style="flex: 1;">🎉 Dễ</button>
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
    const word  = document.getElementById('newQuestion')?.value.trim();
    const zh    = document.getElementById('newWordZH')?.value.trim();
    const py    = document.getElementById('newPinyin')?.value.trim();
    const mean  = document.getElementById('newAnswer')?.value.trim();
    const exEn  = document.getElementById('newExEN')?.value.trim();
    const exZh  = document.getElementById('newExZH')?.value.trim();
    const exVi  = document.getElementById('newExVI')?.value.trim();
    if (!word) { showToast('Nhập từ tiếng Anh!'); return; }
    try {
        const payload = { word, meaning: mean || word, word_en: word || '', word_zh: zh || '', pinyin: py || '', example_en: exEn || '', example_zh: exZh || '', example_vi: exVi || '' };
        let res = await apiFetch('/words', { method: 'POST', body: JSON.stringify(payload) });
        if (res.ok) {
            showToast('✅ Đã tạo thẻ với đầy đủ dữ liệu!');
            if(document.getElementById('newQuestion')) document.getElementById('newQuestion').value = '';
            if(document.getElementById('newWordZH'))   document.getElementById('newWordZH').value = '';
            if(document.getElementById('newPinyin'))   document.getElementById('newPinyin').value = '';
            if(document.getElementById('newAnswer'))   document.getElementById('newAnswer').value = '';
            if(document.getElementById('newExEN'))     document.getElementById('newExEN').value = '';
            if(document.getElementById('newExZH'))     document.getElementById('newExZH').value = '';
            if(document.getElementById('newExVI'))     document.getElementById('newExVI').value = '';
            loadStats(); showTab('study');
        } else {
            showToast('Lỗi tạo thẻ');
        }
    } catch(e) { showToast('Lỗi kết nối'); }
}

window.aiFillForManual = async function() {
    let word = document.getElementById('newQuestion').value.trim();
    if (!word) { showToast('Nhập từ trước'); return; }
    const container = document.getElementById('manualFullPreview');
    if (container) container.innerHTML = `<div style="padding:16px;text-align:center;color:#0ea5e9;font-weight:600;">⏳ Đang AI điền đầy đủ thẻ (EN-IPA + ZH-Pinyin + ví dụ 3 ngôn ngữ)...</div>`;
    showLoading();
    try {
        let res = await apiFetch('/words/ai-preview', { method:'POST', body: JSON.stringify({word, language: document.getElementById('settingLang')?.value || 'trilingual'}) , timeout: 90000 });
        if (res.ok) {
            let data = await res.json();
            renderFullCardPreview(data.preview, 'manual');
        } else {
            if (container) container.innerHTML = '';
            showToast('AI preview lỗi');
        }
    } catch(e){ if (container) container.innerHTML = ''; showToast('Không kết nối AI'); }
    hideLoading();
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
    const preview = document.getElementById('aiPreview');
    if (preview) preview.innerHTML = `<div style="padding:20px;text-align:center;color:#b45309;font-weight:600;">⏳ Đang hỏi AI (model nhỏ hay thiếu Trung/Pinyin)...<br><span style="font-size:12px;color:#64748b;font-weight:400;">Sau khi có preview, bạn phải tự điền các field còn thiếu để đủ 3 ngôn ngữ.</span></div>`;
    showLoading();
    try {
        let lang = document.getElementById('settingLang')?.value || 'trilingual';
        let res = await apiFetch('/words/ai-preview', {
            method: 'POST',
            body: JSON.stringify({ word, language: lang }),
            timeout: 90000
        });
        if (res.ok) {
            let data = await res.json();
            renderFullCardPreview(data.preview, 'ai');
            showToast('✨ Xem trước thẻ — đã có đầy đủ IPA, Pinyin, ví dụ 3 ngôn ngữ');
        } else {
            if (preview) preview.innerHTML = '';
            showToast('❌ AI không tạo được preview');
        }
    } catch(e) {
        if (preview) preview.innerHTML = '';
        showToast('❌ Không kết nối AI (kiểm tra Ollama)');
    }
    hideLoading();
}

// Render rich editable preview for full trilingual card (WebUI upgrade)
function renderFullCardPreview(card, target) {
    const container = (target === 'manual') 
        ? document.getElementById('manualFullPreview') 
        : document.getElementById('aiPreview');
    if (!container) return;

    const idPrefix = 'pv_' + target + '_';
    container.innerHTML = `
        <div style="background:#fff;border:2px solid #6366f1;border-radius:12px;padding:14px;margin-top:12px;">
            <div style="font-weight:700;color:#4338ca;margin-bottom:6px;">📋 Xem trước & chỉnh sửa thẻ (AI hay thiếu field với model nhỏ)</div>
            <div style="font-size:11px;color:#b45309;margin-bottom:10px;background:#fef3c7;padding:4px 6px;border-radius:4px;">⚠️ Model nhỏ hay thiếu Trung/Pinyin/ví dụ. Bạn phải điền những ô trống để có thẻ đầy đủ!</div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
                <div><b>🇬🇧 EN:</b><br><input id="${idPrefix}en" value="${escapeHTML(card.word_en||'')}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;"></div>
                <div><b>IPA:</b><br><input id="${idPrefix}ipa" value="${escapeHTML(card.pronunciation||'')}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></div>
                
                <div><b>🇨🇳 ZH:</b><br><input id="${idPrefix}zh" value="${escapeHTML(card.word_zh||'')}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;"></div>
                <div><b>Pinyin:</b><br><input id="${idPrefix}py" value="${escapeHTML(card.pinyin||'')}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;color:#c2410c;"></div>
                
                <div style="grid-column:1/-1;"><b>🇻🇳 Nghĩa:</b><br><input id="${idPrefix}vi" value="${escapeHTML(card.meaning||'')}" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            </div>

            <div style="margin:10px 0 4px;font-weight:600;color:#334155;">Ví dụ 3 ngôn ngữ:</div>
            <div style="font-size:12px;line-height:1.3;">
                🇬🇧 <input id="${idPrefix}ex_en" value="${escapeHTML(card.example_en||'')}" style="width:98%;padding:3px;border:1px solid #a5b4fc;border-radius:4px;margin:2px 0;"><br>
                🇨🇳 <input id="${idPrefix}ex_zh" value="${escapeHTML(card.example_zh||'')}" style="width:98%;padding:3px;border:1px solid #fdba74;border-radius:4px;margin:2px 0;"><br>
                🇻🇳 <input id="${idPrefix}ex_vi" value="${escapeHTML(card.example_vi||'')}" style="width:98%;padding:3px;border:1px solid #86efac;border-radius:4px;margin:2px 0;">
            </div>

            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="saveFullCardFromPreview('${target}', '${idPrefix}')" style="flex:1;">💾 Lưu thẻ này</button>
                <button class="btn" onclick="regeneratePreview('${target}', '${escapeAttr(card.word_en || document.getElementById('aiWord')?.value || '')}', '${idPrefix}')" style="flex:1;background:#fef3c7;color:#854d0e;border-color:#fde047;">🔄 Tạo lại bằng AI</button>
                <button class="btn" onclick="this.closest('div[style*=\'border:2px solid\']').innerHTML=''" style="background:#fee2e2;color:#991b1b;">✖ Hủy</button>
            </div>
            <div style="font-size:10px;color:#64748b;margin-top:4px;">Tất cả dữ liệu sẽ được lưu đầy đủ (EN-IPA + ZH-Pinyin + VI + ví dụ).</div>
        </div>
    `;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
}

window.saveFullCardFromPreview = async function(target, prefix) {
    const get = id => document.getElementById(prefix + id)?.value?.trim() || '';
    const payload = {
        word: get('en') || get('zh') || 'new',
        meaning: get('vi'),
        word_en: get('en'),
        word_zh: get('zh'),
        pinyin: get('py'),
        pronunciation: get('ipa'),
        example_en: get('ex_en'),
        example_zh: get('ex_zh'),
        example_vi: get('ex_vi'),
        cloze_text: ''   // can be derived later
    };
    try {
        let res = await apiFetch('/words', { method:'POST', body: JSON.stringify(payload) });
        if (res.ok) {
            showToast('✅ Đã lưu thẻ thành công! Nội dung đầy đủ: EN+IPA, ZH+Pinyin, VI + ví dụ 3 ngôn ngữ');
            const cont = (target==='ai') ? document.getElementById('aiPreview') : document.getElementById('manualFullPreview');
            if (cont) cont.innerHTML = '';
            if (target==='ai') document.getElementById('aiWord').value = '';
            loadStats();
            showTab('study');
        } else {
            let errText = '';
            try { const j = await res.json(); errText = j.detail || JSON.stringify(j); } catch(_) {}
            showToast('Lỗi lưu thẻ: ' + (errText || res.status));
            console.error('Save card error', res.status, errText);
        }
    } catch(e){ 
        showToast('Lỗi mạng khi lưu: ' + (e.message || e));
        console.error('Save card network error', e);
    }
}

window.regeneratePreview = async function(target, word, prefix) {
    if (!word) word = prompt('Từ cần tạo lại?', '');
    if (!word) return;
    showLoading();
    try {
        let res = await apiFetch('/words/ai-preview', {method:'POST', body:JSON.stringify({word, language:'trilingual'}), timeout:90000});
        if (res.ok) {
            let d = await res.json();
            renderFullCardPreview(d.preview, target);
        }
    } catch(e){}
    hideLoading();
}

window.generateBatchCards = async function() {
    let text = document.getElementById('batchWords').value;
    let words = text.split(/[\n,]+/).map(w => w.trim()).filter(w => w);
    if (words.length === 0) { showToast('Nhập từ trước!'); return; }
    
    let progressEl = document.getElementById('batchProgress');
    let lang = document.getElementById('settingLang')?.value || 'trilingual';
    let total = words.length;
    let successCount = 0;
    let failCount = 0;
    
    // Show initial state
    function renderProgress() {
        let bars = '';
        for (let i = 0; i < total; i++) {
            let pct = i < successCount ? 100 : i < successCount + failCount ? 0 : 0;
            let color = i < successCount ? '#10b981' : i < successCount + failCount ? '#ef4444' : '#e5e7eb';
            bars += `<div style="flex:1; height:8px; background:${color}; border-radius:4px; margin:2px; display:inline-block; width:${100/total}%;" title="${i+1}/${total}"></div>`;
        }
        progressEl.innerHTML = `
            <div style="margin-bottom:12px;">
                <div style="font-size:13px; color:#374151; margin-bottom:6px; font-weight:600;">
                    ⏳ Đang tạo thẻ đầy đủ 3 ngôn ngữ (EN+IPA, ZH+Pinyin, ví dụ 3 ngôn ngữ)... <span style="color:#6366f1;">${successCount + failCount}/${total}</span>
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
                    document.getElementById('batchStatus').textContent = `✅ "${word}" OK! (đầy đủ IPA + Pinyin + ví dụ 3 ngôn ngữ)`;
                } else {
                    failCount++;
                    document.getElementById('batchStatus').textContent = `❌ "${word}" lỗi: không tạo được thẻ đầy đủ`;
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
    
    const resultEl = document.getElementById('batchResult');
    
    if (failCount === 0) {
        showToast(`✅ Đã tạo tất cả ${successCount} thẻ với nội dung đầy đủ 3 ngôn ngữ!`);
        if (resultEl) {
            resultEl.innerHTML = `
                <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-top:10px;">
                    <div style="color:#166534;font-weight:700;">✅ Hoàn tất!</div>
                    <div style="font-size:13px;color:#166534;margin-top:4px;">
                        Tất cả ${successCount} thẻ đều có đầy đủ: EN + IPA, ZH + Pinyin, nghĩa VI + ví dụ 3 ngôn ngữ.
                    </div>
                    <button class="btn" onclick="showTab('manage'); document.getElementById('batchResult').innerHTML='';" style="margin-top:8px;background:#86efac;color:#166534;">📂 Xem trong Quản lý thẻ</button>
                </div>
            `;
        }
    } else if (successCount === 0) {
        showToast(`❌ Tất cả ${failCount} thẻ đều lỗi. Kiểm tra Ollama AI!`);
        if (resultEl) resultEl.innerHTML = `<div style="color:#ef4444;">Tất cả đều thất bại. Thử từng từ ở tab AI sinh thẻ.</div>`;
    } else {
        showToast(`⚠️ ${successCount} thành công, ${failCount} thất bại`);
        if (resultEl) {
            resultEl.innerHTML = `
                <div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:12px;margin-top:10px;">
                    <div style="color:#854d0e;">Tạo được ${successCount}/${total} thẻ đầy đủ 3 ngôn ngữ.</div>
                    <button class="btn" onclick="showTab('manage')" style="margin-top:8px;">Xem thẻ đã tạo</button>
                </div>
            `;
        }
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

/* === NEW: Sequential audio playback for game-like study (EN word → ZH word → VI meaning → example) === */
window.playFullSequence = function(card) {
    if (!card) return;
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    
    (async () => {
        // 1. English word
        if (card.word_en) {
            speakText('en', card.word_en);
            await delay(1600);
        }
        // 2. Chinese word
        if (card.word_zh) {
            speakText('zh', card.word_zh);
            await delay(1800);
        }
        // 3. Vietnamese meaning
        if (card.meaning) {
            speakText('vi-VN', card.meaning);
            await delay(1600);
        }
        // 4. Example (prefer English, then ZH, then VI)
        const ex = card.example || card.example_zh || card.example_vi;
        if (ex) {
            const langEx = card.example ? 'en' : (card.example_zh ? 'zh' : 'vi-VN');
            speakText(langEx, ex);
        }
    })();
};

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
            div.className = 'exercise-card';
            div.style.background = '#f8fafc';
            div.style.padding = '15px';
            div.style.borderRadius = '12px';
            div.style.marginBottom = '15px';
            
            let text = q.cloze_text.replace('_____', `<input type="text" id="ex-in-${q.vocab_id}" style="border:none; border-bottom: 2px solid #6366f1; width: 100px; text-align: center; outline: none; background: transparent;">`);
            
            div.innerHTML = `
                <div style="font-size: 1.1rem; margin-bottom: 10px;">${text}</div>
                <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 10px;">🇻🇳 ${q.example_vi}</div>
                <button class="btn btn-primary btn-sm" onclick="checkExercise(${q.vocab_id})">Kiểm tra</button>
                <div id="ex-res-${q.vocab_id}" style="margin-top: 10px; font-weight: bold;"></div>
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

window._balloonVocabList    = [];
window._balloonSessionScore = 0;
window._balloonSessionLevel = 0;
window._balloonWordsDone    = [];
window._balloonFloatyElIds  = [];
window._snakeAvatar = null;
const SNAKE_SIZE = 58;

// Goldfish game state
let _gfQs = [], _gfIdx = 0, _gfSc = 0, _gfLv = 3;
let _gfCurrentVI = '', _gfCurrentEN = '', _gfCorrectWord = '', _gfSlotAnswers = [];

// Bird game state
let _birdQs = [], _birdIdx = 0, _birdSc = 0, _birdLv = 3;
let _birdCurrentVI = '', _birdCurrentEN = '', _birdCurrentQ = null;

function _sh(el,h){if(el)el.style.display=h?'none':'';}
function _ld(el,v){if(el)el.textContent=v;}
function _th(el,v){if(el)el.innerHTML=v;}
function _s(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=0|Math.random()*(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}

function _mkSnake(p){
    if(window._snakeAvatar && window._snakeAvatar.el.parentNode===p)return;
    if(window._snakeAvatar)window._snakeAvatar.el.remove();
    const e=document.createElement('div');e.className='snake-char';
    e.innerHTML=`<svg width="${SNAKE_SIZE}"height="${SNAKE_SIZE}"viewBox="0 0 56 56"><defs><linearGradient id="sg"x1="0"y1="0"x2="1"y2="1"><stop offset="0%"stop-color="#a78bfa"/><stop offset="100%"stop-color="#4f46e5"/></linearGradient></defs><circle cx="28"cy="28"r="26"fill="url(#sg)"/><path d="M18 22 Q28 14 38 22"stroke="white"stroke-width="3"stroke-linecap="round"fill="none"/><circle cx="21"cy="20"r="3.5"fill="white"/><circle cx="35"cy="20"r="3.5"fill="white"/><circle cx="22"cy="19"r="1.8"fill="#1e1b4b"/><circle cx="36"cy="19"r="1.8"fill="#1e1b4b"/><path d="M24 36 Q28 41 32 36"stroke="white"stroke-width="2.5"fill="none"stroke-linecap="round"/></svg>`;
    Object.assign(e.style,{position:'absolute',width:SNAKE_SIZE+'px',height:SNAKE_SIZE+'px',pointerEvents:'none',zIndex:'999',transition:'left 0.32s cubic-bezier(0.34,1.56,0.64,1),top 0.32s cubic-bezier(0.34,1.56,0.64,1)'});
    p.prepend(e);window._snakeAvatar={el:e,x:p.offsetWidth/2,y:p.offsetHeight/2};
    window._snakeAvatar.el.style.left=(window._snakeAvatar.x-SNAKE_SIZE/2)+'px';
    window._snakeAvatar.el.style.top=(window._snakeAvatar.y-SNAKE_SIZE/2)+'px';
}
function _mvS(el,c,ms=340){
    if(!window._snakeAvatar||!window._snakeAvatar.el?.parentNode)return;
    const r=el.getBoundingClientRect(),cc=c.getBoundingClientRect();
    window._snakeAvatar.x=r.left+r.width/2-cc.left-SNAKE_SIZE/2;
    window._snakeAvatar.y=r.top+r.height/2-cc.top-SNAKE_SIZE/2;
    window._snakeAvatar.el.style.transitionDuration=ms+'ms';
    window._snakeAvatar.el.style.left=window._snakeAvatar.x+'px';
    window._snakeAvatar.el.style.top=window._snakeAvatar.y+'px';
}
function _rmS(){if(window._snakeAvatar?.el?.parentNode)window._snakeAvatar.el.remove();window._snakeAvatar=null;}

// setGamePhase
window.setGamePhase=function(p){
    // Update active tab buttons
    document.querySelectorAll('.phase-btn').forEach(b=>b.classList.remove('active'));
    const pb=document.getElementById('ptab-'+p);if(pb)pb.classList.add('active');
    // Show correct panel
    document.querySelectorAll('.phase-content').forEach(x=>x.style.display='none');
    const panel=document.getElementById('phase-'+p);if(panel)panel.style.display='block';
    // Update LB subtitle
    const sub=document.getElementById('lbSubtitle');
    if(sub)sub.textContent={balloon:'(Bong bóng từ vựng)',fillblank:'(Điền từ đúng)',build:'(Ghép câu)',snake:'(Snake Lingo)',
      g1:'(🪱 Rắn EN→VI)',g2:'(🐟 Cá điền từ)',g3:'(🐦 Chim bay từ)',g4:'(🐍 Rắn ăn chữ)'}[p]||'';
    // Start game
    switch(p){
        case 'g1':      if(window.startSnake1Game)setTimeout(()=>window.startSnake1Game(),50); break;
        case 'g2':      if(window.startGoldfishGame)setTimeout(()=>window.startGoldfishGame(),50); break;
        case 'g3':      if(window.startBirdGame)setTimeout(()=>window.startBirdGame(),50); break;
        case 'g4':      if(window.startSnake2Game)setTimeout(()=>window.startSnake2Game(),50); break;
        case 'snake':
        case 'g4_old':  if(window.startSnakeGame)setTimeout(()=>window.startSnakeGame(),100); break;
        case 'balloon': loadLeaderboard(); if(window.startBalloonGame)setTimeout(startBalloonGame,50); break;
        case 'fillblank':if(window.startFillBlankGame)setTimeout(startFillBlankGame,50); break;
        case 'build':   if(window.startSentenceBuildGame)setTimeout(startSentenceBuildGame,50); break;
    }
};

// ===== PHASE 1: Balloon Vocabulary =====
window.startBalloonGame=async function(){
    if(!window._balloonVocabList.length){
        try{const r=await apiFetch('/game/vocab-balloon/session');window._balloonVocabList=(await r.json()).vocabs||[];}
        catch(e){showToast('Không tải được từ vựng!');return;}
    }
    if(window._balloonVocabList.length<4){showToast('Học ít nhất 4 thẻ trước!');return;}
    window._balloonSessionScore=0;window._balloonSessionLevel=0;window._balloonWordsDone=[];
    _rmS();
    _ld(document.getElementById('balloonScoreVal'),'0');
    _ld(document.getElementById('balloonLevelVal'),'0/4');
    _sh(document.getElementById('btnBalloonStart'),true);
    _sh(document.getElementById('btnBalloonNext'),true);
    _th(document.getElementById('balloonAnsChips'),'');
    _th(document.getElementById('balloonCanvas'),'');
    _ld(document.getElementById('balloonTaskHint'),'Đang chuẩn bị...');
    if(document.getElementById('balloonCanvas')){document.getElementById('balloonCanvas').innerHTML='';}
    if(document.getElementById('balloonRevealBox')){
        if(document.getElementById('balloonImg'))document.getElementById('balloonImg').style.display='none';
        if(document.getElementById('balloonImgSkel'))document.getElementById('balloonImgSkel').style.display='none';
        ['balloonWordEN','balloonWordZH','balloonWordVI'].forEach(k=>{const e=document.getElementById(k);if(e)e.textContent='';});
    }
    _advBalloon();
};

function _advBalloon(){
    const canvas=document.getElementById('balloonCanvas');if(!canvas)return;
    canvas.innerHTML='';window._balloonFloatyElIds=[];
    const pool=window._balloonVocabList.filter(v=>!window._balloonWordsDone.includes(v.id));
    const done=window._balloonVocabList.length-pool.length;
    if(!pool.length){
        _th(canvas,`<div style="text-align:center;padding:30px;display:flex;flex-direction:column;align-items:center;gap:16px;">
            <div style="font-size:3rem">🎉</div>
            <div style="font-size:1.4rem;font-weight:800;color:#7c3aed">Giai đoạn từ hoàn thành!</div>
            <div style="font-size:1.1rem;color:#6b7280">Điểm: <b style="color:#f59e0b">${window._balloonSessionScore}</b> · ${done} từ đã học</div>
            <button onclick="submitBalloonScoreThenGo()" style="padding:10px 24px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#d946ef);color:white;border:none;font-weight:700;cursor:pointer;font-size:1rem;">→ Sang Điền từ</button>
        </div>`);
        return;
    }
    const vocab=_s(pool)[0];
    window._balloonSessionLevel=done+1;
    const imgEl=document.getElementById('balloonImg');
    imgEl.src=vocab.image_url||'';imgEl.onload=()=>{imgEl.style.display='block';};
    imgEl.onerror=()=>{imgEl.style.display='none';};
    _sh(document.getElementById('balloonImgSkel'),true);
    ['balloonWordVI','balloonWordEN','balloonWordZH'].forEach(id=>_ld(document.getElementById(id),''));
    const pn=['🇬🇧 Tiếng Anh','🇨🇳 Tiếng Trung','🇻🇳 Nghĩa tiếng Việt','📖 Ví dụ'];
    _ld(document.getElementById('balloonPhaseBadge'),`🌐 Giai đoạn ${done+1}/4 — ${pn[done]}`);
    _ld(document.getElementById('balloonLevelVal'),`${done+1}/4`);
    _ld(document.getElementById('balloonScoreVal'),window._balloonSessionScore);
    const tt=vocab.word_en||vocab.word;
    if(done===0){
        _ld(document.getElementById('balloonWordEN'),tt);
        _ld(document.getElementById('balloonTaskHint'),`🔍 Hãy chọn bong bóng có chữ <b>${tt}</b>`);
    }else if(done===1){
        _ld(document.getElementById('balloonWordZH'),vocab.word_zh||'—');
        _ld(document.getElementById('balloonTaskHint'),`🔍 Chọn bong bóng có chữ: <b>${tt}</b>`);
    }else if(done===2){
        _ld(document.getElementById('balloonWordVI'),vocab.meaning||'—');
        _ld(document.getElementById('balloonTaskHint'),`🔍 Chọn bong bóng có nghĩa là <b>${tt}</b>`);
    }else{
        const ex=vocab.example_vi||vocab.example||'—';
        _th(document.getElementById('balloonTaskHint'),`📖 Ví dụ:<br><b>"${ex}"</b><br>Tìm từ <b>${tt}</b> trong câu!`);
    }
    _spawnBalloons(canvas,vocab,tt,done);
}

function _spawnBalloons(canvas,vocab,tt,done){
    const cW=canvas.offsetWidth||560,cH=canvas.offsetHeight||380;
    const isEx=done>=3,matchWord=isEx?(vocab.example_vi||vocab.example):tt;
    const wrongs=_s(window._balloonVocabList.filter(v=>v.id!==vocab.id))
        .slice(0,7).map(v=>isEx?(v.example_vi||v.example||v.word_en):(v.word_en||v.word));
    const words=_s([matchWord,...wrongs.slice(0,6)]);
    _mkSnake(canvas);
    words.forEach((w,i)=>{
        const isT=w===matchWord;
        const el=document.createElement('div');el.className='balloon';
        el.textContent=w.length>9?w.substring(0,8)+'…':w;
        Object.assign(el.style,{
            position:'absolute',minWidth:'72px',maxWidth:'160px',padding:'7px 13px',
            borderRadius:'48% 48% 46% 54%',
            background:isT?'radial-gradient(circle at 30% 30%,#6ee7b7,#10b981)':'radial-gradient(circle at 32% 30%,rgba(96,165,250,0.9),rgba(124,58,237,0.75))',
            border:isT?'3px solid #059669':'2px solid rgba(124,58,237,0.3)',
            color:'white',fontSize:'0.87rem',fontWeight:'800',textAlign:'center',
            cursor:'pointer',zIndex:'5',boxShadow:isT?'0 4px 18px rgba(16,185,129,0.4)':'0 3px 12px rgba(99,102,241,0.22)',
            transition:'transform .2s cubic-bezier(0.34,1.56,0.64,1),box-shadow .2s',
        });
        let px,py,tries=0;
        do{px=14+Math.random()*(cW-100);py=14+Math.random()*(cH-80);tries++;}
        while(tries<25&&window._balloonFloatyElIds.some(id=>{const o=document.getElementById(id);if(!o)return false;return Math.abs(px-parseInt(o.style.left||0))<85&&Math.abs(py-parseInt(o.style.top||0))<70;}));
        el.style.left=px+'px';el.style.top=py+'px';el.id='bb-'+Date.now()+'-'+i;
        window._balloonFloatyElIds.push(el.id);canvas.appendChild(el);
        const d=2400+Math.random()*2000,sy=py,dx=px+(Math.random()-0.5)*38;
        el.animate([{left:px+'px',top:sy+'px'},{left:dx+'px',top:(sy-18)+'px'},{left:px+'px',top:sy+'px'}],
            {duration:d,iterations:Infinity,easing:'ease-in-out'});
        el.addEventListener('click',()=>_onBubClick(el,canvas,isT,vocab,tt));
    });
    setTimeout(()=>_th(document.getElementById('balloonTaskHint'),'🔍 Di chuyển rắn đến bong bóng chính xác!'),1200);
}

function _onBubClick(el,canvas,isT,vocab,tt){
    if(isT){
        window._balloonSessionScore+=Math.round(12+window._balloonSessionLevel*3);
        _ld(document.getElementById('balloonScoreVal'),window._balloonSessionScore);
        _mvS(el,canvas,340);el.style.animation='popOut .3s ease forwards';
        window._balloonWordsDone.push(vocab.id);
        setTimeout(()=>{el.remove();_advBalloon();},360);
    }else{
        window._balloonSessionScore=Math.max(0,window._balloonSessionScore-5);
        _ld(document.getElementById('balloonScoreVal'),window._balloonSessionScore);
        el.style.animation='shake .4s';setTimeout(()=>{el.style.animation='';},600);
        _th(document.getElementById('balloonTaskHint'),`❌ "${el.textContent}" là sai! Tìm bong bóng chính xác nhé!`);
    }
}

window.submitBalloonScoreThenGo=function(){
    apiFetch('/game/vocab-balloon/submit',{method:'POST',body:JSON.stringify({score:window._balloonSessionScore,level:window._balloonSessionLevel})}).catch(()=>{});
    loadLeaderboard();setGamePhase('fillblank');
};

window.playWordAudio=async function(){
    const pool=window._balloonVocabList.filter(v=>!window._balloonWordsDone.includes(v.id));
    if(!pool.length)return;const v=pool[0];
    if(v.word_en)speakText('en',v.word_en);
    await new Promise(r=>setTimeout(r,1600));
    if(v.word_zh)speakText('zh',v.word_zh);
    await new Promise(r=>setTimeout(r,1600));
    if(v.meaning)speakText('vi-VN',v.meaning);
    await new Promise(r=>setTimeout(r,1600));
    const ex=v.example||v.example_zh||v.example_vi;
    if(ex)speakText(v.example?'en':(v.example_zh?'zh':'vi-VN'),ex);
};

// ===== GAME 2: Cá điền từ (Goldfish Fill-Blank) =====

window.startGoldfishGame = async function() {
    _gfIdx = 0; _gfSc = 0; _gfLv = 3; _gfQs = []; _rmS();
    try {
        const r = await apiFetch('/game/goldfish/session');
        _gfQs = (await r.json()).questions || [];
    } catch (e) { _gfQs = []; }
    if (!_gfQs.length) { showToast('Học thẻ có câu ví dụ đầy đủ trước!'); return; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    _gfDrawQ();
};

// Count how many slots needed = number of words in correct phrase
function _gfSlotCount(correctWords) {
    const ans = (correctWords && correctWords[0]) || '';
    const parts = ans.trim().split(/\s+/);  // split on whitespace
    return Math.max(1, parts.length);
}

function _gfDrawQ() {
    if (_gfIdx >= _gfQs.length) { _gfEndGame(); return; }
    const q = _gfQs[_gfIdx];
    _gfCurrentVI  = q.word_vi   || '';
    _gfCurrentEN  = q.sentence_en || '';
    _gfCorrectWord = (q.correctWords && q.correctWords[0]) || '';

    // Build word bank: correct words + wrong words from allWords
    const correctTokens = _gfCorrectWord.trim().split(/\s+/);
    const bank = [...correctTokens]; // start with correct words
    ((q.allWords) || []).forEach(w => {
        if (w && !bank.includes(w)) bank.push(w);
    });
    // Fisher-Yates shuffle
    for (let i = bank.length - 1; i > 0; i--) {
        const j = 0 | Math.random() * (i + 1);
        [bank[i], bank[j]] = [bank[j], bank[i]];
    }

    const numSlots = correctTokens.length;
    _gfSlotAnswers = Array(numSlots).fill(null);  // one null per slot

    // Update UI
    const el = id => document.getElementById(id);
    el('fishLevel').textContent  = _gfIdx + 1;
    el('fishScore').textContent  = _gfSc;
    el('fishLives').textContent  = _gfLv;
    el('fishMsg').innerHTML      = '';
    el('fishSenVI').textContent  = q.sentence_vi || _gfCurrentVI;
    el('fishSenEN').textContent  = _gfCurrentEN;

    // Word bank
    const bankEl = el('fishWordBank');
    bankEl.innerHTML = '';
    bank.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = w.length > 12 ? w.substring(0, 10) + '…' : w;
        btn.style.cssText = 'padding:6px 13px;border-radius:99px;background:linear-gradient(135deg,#dbeafe,#ede9fe);color:#1e40af;font-weight:700;font-size:.85rem;border:2px solid #a5b4fc;cursor:pointer;margin:3px;';
        btn.onclick = () => _gfClickWord(w, btn);
        bankEl.appendChild(btn);
    });

    // Slot boxes  — one box per correct word token
    const slotEl = el('fishSlotBox');
    slotEl.innerHTML = '';
    for (let i = 0; i < numSlots; i++) {
        const s = document.createElement('button');
        s.id = 'gf-slot-' + i;
        s.textContent = '…';
        s.style.cssText = 'width:auto;min-width:56px;height:48px;border-radius:14px;font-size:.85rem;font-weight:700;background:#f8fafc;color:#94a3b8;border:2px dashed #c7d2fe;cursor:default;padding:0 10px;';
        slotEl.appendChild(s);
    }
}

function _gfClickWord(word, btnEl) {
    if (_gfLv <= 0) return;
    const firstEmpty = _gfSlotAnswers.indexOf(null);
    if (firstEmpty < 0) return; // all slots filled

    _gfSlotAnswers[firstEmpty] = word;
    btnEl.style.opacity = '0.3';
    btnEl.disabled = true;

    // Update slot
    const slotEl = document.getElementById('gf-slot-' + firstEmpty);
    if (slotEl) {
        slotEl.textContent = word;
        slotEl.style.cssText = 'min-width:56px;height:48px;border-radius:14px;font-size:.85rem;font-weight:700;background:#d1fae5;color:#065f46;border:2px solid #6ee7b7;cursor:default;padding:0 10px;';
    }

    // Check if all slots filled
    if (!_gfSlotAnswers.includes(null)) {
        // Compare assembled answer vs correct answer
        const correctTokens = _gfCorrectWord.trim().split(/\s+/);
        const ok = _gfSlotAnswers.every((a, i) => a === correctTokens[i]);
        setTimeout(() => {
            if (ok) {
                _gfSc += 20 + 5 * numSlots;
                el('fishScore').textContent = _gfSc;
                el('fishMsg').innerHTML = '<span style="color:#10b981">✅ Chính xác!</span>';
                setTimeout(() => { _gfIdx++; _gfDrawQ(); }, 1000);
            } else {
                _gfLv--;
                el('fishLives').textContent = _gfLv;
                const ansStr = correctTokens.join(' ');
                el('fishMsg').innerHTML = `<span style="color:#ef4444">❌ Sai! Đáp án đúng: <b>${ansStr}</b></span> Máu còn <b>${_gfLv}</b>`;
                if (_gfLv <= 0) { setTimeout(_gfEndGame, 1500); }
                else              { setTimeout(() => { _gfSlotAnswers = Array(correctTokens.length).fill(null); _gfDrawQ(); }, 1500); }
            }
        }, 350);
    }
}

function _gfEndGame() {
    const gEl = id => document.getElementById(id);
    const won = _gfLv > 0;
    const allQs = _gfQs.length;
    gEl('fishMsg').innerHTML = '<span style="font-size:1.1rem;font-weight:800;color:' + (won ? '#10b981' : '#ef4444') + '">Kết thúc! Điểm: ' + _gfSc + ' · Đúng ' + _gfIdx + '/' + allQs + ' câu</span>';
    apiFetch('/game/goldfish/submit', { method: 'POST', body: JSON.stringify({ score: _gfSc, level: _gfIdx + 1 }) }).catch(() => {});
    setTimeout(loadLeaderboard, 500);
}

window.resetFishQ = function() {
    const bankEl = document.getElementById('fishWordBank');
    bankEl.querySelectorAll('button').forEach(b => { b.style.opacity = '1'; b.disabled = false; });
    const correctTokens = _gfCorrectWord.trim().split(/\s+/);
    _gfSlotAnswers = Array(correctTokens.length).fill(null);
    for (let i = 0; i < _gfSlotAnswers.length; i++) {
        const s = document.getElementById('gf-slot-' + i);
        if (s) { s.textContent = '…'; s.style.cssText = 'min-width:56px;height:48px;border-radius:14px;font-size:.85rem;font-weight:700;background:#f8fafc;color:#94a3b8;border:2px dashed #c7d2fe;cursor:default;padding:0 10px;'; }
    }
};

// ===== GAME 3: Chim bay từ (Bird Word Select) =====

window.startBirdGame = async function() {
    _birdIdx = 0; _birdSc = 0; _birdLv = 3; _birdQs = []; _rmS();
    try {
        const r = await apiFetch('/game/goldfish/session');
        _birdQs = (await r.json()).questions || [];
    } catch (e) { _birdQs = []; }
    if (!_birdQs.length) { showToast('Học thẻ có ví dụ đầy đủ trước!'); return; }
    _birdDrawQ();
};

function _birdDrawQ() {
    if (_birdIdx >= _birdQs.length) { _birdEndGame(); return; }
    const q = _birdQs[_birdIdx];
    _birdCurrentVI = q.word_vi   || '';
    _birdCurrentEN = q.sentence_en || '';
    _birdCurrentQ  = q;

    const el = id => document.getElementById(id);
    el('birdWordIdx').textContent = _birdIdx + 1;
    el('birdScore').textContent  = _birdSc;
    el('birdVI').textContent     = _birdCurrentVI;
    el('birdEX').textContent     = q.sentence_vi || '';
    el('birdFeedback').innerHTML = '';

    // Build bank
    const correct  = (q.correctWords && q.correctWords[0]) || (q.word_en || '');
    const bank     = [correct];
    ((q.allWords) || []).forEach(w => { if (w && !bank.includes(w)) bank.push(w); });
    // shuffle
    for (let i = bank.length - 1; i > 0; i--) {
        const j = 0 | Math.random() * (i + 1);
        [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    // Render word buttons
    const wordsEl = el('birdWords');
    wordsEl.innerHTML = '';
    bank.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm';
        btn.textContent = w.length > 14 ? w.substring(0, 12) + '…' : w;
        btn.style.cssText = 'padding:8px 16px;border-radius:12px;background:linear-gradient(135deg,#fef9c3,#fde68a);color:#92400e;font-weight:700;font-size:.88rem;border:2px solid #fde68a;cursor:pointer;margin:3px;transition:transform .15s;';
        btn.onmouseover = () => { btn.style.transform = 'scale(1.08)'; };
        btn.onmouseout  = () => { btn.style.transform = 'scale(1)'; };
        btn.onclick = () => _birdClick(w, correct);
        wordsEl.appendChild(btn);
    });
}

function _birdClick(word, correct) {
    const el = id => document.getElementById(id);
    // Happy bird animation
    const sf = el('birdSprite');
    sf.style.animation = 'birdHappy .5s ease forwards';
    setTimeout(() => sf.style.animation = 'birdFly 1.4s ease-in-out infinite alternate', 600);

    if (word === correct) {
        _birdSc += 15;
        el('birdScore').textContent = _birdSc;
        el('birdFeedback').innerHTML = '<span style="color:#10b981">✅ Đúng!</span>';
        setTimeout(() => { _birdIdx++; _birdDrawQ(); }, 900);
    } else {
        _birdLv--;
        el('birdFeedback').innerHTML = '<span style="color:#ef4444">❌ Sai "' + word + '"! Đáp án: ' + correct + ' (' + _birdCurrentVI + ')</span>';
        if (_birdLv <= 0) { setTimeout(_birdEndGame, 1200); }
    }
}

function _birdEndGame() {
    const msg = 'Kết thúc! Điểm: ' + _birdSc;
    document.getElementById('birdWords').innerHTML = '<p style="font-size:1.1rem;font-weight:700;color:' + (_birdLv > 0 ? '#10b981' : '#ef4444') + '">' + msg + '</p>';
    document.getElementById('birdFeedback').innerHTML = '';
    apiFetch('/game/goldfish/submit', { method: 'POST', body: JSON.stringify({ score: _birdSc, level: _birdIdx + 1 }) }).catch(() => {});
    loadLeaderboard();
}

window.speakBirdCard = function() {
    if (_birdCurrentEN) speakText('en', _birdCurrentEN);
    if (_birdCurrentVI) { setTimeout(() => speakText('vi', _birdCurrentVI), 1800); }
};

// ===== PHASE 2: Fill-Blank =====
let _fbQs=[],_fbIdx=0,_fbSc=0,_fbLv=3;

window.startFillBlankGame=async function(){
    _fbIdx=0;_fbSc=0;_fbLv=3;_fbQs=[];_rmS();
    try{const r=await apiFetch('/exercises/fill-blank');_fbQs=(await r.json())||[];}
    catch(e){_fbQs=[];}
    if(!_fbQs.length){showToast('Học thẻ với ví dụ đầy đủ trước!');return;}
    _drawFBQ();
};

function _drawFBQ(){
    const q=_fbQs[_fbIdx];if(!q){_endFB();return;}
    _ld(document.getElementById('fbIdx'),_fbIdx+1);
    _ld(document.getElementById('fbScoreVal'),_fbSc);
    _ld(document.getElementById('fbLivesVal'),_fbLv);
    _th(document.getElementById('fbFeedbackEl'),'');
    _th(document.getElementById('fbPanel'),q.cloze_text.replace('_____',
        `<input id="_fbbi" readonly style="display:inline-block;border:none;border-bottom:3px solid #6366f1;background:transparent;font-size:1.05rem;font-weight:700;color:#6366f1;text-align:center;min-width:115px;outline:none;cursor:pointer;padding:0 4px;">`));
    setTimeout(()=>{const i=document.getElementById('_fbbi');if(i)i.focus();},50);
    _spawnFBB(q);
}

function _spawnFBB(q){
    const box=document.getElementById('fbCanvas');box.innerHTML='';
    const cW=box.offsetWidth||540,cH=box.offsetHeight||290,bW=90,bH=64;
    const seen=new Set();
    // correct
    const cv=_balloonVocabList.find(v=>v.id===q.vocab_id)||{word_en:q.cloze_text.match(/_____/)?'?':'',word_zh:'',meaning:''};
    const cWord=cv.word_en||cv.word||'word';
    _placeFBB(cW,cH,bW,bH,seen,cWord,true,true);
    // wrong distractors
    const wrongs=_s(_balloonVocabList.filter(v=>v.id!==q.vocab_id)).slice(0,6).map(v=>v.word_en||v.word);
    wrongs.forEach(w=>_placeFBB(cW,cH,bW,bH,seen,w,false,false));
}

function _placeFBB(cW,cH,bW,bH,seen,word,isT,inCanvas=true){
    const box=document.getElementById('fbCanvas');
    let px,py,t=0;
    do{px=14+Math.random()*(cW-bW-28);py=14+Math.random()*(cH-bH-28);t++;}
    while(t<25&&window._balloonFloatyElIds.some(id=>{
        const o=document.getElementById(id);if(!o)return false;
        return Math.abs(px-parseInt(o.style.left||0))<bW*0.7&&Math.abs(py-parseInt(o.style.top||0))<bH*0.7;
    }));
    const el=document.createElement('div');el.className='balloon';
    el.textContent=word.length>10?word.substring(0,8)+'…':word;
    Object.assign(el.style,{
        position:'absolute',minWidth:'80px',padding:'8px 14px',borderRadius:'48% 48% 46% 54%',
        background:isT?'radial-gradient(circle at 30% 30%,#6ee7b7,#10b981)':'radial-gradient(circle at 32% 30%,rgba(96,165,250,0.9),rgba(124,58,237,0.75))',
        border:isT?'3px solid #059669':'2px solid rgba(124,58,237,0.3)',color:'white',
        fontSize:'0.88rem',fontWeight:'800',textAlign:'center',cursor:'pointer',zIndex:'5',
        boxShadow:isT?'0 4px 18px rgba(16,185,129,0.45)':'0 3px 12px rgba(99,102,241,0.22)',
    });
    el.style.left=px+'px';el.style.top=py+'px';
    const id='fbb-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
    el.id=id;window._balloonFloatyElIds.push(id);
    box.appendChild(el);
    const d=2200+Math.random()*1800;
    el.animate([{top:(py+7)+'px'},{top:(py-7)+'px'},{top:(py+7)+'px'}],{duration:d,iterations:Infinity,easing:'ease-in-out'});
    el.addEventListener('click',()=>{
        if(isT){
            _fbSc+=15;_ld(document.getElementById('fbScoreVal'),_fbSc);
            _mvS(el,box,300);el.style.animation='popOut .3s ease forwards';
            const inp=document.getElementById('_fbbi');if(inp)inp.value=word;
            setTimeout(()=>_moveNextFB(),380);
        }else{
            _fbLv--;_ld(document.getElementById('fbLivesVal'),_fbLv);
            el.style.animation='shake .4s';setTimeout(()=>{el.style.animation='';},500);
            _th(document.getElementById('fbFeedbackEl'),`<span style="color:#ef4444">❌ "${word}" là sai! Máu còn <b>${_fbLv}</b>.</span>`);
            if(_fbLv<=0){_th(document.getElementById('fbFeedbackEl'),'<span style="color:#f59e0b">💔 Hết máu!</span>');setTimeout(()=>_moveNextFB(),1200);}
        }
    });
}

function _moveNextFB(){if(_fbIdx>=_fbQs.length-1||_fbLv<=0){_endFB();return;}_fbIdx++;_drawFBQ();}
function _endFB(){
    const box=document.getElementById('fbCanvas');
    _th(box,`<div style="text-align:center;padding:28px;display:flex;flex-direction:column;align-items:center;gap:14px;">
        <div style="font-size:2.8rem">🎈</div><div style="font-size:1.4rem;font-weight:800;color:#15803d">Điền từ hoàn thành!</div>
        <div style="font-size:1rem;color:#6b7280">Điểm: <b style="color:#15803d">${_fbSc}</b></div>
        <button onclick="startSentenceBuildGame()" style="padding:10px 24px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#d946ef);color:white;border:none;font-weight:700;cursor:pointer;font-size:1rem;">→ Ghép câu</button>
    </div>`);
    _th(document.getElementById('fbPanel'),'');
    _th(document.getElementById('fbFeedbackEl'),'');
    apiFetch('/game/vocab-balloon/submit',{method:'POST',body:JSON.stringify({score:_fbSc,level:_fbLv+1})}).catch(()=>{});
    loadLeaderboard();
}

// ===== PHASE 3: Sentence Build =====
let _bsD=[],_bsI=0,_bsS=0,_bsC=0,_bsW=0,_bsT=[],_bsM=false;

window.startSentenceBuildGame=async function(){
    _bsI=0;_bsS=0;_bsC=0;_bsW=0;_rmS();
    try{const r=await apiFetch('/game/sentence-build/session');_bsD=(await r.json()).sentences||[];_bsD=_bsD.slice(0,5);}
    catch(e){_bsD=[];}
    if(!_bsD.length){showToast('Không có câu nào! Tạo thẻ với ví dụ đầy đủ trước.');return;}
    _bsStart();
};
function _bsStart(){
    if(_bsI>=_bsD.length){_bsEnd();return;}
    _bsT=_bsD[_bsI].tokens.map((t,i)=>({text:t,eaten:false,idx:i}));
    _bsM=false;_bsRender();_bsSpawn();
}
function _bsRender(){
    const b=document.getElementById('bsProgBar');b.innerHTML='';
    _bsT.forEach(t=>{
        const c=document.createElement('span');
        c.style.cssText=`display:inline-flex;align-items:center;gap:3px;padding:5px 12px;border-radius:999px;font-size:.82rem;font-weight:700;transition:all .3s;${t.eaten?'background:#d1fae5;border:2px solid #6ee7b7;color:#065f46':'background:#f1f5f9;border:2px dashed #cbd5e1;color:#94a3b8'}`;
        c.textContent=(t.eaten?'✅ ':'⭕ ')+t.text;b.appendChild(c);
    });
}
function _bsSpawn(){
    const box=document.getElementById('bsCanvas');box.innerHTML='';window._balloonFloatyElIds=[];
    const cW=box.offsetWidth||600,cH=box.offsetHeight||360;
    _bsT.forEach((tok,i)=>{
        const tx=18+i*((cW-110)/Math.max(_bsT.length-1,1));
        const ty=14+Math.random()*(cH-86);
        const el=document.createElement('div');el.className='balloon build-balloon';
        el.textContent=tok.text.length>10?tok.text.substring(0,9)+'…':tok.text;
        Object.assign(el.style,{
            position:'absolute',minWidth:'70px',maxWidth:'165px',padding:'8px 13px',
            borderRadius:'48% 48% 46% 54%',
            background:'radial-gradient(circle at 32% 30%,rgba(96,165,250,0.9),rgba(99,102,241,0.75))',
            border:'2.5px solid #a5b4fc',color:'white',fontSize:'0.9rem',fontWeight:'800',
            textAlign:'center',cursor:'pointer',zIndex:'5',
            boxShadow:'0 4px 16px rgba(99,102,241,0.28)',left:tx+'px',top:ty+'px',
        });
        const d=2400+Math.random()*1600;
        el.animate([{top:(ty+9)+'px'},{top:(ty-7)+'px'},{top:(ty+9)+'px'}],
            {duration:d,iterations:Infinity,easing:'ease-in-out'});
        el.addEventListener('click',()=>_bsClick(el,box,tok));
        box.appendChild(el);
    });
}

function _bsClick(el,box,tok){
    if(tok.eaten||_bsM)return;
    const next=_bsT.filter(t=>!t.eaten)[0];if(!next)return;
    const ok=tok===next;
    if(ok){
        tok.eaten=true;_bsC++;_bsS+=15;_bsM=true;
        _mvS(el,box,300);el.style.animation='popOut .3s ease forwards';
        setTimeout(()=>el.remove(),300);
        _bsRender();
        _th(document.getElementById('bsFeedbackEl'),'✅');
        if(_bsT.every(t=>t.eaten)){
            _bsS+=60;
            setTimeout(()=>{
                if(_bsI<_bsD.length-1){_bsI++;_bsStart();}else _bsEnd();
            },900);
        }else{setTimeout(()=>{_bsM=false;_bsSpawn();},300);}
    }else{
        tok.eaten=true;_bsW++;_bsS=Math.max(0,_bsS-8);_bsM=true;
        _mvS(el,box,250);el.style.animation='shake .45s';
        el.classList.add('wrong');
        _th(document.getElementById('bsFeedbackEl'),
            `<span style="color:#ef4444">❌ Sai vị trí!</span>
             <span style="color:#94a3b8;font-size:.85rem;margin-left:8px;">Mục tiêu: <b>${_bsT.filter(t=>!t.eaten)[0]?.text||''}</b></span>`);
        setTimeout(()=>{
            el.style.animation='';el.classList.remove('wrong');el.classList.add('hide-balloon');
            setTimeout(()=>{el.remove();_bsM=false;_bsSpawn();_bsRender();},400);
        },550);
    }
    _ld(document.getElementById('bsScoreVal'),_bsS);
    _ld(document.getElementById('bsCorrectVal'),_bsC);
    _ld(document.getElementById('bsWrongVal'),_bsW);
}

window.resetBSCurrent=function(){_bsT.forEach(t=>t.eaten=false);_bsM=false;_bsSpawn();_bsRender();};
window.skipBSCurrent=function(){if(_bsI<_bsD.length-1){_bsI++;_bsStart();}else _bsEnd();};

function _bsEnd(){
    _th(document.getElementById('bsCanvas'),'');_th(document.getElementById('bsTargetVI'),'');_th(document.getElementById('bsProgBar'),'');
    _th(document.getElementById('bsTargetBox'),`
        <div style="text-align:center;padding:28px 16px;">
            <div style="font-size:2.8rem">🧩</div>
            <div style="font-size:1.4rem;font-weight:800;color:#7c3aed;margin-top:8px">Ghép câu hoàn thành!</div>
            <div style="font-size:1rem;color:#6b7280;margin-top:6px">
                Điểm: <b style="color:#7c3aed">${_bsS}</b>
                &nbsp;✅<b style="color:#10b981">${_bsC}</b>
                &nbsp;❌<b style="color:#ef4444">${_bsW}</b>
            </div>
            <div style="font-size:.9rem;color:#94a3b8;margin-top:8px">Điểm lưu vào bảng vàng!</div>
        </div>`);
    apiFetch('/game/sentence-build/submit',{method:'POST',body:JSON.stringify({score:_bsS,level:_bsI+1})}).catch(()=>{});
    loadLeaderboard();
}

// ===== GAME 2: Cá điền từ (Goldfish Fill-Blank) =====

window.startGoldfishGame = async function() {
    _gfIdx = 0; _gfSc = 0; _gfLv = 3; _gfQs = []; _rmS();
    try {
        const r = await apiFetch('/game/goldfish/session');
        _gfQs = (await r.json()).questions || [];
    } catch (e) { _gfQs = []; }
    if (!_gfQs.length) {
        showToast('Cần từ vựng có ví dụ đầy đủ trước!');
        return;
    }
    // Audio init
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    _gfDrawQ();
};

function _gfDrawQ() {
    if (_gfIdx >= _gfQs.length) {
        _gfEndGame();
        return;
    }
    const q = _gfQs[_gfIdx];
    _gfCurrentVI = q.word_vi || '';
    _gfCurrentEN = q.sentence_en || '';
    const senVI = q.sentence_vi || '';
    // Correct answer = first item from correctWords, fallback to word_en
    _gfCorrectWord = (q.correctWords && q.correctWords[0]) || (q.word_en || '');
    // build word bank: correct + wrong words from allWords
    const bank = [ _gfCorrectWord ];
    const wrongs = (q.allWords || []).filter(w => w !== _gfCorrectWord);
    wrongs.slice(0, 5).forEach(w => { if (w && !bank.includes(w)) bank.push(w); });
    // shuffle
    for (let i = bank.length - 1; i > 0; i--) {
        const j = 0 | Math.random() * (i + 1);
        [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    _gfSlotAnswers = [null, null, null, null]; // up to 4 slots

    // Update UI
    const el = id => document.getElementById(id);
    el('fishLevel').textContent = _gfIdx + 1;
    el('fishScore').textContent = _gfSc;
    el('fishLives').textContent = _gfLv;
    el('fishMsg').innerHTML = '';
    el('fishSenVI').textContent = senVI;
    el('fishSenEN').textContent = _gfCurrentEN;

    // render word bank buttons
    const bankEl = el('fishWordBank');
    bankEl.innerHTML = '';
    bank.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'btn fish-word-btn';
        btn.textContent = w.length > 14 ? w.substring(0, 12) + '…' : w;
        btn.style.cssText = 'padding:7px 15px;border-radius:99px;background:linear-gradient(135deg,#dbeafe,#ede9fe);color:#1e40af;font-weight:700;font-size:.9rem;border:2px solid #a5b4fc;cursor:pointer;';
        btn.onclick = () => _gfPlaceWord(w, btn);
        bankEl.appendChild(btn);
    });

    // render empty slots
    const slotEl = el('fishSlotBox');
    slotEl.innerHTML = '';
    _gfSlotAnswers.forEach((ans, i) => {
        const slot = document.createElement('button');
        slot.className = 'btn fish-slot';
        slot.id = 'gf-slot-' + i;
        slot.textContent = ans || '…';
        slot.style.cssText = `width:72px;height:48px;border-radius:14px;font-size:.85rem;font-weight:700;border:2px dashed #c7d2fe;background:${ans ? '#d1fae5' : '#f8fafc'};color:${ans ? '#065f46' : '#94a3b8'};cursor:${ans ? 'default' : 'pointer'};`;
        slotEl.appendChild(slot);
    });
}

function _gfPlaceWord(word, btnEl) {
    if (_gfLv <= 0) return;
    // Find first empty slot
    const firstEmpty = _gfSlotAnswers.findIndex(a => a === null);
    if (firstEmpty < 0) return; // all slots full — ignore

    // Fill slot
    _gfSlotAnswers[firstEmpty] = word;
    btnEl.style.opacity = '0.3';
    btnEl.disabled = true;

    // Re-render slots
    const slotEl = document.getElementById('fishSlotBox');
    const slots = slotEl.querySelectorAll('.fish-slot');
    slots[firstEmpty].textContent = word.length > 8 ? word.substring(0, 7) + '…' : word;
    slots[firstEmpty].style.cssText = 'width:72px;height:48px;border-radius:14px;font-size:.85rem;font-weight:700;border:2px solid #6ee7b7;background:#d1fae5;color:#065f46;cursor:default;';

    // Check all filled
    if (!_gfSlotAnswers.includes(null)) {
        const allCorrect = _gfSlotAnswers.every(a => a === _gfCorrectWord);
        if (allCorrect) {
            _gfSc += 20;
            el('fishScore').textContent = _gfSc;
            el('fishMsg').innerHTML = '<span style="color:#10b981">✅ Đúng! Điền đủ tất cả các ô!</span>';
            setTimeout(() => { _gfIdx++; _gfDrawQ(); }, 1100);
        } else {
            _gfLv--;
            el('fishLives').textContent = _gfLv;
            el('fishMsg').innerHTML = '<span style="color:#ef4444">❌ Sai rồi! Máu còn ' + _gfLv + '</span>';
            if (_gfLv <= 0) {
                setTimeout(_gfEndGame, 1000);
            } else {
                // Reset board
                setTimeout(() => _gfDrawQ(), 1000);
            }
        }
    }
}

function _gfEndGame() {
    el('fishMsg').innerHTML = `<span style="color:${_gfLv > 0 ? '#10b981' : '#ef4444'}">Kết thúc! Điểm: ${_gfSc}</span>`;
    // Submit score
    apiFetch('/game/goldfish/submit', { method: 'POST', body: JSON.stringify({ score: _gfSc, level: _gfIdx + 1 }) }).catch(() => {});
    loadLeaderboard();
}

window.resetFishQ = function() {
    // Return word bank buttons to active
    const bankEl = document.getElementById('fishWordBank');
    bankEl.querySelectorAll('button').forEach(btn => { btn.style.opacity = '1'; btn.disabled = false; });
    _gfSlotAnswers = [null, null, null, null];
    // Reset all slots to empty
    for (let i = 0; i < 4; i++) {
        const slotEl = document.getElementById('gf-slot-' + i);
        if (slotEl) {
            slotEl.textContent = '…';
            slotEl.style.cssText = 'width:72px;height:48px;border-radius:14px;font-size:.85rem;font-weight:700;border:2px dashed #c7d2fe;background:#f8fafc;color:#94a3b8;cursor:pointer;';
        }
    }
};

// ===== GAME 3: Chim bay từ (Bird Word Select) =====

window.startBirdGame = async function() {
    _birdIdx = 0; _birdSc = 0; _birdLv = 3; _birdQs = []; _rmS();
    try {
        const r = await apiFetch('/game/goldfish/session');
        _birdQs = (await r.json()).questions || [];
    } catch (e) { _birdQs = []; }
    if (!_birdQs.length) { showToast('Cần từ vựng có ví dụ đầy đủ!'); return; }
    _birdDrawQ();
};

function _birdDrawQ() {
    if (_birdIdx >= _birdQs.length) { _birdEndGame(); return; }
    const q = _birdQs[_birdIdx];
    _birdCurrentVI = q.word_vi || '';
    _birdCurrentEN = q.sentence_en || '';
    _birdCurrentQ = q;

    // Update UI
    const el = id => document.getElementById(id);
    el('birdWordIdx').textContent = _birdIdx + 1;
    el('birdScore').textContent = _birdSc;
    el('birdVI').textContent = _birdCurrentVI;
    el('birdEX').textContent = q.sentence_vi || '';
    el('birdFeedback').innerHTML = '';

    // Build word bank: correct English word + wrong distractors
    const correct = (q.correctWords && q.correctWords[0]) || (q.word_en || '');
    const bank = [correct];
    const wrongs = (q.allWords || []).filter(w => w !== correct);
    wrongs.slice(0, 5).forEach(w => { if (w && !bank.includes(w)) bank.push(w); });
    // Always have at least 4 options; fill with other vocab if needed
    if (bank.length < 4) {
        try {
            apiFetch('/words/manage').then(r => r.json()).then(words => {
                words.forEach(w => { if (w.word_en && !bank.includes(w.word_en)) bank.push(w.word_en); });
                if (bank.length < 4) bank.push('unknown', 'something', 'meaning', 'vocabulary');
                _birdRenderButtons(bank, correct);
            });
            return;
        } catch (e) {}
    }
    _birdRenderButtons(bank, correct);
}

function _birdRenderButtons(bank, correct) {
    const el = id => document.getElementById(id);
    // Shuffle
    for (let i = bank.length - 1; i > 0; i--) {
        const j = 0 | Math.random() * (i + 1);
        [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    const wordsEl = el('birdWords');
    wordsEl.innerHTML = '';
    bank.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'btn bird-w-btn';
        btn.textContent = w.length > 13 ? w.substring(0, 11) + '…' : w;
        btn.style.cssText = 'padding:8px 16px;border-radius:12px;background:linear-gradient(135deg,#fef9c3,#fde68a);color:#92400e;font-weight:700;font-size:.9rem;border:2px solid #fde68a;cursor:pointer;margin:4px;';
        btn.onclick = () => {
            el('birdSprite').style.animation = 'birdHappy .5s ease forwards';
            setTimeout(() => el('birdSprite').style.animation = '', 600);
            if (w === correct) {
                _birdSc += 15;
                el('birdScore').textContent = _birdSc;
                el('birdFeedback').innerHTML = '<span style="color:#10b981">✅ Đúng! ' + w + '</span>';
                setTimeout(() => { _birdIdx++; _birdDrawQ(); }, 1000);
            } else {
                _birdLv--;
                el('birdFeedback').innerHTML = '<span style="color:#ef4444">❌ Sai "' + w + '" — đáp án: ' + correct + '</span>';
                if (_birdLv <= 0) { setTimeout(_birdEndGame, 1200); }
            }
        };
        wordsEl.appendChild(btn);
    });
}

function _birdEndGame() {
    const msg = `Kết thúc! Điểm: ${_birdSc}`;
    document.getElementById('birdWords').innerHTML = '<p style="font-size:1.1rem;font-weight:700;color:' + (_birdLv > 0 ? '#10b981' : '#ef4444') + '">' + msg + '</p>';
    document.getElementById('birdFeedback').innerHTML = '';
    apiFetch('/game/goldfish/submit', { method: 'POST', body: JSON.stringify({ score: _birdSc, level: _birdIdx + 1 }) }).catch(() => {});
    loadLeaderboard();
}

window.speakBirdCard = function() {
    if (_birdCurrentVI) speakText('vi', _birdCurrentVI);
};

// ===== LEADERBOARD =====
(function(){
    const _oL=window.loadLeaderboard;
    window.loadLeaderboard=async function(){
        const ul=document.getElementById('gameLeaderboard');
        if(!ul){if(_oL)_oL();return;}
        _th(ul,'<li style="color:#64748b;font-size:.9rem">Đang tải...</li>');
        try{
            const data=(await(await apiFetch('/game/snake/leaderboard')).json())||[];
            _th(ul,'');
            if(!data.length){_th(ul,'<li style="color:#64748b;font-size:.9rem">Chưa có ai. Hãy là người đầu tiên!</li>');return;}
            const mi={balloon:{lbl:'🎈 Bong bóng',cls:'balloon-mode',col:'#7c3aed',bg:'rgba(124,58,237,.1)'},sentence:{lbl:'🧩 Ghép câu',cls:'sentence-mode',col:'#2563eb',bg:'rgba(37,99,235,.1)'},snake:{lbl:'🐍 Rắn săn chữ',cls:'snake-mode',col:'#059669',bg:'rgba(5,150,105,.1)'},snake1:{lbl:'🪱 Rắn EN→VI',cls:'snake1-mode',col:'#2563eb',bg:'rgba(37,99,235,.1)'},goldfish:{lbl:'🐟 Cá điền từ',cls:'goldfish-mode',col:'#16a34a',bg:'rgba(22,163,74,.1)'},bird:{lbl:'🐦 Chim bay từ',cls:'bird-mode',col:'#d97706',bg:'rgba(217,119,6,.1)'},snake2:{lbl:'🐍 Rắn ăn chữ',cls:'snake2-mode',col:'#059669',bg:'rgba(5,150,105,.1)'}};
            data.forEach((it,i)=>{
                const m=mi[it.game_mode]||mi.snake;
                const mc=i<3?['gold','silver','bronze'][i]:'';
                const li=document.createElement('li');
                li.style.cssText='padding:9px 0;border-bottom:1px solid #eef2ff;display:flex;align-items:center;gap:10px;';
                li.innerHTML=`<div class="rank ${mc}" style="width:28px;height:28px;border-radius:50%;background:${m.bg};color:${m.col};font-weight:800;font-size:.8rem;display:flex;align-items:center;justify-content:center;">${i+1}</div>
                    <span class="player-name" style="flex:1;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${it.username}">${i<3?['🥇','🥈','🥉'][i]:'🏅'} ${it.username}</span>
                    <span class="player-game ${m.cls}" style="font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:6px;">${m.lbl}</span>
                    <span class="player-score" style="font-weight:800;color:#10b981;font-size:1rem;flex-shrink:0;">${it.score}</span>
                    <span class="player-level" style="font-size:.75rem;font-weight:600;color:#f59e0b;flex-shrink:0;">Lv.${it.level}</span>`;
                ul.appendChild(li);
            });
        }catch(e){_th(ul,'<li style="color:#ef4444">Lỗi tải bảng vàng.</li>');}
    };
})();
