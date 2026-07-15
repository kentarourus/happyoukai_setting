import { TIMETABLE, CATEGORIES, PRESENTATIONS } from './data.js';

// Application State
const state = {
  selectedIds: new Set(),
  pinnedIds: new Set(),
  selectedSlotFilter: 'all',
  theme: 'dark',
  activeRouteIndex: 0,
  searchQuery: '',
  optimalSchedules: [],
  slotConflicts: {},
  maxAttended: 0
};


// SVG Coordinates for Campus Map
const BLDG_COORDS = {
  1: { x: 60, y: 110, name: "第1校舎" },
  2: { x: 240, y: 110, name: "第2校舎" },
  3: { x: 150, y: 190, name: "第3校舎" }
};

// DOM Elements Cache
const elements = {
  selectedCountBadge: document.getElementById('selected-count-badge'),
  scheduledSlotsBadge: document.getElementById('scheduled-slots-badge'),
  btnClearAll: document.getElementById('btn-clear-all'),
  searchInput: document.getElementById('search-input'),
  categoriesAccordion: document.getElementById('categories-accordion'),
  conflictAlert: document.getElementById('conflict-alert'),
  conflictDesc: document.getElementById('conflict-desc'),
  emptyState: document.getElementById('empty-state'),
  simulationResults: document.getElementById('simulation-results'),
  routeTabs: document.getElementById('route-tabs'),
  scheduleTimeline: document.getElementById('schedule-timeline'),
  routeEfficiency: document.getElementById('route-efficiency'),
  skippedCard: document.getElementById('skipped-card'),
  skippedList: document.getElementById('skipped-list'),
  campusSvg: document.getElementById('campus-svg'),
  activeRoutePath: document.getElementById('active-route-path')
};

// Helper: Get building integer ID
function getBldgId(buildingStr) {
  if (buildingStr.includes("第1校舎")) return 1;
  if (buildingStr.includes("第2校舎")) return 2;
  if (buildingStr.includes("第3校舎")) return 3;
  return null;
}

// Helper: Toggle pin state
function togglePin(id) {
  if (state.pinnedIds.has(id)) {
    state.pinnedIds.delete(id);
  } else {
    state.pinnedIds.add(id);
    state.selectedIds.add(id); // Ensure pinned item is selected
  }
  state.activeRouteIndex = 0;
  renderCategoriesList();
  updateUI();
}

// Initialize Application
function init() {
  // Load saved theme preference
  const savedTheme = localStorage.getItem('happyoukai-theme') || 'dark';
  state.theme = savedTheme;
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    if (sunIcon && moonIcon) {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
  }

  renderCategoriesList();
  setupEventListeners();
  updateUI();
}

// Setup all event listeners
function setupEventListeners() {
  // Clear all button
  elements.btnClearAll.addEventListener('click', () => {
    state.selectedIds.clear();
    state.pinnedIds.clear();
    state.activeRouteIndex = 0;
    updateCheckboxes();
    updateUI();
  });

  // Search input
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderCategoriesList();
  });

  // Theme toggle button
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-theme');
      state.theme = isLight ? 'light' : 'dark';
      localStorage.setItem('happyoukai-theme', state.theme);
      
      const sunIcon = themeToggle.querySelector('.sun-icon');
      const moonIcon = themeToggle.querySelector('.moon-icon');
      if (sunIcon && moonIcon) {
        if (isLight) {
          sunIcon.classList.add('hidden');
          moonIcon.classList.remove('hidden');
        } else {
          sunIcon.classList.remove('hidden');
          moonIcon.classList.add('hidden');
        }
      }
    });
  }

  // Time filter chips container delegation
  const chipsContainer = document.querySelector('.time-filter-chips');
  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.time-chip');
      if (!chip) return;
      
      // Update active class
      chipsContainer.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      state.selectedSlotFilter = chip.getAttribute('data-slot');
      renderCategoriesList();
    });
  }

  // Timeline click delegation for pin toggle
  elements.scheduleTimeline.addEventListener('click', (e) => {
    const pinBtn = e.target.closest('.btn-pin-toggle');
    if (pinBtn) {
      const targetId = pinBtn.getAttribute('data-id');
      togglePin(targetId);
    }
  });
}

