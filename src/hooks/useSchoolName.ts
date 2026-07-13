import { useEffect, useState } from 'react';

import { getSchoolName, onSchoolNameLoaded } from '../services/api';

/**
 * Returns the school name for the device, or null while it is not yet loaded.
 * Subscribes once: if the name arrives after mount, the component updates.
 */
export function useSchoolName(): string | null {
  const [schoolName, setSchoolName] = useState<string | null>(getSchoolName());

  useEffect(() => {
    if (schoolName) return;
    return onSchoolNameLoaded(setSchoolName);
  }, [schoolName]);

  return schoolName;
}
