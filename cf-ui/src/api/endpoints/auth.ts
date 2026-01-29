const API_BASE_URL = process.env.CFN_UI_API_BASE_URL || 'http://localhost:8000';

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({username, password})
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    return response.json();
  },

  refresh: async (refreshToken: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refresh_token: refreshToken})
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }
};
