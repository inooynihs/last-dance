/**
 * study.js — 유니의 마지막 도전 🌸
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js";

const firebaseApp = initializeApp({
  apiKey: "AIzaSyCoGIQVNaIrRRBUM1wzy3A74UGp59jQOQU",
  authDomain: "yuni-archive.firebaseapp.com",
  projectId: "yuni-archive",
  storageBucket: "yuni-archive.firebasestorage.app",
  messagingSenderId: "1082487282227",
  appId: "1:1082487282227:web:a39e154e7f79a037586146"
});
const db      = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/* ── 설정 ── */
const ADMIN_PASSWORD = '1234'; // ★ 비밀번호 변경 가능
const SUNEUNG        = new Date('2026-11-19T00:00:00');
const COLLECTION     = 'study_diary';

/* ── 달력 범위: 2026.05.31 ~ 2026.11.20 ── */
const START = { year: 2026, month: 4, day: 31 }; // month 0-indexed
const END   = { year: 2026, month: 10, day: 20 };

/* ── 특별한 날 ── */
const SPECIAL_DAYS = {
  '2026-06-19': '🎓 종강',
  '2026-09-17': '🎂 유니 생일',
  '2026-11-19': '🌸 수능',
};

/* ── 명언 목록 ── */
const QUOTES = [
  { text: "오늘 할 수 있는 일을 내일로 미루지 마라.", author: "벤자민 프랭클린" },
  { text: "천 리 길도 한 걸음부터.", author: "노자" },
  { text: "포기하지 않는 한 실패는 없다.", author: "알버트 아인슈타인" },
  { text: "지금 이 순간이 인생에서 가장 젊은 때다.", author: "익명" },
  { text: "고통은 일시적이지만 포기는 영원하다.", author: "랜스 암스트롱" },
  { text: "노력은 배신하지 않는다.", author: "익명" },
  { text: "꿈을 꾸는 자만이 그 꿈을 이룰 수 있다.", author: "익명" },
  { text: "힘들다고 멈추면 더 힘들어진다.", author: "익명" },
  { text: "오늘의 나는 내일의 나를 위한 선물이다.", author: "익명" },
  { text: "작은 진전도 진전이다. 스스로를 칭찬해 줘.", author: "익명" },
  { text: "유니, 넌 할 수 있어! 🌸", author: "응원단" },
];

/* ── 상태 ── */
let isAdminMode  = false;
let currentYear  = 2026;
let currentMonth = 4; // 5월 (0-indexed)
let selectedDate = null;
let diaryCache   = {};
let quoteIdx     = 0;

/* ── 명언 로테이션 ── */
function initQuotes() {
  quoteIdx = Math.floor(Math.random() * QUOTES.length);
  showQuote();
  setInterval(() => {
    const textEl   = document.getElementById('quoteText');
    const authorEl = document.getElementById('quoteAuthor');
    textEl.classList.add('fade-out');
    authorEl.classList.add('fade-out');
    setTimeout(() => {
      quoteIdx = (quoteIdx + 1) % QUOTES.length;
      showQuote();
      textEl.classList.remove('fade-out');
      authorEl.classList.remove('fade-out');
    }, 600);
  }, 6000);
}

function showQuote() {
  const q = QUOTES[quoteIdx];
  document.getElementById('quoteText').textContent   = q.text;
  document.getElementById('quoteAuthor').textContent = `— ${q.author}`;
}

/* ── 유틸 ── */
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

function dateKey(year, month, day) {
  return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function formatDateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const days = ['일','월','화','수','목','금','토'];
  const dow = new Date(y, m-1, d).getDay();
  return `${y}년 ${m}월 ${d}일 (${days[dow]})`;
}

/* ── 달 이동 제한 체크 ── */
function canGoPrev() {
  if (currentYear > 2026) return false;
  if (currentYear === 2026 && currentMonth <= 4) return false; // 5월 이전 불가
  return true;
}
function canGoNext() {
  if (currentYear < 2026) return false;
  if (currentYear === 2026 && currentMonth >= 10) return false; // 11월 이후 불가
  return true;
}

/* ── Firebase ── */
async function loadMonth(year, month) {
  const prefix = `${year}-${String(month+1).padStart(2,'0')}`;
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    snap.docs.forEach(d => { if (d.id.startsWith(prefix)) diaryCache[d.id] = d.data(); });
  } catch(e) { console.error(e); }
}

async function saveDay(key, data) {
  await setDoc(doc(db, COLLECTION, key), data);
  diaryCache[key] = data;
}

async function deletePhotoFromEntry(key, photoIndex) {
  const entry = diaryCache[key]; if (!entry) return;
  const photo = entry.photos[photoIndex];
  if (photo?.path) { try { await deleteObject(ref(storage, photo.path)); } catch(_) {} }
  entry.photos.splice(photoIndex, 1);
  await saveDay(key, entry);
}

