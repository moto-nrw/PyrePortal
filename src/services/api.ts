/**
 * API Service for PyrePortal
 * Handles all communication with the backend API
 */

import { createLogger } from '../utils/logger';
import { safeInvoke } from '../utils/tauriContext';

const logger = createLogger('API');

// API configuration interface
interface ApiConfig {
  api_base_url: string;
  device_api_key: string;
}

// Environment configuration - will be loaded at runtime
let API_BASE_URL = '';
let DEVICE_API_KEY = '';
let isInitialized = false;

/**
 * Initialize API configuration from Tauri backend
 */
export async function initializeApi(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    // Try to get config from Tauri backend
    const config = await safeInvoke<ApiConfig>('get_api_config');
    API_BASE_URL = config.api_base_url;
    DEVICE_API_KEY = config.device_api_key;
    isInitialized = true;
    
    logger.info('API initialized with runtime configuration', {
      baseUrl: API_BASE_URL,
      hasApiKey: !!DEVICE_API_KEY
    });
  } catch (error) {
    // Fallback to build-time env vars if Tauri is not available (e.g., in dev without Tauri)
    logger.warn('Failed to load runtime config, falling back to build-time env vars', { error });
    API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:8080';
    DEVICE_API_KEY = import.meta.env.VITE_DEVICE_API_KEY as string;
    
    if (!DEVICE_API_KEY) {
      throw new Error('API key not found. Please set DEVICE_API_KEY or VITE_DEVICE_API_KEY environment variable');
    }
    
    isInitialized = true;
  }
}

/**
 * Ensure API is initialized before making calls
 */
async function ensureInitialized(): Promise<void> {
  if (!isInitialized) {
    await initializeApi();
  }
}

/**
 * Generic API call function with error handling
 */
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  await ensureInitialized();
  
  const url = `${API_BASE_URL}${endpoint}`;

  // Debug logging for authentication issues
  if (endpoint === '/api/iot/ping') {
    logger.debug('Making ping request', {
      url,
      method: options.method,
      hasAuth: !!(options.headers as Record<string, string>)?.Authorization,
      hasPin: !!(options.headers as Record<string, string>)?.['X-Staff-PIN'],
    });
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    // Try to get error details from response body
    let errorMessage = `API Error: ${response.status} - ${response.statusText}`;
    let detailMessage = '';
    try {
      const errorData = await response.json() as { message?: string; error?: string };
      if (errorData.message) {
        detailMessage = errorData.message;
      } else if (errorData.error) {
        detailMessage = errorData.error;
      }
    } catch {
      // If JSON parsing fails, use the default error message
    }
    
    // Include both status code and detail message for better error handling
    if (detailMessage) {
      errorMessage = `${errorMessage}: ${detailMessage}`;
    }
    
    throw new Error(errorMessage);
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
  category: string;
  // Optional fields that might not be present in the new API
  category_name?: string;
  category_color?: string;
  room_name?: string;
  enrollment_count?: number;
  max_participants?: number;
  has_spots?: boolean;
  supervisor_name?: string;
  is_active?: boolean;
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
  building?: string;
  floor?: number;
  category?: string;
  color?: string;
  is_occupied: boolean;
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
  room_id?: number; // Optional: Override the activity's planned room
  supervisor_ids: number[]; // Required: Array of staff IDs who will supervise
  force?: boolean; // Optional: Force start even if conflicts exist
}

/**
 * Supervisor info in session response
 */
export interface SupervisorInfo {
  staff_id: number;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
}

/**
 * Session start response structure
 */
