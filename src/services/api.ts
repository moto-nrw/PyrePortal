/**
 * API Service for PyrePortal
 * Handles all communication with the backend API
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('API');

// Environment configuration
const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8080';
const DEVICE_API_KEY: string =
  (import.meta.env.VITE_DEVICE_API_KEY as string) ??
  'dev_bc17223f4417bd2251742e659efc5a7d14671f714154d3cc207fe8ee0feedeaa';

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

  return response.json() as Promise<T>;
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
 * Activity data structure from API
 */
export interface ActivityResponse {
  id: number;
  name: string;
  category_name: string;
  category_color: string;
  room_name: string;
  enrollment_count: number;
  max_participants: number;
  has_spots: boolean;
  supervisor_name: string;
  is_active: boolean;
}

/**
 * API response structure for activities
 */
interface ActivitiesResponse {
  status: string;
  data: ActivityResponse[];
  message: string;
}

/**
 * Room data structure from API
 */
export interface Room {
  id: number;
  name: string;
  room_type?: string;
  capacity?: number;
}

/**
 * API response structure for rooms
 */
interface RoomsResponse {
  status: string;
  data: Room[];
  message: string;
}

/**
 * Session start request structure
 */
export interface SessionStartRequest {
  activity_id: number;
  force?: boolean;
}

/**
 * Session start response structure
 */
export interface SessionStartResponse {
  active_group_id: number;
  status: string;
  session_id: number;
  activity_name: string;
  room_name: string;
}

/**
 * Current session info structure
 */
export interface CurrentSession {
  active_group_id: number;
  activity_id: number;
  activity_name?: string;
  room_id?: number;
  room_name?: string;
  device_id: number;
  start_time: string;
  duration: string;
  is_active?: boolean;
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
        Authorization: `Bearer ${DEVICE_API_KEY}`,
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
      logger.debug('Starting PIN validation');

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
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      logger.info('PIN validation successful');

      // Check if response has the expected structure
      if (!response.data?.device || !response.data.person || !response.data.staff) {
        logger.error('Unexpected response structure', { response });
        return {
          success: false,
          error: 'Unerwartete Server-Antwort. Bitte versuchen Sie es erneut.',
        };
      }

      const { device, person, staff } = response.data;

