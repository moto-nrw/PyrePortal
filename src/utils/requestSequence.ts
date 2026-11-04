let lastSequence = 0;

/**
 * Monotonic order of kiosk requests. Taken when a request starts, so answers
 * that arrive late can be recognised as older than a value already shown.
 */
export const nextRequestSequence = (): number => ++lastSequence;

/** Sequence of the latest started request; everything up to it is older. */
export const currentRequestSequence = (): number => lastSequence;
