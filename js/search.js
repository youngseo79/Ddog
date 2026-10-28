// =============================================
// search.js — 검색 기능
// =============================================

let searchTimer = null;
let _searchSeq = 0;   // 늦게 도착한 이전 검색 결과가 최신 결과를 덮어쓰지 않도록

function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value.trim()), 300);
  });

  clearBtn.addEventListener('click', () => {
    _searchSeq++;
    input.value = '';
    document.getElementById('search-results').innerHTML = '';
    input.focus();
  });
}

async function runSearch(keyword) {
  const resultEl = document.getElementById('search-results');
  const seq = ++_searchSeq;
  if (!keyword) {
    resultEl.innerHTML = '';
    return;
  }

  resultEl.innerHTML = '<div class="spinner"></div>';

  try {
    // 현재 모드 + 다른 모드(일반/업무) 결과를 함께 표시
    const curMode = (typeof APP_MODE !== 'undefined') ? APP_MODE : 'personal';
    const [curRows, otherRows] = await Promise.all([
      searchTodos(keyword),
      (typeof searchOtherModeTodos === 'function')
        ? searchOtherModeTodos(keyword).catch(e => { console.warn('[search] 다른 모드 검색 실패', e); return []; })
        : Promise.resolve([]),
    ]);
    if (seq !== _searchSeq) return;
    const rows = [...curRows.map(r => ({ ...r, _mode: curMode })), ...otherRows]
      .sort((a, b) => {
        if (a.date !== b.date) return b.date > a.date ? 1 : -1;
        return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
      });
    renderSearchResults(rows, keyword);
  } catch(e) {
    if (seq !== _searchSeq) return;
    resultEl.innerHTML = '<div class="empty-state">검색 실패</div>';
    console.error(e);
  }
}

function renderSearchResults(rows, keyword) {
  const resultEl = document.getElementById('search-results');
  resultEl.innerHTML = '';

  if (!rows || rows.length === 0) {
    resultEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>검색 결과가 없어요</div>';
    return;
  }

  const active = rows.filter(r => !r.is_done);
  const done   = rows.filter(r => r.is_done);

  active.forEach(r => resultEl.appendChild(makeSearchItem(r, keyword, false)));

  if (done.length > 0) {
    const divider = document.createElement('li');
    divider.className = 'search-done-divider';
    divider.textContent = '완료된 항목';
    resultEl.appendChild(divider);
    done.forEach(r => resultEl.appendChild(makeSearchItem(r, keyword, true)));
  }
}

function makeSearchItem(todo, keyword, isDone) {
  const li = document.createElement('li');
  li.className = 'search-item' + (isDone ? ' done-item' : '');

  const titleEl = document.createElement('div');
  titleEl.className = 's-title';
  titleEl.innerHTML = highlight(todo.title || '(제목 없음)', keyword);

  const dateEl = document.createElement('div');
  dateEl.className = 's-date';
  // 창고 항목이면 날짜 대신 "📦 창고" 표시
  if (todo.storage_flag) {
    dateEl.textContent = '📦 창고';
    dateEl.classList.add('s-date-storage');
  } else {
    dateEl.textContent = formatDateKor(todo.date);
  }
  // 업무 항목 표시
  if (todo._mode === 'work') {
    const badge = document.createElement('span');
    badge.className = 's-mode-badge';
    badge.textContent = '업무';
    dateEl.prepend(badge);
  }

  li.appendChild(titleEl);
  li.appendChild(dateEl);

  // 클릭 → 해당 탭으로 이동
  li.addEventListener('click', () => {
    // 다른 모드 항목 → 그 모드로 전환 후 해당 날짜(또는 창고)로 이동
    const curMode = (typeof APP_MODE !== 'undefined') ? APP_MODE : 'personal';
    if (todo._mode && todo._mode !== curMode && typeof switchAppMode === 'function') {
      switchAppMode(todo._mode, todo.storage_flag ? { tab: 'storage' } : { tab: 'todo', date: todo.date });
      return;
    }
    if (todo.storage_flag) {
      switchTab('storage');
    } else {
      switchTab('todo');
      selectDate(todo.date);
    }
  });

  return li;
}

function highlight(text, keyword) {
  if (!keyword) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedKw = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(escapedKw, 'gi'), m => `<mark>${m}</mark>`);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatDateKor(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}
