const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const api = {
  register: `${API_URL}/register`,
  login: `${API_URL}/login`,
  user: (userId) => `${API_URL}/user/${userId}`,
  blockedSites: (userId) => `${API_URL}/blocked-sites/${userId}`,
  stats: (userId) => `${API_URL}/stats/${userId}`,
};

export default api;