/**
 * API Service for PyrePortal
 * Handles all communication with the backend API
 */

// Environment configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const DEVICE_API_KEY = import.meta.env.VITE_DEVICE_API_KEY || 'dev_bc17223f4417bd2251742e659efc5a7d14671f714154d3cc207fe8ee0feedeaa';

/**
 * Generic API call function with error handling
 */
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} - ${response.statusText}`);
  }

  return response.json();
}

/**
 * Teacher data structure from API
 */
export interface Teacher {
  staff_id: number;
  person_id: number;
  first_name: string;
  last_name: string;
  display_name: string;
}

/**
 * API response structure for teachers
 */
interface TeacherResponse {
  status: string;
  data: Teacher[];
  message: string;
}

/**
 * API functions
 */
export const api = {
  /**
   * Get teachers list (device authenticated)
   * Endpoint: GET /api/iot/teachers
   */
  async getTeachers(): Promise<Teacher[]> {
    const response = await apiCall<TeacherResponse>('/api/iot/teachers', {
      headers: {
        'Authorization': `Bearer ${DEVICE_API_KEY}`,
      },
    });
    
    return response.data;
  },

  /**
   * Validate teacher PIN
   * Endpoint: GET /api/iot/status
   */
  async validateTeacherPin(pin: string): Promise<boolean> {
    try {
      await apiCall('/api/iot/status', {
        headers: {
          'Authorization': `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Device health ping
   * Endpoint: POST /api/iot/ping
   */
  async pingDevice(pin: string): Promise<void> {
    await apiCall('/api/iot/ping', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });
  },
};

/**
 * Configuration utilities
 */
export const config = {
  getApiBaseUrl: () => API_BASE_URL,
  getDeviceApiKey: () => DEVICE_API_KEY,
};