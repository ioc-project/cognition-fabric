const API_BASE_URL = process.env.CFN_UI_API_BASE_URL || 'http://localhost:8000';

import {SignupRequest, SignupResponse, SignupResponseSchema} from '../types/auth';

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

  signup: async (data: SignupRequest): Promise<SignupResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {detail?: string};
      if (response.status === 409) {
        throw new Error('Username already exists');
      }
      if (response.status === 422) {
        throw new Error(error.detail || 'Validation error');
      }
      throw new Error('Signup failed');
    }

    const result = await response.json();
    return SignupResponseSchema.parse(result);
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
