/**
 * API Service for PyrePortal
 * Handles all communication with the backend API
 */

// Environment configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
const DEVICE_API_KEY = import.meta.env.VITE_DEVICE_API_KEY ?? 'dev_bc17223f4417bd2251742e659efc5a7d14671f714154d3cc207fe8ee0feedeaa';

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
 * PIN validation response interface
 */
export interface PinValidationResult {
  success: boolean;
  userData?: {
    deviceName: string;
    staffName: string;
    staffId: number;
  };
  error?: string;
  isLocked?: boolean;
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
   * Validate teacher PIN with enhanced error handling
   * Endpoint: GET /api/iot/status
   */
  async validateTeacherPin(pin: string): Promise<PinValidationResult> {
    try {
      console.log('🔍 Starting PIN validation');
      
      const response = await apiCall<{
        status: string;
        data: {
          device: { id: number; device_id: string; name: string; status: string };
          staff: { id: number; person_id: number };
          person: { first_name: string; last_name: string };
          authenticated_at: string;
        };
        message: string;
      }>('/api/iot/status', {
        headers: {
          'Authorization': `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });
      
      console.log('✅ PIN validation successful');
      
      // Check if response has the expected structure
      if (!response.data || !response.data.device || !response.data.person || !response.data.staff) {
        console.error('❌ Unexpected response structure:', response);
        return {
          success: false,
          error: 'Unerwartete Server-Antwort. Bitte versuchen Sie es erneut.'
        };
      }
      
      const { device, person, staff } = response.data;
      
      return {
        success: true,
        userData: {
          deviceName: device.name || 'Unknown Device',
          staffName: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
          staffId: staff.id,
        }
      };
    } catch (error) {
      console.error('❌ PIN validation failed, error:', error);
      
      // Enhanced error handling for security features
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('423')) {
        return { 
          success: false, 
          error: 'Konto vorübergehend gesperrt. Versuchen Sie es später erneut.',
          isLocked: true 
        };
      } else if (errorMessage.includes('401')) {
        return { 
          success: false, 
          error: 'Ungültiger PIN. Bitte versuchen Sie es erneut.' 
        };
      } else {
        return { 
          success: false, 
          error: 'Verbindungsfehler. Bitte überprüfen Sie Ihre Netzwerkverbindung.' 
        };
      }
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