// Sync the checkboxes inside the DOM list
function updateCheckboxes() {
  const checkboxes = elements.categoriesAccordion.querySelectorAll('.pres-checkbox');
  checkboxes.forEach(cb => {
    const id = cb.getAttribute('data-id');
    const item = cb.closest('.pres-item');
    const pinBtn = item.querySelector('.btn-pin-toggle');
    
    if (state.selectedIds.has(id)) {
      cb.checked = true;
      item.classList.add('checked');
    } else {
      cb.checked = false;
      item.classList.remove('checked');
    }
    
    if (state.pinnedIds.has(id)) {
      pinBtn?.classList.add('pinned');
    } else {
      pinBtn?.classList.remove('pinned');
    }
  });
}

// Render Categories Checkbox Accordion List
function renderCategoriesList() {
  elements.categoriesAccordion.innerHTML = '';
  
  // Group presentations by category letter prefix
  const groups = {};
  Object.keys(CATEGORIES).forEach(key => {
    groups[key] = [];
  });

  PRESENTATIONS.forEach(p => {
    const key = p.id.charAt(0);
    if (groups[key]) {
      // 1. Text Search matching
      const q = state.searchQuery.toLowerCase().trim();
      let matchesText = !q;
      
      if (q) {
        // Match presentation properties
        const basicMatch = p.id.toLowerCase().includes(q) || 
                           p.title.toLowerCase().includes(q) || 
                           p.room.toLowerCase().includes(q) ||
                           CATEGORIES[key].name.toLowerCase().includes(q);
        
        // Match time-based queries like "③" or "3" or "9:10"
        let matchesTime = false;
        
        // Map slot symbols/numbers to actual slot indices
        const slotSymbolMap = {
          '①': 1, '1': 1, 'one': 1,
          '②': 2, '2': 2, 'two': 2,
          '③': 3, '3': 3, 'three': 3,
          '④': 4, '4': 4, 'four': 4,
          '⑤': 5, '5': 5, 'five': 5
        };

        if (slotSymbolMap[q]) {
          matchesTime = p.slots.includes(slotSymbolMap[q]);
        } else {
          // Check if query matches TIMETABLE slot names or times
          const matchingSlots = [];
          TIMETABLE.forEach(t => {
            if (t.type === 'slot') {
              const slotLabel1 = `発表${t.index}`;       // 発表3
              const slotLabel2 = `発表${`①②③④⑤`[t.index - 1]}`; // 発表③
              const isMatch = t.start.includes(q) || 
                              t.end.includes(q) || 
                              slotLabel1.includes(q) || 
                              slotLabel2.includes(q);
              if (isMatch) {
                matchingSlots.push(t.index);
              }
            }
          });
          
          if (matchingSlots.length > 0) {
            matchesTime = matchingSlots.some(s => p.slots.includes(s));
          }
        }
        
        matchesText = basicMatch || matchesTime;
      }
      
      // 2. Chip Filter matching
      let matchesChip = true;
      if (state.selectedSlotFilter !== 'all') {
        const filterIndex = parseInt(state.selectedSlotFilter);
        matchesChip = p.slots.includes(filterIndex);
      }
      
      if (matchesText && matchesChip) {
        groups[key].push(p);
      }
    }
  });

  // Render HTML for each group
  let visibleAccordionCount = 0;

  Object.keys(CATEGORIES).forEach(key => {
    const cat = CATEGORIES[key];
    const list = groups[key];
    
    // Skip categories with no matching presentations if searching
    if ((state.searchQuery || state.selectedSlotFilter !== 'all') && list.length === 0) return;
    
    visibleAccordionCount++;

    // Calculate selected counts for this category
    const catSelectedCount = list.filter(p => state.selectedIds.has(p.id)).length;

    const accordionItem = document.createElement('div');
    accordionItem.className = 'acc-item';
    accordionItem.id = `acc-item-${key}`;

    // Active state header class if presentations are selected
    const activeClass = catSelectedCount > 0 ? 'active-count' : '';

    accordionItem.innerHTML = `
      <div class="acc-header">
        <div class="acc-title-group">
          <span class="acc-dot" style="background-color: ${cat.color}"></span>
          <span class="acc-title">${key}. ${cat.name}</span>
        </div>
        <div class="acc-badge-info">
          <span class="acc-count-badge ${activeClass}">${catSelectedCount} / ${list.length}</span>
          <svg class="acc-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      <div class="acc-content ${cat.class}">
        <div class="pres-list">
          ${list.map(p => {
            const isChecked = state.selectedIds.has(p.id);
            const isPinned = state.pinnedIds.has(p.id);
            return `
              <div class="pres-item ${isChecked ? 'checked' : ''}" data-id="${p.id}">
                <div class="pres-checkbox-wrapper">
                  <input type="checkbox" class="pres-checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="pres-details">
                  <div class="pres-id-title">
                    <span class="pres-id">${p.id}</span>
                    <span class="pres-title">${p.title}</span>
                  </div>
                  <div class="pres-meta">
                    <span class="pres-room-tag">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.493 1.698 5.989 3.355 7.587.829.799 1.655 1.381 2.274 1.765.31.193.57.337.757.433.09.048.166.087.22.115l.044.022.012.006.004.002zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                      </svg>
                      ${p.building} ${p.room}
                    </span>
                    <span class="pres-slot-tag">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clip-rule="evenodd" />
                      </svg>
                      枠: ${p.slots.map(s => `①②③④⑤`[s - 1]).join('・')}
                    </span>
                  </div>
                </div>
                <!-- Pin Toggle Button -->
                <button type="button" class="btn-pin-toggle ${isPinned ? 'pinned' : ''}" data-id="${p.id}" title="この発表を見学スケジュールに固定します">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10M12 17v4" />
                  </svg>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Toggle accordion logic
    const header = accordionItem.querySelector('.acc-header');
    header.addEventListener('click', () => {
      accordionItem.classList.toggle('open');
    });

    // Checkbox and item click delegation
    const items = accordionItem.querySelectorAll('.pres-item');
    items.forEach(item => {
      const cb = item.querySelector('.pres-checkbox');
      const id = cb.getAttribute('data-id');

      const handleToggle = (e) => {
        const pinBtn = e.target.closest('.btn-pin-toggle');
        if (pinBtn) {
          e.stopPropagation();
          const targetId = pinBtn.getAttribute('data-id');
          togglePin(targetId);
          return;
        }

        // Prevent click trigger overlap between checkbox and container
        if (e.target !== cb) {
          cb.checked = !cb.checked;
        }

        if (cb.checked) {
          state.selectedIds.add(id);
          item.classList.add('checked');
        } else {
          state.selectedIds.delete(id);
          state.pinnedIds.delete(id); // Deselecting also unpins
          item.classList.remove('checked');
        }

        // Reset pattern tab index on selection change
        state.activeRouteIndex = 0;

        // Sync and refresh
        updateUI();
        updateCategoryCountBadge(key);
      };

      item.addEventListener('click', handleToggle);
    });

    elements.categoriesAccordion.appendChild(accordionItem);
  });

  if (visibleAccordionCount === 0) {
    elements.categoriesAccordion.innerHTML = '<div class="accordion-empty">該当する発表が見つかりません。</div>';
  }
}

