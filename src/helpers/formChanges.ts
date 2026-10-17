import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";

type Comparable = unknown;

// Missing, null, "" and false all mean "nothing entered": an input that
// registers late (undefined, then "") or an untouched checkbox (undefined,
// then false) is not a change.
const isBlank = (value: Comparable) =>
  value === undefined || value === null || value === "" || value === false;

const withoutBlanks = (value: Comparable): Comparable => {
  if (Array.isArray(value)) return value.map(withoutBlanks);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => !isBlank(entry))
        .map(([key, entry]) => [key, withoutBlanks(entry)]),
    );
  }
  return value;
};

/**
 * Whether editable state differs meaningfully from the snapshot it started
 * from. Compares by value, so changing something and changing it back is no
 * change. Callers pass only what would be saved (no React keys or UI flags).
 */
export const hasFormChanges = (
  baseline: Comparable,
  current: Comparable,
): boolean => !isEqual(withoutBlanks(baseline), withoutBlanks(current));

/**
 * A copy of form values to compare against later. Deep, because
 * react-hook-form updates nested values (e.g. `terminology.memberSingular`)
 * in place: a shallow copy would change along with the edits it should catch.
 */
export const snapshotOf = <T>(values: T): T => cloneDeep(values);
