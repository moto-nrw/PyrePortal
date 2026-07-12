// UI request state (isLoading/error). Written by other slices via the shared set().
export const createUiSlice = () => ({
  // Initial state
  isLoading: false,
  error: null,
});
