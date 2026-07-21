/**
 * API Service for PyrePortal
 * Handles all communication with the backend API
 *
 * Split into modules: error mapping lives in ./apiErrors, the HTTP client and
 * auth headers in ./apiClient, school-name state in ./schoolName. This module
 * keeps the endpoint methods and types and re-exports the public surface so
 * existing imports keep working.
 */

import { createLogger } from '../utils/logger';

import { apiCall, buildAuthHeaders, getApiBaseUrl, hasDeviceApiKey } from './apiClient';
import { isNotFoundError, mapAttendanceErrorToGerman, mapServerErrorToGerman } from './apiErrors';

export {
  ApiError,
  formatRoomName,
  getNetworkErrorMessage,
  isNetworkRelatedError,
  isNotFoundError,
  isWCRoomAlias,
  mapApiErrorToGerman,
  mapServerErrorToGerman,
  WC_ROOM_ALIASES,
} from './apiErrors';
export { initializeApi, setNetworkStatusCallback } from './apiClient';
export { fetchSchoolName, getSchoolName, onSchoolNameLoaded } from './schoolName';

const logger = createLogger('API');

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
  is_occupied?: boolean;
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
interface SupervisorInfo {
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

export type StaffClockAction = 'checkin' | 'checkout' | 'break_start' | 'break_end';
type StaffClockStateName = 'checked_out' | 'checked_in' | 'on_break';
type WorkSessionStatus = 'present' | 'home_office';

interface StaffClockSession {
  id: number;
  staff_id: number;
  check_in_time: string;
  check_out_time?: string;
  status: WorkSessionStatus;
  source: 'app' | 'nfc';
}

export interface StaffClockState {
  staff_id: number;
  staff_name: string;
  state: StaffClockStateName;
  allowed_actions: StaffClockAction[];
  session?: StaffClockSession;
  active_break?: {
    id: number;
    started_at: string;
  };
  net_minutes: number;
  break_minutes: number;
  required_break_minutes: number;
  is_break_compliant: boolean;
}

export interface StaffClockCommand {
  rfid_tag: string;
  action: StaffClockAction;
  status?: WorkSessionStatus;
  reason?: string;
  planned_duration_minutes?: number;
}

/**
 * API functions
 */
export const api = {
  /**
   * Get the current time-tracking state for a scanned staff card.
   *
   * `staffId` is the employee the card belongs to and is sent as X-Staff-ID so
   * the request carries its actor. It is unknown on the very first read of a
   * card — resolving the tag to a person is what that read is for — and is
   * passed on every later read of a card already identified.
   */
  async getStaffClockState(
    pin: string,
    rfidTag: string,
    staffId?: number
  ): Promise<StaffClockState> {
    const response = await apiCall<{ status: string; data: StaffClockState }>(
      '/api/iot/staff-clock/state',
      {
        method: 'POST',
        headers: buildAuthHeaders(pin, staffId),
        body: JSON.stringify({ rfid_tag: rfidTag }),
      }
    );
    return response.data;
  },

  /**
   * Execute one NFC staff clock action and return the authoritative new state.
   *
   * `staffId` is the employee being stamped, taken from the state read that the
   * scan produced, and travels as X-Staff-ID alongside the command.
   */
  async executeStaffClockAction(
    pin: string,
    command: StaffClockCommand,
    staffId?: number
  ): Promise<StaffClockState> {
    const response = await apiCall<{ status: string; data: StaffClockState }>(
      '/api/iot/staff-clock',
      {
        method: 'POST',
        headers: buildAuthHeaders(pin, staffId),
        body: JSON.stringify(command),
      }
    );
    return response.data;
  },

  /**
   * Get teachers list (device authenticated)
   * Endpoint: GET /api/iot/teachers
   */
  async getTeachers(): Promise<Teacher[]> {
    const response = await apiCall<TeacherResponse>('/api/iot/teachers', {
      headers: buildAuthHeaders(),
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
        hasApiKey: hasDeviceApiKey(),
      });

      await apiCall('/api/iot/ping', {
        method: 'POST',
        headers: buildAuthHeaders(pin),
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
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Global PIN validation failed', {
        error: errorMessage,
      });

      // Use the error mapping function for user-friendly messages
      const userMessage = mapServerErrorToGerman(errorMessage);

      return {
        success: false,
        error: userMessage,
      };
    }
  },

  /**
   * Get teacher's activities for today
   * Endpoint: GET /api/iot/activities
   */
  async getActivities(pin: string): Promise<ActivityResponse[]> {
    const response = await apiCall<ActivitiesResponse>('/api/iot/activities', {
      headers: buildAuthHeaders(pin),
    });

    return response.data;
  },