/* ── 업로드 ── */
function showUpload(fn) {
  let el = document.getElementById('uploadBarModal');
  if (!el) {
    el = document.createElement('div'); el.id = 'uploadBarModal'; el.className = 'upload-bar-modal';
    el.innerHTML = `<p style="font-size:.8rem;color:var(--text-m);font-family:'Cute Font',sans-serif;">📤 ${fn}</p><div class="upload-bar-track"><div class="upload-bar-fill" id="ubFill"></div></div><p class="upload-bar-pct" id="ubPct">0%</p>`;
    document.body.appendChild(el);
  }
  el.classList.add('open');
}
function updateUpload(p) {
  const f = document.getElementById('ubFill'), t = document.getElementById('ubPct');
  if (f) f.style.width = p + '%'; if (t) t.textContent = p + '%';
}
function hideUpload() {
  const el = document.getElementById('uploadBarModal');
  if (el) { el.classList.remove('open'); setTimeout(() => el.remove(), 300); }
}

function uploadPhoto(file) {
  return new Promise((resolve, reject) => {
    const uid  = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const path = `study_photos/${uid}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on('state_changed',
      s => updateUpload(Math.round(s.bytesTransferred / s.totalBytes * 100)),
      reject,
      async () => resolve({ url: await getDownloadURL(task.snapshot.ref), path })
    );
  });
}

/* ── 달력 렌더링 ── */
const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

async function renderCalendar() {
  document.getElementById('monthTitle').textContent = `${currentYear}년 ${MONTH_NAMES[currentMonth]}`;

  // 이전/다음 버튼 상태
  document.getElementById('prevMonth').style.opacity = canGoPrev() ? '1' : '0.3';
  document.getElementById('nextMonth').style.opacity = canGoNext() ? '1' : '0.3';

  await loadMonth(currentYear, currentMonth);

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const today      = new Date();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // 이 달에서 보여줄 날짜 범위 결정
  let startDay = 1;
  let endDay   = daysInMonth;

  // 5월: 31일만
  if (currentYear === 2026 && currentMonth === 4) {
    startDay = 31; endDay = 31;
  }
  // 11월: 1~20일만
  if (currentYear === 2026 && currentMonth === 10) {
    endDay = 20;
  }

  // 첫 날 요일 계산 (startDay 기준)
  const firstDow = new Date(currentYear, currentMonth, startDay).getDay();

  // 빈칸
  for (let i = 0; i < firstDow; i++) {
    const el = document.createElement('div');
    el.className = 'day-cell empty';
    grid.appendChild(el);
  }

  // 날짜 셀
  for (let d = startDay; d <= endDay; d++) {
    const key     = dateKey(currentYear, currentMonth, d);
    const entry   = diaryCache[key];
    const special = SPECIAL_DAYS[key];
    const dow     = new Date(currentYear, currentMonth, d).getDay();

    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (dow === 0) cell.classList.add('sunday');
    if (dow === 6) cell.classList.add('saturday');
    if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
      cell.classList.add('today');
    }
    if (entry && (entry.photos?.length || entry.comment)) cell.classList.add('has-content');
    if (special) cell.classList.add('special-day');

    // 날짜 숫자
    const numEl = document.createElement('span');
    numEl.className = 'day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    // 특별한 날 라벨
    if (special) {
      const label = document.createElement('span');
      label.className = 'day-special-label';
      label.textContent = special;
      cell.appendChild(label);
    }

    // 썸네일
    if (entry?.photos?.length) {
      const img = document.createElement('img');
      img.src = entry.photos[0].url;
      img.className = 'day-thumb';
      img.loading = 'lazy';
      cell.appendChild(img);
    }

    // 코멘트 미리보기
    if (entry?.comment && !entry?.photos?.length) {
      const prev = document.createElement('p');
      prev.className = 'day-comment-preview';
      prev.textContent = entry.comment;
      cell.appendChild(prev);
    }

    // 기록 점
    if (entry && (entry.photos?.length || entry.comment)) {
      const dot = document.createElement('div');
      dot.className = 'day-dot';
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => openDayModal(key));
    grid.appendChild(cell);
  }
}

/* ── 날짜 모달 ── */
const dayModal        = document.getElementById('dayModal');
const dayPhotosEl     = document.getElementById('dayPhotos');
const dayCommentText  = document.getElementById('dayCommentText');
const dayCommentEmpty = document.getElementById('dayCommentEmpty');
const dayEditUi       = document.getElementById('dayEditUi');
const commentInput    = document.getElementById('commentInput');

function openDayModal(key) {
  selectedDate = key;
  const entry   = diaryCache[key] || { photos: [], comment: '' };
  const special = SPECIAL_DAYS[key];

  document.getElementById('dayModalDate').textContent = formatDateLabel(key);

  const specialEl = document.getElementById('dayModalSpecial');
  if (special) { specialEl.textContent = special; specialEl.style.display = 'inline-block'; }
  else          { specialEl.style.display = 'none'; }

  renderDayPhotos(entry);

  if (entry.comment) {
    dayCommentText.textContent = entry.comment;
    dayCommentText.style.display = 'block';
    dayCommentEmpty.style.display = 'none';
  } else {
    dayCommentText.style.display = 'none';
    dayCommentEmpty.style.display = 'block';
  }

  dayEditUi.style.display = isAdminMode ? 'block' : 'none';
  if (isAdminMode) commentInput.value = entry.comment || '';

  dayModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderDayPhotos(entry) {
  dayPhotosEl.innerHTML = '';
  (entry.photos || []).forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'day-photo-item';
    item.innerHTML = `<img src="${p.url}" alt=""><button class="day-photo-del" data-idx="${i}">✕</button>`;
    item.querySelector('.day-photo-del').addEventListener('click', async () => {
      if (!confirm('사진을 삭제할까요?')) return;
      await deletePhotoFromEntry(selectedDate, i);
      renderDayPhotos(diaryCache[selectedDate] || { photos: [] });
      renderCalendar();
      toast('🗑️ 사진 삭제 완료');
    });
    dayPhotosEl.appendChild(item);
  });
}

document.getElementById('dayModalClose').addEventListener('click', () => {
  dayModal.classList.remove('open'); document.body.style.overflow = '';
});
dayModal.addEventListener('click', e => {
  if (e.target === dayModal) { dayModal.classList.remove('open'); document.body.style.overflow = ''; }
});

/* ── 사진 추가 ── */
document.getElementById('addPhotoBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) { input.remove(); return; }
    showUpload(file.name);
    try {
      const { url, path } = await uploadPhoto(file);
      hideUpload();
      const entry = diaryCache[selectedDate] || { photos: [], comment: '' };
      entry.photos = entry.photos || [];
      entry.photos.push({ url, path });
      await saveDay(selectedDate, entry);
      renderDayPhotos(entry);
      renderCalendar();
      toast('📷 사진 추가 완료!');
    } catch(e) { hideUpload(); toast('❌ 업로드 실패'); console.error(e); }
    input.remove();
  });
  input.click();
});

/* ── 저장 ── */
document.getElementById('saveDayBtn').addEventListener('click', async () => {
  const entry = diaryCache[selectedDate] || { photos: [], comment: '' };
  entry.comment = commentInput.value.trim();
  await saveDay(selectedDate, entry);
  if (entry.comment) {
    dayCommentText.textContent = entry.comment;
    dayCommentText.style.display = 'block';
    dayCommentEmpty.style.display = 'none';
  } else {
    dayCommentText.style.display = 'none';
    dayCommentEmpty.style.display = 'block';
  }
  renderCalendar();
  toast('💾 저장 완료 🌸');
});

/* ── 달 이동 ── */
document.getElementById('prevMonth').addEventListener('click', () => {
  if (!canGoPrev()) return;
  if (currentMonth === 0) { currentMonth = 11; currentYear--; } else currentMonth--;
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  if (!canGoNext()) return;
  if (currentMonth === 11) { currentMonth = 0; currentYear++; } else currentMonth++;
  renderCalendar();
});

/* ── 관리자 인증 ── */
const pwModal  = document.getElementById('pwModal');
const pwInput  = document.getElementById('pwInput');
const adminBar = document.getElementById('adminBar');
const lockFab  = document.getElementById('lockFab');

function setAdmin(on) {
  isAdminMode = on;
  document.body.classList.toggle('admin-mode', on);
  adminBar.classList.toggle('open', on);
  lockFab.textContent = on ? '🔓' : '🔒';
  toast(on ? '✏️ 편집 모드 켜짐' : '🔒 편집 모드 꺼짐');
}

lockFab.addEventListener('click', () => {
  if (isAdminMode) { setAdmin(false); return; }
  pwInput.value = '';
  pwModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => pwInput.focus(), 100);
});

document.getElementById('pwCancel').addEventListener('click', () => {
  pwModal.classList.remove('open'); document.body.style.overflow = '';
});
document.getElementById('pwConfirm').addEventListener('click', () => {
  if (pwInput.value === ADMIN_PASSWORD) {
    pwModal.classList.remove('open'); document.body.style.overflow = '';
    setAdmin(true);
  } else {
    pwInput.value = '';
    pwInput.placeholder = '틀렸어요 🌷 다시!';
    setTimeout(() => { pwInput.placeholder = '비밀번호를 입력해주세요'; }, 1500);
  }
});
pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pwConfirm').click(); });
document.getElementById('adminExitBtn').addEventListener('click', () => setAdmin(false));

/* ── ESC ── */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (dayModal.classList.contains('open'))  { dayModal.classList.remove('open');  document.body.style.overflow = ''; }
  else if (pwModal.classList.contains('open')) { pwModal.classList.remove('open'); document.body.style.overflow = ''; }
});

/* ── 초기화 ── */
initQuotes();
renderCalendar();
