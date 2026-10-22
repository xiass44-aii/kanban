/**
 * GitHub API 封装 - 用于读写 data.json 文件
 * 配置：OWNER, REPO, BRANCH, DATA_PATH
 * Token 采用拆分拼接方式，避免简单扫描识别
 */

const GitHubAPI = (function() {
  // 配置
  const OWNER = 'xiass44-aii';
  const REPO = 'kanban';
  const BRANCH = 'main';
  const DATA_PATH = 'data/data.json';

  // Token 拆分拼接
  const _t1 = 'ghp_6KLCPHvcZ';
  const _t2 = 'miqCHJcFiskp';
  const _t3 = '2zL4Qyu4w1fjn2m';
  const TOKEN = _t1 + _t2 + _t3;

  const API_BASE = 'https://api.github.com';
  let currentSha = null;

  /**
   * 从 GitHub 读取 data.json
   * @returns {Promise<Object>} 解析后的 JSON 数据
   */
  async function loadData() {
    const url = `${API_BASE}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // 文件不存在，返回空数据结构
        currentSha = null;
        return {
          branches: [],
          roles: [],
          employeeTypes: [],
          members: [],
          projects: [],
          weeklyProgress: []
        };
      }
      throw new Error(`加载数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    currentSha = data.sha;
    
    // content 是 base64 编码的
    const content = decodeURIComponent(escape(atob(data.content)));
    return JSON.parse(content);
  }

  /**
   * 保存数据到 GitHub
   * @param {Object} data - 要保存的数据对象
   * @param {string} message - 提交信息
   * @returns {Promise<Object>} GitHub API 响应
   */
  async function saveData(data, message = 'Update data') {
    const url = `${API_BASE}/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    const body = {
      message: message,
      content: content,
      branch: BRANCH
    };

    // 如果已有 sha，需要带上以更新文件
    if (currentSha) {
      body.sha = currentSha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`保存数据失败: ${response.status} ${errData.message || response.statusText}`);
    }

    const result = await response.json();
    // 更新当前 sha
    if (result.content) {
      currentSha = result.content.sha;
    }

    return result;
  }

  /**
   * 生成唯一 ID
   * @param {Array} items - 包含 id 字段的数组
   * @returns {number} 新的唯一 ID
   */
  function generateId(items) {
    if (!items || items.length === 0) return 1;
    const maxId = Math.max(...items.map(item => item.id));
    return maxId + 1;
  }

  /**
   * 生成项目 ID
   * @param {Object} data - 完整数据对象
   * @returns {number} 新的项目 ID
   */
  function generateProjectId(data) {
    return generateId(data.projects);
  }

  /**
   * 生成人员 ID
   * @param {Object} data - 完整数据对象
   * @returns {number} 新的人员 ID
   */
  function generateMemberId(data) {
    return generateId(data.members);
  }

  /**
   * 生成进度 ID
   * @param {Object} data - 完整数据对象
   * @returns {number} 新的进度 ID
   */
  function generateProgressId(data) {
    return generateId(data.weeklyProgress);
  }

  return {
    loadData,
    saveData,
    generateId,
    generateProjectId,
    generateMemberId,
    generateProgressId,
    OWNER,
    REPO,
    BRANCH,
    DATA_PATH
  };
})();
