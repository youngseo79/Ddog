// =============================================
// search.js — 검색 기능
// =============================================

let searchTimer = null;

function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value.trim()), 300);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    document.getElementById('search-results').innerHTML = '';
    input.focus();
  });
}

async function runSearch(keyword) {
  const resultEl = document.getElementById('search-results');
  if (!keyword) {
    resultEl.innerHTML = '';
    return;
  }

  resultEl.innerHTML = '<div class="spinner"></div>';

  try {
    const rows = await searchTodos(keyword);
    renderSearchResults(rows, keyword);
  } catch(e) {
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

  li.appendChild(titleEl);
  li.appendChild(dateEl);

  // 클릭 → 해당 탭으로 이동
  li.addEventListener('click', () => {
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
