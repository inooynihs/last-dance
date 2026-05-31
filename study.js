/**
 * study.js — 유니의 마지막 도전 🌸
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc }
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
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/* ── 설정 ── */
const ADMIN_PASSWORD = '1234'; // ★ 비밀번호 변경 가능
const SUNEUNG_DATE   = new Date('2026-11-19T00:00:00');
const COLLECTION     = 'study_diary';

/* ── 특별한 날 목록 ── */
const SPECIAL_DAYS = {
  '2026-06-19': '🎯 중강',
  '2026-09-17': '🎂 유니 생일',
  '2026-11-19': '🌸 수능 D-DAY',
};

/* ── 중간고사 기간 (6/1 ~ 6/19) ── */
function isExamPeriod(year, month, day) {
  if (year === 2026 && month === 5) { // month는 0-indexed, 5 = 6월
    return day >= 1 && day <= 19;
  }
  return false;
}

/* ── 상태 ── */
let isAdminMode  = false;
let currentYear  = 2026;
let currentMonth = 5; // 0-indexed: 5 = 6월
let selectedDate = null;
let diaryCache   = {};

/* ── D-day ── */
function updateDday() {
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.ceil((SUNEUNG_DATE - today) / (1000*60*60*24));
  const el = document.getElementById('ddayNum');
  if (diff > 0)       el.textContent = `D-${diff}`;
  else if (diff === 0) el.textContent = 'D-DAY 🌸';
  else                el.textContent  = `D+${Math.abs(diff)}`;
}
updateDday();

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
  const [y, m, d] = key.split('-');
  const days = ['일','월','화','수','목','금','토'];
  const date = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${days[date.getDay()]})`;
}

function getDdayForDate(key) {
  const date = new Date(key + 'T00:00:00');
  const diff = Math.ceil((SUNEUNG_DATE - date) / (1000*60*60*24));
  if (diff > 0)       return `수능까지 D-${diff}`;
  else if (diff === 0) return '수능 당일! 🌸';
  else                return `수능 후 D+${Math.abs(diff)}`;
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

async function deletePhoto(key, photoIndex) {
  const entry = diaryCache[key]; if (!entry) return;
  const photo = entry.photos[photoIndex];
  if (photo?.path) { try { await deleteObject(ref(storage, photo.path)); } catch(_) {} }
  entry.photos.splice(photoIndex, 1);
  await saveDay(key, entry);
}

/* ── 업로드 ── */
function showUpload(filename) {
  let el = document.getElementById('uploadBarModal');
  if (!el) {
    el = document.createElement('div'); el.id = 'uploadBarModal'; el.className = 'upload-bar-modal';
    el.innerHTML = `<p style="font-size:.78rem;color:var(--text-m);font-family:'Gaegu',cursive;">📤 ${filename}</p><div class="upload-bar-track"><div class="upload-bar-fill" id="ubFill"></div></div><p class="upload-bar-pct" id="ubPct">0%</p>`;
    document.body.appendChild(el);
  }
  el.classList.add('open');
}
function updateUpload(p) { const f=document.getElementById('ubFill'),t=document.getElementById('ubPct'); if(f)f.style.width=p+'%'; if(t)t.textContent=p+'%'; }
function hideUpload() { const el=document.getElementById('uploadBarModal'); if(el){el.classList.remove('open');setTimeout(()=>el.remove(),300);} }

function uploadPhoto(file) {
  return new Promise((resolve, reject) => {
    const uid = Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const path = `study_photos/${uid}_${file.name}`;
    const task = uploadBytesResumable(ref(storage,path), file);
    task.on('state_changed', s=>updateUpload(Math.round(s.bytesTransferred/s.totalBytes*100)), reject,
      async()=>resolve({url:await getDownloadURL(task.snapshot.ref),path}));
  });
}

/* ── 달력 렌더링 ── */
const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

async function renderCalendar() {
  document.getElementById('monthTitle').textContent = `${currentYear}년 ${monthNames[currentMonth]}`;
  await loadMonth(currentYear, currentMonth);

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
  const today = new Date();

  // 5월은 31일만 표시 (나머지 생략)
  const startDay = (currentYear === 2026 && currentMonth === 4) ? 31 : 1;

  // 앞 빈칸 계산
  let emptyCount = firstDay;
  if (currentYear === 2026 && currentMonth === 4) {
    // 5월 31일의 요일
    emptyCount = new Date(2026, 4, 31).getDay();
  }

  for (let i = 0; i < emptyCount; i++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell empty';
    grid.appendChild(cell);
  }

  const days = (currentYear === 2026 && currentMonth === 4) ? [31] : Array.from({length: daysInMonth}, (_, i) => i+1);

  for (const d of days) {
    const key = dateKey(currentYear, currentMonth, d);
    const entry = diaryCache[key];
    const cell = document.createElement('div');
    const dow = new Date(currentYear, currentMonth, d).getDay();
    const special = SPECIAL_DAYS[key];

    cell.className = 'day-cell';
    if (dow === 0) cell.classList.add('sunday');
    if (dow === 6) cell.classList.add('saturday');

    // 오늘
    if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
      cell.classList.add('today');
    }
    // 기록 있는 날
    if (entry && (entry.photos?.length || entry.comment)) cell.classList.add('has-content');
    // 중간고사 기간
    if (isExamPeriod(currentYear, currentMonth, d)) cell.classList.add('exam-period');
    // 특별한 날
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
      const preview = document.createElement('p');
      preview.className = 'day-comment-preview';
      preview.textContent = entry.comment;
      cell.appendChild(preview);
    }

    // 기록 점
    if (entry && (entry.photos?.length || entry.comment)) {
      const dot = document.createElement('div');
      dot.className = 'day-dot';
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => openDayModal(key, d));
    grid.appendChild(cell);
  }
}

/* ── 날짜 모달 ── */
const dayModal     = document.getElementById('dayModal');
const dayPhotosEl  = document.getElementById('dayPhotos');
const dayCommentText  = document.getElementById('dayCommentText');
const dayCommentEmpty = document.getElementById('dayCommentEmpty');
const dayEditUi    = document.getElementById('dayEditUi');
const commentInput = document.getElementById('commentInput');

function openDayModal(key, day) {
  selectedDate = key;
  const entry = diaryCache[key] || { photos: [], comment: '' };
  const special = SPECIAL_DAYS[key];

  document.getElementById('dayModalDate').textContent  = formatDateLabel(key);
  document.getElementById('dayModalDday').textContent  = getDdayForDate(key);
  document.getElementById('dayModalSpecial').textContent = special || '';

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
      await deletePhoto(selectedDate, i);
      renderDayPhotos(diaryCache[selectedDate] || { photos: [] });
      renderCalendar();
      toast('🗑️ 사진 삭제 완료');
    });
    dayPhotosEl.appendChild(item);
  });
}

document.getElementById('dayModalClose').addEventListener('click', () => { dayModal.classList.remove('open'); document.body.style.overflow = ''; });
dayModal.addEventListener('click', e => { if (e.target === dayModal) { dayModal.classList.remove('open'); document.body.style.overflow = ''; } });

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
  if (currentMonth === 0) { currentMonth = 11; currentYear--; } else currentMonth--;
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
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

document.getElementById('pwCancel').addEventListener('click', () => { pwModal.classList.remove('open'); document.body.style.overflow = ''; });
document.getElementById('pwConfirm').addEventListener('click', () => {
  if (pwInput.value === ADMIN_PASSWORD) {
    pwModal.classList.remove('open'); document.body.style.overflow = '';
    setAdmin(true);
  } else {
    pwInput.value = '';
    pwInput.placeholder = '틀렸어요 🌷 다시 입력해주세요';
    setTimeout(() => { pwInput.placeholder = '비밀번호를 입력해주세요'; }, 1500);
  }
});
pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pwConfirm').click(); });
document.getElementById('adminExitBtn').addEventListener('click', () => setAdmin(false));

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (dayModal.classList.contains('open')) { dayModal.classList.remove('open'); document.body.style.overflow = ''; }
  else if (pwModal.classList.contains('open')) { pwModal.classList.remove('open'); document.body.style.overflow = ''; }
});

/* ── 초기화 ── */
renderCalendar();
