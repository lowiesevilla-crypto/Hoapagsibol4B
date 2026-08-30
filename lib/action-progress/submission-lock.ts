export type SubmissionLock = {
  acquire: () => boolean;
  release: () => void;
  isLocked: () => boolean;
};

/**
 * A synchronous, browser-neutral lock used before React's pending state renders.
 * The first submission acquires the lock; every repeated click/Enter attempt is
 * rejected until the request settles or the component unmounts.
 */
export function createSubmissionLock(): SubmissionLock {
  let locked = false;

  return {
    acquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
}