      return {
        success: true,
        userData: {
          deviceName: device.name || 'Unknown Device',
          staffName: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
          staffId: staff.id,
        },
      };
    } catch (error) {
      logger.error('PIN validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Enhanced error handling for security features
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('423')) {
        return {
          success: false,
          error: 'Konto vorübergehend gesperrt. Versuchen Sie es später erneut.',
          isLocked: true,
        };
      } else if (errorMessage.includes('401')) {
        return {
          success: false,
          error: 'Ungültiger PIN. Bitte versuchen Sie es erneut.',
        };
      } else {
        return {
          success: false,
          error: 'Verbindungsfehler. Bitte überprüfen Sie Ihre Netzwerkverbindung.',
        };
      }
    }
  },

  /**
   * Get teacher's activities for today
   * Endpoint: GET /api/iot/activities
   */
  async getActivities(pin: string): Promise<ActivityResponse[]> {
    const response = await apiCall<ActivitiesResponse>('/api/iot/activities', {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });

    return response.data;
  },

  /**
   * Device health ping
   * Endpoint: POST /api/iot/ping
   */
  async pingDevice(pin: string): Promise<void> {
    await apiCall('/api/iot/ping', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });
  },

  /**
   * Get available rooms (device authenticated)
   * Endpoint: GET /api/iot/rooms/available
   */
  async getRooms(pin: string, capacity?: number): Promise<Room[]> {
    const params = new URLSearchParams();
    if (capacity) {
      params.append('capacity', capacity.toString());
    }

    const endpoint = `/api/iot/rooms/available${params.toString() ? `?${params.toString()}` : ''}`;

    const response = await apiCall<RoomsResponse>(endpoint, {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });

    return response.data;
  },

  /**
   * Start activity session
   * Endpoint: POST /api/iot/session/start
   */
  async startSession(pin: string, request: SessionStartRequest): Promise<SessionStartResponse> {
    const response = await apiCall<SessionStartResponse>('/api/iot/session/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify(request),
    });

    return response;
  },

  /**
   * Get current session for device
   * Endpoint: GET /api/iot/session/current
   */
  async getCurrentSession(pin: string): Promise<CurrentSession | null> {
    try {
      const response = await apiCall<{
        status: string;
        data: CurrentSession;
        message: string;
      }>('/api/iot/session/current', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      // Check if we have valid session data
      if (!response.data?.active_group_id || !response.data.activity_id) {
        return null;
      }

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means no current session, which is fine
      if (errorMessage.includes('404')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * End current session
   * Endpoint: POST /api/iot/session/end
   */
  async endSession(pin: string): Promise<void> {
    await apiCall('/api/iot/session/end', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });
  },

  /**
   * Get teacher's students for tag assignment
   * Endpoint: GET /api/iot/students
   */
  async getStudents(pin: string): Promise<Student[]> {
    const response = await apiCall<{
      status: string;
      data: Student[];
      message: string;
    }>('/api/iot/students', {
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
    });

    return response.data;
  },

  /**
   * Check RFID tag assignment status
   * Endpoint: GET /api/iot/rfid/{tagId}
   */
  async checkTagAssignment(pin: string, tagId: string): Promise<TagAssignmentCheck> {
    try {
      const response = await apiCall<{
        status: string;
        message: string;
        data: TagAssignmentCheck;
      }>(`/api/iot/rfid/${tagId}`, {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means tag is not assigned, which is fine
      if (errorMessage.includes('404')) {
        return { assigned: false };
      }
      throw error;
    }
  },

  /**
   * Assign RFID tag to student
   * Endpoint: POST /api/students/{studentId}/rfid
   */
  async assignTag(pin: string, studentId: number, tagId: string): Promise<TagAssignmentResult> {
    const response = await apiCall<{
      status: string;
      data?: {
        student_id: number;
        rfid_tag: string;
        previous_tag?: string;
        message?: string;
      };
      message?: string;
    }>(`/api/students/${studentId}/rfid`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify({
        rfid_tag: tagId,
      }),
    });

    // Transform the API response to match our expected TagAssignmentResult interface
    return {
      success: response.status === 'success',
      message: response.data?.message ?? response.message ?? 'Tag erfolgreich zugewiesen',
      previous_tag: response.data?.previous_tag,
    };
  },

  /**
   * Process RFID check-in/check-out
   * Endpoint: POST /api/iot/checkin
   */
  async processRfidScan(
    scanData: {
      student_rfid: string;
      action: 'checkin' | 'checkout';
      room_id: number;
    },
    pin: string
  ): Promise<RfidScanResult> {
    const response = await apiCall<RfidScanResult>('/api/iot/checkin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify(scanData),
    });

    return response;
  },

  /**
   * Update session activity to prevent timeout
   * Endpoint: POST /api/iot/session/activity
   */
  async updateSessionActivity(pin: string): Promise<void> {
    await apiCall('/api/iot/session/activity', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify({
        activity_type: 'rfid_scan', // Changed from 'student_scan' to 'rfid_scan'
        timestamp: new Date().toISOString(),
      }),
    });
  },

  /**
   * Get current session information including active student count
   * Endpoint: GET /api/iot/session/current
   */
  async getCurrentSessionInfo(
    pin: string
  ): Promise<{ activity_name: string; room_name: string; active_students: number } | null> {
    try {
      const response = await apiCall<{
        status: string;
        data: {
          activity_name: string;
          room_name: string;
          active_students: number;
          last_activity: string;
        };
        message: string;
      }>('/api/iot/session/current', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      logger.debug('getCurrentSessionInfo response', { response });
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means no current session
      if (errorMessage.includes('404')) {
        return null;
      }
      throw error;
    }
  },
};

/**
 * Student data structure from /api/iot/students
 */
export interface Student {
  student_id: number;
  person_id: number;
  first_name: string;
  last_name: string;
  school_class: string;
  group_name: string;
  rfid_tag?: string;
}

/**
 * Tag assignment check response from /api/rfid-cards/{tagId}
 */
export interface TagAssignmentCheck {
  assigned: boolean;
  student?: {
    id: number;
    name: string;
    group: string;
  };
}

/**
 * Tag assignment result from POST /api/students/{studentId}/rfid
 */
export interface TagAssignmentResult {
  success: boolean;
  previous_tag?: string;
  message?: string;
}

/**
 * RFID scan result from POST /api/iot/checkin
 */
export interface RfidScanResult {
  student_id: number;
  student_name: string;
  action: 'checked_in' | 'checked_out';
  visit_id?: number;
  room_name?: string;
  processed_at?: string;
  message?: string;
  status?: string;
}

/**
 * Configuration utilities
 */
export const config = {
  getApiBaseUrl: (): string => API_BASE_URL,
  getDeviceApiKey: (): string => DEVICE_API_KEY,
};
