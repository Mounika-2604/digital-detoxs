const API_URL = 'https://digital-detoxs.onrender.com/api';
const config = {
  apiUrl: API_URL,
  endpoints: {
    sync: `${API_URL}/api/extension/sync`,
    config: `${API_URL}/api/extension/config`,
    checkAccess: `${API_URL}/api/extension/check-access`,
    login: `${API_URL}/login`,
    register: `${API_URL}/register`
  }
};