// Update specific accordion badge dynamically without full list rerender
function updateCategoryCountBadge(key) {
  const accordionItem = document.getElementById(`acc-item-${key}`);
  if (!accordionItem) return;

  const badge = accordionItem.querySelector('.acc-count-badge');
  const items = accordionItem.querySelectorAll('.pres-checkbox');
  const total = items.length;
  const checkedCount = Array.from(items).filter(cb => cb.checked).length;

  badge.textContent = `${checkedCount} / ${total}`;
  if (checkedCount > 0) {
    badge.classList.add('active-count');
  } else {
    badge.classList.remove('active-count');
  }
}

// Optimal route generator (Backtracking DFS solver)
function solveSchedules() {
  if (state.selectedIds.size === 0) {
    return { optimalSchedules: [], slotConflicts: {}, maxAttended: 0 };
  }

  const selectedPres = PRESENTATIONS.filter(p => state.selectedIds.has(p.id));
  const results = [];

  // Recursive explorer
  function explore(slotIndex, currentMap, usedIds) {
    if (slotIndex > 5) {
      const attended = Object.keys(usedIds).length;
      
      // Pin constraint: the schedule MUST contain all pinned presentation IDs
      const containsAllPinned = Array.from(state.pinnedIds).every(id => usedIds[id]);
      
      if (containsAllPinned) {
        results.push({
          schedule: { ...currentMap }, // slot -> presentation object or null
          attendedCount: attended,
          attendedIds: new Set(Object.keys(usedIds))
        });
      }
      return;
    }

    // Path 1: slotIndex is a Free slot
    currentMap[slotIndex] = null;
    explore(slotIndex + 1, currentMap, usedIds);

    // Path 2: slotIndex has one of the selected presentations
    for (const p of selectedPres) {
      if (p.slots.includes(slotIndex) && !usedIds[p.id]) {
        currentMap[slotIndex] = p;
        usedIds[p.id] = true;
        explore(slotIndex + 1, currentMap, usedIds);
        delete usedIds[p.id];
      }
    }
  }

  explore(1, {}, {});

  // Find max attended count
  let maxAttended = 0;
  results.forEach(r => {
    if (r.attendedCount > maxAttended) maxAttended = r.attendedCount;
  });

  // Filter optimal and deduplicate by slot presentations sequence mapping keys
  const seenKeys = new Set();
  const optimalSchedules = [];

  results.forEach(r => {
    if (r.attendedCount === maxAttended) {
      const key = [1, 2, 3, 4, 5].map(s => r.schedule[s] ? r.schedule[s].id : 'none').join('-');
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        optimalSchedules.push(r);
      }
    }
  });

  // Calculate conflicts at each slot (multiple selected items competing for the same slot)
  const slotConflicts = {};
  for (let s = 1; s <= 5; s++) {
    const available = selectedPres.filter(p => p.slots.includes(s)).map(p => p.id);
    if (available.length > 1) {
      slotConflicts[s] = available;
    }
  }

  return { optimalSchedules, slotConflicts, maxAttended };
}

