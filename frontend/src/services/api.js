/**
 * API client - handles all communication with varv-server
 */

class APIClient {
  constructor(apiBase, getAuth) {
    this.apiBase = apiBase;
    this.getAuth = getAuth;
  }

  async get(endpoint) {
    const auth = this.getAuth();
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      headers: {
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
      }
    });
    if (!response.ok) {
      throw new Error(`API GET ${endpoint} failed: ${response.status}`);
    }
    return response.json();
  }

  async post(endpoint, body) {
    const auth = this.getAuth();
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`API POST ${endpoint} failed: ${response.status}`);
    }
    return response.json();
  }

  async patch(endpoint, body) {
    const auth = this.getAuth();
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`API PATCH ${endpoint} failed: ${response.status}`);
    }
    return response.json();
  }

  async delete(endpoint) {
    const auth = this.getAuth();
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'DELETE',
      headers: {
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {})
      }
    });
    if (!response.ok) {
      throw new Error(`API DELETE ${endpoint} failed: ${response.status}`);
    }
    return response.json();
  }

  // Auth
  async login(username, password) {
    return this.post('/api/auth/login', { username, password });
  }

  // Tasks
  async getTasks(done = false) {
    return this.get(`/api/tasks?done=${done}`);
  }

  async patchTask(taskId, changes) {
    return this.patch(`/api/tasks/${taskId}`, changes);
  }

  async toggleStep(stepId) {
    return this.patch(`/api/steps/${stepId}/toggle`);
  }

  // Ideas
  async getIdeas() {
    return this.get('/api/ideas');
  }

  async deleteIdea(ideaId) {
    return this.delete(`/api/ideas/${ideaId}`);
  }

  // Lists
  async getLists() {
    return this.get('/api/lists');
  }

  async toggleListItem(itemId) {
    return this.patch(`/api/list-items/${itemId}/toggle`);
  }

  // Energy & capacity
  async getEnergy() {
    return this.get('/api/energy');
  }

  async addEnergy(delta, label) {
    return this.post('/api/capacity', { delta, label });
  }

  async setCapacity(mode, by = 'user') {
    return this.post(`/api/capacity/${mode}`, { by });
  }

  // Wins
  async getWins(day = null) {
    return this.get(`/api/wins${day ? `?day=${day}` : ''}`);
  }

  // Stats
  async getWeekStats() {
    return this.get('/api/stats/week');
  }

  async getTopics() {
    return this.get('/api/topics');
  }

  async getAgentLog() {
    return this.get('/api/agents/log');
  }

  async getCaptures() {
    return this.get('/api/captures');
  }

  // Capture & voice
  async capture(raw, source = 'text', override = null) {
    return this.post('/api/capture', { raw, source, override });
  }

  // Agents
  async classify(raw) {
    return this.post('/api/agents/classify', { raw });
  }

  async refine(raw) {
    return this.post('/api/agents/refine', { raw });
  }

  async breakdown(title) {
    return this.post('/api/agents/breakdown', { title });
  }

  // Sync
  async syncPush(changes) {
    return this.post('/api/sync/push', changes);
  }

  async syncPull(since = null) {
    const url = since
      ? `/api/sync/pull?since=${encodeURIComponent(since)}`
      : '/api/sync/pull';
    return this.get(url);
  }

  async getMe() {
    return this.get('/api/me');
  }

  async patchMe(data) {
    return this.patch('/api/me', data);
  }

  // Google (kalender + gmail) koppling
  async getGoogleStatus() {
    return this.get('/api/integrations/google/status');
  }

  async disconnectGoogle() {
    return this.delete('/api/integrations/google');
  }

  connectGoogleUrl() {
    const auth = this.getAuth();
    return `${this.apiBase}/api/integrations/google/connect?token=${encodeURIComponent(auth?.token || '')}`;
  }
}

export { APIClient };