  /**
   * Device health check (unauthenticated)
   * Endpoint: GET /health
   * Note: Returns plain text "OK", not JSON, so we don't use apiCall
   */
  async healthCheck(): Promise<void> {
    const response = await fetch(`${getApiBaseUrl()}/health`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    // Response is plain text "OK", not JSON - no parsing needed
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

    const queryString = params.toString();
    const queryPart = queryString ? `?${queryString}` : '';
    const endpoint = `/api/iot/rooms/available${queryPart}`;

    const response = await apiCall<RoomsResponse>(endpoint, {
      headers: buildAuthHeaders(pin),
    });

    return response.data;
  },

  /**
   * Start activity session with multiple supervisors
   * Endpoint: POST /api/iot/session/start
   */
  async startSession(pin: string, request: SessionStartRequest): Promise<SessionStartResponse> {
    logger.info('Starting session', { ...request });

    const response = await apiCall<{
      status: string;
      data: SessionStartResponse;
      message?: string;
    }>('/api/iot/session/start', {
      method: 'POST',
      headers: buildAuthHeaders(pin),
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
        headers: buildAuthHeaders(pin),
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
      if (isNotFoundError(error, errorMessage)) {
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
      headers: buildAuthHeaders(pin),
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
      headers: buildAuthHeaders(pin),
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
      headers: buildAuthHeaders(pin),
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
        headers: buildAuthHeaders(pin),
      });

      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 404 means tag is not assigned, which is fine
      if (isNotFoundError(error, errorMessage)) {
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
      headers: buildAuthHeaders(pin),
      body: JSON.stringify({
        rfid_tag: tagId,
      }),
    });

    // Transform the API response to match our expected TagAssignmentResult interface
    return {
      success: response.data?.success ?? response.status === 'success',
      message: response.data?.message ?? response.message ?? 'Tag erfolgreich zugewiesen',
      student_id: response.data?.student_id,
      student_name: response.data?.student_name,
      rfid_tag: response.data?.rfid_tag,
      previous_tag: response.data?.previous_tag,
    };
  },

  /**
   * Assign RFID tag to staff member
   * Endpoint: POST /api/iot/staff/{staffId}/rfid
   */
  async assignStaffTag(pin: string, staffId: number, tagId: string): Promise<TagAssignmentResult> {
    const response = await apiCall<{
      status: string;
      data?: {
        success: boolean;
        staff_id: number;
        staff_name: string;
        rfid_tag: string;
        previous_tag?: string;
        message?: string;
      };
      message?: string;
    }>(`/api/iot/staff/${staffId}/rfid`, {
      method: 'POST',
      headers: buildAuthHeaders(pin, staffId),
      body: JSON.stringify({
        rfid_tag: tagId,
      }),
    });

    return {
      success: response.data?.success ?? response.status === 'success',
      message: response.data?.message ?? response.message ?? 'Tag erfolgreich zugewiesen',
      student_id: response.data?.staff_id,
      student_name: response.data?.staff_name,
      rfid_tag: response.data?.rfid_tag,
      previous_tag: response.data?.previous_tag,
    };
  },

  /**
   * Remove RFID tag from staff member
   * Endpoint: DELETE /api/iot/staff/{staffId}/rfid
   */
  async unassignStaffTag(pin: string, staffId: number): Promise<TagAssignmentResult> {
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
    }>(`/api/iot/staff/${staffId}/rfid`, {
      method: 'DELETE',
      headers: buildAuthHeaders(pin, staffId),
    });

    return {
      success: response.data?.success ?? response.status === 'success',
      message: response.data?.message ?? response.message,
      student_id: response.data?.student_id,
      student_name: response.data?.student_name,
      rfid_tag: response.data?.rfid_tag,
      previous_tag: response.data?.previous_tag,
    };
  },

  /**
   * Remove RFID tag from student
   * Endpoint: DELETE /api/students/{studentId}/rfid
   */
  async unassignStudentTag(pin: string, studentId: number): Promise<TagAssignmentResult> {
    const response = await apiCall<{
      status: string;
      data?: {
        success: boolean;
        student_id: number;
        student_name: string;
        rfid_tag: string;
        message: string;
      };
      message?: string;
    }>(`/api/students/${studentId}/rfid`, {
      method: 'DELETE',
      headers: buildAuthHeaders(pin),
    });

    return {
      success: response.data?.success ?? response.status === 'success',
      student_id: response.data?.student_id,
      student_name: response.data?.student_name,
      rfid_tag: response.data?.rfid_tag,
      message: response.data?.message ?? response.message,
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
      headers: buildAuthHeaders(pin),
      body: JSON.stringify(scanData),
    });

    // Extract the actual data from the nested response
    const result = response.data;

    // Normalize backend action: checked_out_daily → checked_out + daily_checkout_available
    // Student is checked out and eligible for "nach Hause" (daily checkout)
    if ((result.action as string) === 'checked_out_daily') {
      result.action = 'checked_out';
      result.daily_checkout_available = true;
    }

