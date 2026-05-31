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
  { text: "고통은 일시적이지만 포기는 영원하다.", author: "랜스 암스트롱" },
  { text: "당신이 할 수 있다고 믿든, 할 수 없다고 믿든 — 당신이 옳다.", author: "헨리 포드" },
  { text: "성공은 최선을 다한 것에 대한 보상이다.", author: "콜린 파월" },
  { text: "시작이 반이다.", author: "아리스토텔레스" },
  { text: "인내는 쓰지만 그 열매는 달다.", author: "루소" },
  { text: "꿈을 향해 나아가라, 두려움이 없는 사람처럼.", author: "마크 트웨인" },
  { text: "당신의 시간은 한정되어 있다. 다른 사람의 삶을 살면서 낭비하지 마라.", author: "스티브 잡스" },
  { text: "인생을 건 시험에 투머치는 없다.", author: "이원준T" },
  { text: "유니, 넌 할 수 있어! 🌸", author: "응원단" },
];

/* ── 상태 ── */
let isAdminMode  = false;
let currentYear  = 2026;
let currentMonth = 5; // 6월 (0-indexed) - 5월31일은 6월 달력에 포함
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
  if (currentYear === 2026 && currentMonth <= 5) return false; // 6월 이전 불가
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

/** 날짜 셀 하나 생성 */
function makeDayCell(key, displayNum, year, month, day) {
  const today   = new Date();
  const entry   = diaryCache[key];
  const special = SPECIAL_DAYS[key];
  const dow     = new Date(year, month, day).getDay();
  const cell    = document.createElement('div');

  cell.className = 'day-cell';
  if (dow === 0) cell.classList.add('sunday');
  if (dow === 6) cell.classList.add('saturday');
  if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear())
    cell.classList.add('today');
  if (entry && (entry.photos?.length || entry.comment)) cell.classList.add('has-content');
  if (special) cell.classList.add('special-day');

  const numEl = document.createElement('span');
  numEl.className = 'day-num';
  numEl.textContent = displayNum;
  cell.appendChild(numEl);

  if (special) {
    const label = document.createElement('span');
    label.className = 'day-special-label';
    label.textContent = special;
    cell.appendChild(label);
  }
  if (entry?.photos?.length) {
    const img = document.createElement('img');
    img.src = entry.photos[0].url; img.className = 'day-thumb'; img.loading = 'lazy';
    cell.appendChild(img);
  }
  if (entry?.comment && !entry?.photos?.length) {
    const p = document.createElement('p');
    p.className = 'day-comment-preview'; p.textContent = entry.comment;
    cell.appendChild(p);
  }
  if (entry && (entry.photos?.length || entry.comment)) {
    const dot = document.createElement('div'); dot.className = 'day-dot'; cell.appendChild(dot);
  }
  cell.addEventListener('click', () => openDayModal(key));
  return cell;
}

