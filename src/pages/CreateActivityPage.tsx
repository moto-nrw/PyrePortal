import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ContentBox, Select } from '../components/ui';
import { useUserStore, ActivityCategory } from '../store/userStore';
import theme from '../styles/theme';
import { createLogger, logNavigation, logUserAction, logError } from '../utils/logger';

function CreateActivityPage() {
  const {
    users,
    selectedRoom,
    selectedUser,
    currentActivity,
    isLoading,
    error,
    initializeActivity,
    updateActivityField,
    createActivity,
    cancelActivityCreation,
    logout,
  } = useUserStore();

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  // Create logger instance for this component
  const logger = createLogger('CreateActivityPage');

  // Log component mount/unmount and initialization state
  useEffect(() => {
    logger.debug('CreateActivityPage component mounted', {
      user: selectedUser,
      hasSelectedRoom: !!selectedRoom,
      hasCurrentActivity: !!currentActivity,
    });

    // Check authentication and prerequisites
    if (!selectedUser) {
      logger.warn('Unauthenticated access to CreateActivityPage');
    }

    if (!selectedRoom) {
      logger.warn('CreateActivityPage accessed without selected room');
    }

    return () => {
      logger.debug('CreateActivityPage component unmounted');
    };
  }, [selectedUser, selectedRoom, currentActivity, logger]);

  // Initialize currentActivity with selected room if not already done
  useEffect(() => {
    if (!currentActivity && selectedRoom) {
      logger.info('Initializing new activity', {
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
      });

      performance.mark('activity-init-start');
      initializeActivity(selectedRoom.id);
      performance.mark('activity-init-end');
      performance.measure('activity-init-duration', 'activity-init-start', 'activity-init-end');

      const measure = performance.getEntriesByName('activity-init-duration')[0];
      logger.debug('Activity initialization performance', { duration_ms: measure.duration });
    } else if (!selectedRoom) {
      // Redirect to room selection if no room is selected
      logger.warn('No room selected, redirecting to room selection');
      logNavigation('CreateActivityPage', 'RoomSelectionPage', { reason: 'no_room_selected' });
      void navigate('/rooms');
    }
  }, [currentActivity, selectedRoom, initializeActivity, navigate, logger]);

  // Convert enum to array for dropdown
  const categoryOptions = Object.values(ActivityCategory).map(category => ({
    value: category,
    label: category,
  }));

  // Create supervisor options from users
  const supervisorOptions = users.map(user => ({
    value: user.id.toString(),
    label: user.name,
  }));

  // Handle input changes for regular inputs
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const { name, value } = e.target;

      logger.debug('Activity form field changed', { field: name, value });

      // Clear error for this field
      if (formErrors[name]) {
        logger.debug('Clearing validation error', { field: name, previousError: formErrors[name] });
        setFormErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }

      // Handle maxParticipants as a special case (convert to number)
      if (name === 'maxParticipants') {
        const parsedValue = value ? parseInt(value) : undefined;
        logger.debug('Setting max participants', { value: parsedValue });
        updateActivityField('maxParticipants', parsedValue);
      } else {
        updateActivityField(name as 'name', value);
      }

      logUserAction('activity_field_updated', {
        field: name,
        activity: currentActivity?.name ?? 'New Activity',
      });
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleInputChange'
      );
    }
  };

  // Handle select change for supervisor
  const handleSupervisorChange = (value: string) => {
    try {
      // Get supervisor name for logging
      const supervisorName = users.find(u => u.id.toString() === value)?.name ?? 'Unknown';
      logger.debug('Supervisor changed', { supervisorId: value, supervisorName });

      // Clear error
      if (formErrors.supervisorId) {
        logger.debug('Clearing supervisor validation error');
        setFormErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.supervisorId;
          return newErrors;
        });
      }

      updateActivityField('supervisorId', parseInt(value));
      logUserAction('activity_supervisor_changed', {
        supervisorId: value,
        supervisorName,
        activity: currentActivity?.name ?? 'New Activity',
      });
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleSupervisorChange'
      );
    }
  };

  // Handle select change for category
  const handleCategoryChange = (value: string) => {
    try {
      logger.debug('Activity category changed', { category: value });

      // Clear error
      if (formErrors.category) {
        logger.debug('Clearing category validation error');
        setFormErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.category;
          return newErrors;
        });
      }

      updateActivityField('category', value as ActivityCategory);
      logUserAction('activity_category_changed', {
        category: value,
        activity: currentActivity?.name ?? 'New Activity',
      });
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleCategoryChange'
      );
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    try {
      logger.debug('Validating activity form');
      performance.mark('form-validation-start');

      const errors: Record<string, string> = {};

      if (!currentActivity?.name) {
        errors.name = 'Bitte gib einen Namen für die Aktivität ein';
      }

      if (!currentActivity?.supervisorId) {
        errors.supervisorId = 'Bitte wähle einen Betreuer aus';
      }

      if (!currentActivity?.category) {
        errors.category = 'Bitte wähle eine Kategorie aus';
      }

      setFormErrors(errors);
      const isValid = Object.keys(errors).length === 0;

      performance.mark('form-validation-end');
      performance.measure(
        'form-validation-duration',
        'form-validation-start',
        'form-validation-end'
      );
      const measure = performance.getEntriesByName('form-validation-duration')[0];

      logger.info('Form validation complete', {
        isValid,
        errors: Object.keys(errors),
        validationTime_ms: measure.duration,
      });

      if (!isValid) {
        logUserAction('activity_validation_failed', {
          errors: Object.keys(errors),
          activity: currentActivity?.name ?? 'New Activity',
        });
      }

      return isValid;
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.validateForm'
      );
      return false;
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      logger.info('Activity form submission initiated', {
        activityName: currentActivity?.name,
        category: currentActivity?.category,
        roomId: selectedRoom?.id,
        roomName: selectedRoom?.name,
      });

      if (!validateForm()) {
        return;
      }

      // Performance tracking for activity creation
      performance.mark('activity-creation-start');

      logUserAction('activity_submission', {
        activityName: currentActivity?.name ?? 'Unnamed Activity',
        category: currentActivity?.category,
        roomId: selectedRoom?.id,
        roomName: selectedRoom?.name,
      });

      const success = await createActivity();

      performance.mark('activity-creation-end');
      performance.measure(
        'activity-creation-duration',
        'activity-creation-start',
        'activity-creation-end'
      );
      const measure = performance.getEntriesByName('activity-creation-duration')[0];

      if (success) {
        logger.info('Activity created successfully', {
          activityName: currentActivity?.name,
          duration_ms: measure.duration,
        });

        logUserAction('activity_created', {
          activityName: currentActivity?.name ?? 'Unnamed Activity',
          roomName: selectedRoom?.name,
        });

        logNavigation('CreateActivityPage', 'CheckInOutPage', {
          reason: 'activity_created_successfully',
        });

        // Navigate to the check-in-out page for student management
        void navigate('/check-in-out');
      } else {
        logger.error('Activity creation failed', {
          duration_ms: measure.duration,
          error: error ?? 'Unknown error',
        });

        logUserAction('activity_creation_failed', {
          activityName: currentActivity?.name ?? 'Unnamed Activity',
          error: error ?? 'Unknown error',
        });
      }
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleSubmit'
      );
    }
  };

  // Handle back button - now cancels the activity creation
  const handleBack = () => {
    try {
      logger.info('Activity creation cancelled by user', {
        roomId: selectedRoom?.id,
        roomName: selectedRoom?.name,
      });

      // Cancel the activity creation process and release the room
      cancelActivityCreation();

      logUserAction('activity_creation_cancelled', {
        roomId: selectedRoom?.id,
        roomName: selectedRoom?.name,
        activityName: currentActivity?.name ?? 'Unnamed Activity',
      });

      logNavigation('CreateActivityPage', 'RoomSelectionPage', { reason: 'user_cancelled' });
      void navigate('/rooms');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleBack'
      );
    }
  };

  // Handle logout
  const handleLogout = () => {
    try {
      logger.info('User logging out during activity creation', {
        user: selectedUser,
        roomId: selectedRoom?.id,
        roomName: selectedRoom?.name,
      });

      // Cancel activity creation when logging out
      cancelActivityCreation();

      logUserAction('logout_during_activity_creation', {
        username: selectedUser,
        roomName: selectedRoom?.name,
        activityProgress: currentActivity ? Object.keys(currentActivity).length : 0,
      });

      logout();

      logNavigation('CreateActivityPage', 'LoginPage');
      void navigate('/');
    } catch (error) {
      logError(
        error instanceof Error ? error : new Error(String(error)),
        'CreateActivityPage.handleLogout'
      );
    }
  };

  return (
    <ContentBox shadow="md" rounded="lg" height="95%" className="overflow-auto" centered={false}>
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1
            style={{
              fontSize: theme.fonts.size.xl,
              fontWeight: theme.fonts.weight.bold,
            }}
          >
            Aktivität erstellen
          </h1>
          <div className="flex items-center">
            <p className="mr-3 font-medium text-[#396cd8]">{selectedUser}</p>
            <div className="flex gap-2">
              <Button onClick={handleLogout} variant="outline" size="small">
                Abmelden
              </Button>
            </div>
          </div>
        </div>

        {/* Room Info */}
        {selectedRoom && (
          <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="font-medium text-blue-800">Raum: {selectedRoom.name}</p>
          </div>
        )}

        {/* Error message from store */}
        {error && (
          <div className="mb-6 rounded-md bg-red-100 p-3 text-center text-red-800">{error}</div>
        )}

        {/* Activity Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Activity Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              Aktivitätsname*
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={currentActivity?.name ?? ''}
              onChange={handleInputChange}
              className={`w-full rounded-md border px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                formErrors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Name der Aktivität"
            />
            {formErrors.name && <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>}
          </div>

          {/* Supervisor */}
          <div>
            <label htmlFor="supervisorId" className="mb-1 block text-sm font-medium text-gray-700">
              Betreuer*
            </label>
            <Select
              id="supervisorId"
              name="supervisorId"
              value={currentActivity?.supervisorId?.toString() ?? ''}
              onChange={handleSupervisorChange}
              options={supervisorOptions}
              placeholder="Betreuer auswählen"
              error={formErrors.supervisorId}
            />
            {formErrors.supervisorId && (
              <p className="mt-1 text-sm text-red-600">{formErrors.supervisorId}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">
              Kategorie*
            </label>
            <Select
              id="category"
              name="category"
              value={currentActivity?.category ?? ''}
              onChange={handleCategoryChange}
              options={categoryOptions}
              placeholder="Kategorie auswählen"
              error={formErrors.category}
            />
            {formErrors.category && (
              <p className="mt-1 text-sm text-red-600">{formErrors.category}</p>
            )}
          </div>

          {/* Max Participants */}
          <div>
            <label
              htmlFor="maxParticipants"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Maximale Teilnehmerzahl (optional)
            </label>
            <input
              type="number"
              id="maxParticipants"
              name="maxParticipants"
              min="1"
              value={currentActivity?.maxParticipants ?? ''}
              onChange={handleInputChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Maximale Anzahl an Teilnehmern"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-between pt-4">
            <Button onClick={handleBack} variant="outline" size="medium" type="button">
              Abbrechen
            </Button>

            <Button variant="secondary" size="medium" type="submit" disabled={isLoading}>
              {isLoading ? 'Wird erstellt...' : 'Aktivität erstellen'}
            </Button>
          </div>
        </form>
      </div>
    </ContentBox>
  );
}

export default CreateActivityPage;
