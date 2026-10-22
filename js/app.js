/**
 * 主应用逻辑 - 从 dashboard-template.html 内联 JS 提取
 * 数据通过 GitHubAPI 读写
 */

// 全局数据存储
let DATA = null;
let isSaving = false;

const statusLabels = {
  prescheduled: '预排期',
  presale: '预售前',
  inprogress: '进行中',
  delivered: '已交付',
  paused: '暂停'
};

const branchColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const roleColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];

let currentTab = 'project';
let memberView = 'role';
let timelineView = 'person';
let deliveredExpanded = false;
let filters = { search: '', status: '', branch: '', platform: '' };
let memberSearch = '';

// ============ 数据加载与保存 ============

async function loadData() {
  showLoading();
  try {
    DATA = await GitHubAPI.loadData();
    renderAll();
  } catch (err) {
    showError('加载数据失败: ' + err.message);
    document.getElementById('mainContent').innerHTML = `<div class="loading">加载失败: ${err.message}</div>`;
  }
}

async function refreshData() {
  await loadData();
  showToast('数据已刷新', 'success');
}

/**
 * 保存数据到 GitHub
 * @param {string} message - 提交信息
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveData(message = 'Update data') {
  if (isSaving) {
    console.warn('已有保存操作进行中，跳过');
    return false;
  }
  
  isSaving = true;
  showSavingIndicator();
  
  try {
    await GitHubAPI.saveData(DATA, message);
    return true;
  } catch (err) {
    showError('保存失败: ' + err.message);
    return false;
  } finally {
    isSaving = false;
    hideSavingIndicator();
  }
}

function showLoading() {
  document.getElementById('mainContent').innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';
}

function showSavingIndicator() {
  // 移除已有的保存指示器
  hideSavingIndicator();
  const indicator = document.createElement('div');
  indicator.className = 'saving-indicator';
  indicator.id = 'savingIndicator';
  indicator.innerHTML = '<div class="spinner"></div><span>保存中...</span>';
  document.body.appendChild(indicator);
}

function hideSavingIndicator() {
  const indicator = document.getElementById('savingIndicator');
  if (indicator) indicator.remove();
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
  showToast(message, 'error');
}

// ============ 工具函数 ============

function getAvatarColor(name) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getBranchName(id) { return DATA.branches.find(b => b.id === id)?.name || '未知'; }
function getRoleName(id) { return DATA.roles.find(r => r.id === id)?.name || '未知'; }
function getMemberName(id) { return DATA.members.find(m => m.id === id)?.name || '未知'; }
function getProgressByProject(projectId) {
  return DATA.weeklyProgress.filter(w => w.projectId === projectId).sort((a, b) => b.week.localeCompare(a.week));
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
}

// ============ 渲染函数 ============

function renderAll() {
  const html = `
    <div class="stats-grid" id="statsOverview"></div>
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="project">项目看板</button>
      <button class="tab-btn" data-tab="member">人员看板</button>
      <button class="tab-btn" data-tab="timeline">时间轴看板</button>
      <button class="tab-btn" data-tab="charts">数据图表</button>
    </div>
    <div class="card mb-5" id="filterSection">
      <div class="card-body" style="padding: 14px 20px;">
        <div class="filter-bar">
          <div class="search-input-wrapper" style="flex: 1; min-width: 200px;">
            <span class="search-icon">🔍</span>
            <input type="search" id="searchInput" placeholder="搜索项目、人员、平台...">
          </div>
          <select id="statusFilter">
            <option value="">全部状态</option>
            <option value="prescheduled">预排期</option>
            <option value="presale">预售前</option>
            <option value="inprogress">进行中</option>
            <option value="delivered">已交付</option>
            <option value="paused">暂停</option>
          </select>
          <select id="branchFilter"><option value="">全部分店</option></select>
          <select id="platformFilter"><option value="">全部平台</option></select>
          <button class="btn btn-primary" onclick="showAddProjectModal()">+ 新增项目</button>
        </div>
        <div class="filter-chips" id="activeFilters"></div>
      </div>
    </div>
    <div class="tab-content" id="projectTab"></div>
    <div class="tab-content hidden" id="memberTab"></div>
    <div class="tab-content hidden" id="timelineTab"></div>
    <div class="tab-content hidden" id="chartsTab"></div>
  `;
  document.getElementById('mainContent').innerHTML = html;

  populateFilters();
  renderStats();
  renderProjects();
  setupEventListeners();
}

function populateFilters() {
  const branchFilter = document.getElementById('branchFilter');
  DATA.branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = b.name;
    branchFilter.appendChild(opt);
  });

  const platformFilter = document.getElementById('platformFilter');
  const platforms = [...new Set(DATA.projects.map(p => p.platform).filter(Boolean))].sort();
  platforms.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    platformFilter.appendChild(opt);
  });
}

function renderStats() {
  const activeProjects = DATA.projects.filter(p => p.status === 'inprogress').length;
  const totalMembers = DATA.members.length;
  const deliveredProjects = DATA.projects.filter(p => p.status === 'delivered').length;
  const totalBranches = DATA.branches.length;

  const stats = [
    { label: '进行中项目', value: activeProjects, icon: '📋', bg: '#eff6ff', color: '#2563eb' },
    { label: '总人员数', value: totalMembers, icon: '👥', bg: '#f0fdf4', color: '#16a34a' },
    { label: '已交付项目', value: deliveredProjects, icon: '✅', bg: '#f8fafc', color: '#475569' },
    { label: '分店数', value: totalBranches, icon: '🏢', bg: '#faf5ff', color: '#7c3aed' },
  ];

  document.getElementById('statsOverview').innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-icon" style="background: ${s.bg}; color: ${s.color};">${s.icon}</div>
      <div class="stat-info">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value" style="color: ${s.color};">${s.value}</div>
      </div>
    </div>
  `).join('');
}

function getFilteredProjects() {
  let result = DATA.projects;
  if (filters.search) {
    const query = filters.search.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.members || []).some(mId => getMemberName(mId).toLowerCase().includes(query))
    );
  }
  if (filters.status) result = result.filter(p => p.status === filters.status);
  if (filters.branch) result = result.filter(p => p.branch === parseInt(filters.branch));
  if (filters.platform) result = result.filter(p => p.platform === filters.platform);
  return result;
}

function renderProjects() {
  const allProjects = getFilteredProjects();

  // Sort: prescheduled → presale → inprogress → paused, then by id desc (newest first)
  const statusOrder = { prescheduled: 0, presale: 1, inprogress: 2, paused: 3, delivered: 99 };
  const sortedProjects = [...allProjects].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 99;
    const sb = statusOrder[b.status] ?? 99;
    if (sa !== sb) return sa - sb;
    return b.id - a.id;
  });

  const activeProjects = sortedProjects.filter(p => p.status !== 'delivered');
  const deliveredProjects = sortedProjects.filter(p => p.status === 'delivered');

  const html = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">项目列表</div>
          <div class="card-desc">共 ${allProjects.length} 个项目</div>
        </div>
      </div>
      <div class="card-body" style="padding: 0;">
        <div style="overflow-x: auto;">
          <table style="min-width: 1100px;">
            <thead><tr>
              <th style="width: 180px;">项目名称</th>
              <th style="width: 80px;">状态</th>
              <th style="width: 100px;">分店</th>
              <th style="width: 80px;">平台</th>
              <th style="width: 80px;">商务</th>
              <th style="width: 90px;">项目经理</th>
              <th style="width: 160px;">成员</th>
              <th style="width: 180px;">开始 / 上线</th>
              <th style="min-width: 200px;">最新进度</th>
              <th style="width: 120px;">操作</th>
            </tr></thead>
            <tbody>
              ${activeProjects.map(p => {
                const memberNames = (p.members || []).map(mId => getMemberName(mId)).filter(Boolean);
                const memberDisplay = memberNames.length > 3
                  ? `${memberNames.slice(0, 3).join('、')} +${memberNames.length - 3}`
                  : memberNames.join('、') || '-';
                const memberFull = memberNames.join('、') || '-';
                const progress = getProgressByProject(p.id);
                const latestProgress = progress[0];
                const startStr = p.startDate ? formatDate(p.startDate) : '-';
                const endStr = p.endDate ? formatDate(p.endDate) : '-';
                return `
                  <tr>
                    <td>
                      <div style="font-weight: 500; color: #0f172a; font-size: 13px;">${p.name}</div>
                      ${p.isCase ? '<span style="font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #ffedd5; color: #ea580c; border: 1px solid #fed7aa; display: inline-block; margin-top: 4px;">案例</span>' : ''}
                    </td>
                    <td><span class="status-tag status-${p.status}">${statusLabels[p.status] || p.status}</span></td>
                    <td><span class="branch-tag" style="background: ${branchColors[(p.branch - 1) % branchColors.length]}20; color: ${branchColors[(p.branch - 1) % branchColors.length]};">${getBranchName(p.branch)}</span></td>
                    <td class="text-muted">${p.platform || '-'}</td>
                    <td class="text-muted">${p.business || '-'}</td>
                    <td class="text-muted">${p.projectManager || '-'}</td>
                    <td title="${memberFull}" style="font-size: 12px; color: #64748b; cursor: help;">
                      ${memberDisplay}
                    </td>
                    <td style="font-size: 12px; color: #64748b; line-height: 1.5;">
                      <div>开始：${startStr}</div>
                      <div>上线：${endStr}</div>
                    </td>
                    <td>
                      ${latestProgress ? `
                        <div style="cursor: pointer;" onclick="showProjectDetail(${p.id})">
                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                            <span style="font-size: 11px; font-weight: 500; color: #2563eb;">${latestProgress.week}</span>
                            ${latestProgress.risk ? '<span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;">风险</span>' : ''}
                          </div>
                          <div style="font-size: 12px; color: #475569; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${latestProgress.content}
                          </div>
                        </div>
                      ` : `
                        <span style="color: #94a3b8; font-size: 12px; cursor: pointer;" onclick="showProjectDetail(${p.id})">查看详情 →</span>
                      `}
                    </td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="showEditProjectModal(${p.id})">编辑</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteProject(${p.id})" style="margin-left: 4px;">删除</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding: 12px 20px 20px;">
          <button type="button" id="toggleDelivered" class="delivered-toggle">
            <span id="deliveredIcon">▼</span> 已交付项目 (<span id="deliveredCount">${deliveredProjects.length}</span>)
          </button>
          <div class="delivered-list ${deliveredExpanded ? '' : 'hidden'}" id="deliveredList">
            ${deliveredProjects.map(p => `
              <div class="delivered-item" onclick="showProjectDetail(${p.id})">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                  <span class="status-tag status-delivered">已交付</span>
                  <span style="font-size: 13px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${p.name}</span>
                  ${p.isCase ? '<span style="font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #ffedd5; color: #ea580c; flex-shrink: 0;">案例</span>' : ''}
                  ${p.business ? `<span class="text-subtle" style="font-size: 12px;">商务：${p.business}</span>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 14px; flex-shrink: 0; margin-left: 16px;">
                  <span class="text-subtle" style="font-size: 12px;">${getBranchName(p.branch)}</span>
                  <span class="text-subtle" style="font-size: 12px;">${(p.members || []).length}人</span>
                  <span class="text-subtle" style="font-size: 12px;">${getProgressByProject(p.id).length}条进度</span>
                  <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteProject(${p.id})">删除</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('projectTab').innerHTML = html;

  document.getElementById('toggleDelivered').addEventListener('click', () => {
    deliveredExpanded = !deliveredExpanded;
    document.getElementById('deliveredList').classList.toggle('hidden');
    document.getElementById('deliveredIcon').textContent = deliveredExpanded ? '▲' : '▼';
  });
}

function renderMemberBoard() {
  let filteredMembers = filters.branch ? DATA.members.filter(m => m.branch === parseInt(filters.branch)) : DATA.members;
  // Apply search filter
  if (memberSearch.trim()) {
    const q = memberSearch.trim().toLowerCase();
    filteredMembers = filteredMembers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      getRoleName(m.role).toLowerCase().includes(q) ||
      getBranchName(m.branch).toLowerCase().includes(q) ||
      (m.employeeType && m.employeeType.toLowerCase().includes(q))
    );
  }

  let html = '<div class="card">';
  html += '<div style="padding: 16px 20px; border-bottom: 1px solid #f3f4f8;">';
  html += `<div style="display: flex; align-items: center; gap: 12px;">
    <div class="search-input-wrapper" style="flex: 1; max-width: 320px;">
      <span class="search-icon">🔍</span>
      <input type="text" id="memberSearchInput" placeholder="搜索人员姓名、岗位、分店..."
        value="${memberSearch}"
      >
    </div>
    <div style="flex: 1;"></div>
    <div class="sub-tab-bar">
      <button class="sub-tab-btn ${memberView === 'role' ? 'active' : ''}" data-member-view="role">按岗位视图</button>
      <button class="sub-tab-btn ${memberView === 'branch' ? 'active' : ''}" data-member-view="branch">按分店视图</button>
    </div>
    <button class="btn btn-primary btn-sm" onclick="showAddMemberModal()">+ 新增人员</button>
  </div>`;
  html += '<div style="margin-top: 10px; font-size: 12px; color: #64748b;">共 ' + filteredMembers.length + ' 人' + (memberSearch.trim() ? '（搜索结果）' : '') + '</div>';
  html += '</div>';
  html += '<div class="card-body">';

  if (memberView === 'role') {
    DATA.roles.forEach(r => {
      const members = filteredMembers.filter(m => m.role === r.id);
      html += `<div class="branch-group">
        <div class="branch-header">
          <div class="branch-dot" style="background: ${roleColors[(r.id - 1) % roleColors.length]};"></div>
          <span class="branch-name">${r.name}</span>
          <span class="branch-count">${members.length}人</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">
          ${members.map(m => `
            <div class="member-card">
              <div class="avatar" style="background: ${getAvatarColor(m.name)};">${m.name.charAt(0)}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; color: #0f172a; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</div>
                <div class="text-subtle" style="font-size: 11px;">${getBranchName(m.branch)} · ${m.saturation === 'full' ? '全职' : m.saturation === 'under' ? '不饱和' : m.saturation}</div>
              </div>
              ${m.employeeType ? `<span class="text-subtle" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #f1f5f9;">${m.employeeType}</span>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="showEditMemberModal(${m.id})">编辑</button>
            </div>
          `).join('')}
          ${members.length === 0 ? '<div class="text-subtle" style="font-size: 13px; grid-column: 1 / -1; text-align: center; padding: 20px 0;">暂无人员</div>' : ''}
        </div>
      </div>`;
    });
  } else {
    DATA.branches.forEach(b => {
      const members = filteredMembers.filter(m => m.branch === b.id);
      html += `<div class="branch-group">
        <div class="branch-header">
          <div class="branch-dot" style="background: ${branchColors[(b.id - 1) % branchColors.length]};"></div>
          <span class="branch-name">${b.name}</span>
          <span class="branch-count">${members.length}人</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">
          ${members.map(m => `
            <div class="member-card">
              <div class="avatar" style="background: ${getAvatarColor(m.name)};">${m.name.charAt(0)}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 500; color: #0f172a; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</div>
                <div class="text-subtle" style="font-size: 11px;">${getRoleName(m.role)} · ${m.saturation === 'full' ? '全职' : m.saturation === 'under' ? '不饱和' : m.saturation}</div>
              </div>
              ${m.employeeType ? `<span class="text-subtle" style="font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #f1f5f9;">${m.employeeType}</span>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="showEditMemberModal(${m.id})">编辑</button>
            </div>
          `).join('')}
          ${members.length === 0 ? '<div class="text-subtle" style="font-size: 13px; grid-column: 1 / -1; text-align: center; padding: 20px 0;">暂无人员</div>' : ''}
        </div>
      </div>`;
    });
  }

  html += '</div></div>';
  document.getElementById('memberTab').innerHTML = html;

  document.querySelectorAll('[data-member-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      memberView = btn.dataset.memberView;
      renderMemberBoard();
    });
  });

  // Member search input
  const searchInput = document.getElementById('memberSearchInput');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        memberSearch = e.target.value;
        renderMemberBoard();
        // Restore focus and cursor position
        const input = document.getElementById('memberSearchInput');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 200);
    });
  }
}

function renderTimeline() {
  let html = '<div class="card"><div class="card-header">';
  html += `<div class="sub-tab-bar">
    <button class="sub-tab-btn ${timelineView === 'person' ? 'active' : ''}" data-timeline-view="person">人员时间轴</button>
    <button class="sub-tab-btn ${timelineView === 'project' ? 'active' : ''}" data-timeline-view="project">项目时间轴</button>
  </div>`;
  html += '</div><div class="card-body">';

  const projectsWithDates = DATA.projects.filter(p => p.startDate || p.endDate);

  if (projectsWithDates.length === 0) {
    html += '<p class="text-subtle">暂无时间轴数据</p>';
    document.getElementById('timelineTab').innerHTML = html + '</div></div>';
    return;
  }

  const allDates = [];
  projectsWithDates.forEach(p => {
    if (p.startDate) allDates.push(new Date(p.startDate));
    if (p.endDate) allDates.push(new Date(p.endDate));
  });

  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24) + 30;

  // Month markers
  const months = [];
  let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (current <= maxDate) {
    const left = ((current - minDate) / (1000 * 60 * 60 * 24 * totalDays)) * 100;
    months.push({ label: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`, left });
    current.setMonth(current.getMonth() + 1);
  }

  html += '<div style="overflow-x: auto;"><div style="min-width: 800px;">';
  // Header row with month markers
  html += '<div style="display: flex; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">';
  html += `<div style="width: 140px; flex-shrink: 0; font-size: 12px; font-weight: 600; color: #64748b;">${timelineView === 'person' ? '人员' : '项目'}</div>`;
  html += '<div style="flex: 1; position: relative; height: 16px;">';
  months.forEach(m => {
    html += `<div style="position: absolute; left: ${m.left}%; font-size: 11px; color: #94a3b8;">${m.label}</div>`;
  });
  html += '</div></div>';

  if (timelineView === 'person') {
    const filteredMembers = filters.branch ? DATA.members.filter(m => m.branch === parseInt(filters.branch)) : DATA.members;
    filteredMembers.forEach(m => {
      const personProjects = projectsWithDates.filter(p => (p.members || []).includes(m.id));
      html += `<div style="display: flex; align-items: center; padding: 4px 0; border-bottom: 1px solid #f1f5f9;">
        <div style="width: 140px; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
          <div class="avatar" style="width: 26px; height: 26px; font-size: 11px; background: ${getAvatarColor(m.name)};">${m.name.charAt(0)}</div>
          <span style="font-size: 12px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${m.name}</span>
        </div>
        <div style="flex: 1; position: relative; height: 22px;">`;
      personProjects.forEach(p => {
        const start = p.startDate ? new Date(p.startDate) : minDate;
        const end = p.endDate ? new Date(p.endDate) : maxDate;
        const left = Math.max(0, ((start - minDate) / (1000 * 60 * 60 * 24 * totalDays)) * 100);
        const width = Math.max(2, ((end - start) / (1000 * 60 * 60 * 24 * totalDays)) * 100);
        const color = branchColors[(p.branch - 1) % branchColors.length];
        html += `<div class="timeline-bar" style="position: absolute; top: 50%; transform: translateY(-50%); left: ${left}%; width: ${width}%; background: ${color};" title="${p.name}" onclick="showProjectDetail(${p.id})"></div>`;
      });
      html += '</div></div>';
    });
  } else {
    DATA.branches.forEach(b => {
      const branchProjects = projectsWithDates.filter(p => p.branch === b.id && p.status !== 'delivered');
      if (branchProjects.length === 0) return;
      html += `<div style="margin-bottom: 14px;"><div style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: ${branchColors[(b.id - 1) % branchColors.length]};">${b.name}</div>`;
      branchProjects.forEach(p => {
        const start = p.startDate ? new Date(p.startDate) : minDate;
        const end = p.endDate ? new Date(p.endDate) : maxDate;
        const left = Math.max(0, ((start - minDate) / (1000 * 60 * 60 * 24 * totalDays)) * 100);
        const width = Math.max(2, ((end - start) / (1000 * 60 * 60 * 24 * totalDays)) * 100);
        const color = branchColors[(b.id - 1) % branchColors.length];
        html += `<div style="display: flex; align-items: center; padding: 3px 0;">
          <div style="width: 180px; flex-shrink: 0; font-size: 12px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px; cursor: pointer;" onclick="showProjectDetail(${p.id})">${p.name}</div>
          <div style="flex: 1; position: relative; height: 20px;">
            <div class="timeline-bar" style="position: absolute; top: 50%; transform: translateY(-50%); left: ${left}%; width: ${width}%; background: ${color}; opacity: ${p.status === 'inprogress' ? 1 : 0.5};" title="${p.name} - ${statusLabels[p.status]}" onclick="showProjectDetail(${p.id})"></div>
          </div>
        </div>`;
      });
      html += '</div>';
    });
  }

  html += '</div></div></div></div>';
  document.getElementById('timelineTab').innerHTML = html;

  document.querySelectorAll('[data-timeline-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      timelineView = btn.dataset.timelineView;
      renderTimeline();
    });
  });
}

const statusConfig = {
  prescheduled: { label: '预排', dot: '#4f46e5', bg: 'bg-indigo-100', color: 'text-indigo-700', border: 'border-indigo-300' },
  presale: { label: '售前', dot: '#ea580c', bg: 'bg-orange-100', color: 'text-orange-700', border: 'border-orange-300' },
  inprogress: { label: '制作中', dot: '#0284c7', bg: 'bg-sky-100', color: 'text-sky-700', border: 'border-sky-300' },
  delivered: { label: '已交付', dot: '#059669', bg: 'bg-emerald-100', color: 'text-emerald-700', border: 'border-emerald-300' },
  paused: { label: '暂停', dot: '#64748b', bg: 'bg-slate-100', color: 'text-slate-500', border: 'border-slate-300' },
};

const branchAccentColors = [
  { bg: 'from-blue-500 to-blue-600', border: 'border-l-blue-500', nameBg: 'bg-blue-100 text-blue-800' },
  { bg: 'from-emerald-500 to-emerald-600', border: 'border-l-emerald-500', nameBg: 'bg-emerald-100 text-emerald-800' },
  { bg: 'from-violet-500 to-violet-600', border: 'border-l-violet-500', nameBg: 'bg-violet-100 text-violet-800' },
  { bg: 'from-amber-500 to-amber-600', border: 'border-l-amber-500', nameBg: 'bg-amber-100 text-amber-800' },
  { bg: 'from-rose-500 to-rose-600', border: 'border-l-rose-500', nameBg: 'bg-rose-100 text-rose-800' },
];

function saturationRing(rate) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444';
  return `
    <div style="position: relative; width: 72px; height: 72px; flex-shrink: 0;">
      <svg style="width: 100%; height: 100%; transform: rotate(-90deg);" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="6"/>
        <circle cx="36" cy="36" r="${radius}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          style="transition: stroke-dashoffset 0.6s ease"/>
      </svg>
      <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1;">${rate}%</span>
        <span style="font-size: 9px; color: #94a3b8; margin-top: 2px;">饱和度</span>
      </div>
    </div>`;
}

function getBranchStats(branchId) {
  const branch = DATA.branches.find(b => b.id === branchId);
  const branchProjects = DATA.projects.filter(p => p.branch === branchId);
  const branchMembers = DATA.members.filter(m => m.branch === branchId);
  const nonDeliveredProjects = branchProjects.filter(p => p.status !== 'delivered');
  const byStatus = { prescheduled: 0, presale: 0, inprogress: 0, paused: 0 };
  nonDeliveredProjects.forEach(p => { if (byStatus[p.status] !== undefined) byStatus[p.status]++; });
  const saturatedMembers = branchMembers.filter(m => m.saturation === 'full').length;
  const saturationRate = branchMembers.length > 0 ? Math.round((saturatedMembers / branchMembers.length) * 100) : 0;

  // Idle members = not in any active project
  const idleMembers = branchMembers.filter(m =>
    !DATA.projects.some(p => (p.members || []).includes(m.id) && p.status !== 'delivered')
  );

  // Available = under-saturated
  const availableMembers = branchMembers.filter(m => m.saturation === 'under');

  // Project list sorted by status
  const projectList = nonDeliveredProjects
    .map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      memberCount: (p.members || []).length,
      isCase: p.isCase,
      endDate: p.endDate,
      duration: p.duration,
      latestProgress: getProgressByProject(p.id)[0] || null,
    }))
    .sort((a, b) => {
      const order = { prescheduled: 0, presale: 1, inprogress: 2, paused: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

  return {
    branch,
    totalProjects: nonDeliveredProjects.length,
    byStatus,
    totalMembers: branchMembers.length,
    activeMembers: saturatedMembers,
    idleMembers: idleMembers.length,
    saturationRate,
    projectList,
    idleDetails: idleMembers.map(m => ({ name: m.name, roleName: getRoleName(m.role) })),
    availableDetails: availableMembers.map(m => ({ name: m.name, roleName: getRoleName(m.role), saturation: m.saturation })),
  };
}

function renderBranchCard(branchId, index) {
  const stats = getBranchStats(branchId);
  const accent = branchAccentColors[index % branchAccentColors.length];
  const statusKeys = ['prescheduled', 'presale', 'inprogress', 'paused'];
  const borderColor = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'][index % 5];

  const statusBadges = statusKeys
    .filter(s => stats.byStatus[s] > 0)
    .map(s => {
      const cfg = statusConfig[s];
      return `<span class="status-tag status-${s}" style="font-size: 11px;">
        ${cfg.label} · ${stats.byStatus[s]}
      </span>`;
    }).join('');

  const projectListHtml = stats.projectList.length === 0
    ? '<p class="text-subtle" style="font-size: 12px; padding: 8px 0; text-align: center;">暂无项目</p>'
    : stats.projectList.map(proj => {
        const cfg = statusConfig[proj.status];
        const dateStr = proj.endDate
          ? `${new Date(proj.endDate).getMonth() + 1}-${new Date(proj.endDate).getDate()}`
          : '待定';
        const progress = proj.latestProgress;
        return `
          <div style="padding: 10px 12px; border-radius: 8px; background: #f8fafc; border-left: 3px solid ${cfg.dot}; cursor: pointer; transition: all 0.15s; margin-bottom: 6px;"
            onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'"
            onclick="showProjectDetail(${proj.id})">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
              <div style="flex: 1; min-width: 0;">
                <span style="font-size: 12px; font-weight: 500; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${proj.name}</span>
              </div>
              <span class="status-tag status-${proj.status}" style="font-size: 10px; padding: 1px 8px; flex-shrink: 0;">${cfg.label}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94a3b8;">
              <span>${proj.memberCount}人</span>
              <span>·</span>
              ${proj.duration ? `<span>${proj.duration}</span><span>·</span>` : ''}
              <span>上线：${dateStr}</span>
            </div>
            ${progress ? `
              <div style="margin-top: 6px; font-size: 11px; color: #64748b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${progress.risk ? '<span style="color: #dc2626; font-weight: 500;">[风险] </span>' : ''}${progress.content}
              </div>` : ''}
          </div>`;
      }).join('');

  const idleSection = stats.idleDetails.length > 0 ? `
    <div style="border-top: 1px solid #fecaca; padding: 12px 16px; background: #fef2f2;">
      <p style="font-size: 12px; font-weight: 600; color: #dc2626; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
        ⚠️ 闲置人员 (${stats.idleDetails.length}人)
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${stats.idleDetails.map(m => `
          <span style="display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 6px; font-size: 11px; background: white; border: 1px solid #fecaca; color: #b91c1c;">
            <span style="font-weight: 500;">${m.name}</span>
            <span style="color: #fca5a5; margin-left: 4px; font-size: 10px;">(${m.roleName})</span>
          </span>`).join('')}
      </div>
    </div>` : '';

  const availableSection = stats.availableDetails.length > 0 ? `
    <div style="border-top: 1px solid #fde68a; padding: 12px 16px; background: #fffbeb;">
      <p style="font-size: 12px; font-weight: 600; color: #b45309; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
        👥 可用人员 (${stats.availableDetails.length}人)
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${stats.availableDetails.map(m => `
          <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 6px; font-size: 11px; background: white; border: 1px solid #fde68a;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #f59e0b;"></span>
            <span style="font-weight: 500; color: #92400e;">${m.name}</span>
            <span style="font-size: 10px; color: #94a3b8;">${m.roleName}</span>
          </span>`).join('')}
      </div>
    </div>` : '';

  const caseCount = stats.projectList.filter(p => p.isCase).length;

  return `
    <div class="card" style="overflow: hidden; border-top: 3px solid ${borderColor};">
      <div style="padding: 16px 18px;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 6px;">${stats.branch.name}</div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #64748b;">
              <span><strong style="color: #0f172a; font-size: 15px; font-weight: 700;">${stats.totalProjects}</strong> 个进行中</span>
              <span style="color: #e2e8f0;">|</span>
              <span><strong style="color: #0f172a; font-size: 15px; font-weight: 700;">${stats.totalMembers}</strong> 人 (${stats.activeMembers}在岗)</span>
              ${caseCount > 0 ? `<span style="color: #e2e8f0;">|</span><span style="color: #ea580c;"><strong style="font-size: 15px; font-weight: 700;">${caseCount}</strong> 案例</span>` : ''}
            </div>
          </div>
          ${saturationRing(stats.saturationRate)}
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${statusBadges}
        </div>
      </div>
      <div style="border-top: 1px solid #f1f5f9; padding: 12px 16px;">
        <p style="font-size: 11px; font-weight: 600; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">项目列表</p>
        <div style="max-height: 240px; overflow-y: auto;">
          ${projectListHtml}
        </div>
      </div>
      ${idleSection}
      ${availableSection}
    </div>`;
}

function renderCharts() {
  const totalProjects = DATA.projects.length;
  const inProgress = DATA.projects.filter(p => p.status === 'inprogress').length;
  const totalMembers = DATA.members.length;
  const saturatedMembers = DATA.members.filter(m => m.saturation === 'full').length;
  const saturationRate = totalMembers > 0 ? Math.round((saturatedMembers / totalMembers) * 100) : 0;
  const nonFullMembers = totalMembers - saturatedMembers;

  // Employee type counts
  const empTypeCounts = {};
  DATA.employeeTypes.forEach(t => { empTypeCounts[t.name] = 0; });
  DATA.members.forEach(m => {
    const t = m.employeeType || '正式';
    empTypeCounts[t] = (empTypeCounts[t] || 0) + 1;
  });
  const empTypeChips = Object.entries(empTypeCounts)
    .filter(([_, c]) => c > 0)
    .map(([name, count]) =>
      `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 9999px; border: 1px solid #e2e8f0; background: white; font-size: 11px; color: #64748b;">
        ${name}<strong style="color: #7c3aed;">${count}</strong>
      </span>`).join('');

  const sortedBranches = [...DATA.branches].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const mainBranches = sortedBranches.filter(b => !b.name.includes('培养'));
  const trainBranches = sortedBranches.filter(b => b.name.includes('培养'));

  const mainBranchCards = mainBranches.map((b, i) => renderBranchCard(b.id, i)).join('');
  const trainBranchCards = trainBranches.map((b, i) => renderBranchCard(b.id, i)).join('');

  const html = `
    <div style="display: flex; flex-direction: column; gap: 24px;">
      <!-- Stat Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
        <div class="stat-card" style="border-left: 3px solid #3b82f6;">
          <div class="stat-icon" style="background: #eff6ff; color: #3b82f6;">📊</div>
          <div class="stat-info">
            <div class="stat-label">项目总数</div>
            <div class="stat-value" style="color: #2563eb;">${totalProjects}</div>
            <div class="stat-sub">制作中 ${inProgress}</div>
          </div>
        </div>
        <div class="stat-card" style="border-left: 3px solid #8b5cf6;">
          <div class="stat-icon" style="background: #faf5ff; color: #8b5cf6;">👥</div>
          <div class="stat-info">
            <div class="stat-label">在岗人员</div>
            <div class="stat-value" style="color: #7c3aed;">${totalMembers}</div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">${empTypeChips}</div>
          </div>
        </div>
        <div class="stat-card" style="border-left: 3px solid #ec4899;">
          <div class="stat-icon" style="background: #fdf2f8; color: #ec4899;">📈</div>
          <div class="stat-info">
            <div class="stat-label">饱和度</div>
            <div class="stat-value" style="color: #db2777;">${saturationRate}%</div>
            <div class="stat-sub">${nonFullMembers} 人非满载</div>
          </div>
        </div>
      </div>

      <!-- Branch Cards - Main (3 in one row) -->
      <div>
        <div class="section-header">
          <div class="section-title">
            <span>💼</span>
            <span>各分店概况</span>
            <span class="section-count">${mainBranches.length} 个分店</span>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          ${mainBranchCards}
        </div>
      </div>

      <!-- Branch Cards - Training -->
      ${trainBranchCards ? `
      <div>
        <div class="section-header">
          <div class="section-title">
            <span>🎓</span>
            <span>培养</span>
            <span class="section-count">${trainBranches.length} 个</span>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          ${trainBranchCards}
        </div>
      </div>
      ` : ''}

      <!-- Charts Row -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">项目状态分布</div>
              <div class="card-desc">按项目状态统计占比</div>
            </div>
          </div>
          <div class="card-body">
            <div id="statusPieChart" style="height: 280px;"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">人员项目负载 Top8</div>
              <div class="card-desc">按参与项目数量排序</div>
            </div>
          </div>
          <div class="card-body">
            <div id="workloadChart" style="height: 280px;"></div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('chartsTab').innerHTML = html;

  // Status Pie Chart
  const statusKeys = ['prescheduled', 'presale', 'inprogress', 'paused'];
  const statusCounts = { prescheduled: 0, presale: 0, inprogress: 0, paused: 0 };
  DATA.projects.forEach(p => { if (statusCounts[p.status] !== undefined) statusCounts[p.status]++; });

  const pieData = statusKeys
    .filter(s => statusCounts[s] > 0)
    .map(s => ({
      value: statusCounts[s],
      name: statusConfig[s].label,
      itemStyle: { color: statusConfig[s].dot }
    }));

  echarts.init(document.getElementById('statusPieChart')).setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#6b7280' } },
    series: [{
      type: 'pie', radius: ['50%', '75%'], center: ['50%', '42%'],
      avoidLabelOverlap: false,
      label: {
        show: true, position: 'center',
        formatter: `{n|${totalProjects}}\n{t|项目总数}`,
        rich: {
          n: { fontSize: 32, fontWeight: 'bold', color: '#1f2937', lineHeight: 38 },
          t: { fontSize: 12, color: '#9ca3af', lineHeight: 20 },
        },
      },
      emphasis: { label: { show: true } },
      labelLine: { show: false },
      data: pieData,
    }],
  });

  // Workload Bar Chart
  const workloadData = DATA.members
    .map(m => ({
      name: m.name,
      total: DATA.projects.filter(p => (p.members || []).includes(m.id)).length,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  echarts.init(document.getElementById('workloadChart')).setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '6%', bottom: '6%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category', data: workloadData.map(d => d.name),
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { fontSize: 11, color: '#6b7280', interval: 0, rotate: workloadData.length > 5 ? 25 : 0 },
    },
    yAxis: {
      type: 'value', minInterval: 1,
      splitLine: { lineStyle: { color: '#f3f4f6' } },
      axisLabel: { fontSize: 10, color: '#9ca3af' },
    },
    series: [{
      type: 'bar', data: workloadData.map(d => ({
        value: d.total,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#6366f1' }, { offset: 1, color: '#a5b4fc' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
      })),
      barWidth: '55%',
      label: { show: true, position: 'top', fontSize: 11, color: '#374151', fontWeight: 'bold' },
    }],
  });
}

// ============ CRUD 操作 ============

function showProjectDetail(projectId) {
  const project = DATA.projects.find(p => p.id === projectId);
  if (!project) return;
  const progress = getProgressByProject(projectId);
  const memberNames = (project.members || []).map(mId => getMemberName(mId)).filter(Boolean).join(', ');

  document.getElementById('modalTitle').textContent = project.name;
  document.getElementById('modalContent').className = 'modal-content large';
  document.getElementById('modalBody').innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="status-tag status-${project.status}">${statusLabels[project.status] || project.status}</span>
        <span class="branch-tag" style="background: ${branchColors[(project.branch - 1) % branchColors.length]}20; color: ${branchColors[(project.branch - 1) % branchColors.length]};">${getBranchName(project.branch)}</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px 16px; font-size: 13px;">
        <div><span class="text-muted">平台：</span>${project.platform || '-'}</div>
        <div><span class="text-muted">商务：</span>${project.business || '-'}</div>
        <div><span class="text-muted">项目经理：</span>${project.projectManager || '-'}</div>
        <div><span class="text-muted">时长：</span>${project.duration || '-'}</div>
        <div><span class="text-muted">开始日期：</span>${formatDate(project.startDate)}</div>
        <div><span class="text-muted">上线日期：</span>${formatDate(project.endDate)}</div>
        <div style="grid-column: 1 / -1;"><span class="text-muted">成员：</span>${memberNames || '-'}</div>
      </div>
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h4 style="font-size: 14px; font-weight: 600; color: #0f172a;">周进度 (${progress.length}条)</h4>
          <button class="btn btn-primary btn-sm" onclick="showAddProgressModal(${project.id})">+ 新增进度</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
          ${progress.length === 0 ? '<p class="text-subtle" style="font-size: 13px;">暂无进度记录</p>' : progress.map(w => `
            <div style="padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid ${w.risk ? '#ef4444' : '#3b82f6'};">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 600; color: ${w.risk ? '#dc2626' : '#2563eb'};">${w.week}</span>
                <div style="display: flex; gap: 10px; align-items: center;">
                  ${w.risk ? '<span style="font-size: 11px; color: #dc2626;">有风险</span>' : ''}
                  <button style="font-size: 12px; color: #ef4444; cursor: pointer; background: none; border: none;" onclick="deleteProgress(${w.id})">删除</button>
                </div>
              </div>
              <p style="font-size: 13px; color: #334155; line-height: 1.6;">${w.content}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.getElementById('modal').classList.remove('hidden');
}

function showAddProjectModal() {
  renderProjectForm(null);
}

function showEditProjectModal(projectId) {
  const project = DATA.projects.find(p => p.id === projectId);
  if (!project) return;
  renderProjectForm(project);
}

function renderProjectForm(project) {
  const isEdit = !!project;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑项目' : '新增项目';
  document.getElementById('modalContent').className = 'modal-content large';

  const memberOptions = DATA.members.map(m =>
    `<option value="${m.id}" ${project && project.members && project.members.includes(m.id) ? 'selected' : ''}>${m.name}</option>`
  ).join('');

  const branchOptions = DATA.branches.map(b =>
    `<option value="${b.id}" ${project && project.branch === b.id ? 'selected' : ''}>${b.name}</option>`
  ).join('');

  document.getElementById('modalBody').innerHTML = `
    <form id="projectForm">
      <div class="form-group">
        <label class="form-label">项目名称 *</label>
        <input type="text" name="name" class="form-input" value="${project?.name || ''}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">状态 *</label>
          <select name="status" class="form-input" required>
            ${Object.entries(statusLabels).map(([k, v]) => `<option value="${k}" ${project?.status === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">分店 *</label>
          <select name="branch" class="form-input" required>${branchOptions}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">开始日期</label>
          <input type="date" name="startDate" class="form-input" value="${project?.startDate ? project.startDate.split('T')[0] : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">结束日期</label>
          <input type="date" name="endDate" class="form-input" value="${project?.endDate ? project.endDate.split('T')[0] : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">成员</label>
        <select name="members" multiple class="form-input" size="6" style="height: auto;">${memberOptions}</select>
        <p class="text-xs text-gray-400 mt-1">按住 Ctrl/Cmd 多选</p>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">平台</label>
          <input type="text" name="platform" class="form-input" value="${project?.platform || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">商务</label>
          <input type="text" name="business" class="form-input" value="${project?.business || ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">项目经理</label>
          <input type="text" name="projectManager" class="form-input" value="${project?.projectManager || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">时长</label>
          <input type="text" name="duration" class="form-input" value="${project?.duration || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" name="isCase" ${project?.isCase ? 'checked' : ''}> 是否案例项目
        </label>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button type="submit" class="btn btn-primary">${isEdit ? '保存' : '创建'}</button>
      </div>
    </form>
  `;

  document.getElementById('projectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      status: formData.get('status'),
      branch: parseInt(formData.get('branch')),
      startDate: formData.get('startDate') || null,
      endDate: formData.get('endDate') || null,
      members: formData.getAll('members').map(Number),
      platform: formData.get('platform') || null,
      business: formData.get('business') || null,
      projectManager: formData.get('projectManager') || null,
      duration: formData.get('duration') || null,
      isCase: formData.get('isCase') === 'on'
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';

    try {
      if (isEdit) {
        // 更新本地数据
        const idx = DATA.projects.findIndex(p => p.id === project.id);
        if (idx !== -1) {
          DATA.projects[idx] = { ...DATA.projects[idx], ...data };
        }
        await saveData(`更新项目: ${data.name}`);
        showToast('项目已更新');
      } else {
        // 生成新 ID 并添加
        const newId = GitHubAPI.generateProjectId(DATA);
        const now = new Date().toISOString();
        const newProject = {
          id: newId,
          ...data,
          createdAt: now,
          createdBy: 'github-app',
          updatedAt: now,
          updatedBy: 'github-app'
        };
        DATA.projects.push(newProject);
        await saveData(`新增项目: ${data.name}`);
        showToast('项目已创建');
      }
      closeModal();
      renderAll();
    } catch (err) {
      showError(err.message);
    } finally {
      const btn = document.querySelector('#projectForm button[type="submit"]');
      if (btn) { btn.disabled = false; btn.textContent = isEdit ? '保存' : '创建'; }
    }
  });

  document.getElementById('modal').classList.remove('hidden');
}

async function deleteProject(projectId) {
  if (!confirm('确定要删除这个项目吗？相关的周进度也会被删除。')) return;
  try {
    const project = DATA.projects.find(p => p.id === projectId);
    const projectName = project?.name || `项目#${projectId}`;
    
    // 本地移除
    DATA.projects = DATA.projects.filter(p => p.id !== projectId);
    DATA.weeklyProgress = DATA.weeklyProgress.filter(w => w.projectId !== projectId);
    
    await saveData(`删除项目: ${projectName}`);
    showToast('项目已删除');
    renderAll();
  } catch (err) {
    showError(err.message);
  }
}

function showAddMemberModal() {
  renderMemberForm(null);
}

function showEditMemberModal(memberId) {
  const member = DATA.members.find(m => m.id === memberId);
  if (!member) return;
  renderMemberForm(member);
}

function renderMemberForm(member) {
  const isEdit = !!member;
  document.getElementById('modalTitle').textContent = isEdit ? '编辑人员' : '新增人员';
  document.getElementById('modalContent').className = 'modal-content';

  const roleOptions = DATA.roles.map(r =>
    `<option value="${r.id}" ${member && member.role === r.id ? 'selected' : ''}>${r.name}</option>`
  ).join('');

  const branchOptions = DATA.branches.map(b =>
    `<option value="${b.id}" ${member && member.branch === b.id ? 'selected' : ''}>${b.name}</option>`
  ).join('');

  const typeOptions = DATA.employeeTypes.map(t =>
    `<option value="${t.name}" ${member && member.employeeType === t.name ? 'selected' : ''}>${t.name}</option>`
  ).join('');

  document.getElementById('modalBody').innerHTML = `
    <form id="memberForm">
      <div class="form-group">
        <label class="form-label">姓名 *</label>
        <input type="text" name="name" class="form-input" value="${member?.name || ''}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">分店 *</label>
          <select name="branch" class="form-input" required>${branchOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">岗位 *</label>
          <select name="role" class="form-input" required>${roleOptions}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">饱和度</label>
          <select name="saturation" class="form-input">
            <option value="full" ${member?.saturation === 'full' ? 'selected' : ''}>全职</option>
            <option value="under" ${member?.saturation === 'under' ? 'selected' : ''}>不饱和</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">人员性质</label>
          <select name="employeeType" class="form-input">${typeOptions}</select>
        </div>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        ${isEdit ? `<button type="button" class="btn btn-danger mr-auto" onclick="deleteMember(${member.id})">删除</button>` : ''}
        <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button type="submit" class="btn btn-primary">${isEdit ? '保存' : '创建'}</button>
      </div>
    </form>
  `;

  document.getElementById('memberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      branch: parseInt(formData.get('branch')),
      role: parseInt(formData.get('role')),
      saturation: formData.get('saturation'),
      employeeType: formData.get('employeeType'),
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';

    try {
      if (isEdit) {
        const idx = DATA.members.findIndex(m => m.id === member.id);
        if (idx !== -1) {
          DATA.members[idx] = { ...DATA.members[idx], ...data };
        }
        await saveData(`更新人员: ${data.name}`);
        showToast('人员已更新');
      } else {
        const newId = GitHubAPI.generateMemberId(DATA);
        const now = new Date().toISOString();
        const newMember = {
          id: newId,
          ...data,
          createdAt: now,
          createdBy: 'github-app',
          updatedAt: now,
          updatedBy: 'github-app'
        };
        DATA.members.push(newMember);
        await saveData(`新增人员: ${data.name}`);
        showToast('人员已创建');
      }
      closeModal();
      renderAll();
    } catch (err) {
      showError(err.message);
    } finally {
      const btn = document.querySelector('#memberForm button[type="submit"]');
      if (btn) { btn.disabled = false; btn.textContent = isEdit ? '保存' : '创建'; }
    }
  });

  document.getElementById('modal').classList.remove('hidden');
}

async function deleteMember(memberId) {
  if (!confirm('确定要删除这名人员吗？')) return;
  try {
    const member = DATA.members.find(m => m.id === memberId);
    const memberName = member?.name || `人员#${memberId}`;
    
    DATA.members = DATA.members.filter(m => m.id !== memberId);
    await saveData(`删除人员: ${memberName}`);
    showToast('人员已删除');
    closeModal();
    renderAll();
  } catch (err) {
    showError(err.message);
  }
}

function showAddProgressModal(projectId) {
  document.getElementById('modalTitle').textContent = '新增周进度';
  document.getElementById('modalContent').className = 'modal-content';
  document.getElementById('modalBody').innerHTML = `
    <form id="progressForm">
      <div class="form-group">
        <label class="form-label">周次 *</label>
        <input type="text" name="week" class="form-input" placeholder="例如: W40 (10.06-10.12)" required>
      </div>
      <div class="form-group">
        <label class="form-label">进度内容 *</label>
        <textarea name="content" class="form-input" rows="4" required></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">风险说明</label>
        <textarea name="risk" class="form-input" rows="2"></textarea>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button type="submit" class="btn btn-primary">添加</button>
      </div>
    </form>
  `;

  document.getElementById('progressForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '添加中...';
    try {
      const newId = GitHubAPI.generateProgressId(DATA);
      const now = new Date().toISOString();
      const newProgress = {
        id: newId,
        projectId: projectId,
        week: formData.get('week'),
        content: formData.get('content'),
        risk: formData.get('risk') || null,
        createdAt: now,
        createdBy: 'github-app',
        updatedAt: now,
        updatedBy: 'github-app'
      };
      DATA.weeklyProgress.push(newProgress);
      await saveData(`新增进度: 项目#${projectId} - ${newProgress.week}`);
      showToast('进度已添加');
      closeModal();
      renderAll();
      showProjectDetail(projectId);
    } catch (err) {
      showError(err.message);
    } finally {
      const btn = document.querySelector('#progressForm button[type="submit"]');
      if (btn) { btn.disabled = false; btn.textContent = '添加'; }
    }
  });

  document.getElementById('modal').classList.remove('hidden');
}

async function deleteProgress(progressId) {
  if (!confirm('确定要删除这条进度记录吗？')) return;
  try {
    const progress = DATA.weeklyProgress.find(w => w.id === progressId);
    const projectId = progress?.projectId;
    
    DATA.weeklyProgress = DATA.weeklyProgress.filter(w => w.id !== progressId);
    await saveData(`删除进度: #${progressId}`);
    showToast('进度已删除');
    renderAll();
    if (projectId) showProjectDetail(projectId);
  } catch (err) {
    showError(err.message);
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// ============ 事件监听 ============

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(currentTab + 'Tab').classList.remove('hidden');

      document.getElementById('filterSection').style.display = currentTab === 'project' ? 'block' : 'none';

      if (currentTab === 'member') renderMemberBoard();
      if (currentTab === 'timeline') renderTimeline();
      if (currentTab === 'charts') renderCharts();
    });
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filters.search = e.target.value;
    renderProjects();
  });

  // Status filter
  document.getElementById('statusFilter').addEventListener('change', (e) => {
    filters.status = e.target.value;
    renderProjects();
    updateActiveFilters();
  });

  // Branch filter
  document.getElementById('branchFilter').addEventListener('change', (e) => {
    filters.branch = e.target.value;
    renderProjects();
    if (currentTab === 'member') renderMemberBoard();
    if (currentTab === 'timeline') renderTimeline();
    updateActiveFilters();
  });

  // Platform filter
  document.getElementById('platformFilter').addEventListener('change', (e) => {
    filters.platform = e.target.value;
    renderProjects();
    updateActiveFilters();
  });

  // Modal close
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  // Resize charts
  window.addEventListener('resize', () => {
    if (currentTab === 'charts') {
      ['statusPieChart', 'workloadChart'].forEach(id => {
        const chart = echarts.getInstanceByDom(document.getElementById(id));
        if (chart) chart.resize();
      });
    }
  });
}

function updateActiveFilters() {
  const container = document.getElementById('activeFilters');
  const chips = [];
  if (filters.status) chips.push({ label: `状态: ${statusLabels[filters.status]}`, key: 'status' });
  if (filters.branch) chips.push({ label: `分店: ${getBranchName(parseInt(filters.branch))}`, key: 'branch' });
  if (filters.platform) chips.push({ label: `平台: ${filters.platform}`, key: 'platform' });

  container.innerHTML = chips.map(c =>
    `<span class="filter-chip" data-filter="${c.key}">${c.label} ×</span>`
  ).join('');

  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      filters[key] = '';
      document.getElementById(key + 'Filter').value = '';
      renderProjects();
      if (key === 'branch' && currentTab === 'member') renderMemberBoard();
      if (key === 'branch' && currentTab === 'timeline') renderTimeline();
      updateActiveFilters();
    });
  });
}

// 初始化
loadData();