export interface SessionStartResponse {
  active_group_id: number;
  activity_id: number;
  device_id: number;
  start_time: string;
  supervisors: SupervisorInfo[];
  status: string;
  message: string;
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
  active_students?: number;
  supervisors?: SupervisorInfo[];
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
   * Validate global OGS PIN
   * Endpoint: POST /api/iot/ping
   */
  async validateGlobalPin(pin: string): Promise<PinValidationResult> {
    try {
      logger.debug('Starting global PIN validation', { 
        pin: pin.length + ' digits',
        hasApiKey: !!DEVICE_API_KEY,
        apiKeyLength: DEVICE_API_KEY?.length 
      });

      await apiCall('/api/iot/ping', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      logger.info('Global PIN validation successful');

      return {
        success: true,
        userData: {
          deviceName: 'OGS Device',
          staffName: 'OGS Global User',
          staffId: 0, // No specific staff ID for global PIN
        },
      };
    } catch (error) {
      logger.error('Global PIN validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('401')) {
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
   * Validate teacher PIN with enhanced error handling
   * Endpoint: GET /api/iot/status
   */
  async validateTeacherPin(pin: string, staffId: number): Promise<PinValidationResult> {
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
          'X-Staff-ID': staffId.toString(),
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
   * Start activity session with multiple supervisors
   * Endpoint: POST /api/iot/session/start
   */
  async startSession(pin: string, request: SessionStartRequest): Promise<SessionStartResponse> {
    logger.info('Starting session with request:', { ...request });
    
    const response = await apiCall<{
      status: string;
      data: SessionStartResponse;
      message?: string;
    }>('/api/iot/session/start', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify(request),
    });

    return response.data;
  },

  /**
   * Get current session for device
   * Endpoint: GET /api/iot/session/current
   */
  async getCurrentSession(pin: string): Promise<CurrentSession | null> {
    try {
      const response = await apiCall<{
        status: string;
        data: CurrentSession | { device_id: number; is_active: false };
        message?: string;
      }>('/api/iot/session/current', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      // Check if we have an active session
      if ('is_active' in response.data && response.data.is_active === false) {
        return null;
      }

      // The server returns the session data directly in the data field
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
   * Update session supervisors
   * Endpoint: PUT /api/iot/session/{sessionId}/supervisors
   */
  async updateSessionSupervisors(
    pin: string,
    sessionId: number,
    supervisorIds: number[]
  ): Promise<{ supervisors: SupervisorInfo[] }> {
    const response = await apiCall<{
      status: string;
      data: {
        active_group_id: number;
        supervisors: SupervisorInfo[];
        status: string;
        message: string;
      };
      message?: string;
    }>(`/api/iot/session/${sessionId}/supervisors`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify({ supervisor_ids: supervisorIds }),
    });

    return { supervisors: response.data.supervisors };
  },

  /**
   * Get students supervised by specified teachers
   * Endpoint: GET /api/iot/students?teacher_ids=1,2,3
   */
  async getStudents(pin: string, teacherIds: number[]): Promise<Student[]> {
    // Create query parameter string
    const queryParam = teacherIds.length > 0 ? `?teacher_ids=${teacherIds.join(',')}` : '';
    
    const response = await apiCall<{
      status: string;
      data: Student[];
      message: string;
    }>(`/api/iot/students${queryParam}`, {
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
        success: boolean;
        student_id: number;
        student_name: string;
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
      success: response.data?.success ?? (response.status === 'success'),
      message: response.data?.message ?? response.message ?? 'Tag erfolgreich zugewiesen',
      student_id: response.data?.student_id,
      student_name: response.data?.student_name,
      rfid_tag: response.data?.rfid_tag,
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
    const response = await apiCall<{
      data: RfidScanResult;
      message: string;
      status: string;
    }>('/api/iot/checkin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEVICE_API_KEY}`,
        'X-Staff-PIN': pin,
      },
      body: JSON.stringify(scanData),
    });

    // Extract the actual data from the nested response
    return response.data;
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
        data: CurrentSession | { device_id: number; is_active: false };
        message: string;
      }>('/api/iot/session/current', {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      logger.debug('getCurrentSessionInfo response', { response });
      
      // Check if we have an active session
      if ('is_active' in response.data && response.data.is_active === false) {
        return null;
      }
      
      // Map the CurrentSession to the simplified format expected by the UI
      const session = response.data;
      return {
        activity_name: session.activity_name ?? 'Unknown Activity',
        room_name: session.room_name ?? 'Unknown Room',
        active_students: session.active_students ?? 0,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means no current session
      if (errorMessage.includes('404')) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get student attendance status
   * Endpoint: GET /api/iot/attendance/status/{rfid}
   */
  async getAttendanceStatus(pin: string, rfid: string): Promise<AttendanceStatusResponse> {
    try {
      const response = await apiCall<AttendanceStatusResponse>(`/api/iot/attendance/status/${rfid}`, {
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404')) {
        throw new Error('Schüler nicht gefunden oder keine Anwesenheitsdaten verfügbar');
      }
      if (errorMessage.includes('403')) {
        throw new Error('Keine Berechtigung für diesen Schüler');
      }
      throw error;
    }
  },

  /**
   * Toggle student attendance (check-in/check-out)
   * Endpoint: POST /api/iot/attendance/toggle
   */
  async toggleAttendance(
    pin: string,
    rfid: string,
    action: 'confirm' | 'cancel'
  ): Promise<AttendanceToggleResponse> {
    try {
      const response = await apiCall<AttendanceToggleResponse>('/api/iot/attendance/toggle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEVICE_API_KEY}`,
          'X-Staff-PIN': pin,
        },
        body: JSON.stringify({
          rfid,
          action,
        }),
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404')) {
        throw new Error('Schüler nicht gefunden');
      }
      if (errorMessage.includes('403')) {
        throw new Error('Keine Berechtigung für diesen Schüler');
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
 * Tag assignment check response from /api/iot/rfid/{tagId}
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
  student_id?: number;
  student_name?: string;
  rfid_tag?: string;
  previous_tag?: string;
  message?: string;
}

/**
 * RFID scan result from POST /api/iot/checkin
 */
export interface RfidScanResult {
  student_id: number;
  student_name: string;
  action: 'checked_in' | 'checked_out' | 'transferred';
  greeting?: string;
  visit_id?: number;
  room_name?: string;
  previous_room?: string;
  processed_at?: string;
  message?: string;
  status?: string;
}

/**
 * Attendance status response from GET /api/iot/attendance/status/{rfid}
 */
export interface AttendanceStatusResponse {
  status: string;
  data: {
    student: {
      id: number;
      first_name: string;
      last_name: string;
      group: {
        id: number;
        name: string;
      };
    };
    attendance: {
      status: 'checked_in' | 'checked_out' | 'not_checked_in';
      date: string;
      check_in_time: string | null;
      check_out_time: string | null;
      checked_in_by: string;
      checked_out_by: string;
    };
  };
  message: string;
}

/**
 * Attendance toggle request for POST /api/iot/attendance/toggle
 */
export interface AttendanceToggleRequest {
  rfid: string;
  action: 'confirm' | 'cancel';
}

/**
 * Attendance toggle response from POST /api/iot/attendance/toggle
 */
export interface AttendanceToggleResponse {
  status: string;
  data: {
    action: 'checked_in' | 'checked_out' | 'cancelled';
    student: {
      id: number;
      first_name: string;
      last_name: string;
      group: {
        id: number;
        name: string;
      };
    };
    attendance: {
      status: 'checked_in' | 'checked_out' | '';
      date: string;
      check_in_time: string | null;
      check_out_time: string | null;
      checked_in_by: string;
      checked_out_by: string;
    };
    message: string;
  };
  message: string;
}

/**
 * Configuration utilities
 */
export const config = {
  getApiBaseUrl: (): string => API_BASE_URL,
  getDeviceApiKey: (): string => DEVICE_API_KEY,
};