async function renderCalendar() {
  document.getElementById('monthTitle').textContent = `${currentYear}년 ${MONTH_NAMES[currentMonth]}`;
  document.getElementById('prevMonth').style.opacity = canGoPrev() ? '1' : '0.3';
  document.getElementById('nextMonth').style.opacity = canGoNext() ? '1' : '0.3';

  // 6월이면 5월 31일 데이터도 함께 로드
  if (currentYear === 2026 && currentMonth === 5) {
    await loadMonth(2026, 4); // 5월 데이터
  }
  await loadMonth(currentYear, currentMonth);

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  let endDay = (currentYear === 2026 && currentMonth === 10) ? 20 : daysInMonth;

  // 6월: 5/31 칸을 달력 맨 앞에 삽입
  if (currentYear === 2026 && currentMonth === 5) {
    const may31Key = '2026-05-31';
    const may31Dow = new Date(2026, 4, 31).getDay(); // 일요일=0

    // 5/31 앞 빈칸
    for (let i = 0; i < may31Dow; i++) {
      const el = document.createElement('div'); el.className = 'day-cell empty'; grid.appendChild(el);
    }
    // 5/31 셀 (날짜 표시: "5/31")
    grid.appendChild(makeDayCell(may31Key, '5/31', 2026, 4, 31));
    // 6/1 빈칸 (5/31 이후 ~ 6/1 요일까지)
    const june1Dow = new Date(2026, 5, 1).getDay();
    // 그리드 현재 셀 수 = may31Dow + 1
    const filledSoFar = may31Dow + 1;
    const emptyNeeded = june1Dow - (filledSoFar % 7);
    const blanks = emptyNeeded < 0 ? emptyNeeded + 7 : emptyNeeded;
    for (let i = 0; i < blanks; i++) {
      const el = document.createElement('div'); el.className = 'day-cell empty'; grid.appendChild(el);
    }
  } else {
    // 일반 달: 1일 앞 빈칸
    const firstDow = new Date(currentYear, currentMonth, 1).getDay();
    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div'); el.className = 'day-cell empty'; grid.appendChild(el);
    }
  }

  // 날짜 셀
  for (let d = 1; d <= endDay; d++) {
    const key = dateKey(currentYear, currentMonth, d);
    grid.appendChild(makeDayCell(key, d, currentYear, currentMonth, d));
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
  const photos = entry.photos || [];
  photos.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'day-photo-item';

    const img = document.createElement('img');
    img.src = p.url;
    img.alt = '';
    img.className = 'day-photo-thumb';
    img.addEventListener('click', e => {
      e.stopPropagation();
      openPhotoLightbox(photos, i);
    });
    item.appendChild(img);

    const delBtn = document.createElement('button');
    delBtn.className = 'day-photo-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('사진을 삭제할까요?')) return;
      await deletePhotoFromEntry(selectedDate, i);
      renderDayPhotos(diaryCache[selectedDate] || { photos: [] });
      renderCalendar();
      toast('🗑️ 사진 삭제 완료');
    });
    item.appendChild(delBtn);

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

/* ── 사진 라이트박스 ── */
function openPhotoLightbox(photos, startIndex) {
  document.getElementById('photoLightbox')?.remove();

  const lb = document.createElement('div');
  lb.id = 'photoLightbox';
  lb.className = 'photo-lightbox';
  lb.innerHTML = `
    <button class="lb-close" id="lbClose">✕</button>
    <button class="lb-nav lb-prev" id="lbPrev">‹</button>
    <div class="lb-img-wrap">
      <img class="lb-img" id="lbImg" src="${photos[startIndex].url}" alt="">
    </div>
    <button class="lb-nav lb-next" id="lbNext">›</button>
    <p class="lb-counter" id="lbCounter">${startIndex + 1} / ${photos.length}</p>`;

  document.body.appendChild(lb);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => lb.classList.add('open'));

  let idx = startIndex;

  const update = () => {
    document.getElementById('lbImg').src = photos[idx].url;
    document.getElementById('lbCounter').textContent = `${idx + 1} / ${photos.length}`;
  };

  document.getElementById('lbClose').addEventListener('click', () => {
    lb.remove(); document.body.style.overflow = '';
  });
  lb.addEventListener('click', e => {
    if (e.target === lb) { lb.remove(); document.body.style.overflow = ''; }
  });
  document.getElementById('lbPrev').addEventListener('click', () => {
    idx = (idx - 1 + photos.length) % photos.length; update();
  });
  document.getElementById('lbNext').addEventListener('click', () => {
    idx = (idx + 1) % photos.length; update();
  });

  // 키보드 이동
  const keyHandler = e => {
    if (e.key === 'ArrowLeft')  { idx = (idx - 1 + photos.length) % photos.length; update(); }
    if (e.key === 'ArrowRight') { idx = (idx + 1) % photos.length; update(); }
    if (e.key === 'Escape')     { lb.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);
}

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