// Calculate and refresh UI display based on current selections
function updateUI() {
  // Sync count stats in header
  elements.selectedCountBadge.textContent = state.selectedIds.size;

  // Calculate schedule solution
  const solution = solveSchedules();
  state.optimalSchedules = solution.optimalSchedules;
  state.slotConflicts = solution.slotConflicts;
  state.maxAttended = solution.maxAttended;

  // Empty state handling
  if (state.selectedIds.size === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.simulationResults.classList.add('hidden');
    elements.conflictAlert.classList.add('hidden');
    elements.scheduledSlotsBadge.textContent = '0 / 5';
    resetCampusMap();
    return;
  }

  // Handle case where pinned presentations conflict and no schedule can be generated
  if (state.optimalSchedules.length === 0) {
    elements.emptyState.classList.add('hidden');
    elements.simulationResults.classList.add('hidden');
    elements.conflictAlert.classList.remove('hidden');
    elements.scheduledSlotsBadge.textContent = '0 / 5';
    elements.conflictDesc.innerHTML = `⚠️ <strong>ピン留め（固定）の競合:</strong> 固定した発表の組み合わせ（${Array.from(state.pinnedIds).join(', ')}）に時間枠の重複があるか、枠上限を超えています。一部のピン留めを解除してください。`;
    resetCampusMap();
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.simulationResults.classList.remove('hidden');

  // Badge check: count slots occupied
  if (state.optimalSchedules.length > 0) {
    const activeRoute = state.optimalSchedules[state.activeRouteIndex].schedule;
    let filledSlots = 0;
    for (let s = 1; s <= 5; s++) {
      if (activeRoute[s]) filledSlots++;
    }
    elements.scheduledSlotsBadge.textContent = `${filledSlots} / 5`;
  }

  // Conflict warning handler
  // Show warnings if there are slot conflicts OR if we have to skip some presentation
  const skippedPresCount = state.selectedIds.size - state.maxAttended;
  const hasConflicts = Object.keys(state.slotConflicts).length > 0 || skippedPresCount > 0;

  if (hasConflicts) {
    elements.conflictAlert.classList.remove('hidden');
    
    // Construct rich text alert
    let desc = '';
    if (skippedPresCount > 0) {
      desc += `選択した発表のうち ${skippedPresCount} 件は、時間枠の重複により同じルートで見学できません。下に別ルート案（パターン）を提示しています。`;
    } else {
      desc += `時間枠が競合する発表があります（同じ時間帯に複数の見学希望）。最適な配置パターンを自動で割り振っています。`;
    }
    
    // Detail slot conflicts
    const conflictSlots = Object.keys(state.slotConflicts);
    if (conflictSlots.length > 0) {
      desc += ` (競合時間枠: ${conflictSlots.map(s => `発表${`①②③④⑤`[s - 1]}`).join(', ')})`;
    }
    
    elements.conflictDesc.textContent = desc;
  } else {
    elements.conflictAlert.classList.add('hidden');
  }

  // Render route pattern tabs
  renderRouteTabs();

  // Render timeline and map traversal
  renderTimelineAndMap();
}

// Render tabs to switch between route patterns
function renderRouteTabs() {
  elements.routeTabs.innerHTML = '';
  
  if (state.optimalSchedules.length <= 1) {
    // Only one route option, we can hide the tabs container or show just one tab
    const tab = document.createElement('button');
    tab.className = 'route-tab-btn active';
    tab.textContent = `最適ルート (見学数: ${state.maxAttended}件)`;
    elements.routeTabs.appendChild(tab);
    return;
  }

  // Multiple optimal schedule routes
  state.optimalSchedules.forEach((route, index) => {
    const tab = document.createElement('button');
    tab.className = `route-tab-btn ${index === state.activeRouteIndex ? 'active' : ''}`;
    tab.textContent = `ルートパターン ${String.fromCharCode(65 + index)} (${route.attendedCount}件見学可)`;
    
    tab.addEventListener('click', () => {
      state.activeRouteIndex = index;
      updateUI();
    });
    
    elements.routeTabs.appendChild(tab);
  });
}

// Reset campus map SVG classes
function resetCampusMap() {
  for (let i = 1; i <= 3; i++) {
    const bldg = document.getElementById(`bldg-${i}`);
    if (bldg) {
      bldg.classList.remove('visited', 'current-active');
    }
  }
  elements.activeRoutePath.classList.add('hidden');
  elements.activeRoutePath.setAttribute('d', '');
}

// Render dynamic timeline list and corresponding map paths
function renderTimelineAndMap() {
  if (state.optimalSchedules.length === 0) return;

  const currentRoute = state.optimalSchedules[state.activeRouteIndex];
  const schedule = currentRoute.schedule;
  
  // Show route efficiency badge
  elements.routeEfficiency.textContent = `見学数: ${currentRoute.attendedCount} / ${state.selectedIds.size}`;

  // 1. Build chronological timeline elements
  elements.scheduleTimeline.innerHTML = '';
  
  // Track sequence of building IDs visited for the SVG path
  const buildingSequence = [];

  TIMETABLE.forEach((item, timeIdx) => {
    if (item.type === 'fixed') {
      // General pre-scheduled fixed items
      const tlItem = document.createElement('div');
      tlItem.className = 'timeline-item fixed-event';
      tlItem.innerHTML = `
        <div class="timeline-badge-time">
          <span class="timeline-time-text">${item.start}</span>
        </div>
        <div class="timeline-dot"></div>
        <div class="timeline-content-card">
          <div class="timeline-card-header">
            <span class="timeline-slot-label">全体行事</span>
            <span class="timeline-time-text">${item.start} - ${item.end}</span>
          </div>
          <div class="timeline-card-title">${item.name}</div>
        </div>
      `;
      elements.scheduleTimeline.appendChild(tlItem);

      // Simple connector divider
      if (timeIdx < TIMETABLE.length - 1) {
        renderTransitionDivider(timeIdx, null, null);
      }
    } else {
      // Slot-based items
      const slotNum = item.index;
      const pres = schedule[slotNum];
      
      const tlItem = document.createElement('div');
      tlItem.className = `timeline-item ${pres ? 'active' : 'free-slot'}`;
      
      if (pres) {
        const catKey = pres.id.charAt(0);
        const cat = CATEGORIES[catKey];
        const bldgId = getBldgId(pres.building);
        if (bldgId) buildingSequence.push(bldgId);
        const isPinned = state.pinnedIds.has(pres.id);

        tlItem.innerHTML = `
          <div class="timeline-badge-time">
            <span class="timeline-time-text">${item.start}</span>
          </div>
          <div class="timeline-dot"></div>
          <div class="timeline-content-card" style="border-left: 4px solid ${cat.color}">
            <div class="timeline-card-header">
              <span class="timeline-slot-label" style="color: ${cat.color}">発表${item.name.replace('発表', '')}</span>
              <span class="timeline-time-text">${item.start} - ${item.end} (${item.end.split(':')[1] - item.start.split(':')[1] + 60 * (item.end.split(':')[0] - item.start.split(':')[0])}分間)</span>
            </div>
            <div class="timeline-card-title-row">
              <div class="timeline-card-title">
                <span class="pres-id" style="color: ${cat.color}; border-color: ${cat.color}22; margin-right: 6px; font-weight: 800;">${pres.id}</span>
                <strong>${pres.title}</strong>
              </div>
              <button class="btn-pin-toggle ${isPinned ? 'pinned' : ''}" data-id="${pres.id}" title="この発表を見学スケジュールに固定します">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10M12 17v4" />
                </svg>
              </button>
            </div>
            <div class="timeline-card-meta">
              <span class="meta-item">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.493 1.698 5.989 3.355 7.587.829.799 1.655 1.381 2.274 1.765.31.193.57.337.757.433.09.048.166.087.22.115l.044.022.012.006.004.002zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                </svg>
                ${pres.building} ${pres.room}
              </span>
            </div>
          </div>
        `;
      } else {
        // Free Slot
        tlItem.innerHTML = `
          <div class="timeline-badge-time">
            <span class="timeline-time-text">${item.start}</span>
          </div>
          <div class="timeline-dot"></div>
          <div class="timeline-content-card">
            <div class="timeline-card-header">
              <span class="timeline-slot-label">発表${item.name.replace('発表', '')}</span>
              <span class="timeline-time-text">${item.start} - ${item.end}</span>
            </div>
            <div class="timeline-card-title">☕ 空き時間 (自由見学 / 休憩など)</div>
          </div>
        `;
      }

      elements.scheduleTimeline.appendChild(tlItem);

      // Render transition descriptor after this slot
      if (timeIdx < TIMETABLE.length - 1) {
        const nextItem = TIMETABLE[timeIdx + 1];
        const nextPres = nextItem.type === 'slot' ? schedule[nextItem.index] : null;
        renderTransitionDivider(timeIdx, pres, nextPres);
      }
    }
  });

  // 2. Render Campus Map traversal overlay paths
  resetCampusMap();
  
  // Highlight visited buildings
  const uniqueVisitedBldgs = new Set(buildingSequence);
  uniqueVisitedBldgs.forEach(bId => {
    const bldgGroup = document.getElementById(`bldg-${bId}`);
    if (bldgGroup) bldgGroup.classList.add('visited');
  });

  // Deduplicate consecutive visits to draw simplified building paths
  const simplePathSequence = [];
  buildingSequence.forEach(bId => {
    if (simplePathSequence.length === 0 || simplePathSequence[simplePathSequence.length - 1] !== bId) {
      simplePathSequence.push(bId);
    }
  });

  // Render travel path lines in SVG campus map
  if (simplePathSequence.length >= 2) {
    let dAttr = '';
    
    // Draw coordinates connection
    simplePathSequence.forEach((bId, idx) => {
      const coord = BLDG_COORDS[bId];
      if (idx === 0) {
        dAttr += `M ${coord.x} ${coord.y}`;
      } else {
        dAttr += ` L ${coord.x} ${coord.y}`;
      }
    });

    elements.activeRoutePath.setAttribute('d', dAttr);
    elements.activeRoutePath.classList.remove('hidden');

    // If there is any urgent transition, style the path with a warning style
    let hasUrgentBldgMove = false;
    for (let s = 1; s <= 4; s++) {
      const p1 = schedule[s];
      const p2 = schedule[s+1];
      if (p1 && p2 && getBldgId(p1.building) !== getBldgId(p2.building) && [1, 2, 4].includes(s)) {
        hasUrgentBldgMove = true;
        break;
      }
    }

    if (hasUrgentBldgMove) {
      elements.activeRoutePath.setAttribute('stroke', 'var(--warning)');
      elements.activeRoutePath.setAttribute('marker-end', 'url(#arrow-warning)');
    } else {
      elements.activeRoutePath.setAttribute('stroke', 'var(--accent-color)');
      elements.activeRoutePath.setAttribute('marker-end', 'url(#arrow)');
    }
  }

  // 3. Render Skipped Presentations list
  const skippedPres = PRESENTATIONS.filter(p => state.selectedIds.has(p.id) && !currentRoute.attendedIds.has(p.id));
  
  if (skippedPres.length > 0) {
    elements.skippedCard.classList.remove('hidden');
    elements.skippedList.innerHTML = skippedPres.map(p => `
      <li class="skipped-list-item">
        <div class="skipped-header">
          <div class="skipped-id-title">
            <span class="skipped-id-badge">${p.id}</span>
            <span class="skipped-title" title="${p.title}">${p.title}</span>
          </div>
        </div>
        <div class="skipped-slots">
          教室: ${p.building} ${p.room} (対応枠: ${p.slots.map(s => `発表${`①②③④⑤`[s - 1]}`).join(', ')})
        </div>
      </li>
    `).join('');
  } else {
    elements.skippedCard.classList.add('hidden');
  }
}

// Generate intermediate transitions to render on the timeline
function renderTransitionDivider(timeIdx, currentPres, nextPres) {
  const divider = document.createElement('div');
  divider.className = 'timeline-movement-divider';

  // Check what interval we are handling
  // Let's deduce transition information
  if (currentPres && nextPres) {
    // Both active slots
    const b1 = currentPres.building;
    const b2 = nextPres.building;
    const r1 = currentPres.room;
    const r2 = nextPres.room;

    const bId1 = getBldgId(b1);
    const bId2 = getBldgId(b2);

    if (bId1 !== bId2) {
      // Inter-building movement
      // Is it a 5-minute break?
      // Slots 1->2 (idx 2), 2->3 (idx 3), 4->5 (idx 5) are 5-minute breaks
      // Note: in TIMETABLE, slot idx are:
      // index 2 = 発表①, index 3 = 発表②, index 4 = 発表③, index 5 = 発表④, index 6 = 発表⑤
      const isFiveMinBreak = [2, 3, 5].includes(timeIdx);

      if (isFiveMinBreak) {
        divider.innerHTML = `
          <div class="movement-card urgent-bldg" title="5分間での校舎間移動は大変混雑が予想されます！">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>🚨 <strong>激しい移動:</strong> 5分間で校舎移動！ [${b1.split(' ')[0]}] ➔ [${b2.split(' ')[0]}] へ移動してください</span>
          </div>
        `;
      } else {
        // 10-minute break (slot 3->4, idx 4)
        divider.innerHTML = `
          <div class="movement-card inter-bldg">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span>⚠️ <strong>校舎移動:</strong> [${b1.split(' ')[0]}] ➔ [${b2.split(' ')[0]}] (10分間の休み時間で移動)</span>
          </div>
        `;
      }
    } else {
      // Same building
      if (r1 !== r2) {
        divider.innerHTML = `
          <div class="movement-card">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>🚶 <strong>同校舎移動:</strong> ${r1} ➔ ${r2} (${b1.split(' ')[1] || ''})</span>
          </div>
        `;
      } else {
        divider.innerHTML = `
          <div class="movement-card">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>✨ <strong>移動なし:</strong> 引き続き同じ教室 (${r1}) に滞在</span>
          </div>
        `;
      }
    }
  } else if (currentPres && !nextPres) {
    // Going to a Free slot
    divider.innerHTML = `
      <div class="movement-card">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>☕ 自由時間に入ります (休憩・展示見学など)</span>
      </div>
    `;
  } else if (!currentPres && nextPres) {
    // Coming from a Free slot
    divider.innerHTML = `
      <div class="movement-card">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
        <span>🚶 見学先へ移動: [${nextPres.building}] ${nextPres.room} へ向かいます</span>
      </div>
    `;
  } else {
    // Free -> Free or fixed breaks
    divider.innerHTML = `
      <div class="movement-card" style="opacity: 0.4;">
        <span>☕ 空き時間・移動</span>
      </div>
    `;
  }

  elements.scheduleTimeline.appendChild(divider);
}

// Start the app on DOM Load
document.addEventListener('DOMContentLoaded', init);