    return result;
  },

  /**
   * Query pickup info without mutating attendance
   * Endpoint: POST /api/iot/pickup-query
   */
  async queryPickupInfo(
    scanData: {
      student_rfid: string;
    },
    pin: string
  ): Promise<RfidScanResult> {
    const response = await apiCall<{
      data: RfidScanResult;
      message: string;
      status: string;
    }>('/api/iot/pickup-query', {
      method: 'POST',
      headers: buildAuthHeaders(pin),
      body: JSON.stringify(scanData),
    });

    return response.data;
  },

  /**
   * Update session activity to prevent timeout
   * Endpoint: POST /api/iot/session/activity
   */
  async updateSessionActivity(pin: string): Promise<void> {
    await apiCall('/api/iot/session/activity', {
      method: 'POST',
      headers: buildAuthHeaders(pin),
      body: JSON.stringify({
        activity_type: 'rfid_scan', // Changed from 'student_scan' to 'rfid_scan'
        timestamp: new Date().toISOString(),
      }),
    });
  },

  /**
   * Toggle student attendance (check-in/check-out)
   * Endpoint: POST /api/iot/attendance/toggle
   */
  async toggleAttendance(
    pin: string,
    rfid: string,
    action: 'confirm' | 'cancel' | 'confirm_daily_checkout',
    destination?: 'zuhause' | 'unterwegs'
  ): Promise<AttendanceToggleResponse> {
    try {
      const body: { rfid: string; action: string; destination?: string } = {
        rfid,
        action,
      };

      // Add destination for confirm_daily_checkout action
      if (action === 'confirm_daily_checkout' && destination) {
        body.destination = destination;
      }

      const response = await apiCall<AttendanceToggleResponse>('/api/iot/attendance/toggle', {
        method: 'POST',
        headers: buildAuthHeaders(pin),
        body: JSON.stringify(body),
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(mapAttendanceErrorToGerman(errorMessage, 'toggle'));
    }
  },

  /**
   * Submit daily feedback when student checks out for the day
   * Endpoint: POST /api/iot/feedback
   */
  async submitDailyFeedback(
    pin: string,
    feedback: DailyFeedbackRequest
  ): Promise<DailyFeedbackResponse> {
    try {
      const response = await apiCall<DailyFeedbackResponse>('/api/iot/feedback', {
        method: 'POST',
        headers: buildAuthHeaders(pin),
        body: JSON.stringify(feedback),
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(mapAttendanceErrorToGerman(errorMessage, 'feedback'));
    }
  },

  /**
   * Get device configuration (checkout button visibility, feedback settings)
   * Endpoint: GET /api/iot/config
   * Auth: Device API key only (no PIN required)
   */
  async getDeviceConfig(): Promise<DeviceConfig> {
    const response = await apiCall<{ status: string; data: DeviceConfig }>('/api/iot/config', {
      headers: buildAuthHeaders(),
    });

    return response.data;
  },
};

/**
 * Device configuration returned by GET /api/iot/config.
 * Controls which buttons appear on the checkout screen and whether feedback is shown.
 */
export interface DeviceConfig {
  presence_mode: 'detailed' | 'binary';
  checkout: {
    raumwechsel_enabled: boolean;
    schulhof_enabled: boolean;
    wc_enabled: boolean;
    /** "HH:MM" or null (null = "nach Hause" always available) */
    daily_checkout_time: string | null;
  };
  feedback: {
    enabled: boolean;
  };
}

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
  person_type?: 'student' | 'staff';
  person?: {
    id: number;
    person_id: number;
    name: string;
    group: string;
  };
}

/**
 * Tag assignment result from POST /api/students/{studentId}/rfid
 */
interface TagAssignmentResult {
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
  student_id: number | null;
  student_name: string;
  action:
    | 'checked_in'
    | 'checked_out'
    | 'transferred'
    | 'pickup_info'
    | 'supervisor_authenticated'
    | 'error'
    | 'already_in';
  greeting?: string;
  /** Whether the student is eligible for daily checkout ("nach Hause") */
  daily_checkout_available?: boolean;
  /** Whether the feedback modal should be shown after daily checkout */
  feedback_enabled?: boolean;
  /** Today's scheduled pickup time in HH:MM format (e.g. "15:30") */
  pickup_time?: string;
  /** Optional pickup note for the current day */
  pickup_note?: string;
  visit_id?: number;
  room_name?: string;
  previous_room?: string;
  processed_at?: string;
  message?: string;
  status?: string;
  /** Indicates this result should be displayed as an error state */
  showAsError?: boolean;
  /** Indicates this result is informational (not a scan result) */
  isInfo?: boolean;
  /** The RFID tag that was scanned (added by frontend, not from server) */
  scannedTagId?: string;
  /** Authoritative count of active students in the room's session (from server) */
  active_students?: number;
}

/**
 * Attendance toggle response from POST /api/iot/attendance/toggle
 */
interface AttendanceToggleResponse {
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
    /** Whether the feedback modal should be shown after daily checkout */
    feedback_enabled?: boolean;
  };
  message: string;
}

/**
 * Daily feedback rating type - matches backend enum validation
 */
export type DailyFeedbackRating = 'positive' | 'neutral' | 'negative';

/**
 * Feedback submission request for POST /api/iot/feedback
 */
interface DailyFeedbackRequest {
  student_id: number;
  value: DailyFeedbackRating;
}

/**
 * Feedback submission response from POST /api/iot/feedback
 */
interface DailyFeedbackResponse {
  status: string;
  message: string;
  data?: {
    id: number;
    student_id: number;
    value: string;
    day: string; // "2025-10-12"
    time: string; // "15:30:45"
    created_at: string; // ISO 8601
  };
}
