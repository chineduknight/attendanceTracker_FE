/**
 * The View Members list in the address: the name search and the option-field
 * filters, so a refresh — or Back from a member — returns to the same working
 * list instead of every member again. Field names and option values are
 * storage keys; display labels never enter the address.
 *
 * Each selected value gets its own repeated `filter.<field>` param: option
 * values may contain commas, so they are never joined into one value.
 */
export interface MemberListState {
  /** The name search on screen. */
  q: string;
  /** Selected option values, keyed by member-field storage key. */
  filters: Record<string, string[]>;
}

const FILTER_PARAM = "filter.";

/** Reads the list state; unrelated params are ignored and duplicate values dropped. */
export const readMemberListParams = (
  params: URLSearchParams,
): MemberListState => {
  const filters: Record<string, string[]> = {};
  params.forEach((value, key) => {
    if (!key.startsWith(FILTER_PARAM)) return;
    const field = key.slice(FILTER_PARAM.length);
    if (!field || !value) return;
    const values = filters[field] ?? (filters[field] = []);
    if (!values.includes(value)) values.push(value);
  });
  return { q: params.get("q") ?? "", filters };
};

/**
 * Writes the list state over `base` (the rest of the address), replacing the
 * params it owns. Empty values are omitted, so a cleared list has a clean
 * address rather than a bare `?q=`.
 */
export const writeMemberListParams = (
  state: MemberListState,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams => {
  const params = new URLSearchParams(base);
  Array.from(new Set(params.keys()))
    .filter((key) => key === "q" || key.startsWith(FILTER_PARAM))
    .forEach((key) => params.delete(key));
  if (state.q) params.set("q", state.q);
  Object.entries(state.filters).forEach(([field, values]) => {
    values.forEach((value) => params.append(`${FILTER_PARAM}${field}`, value));
  });
  return params;
};

/**
 * A saved link can outlive the model it names. Keeping a filter for a field or
 * option the organisation no longer offers would hide every member with no
 * visible control to undo it, so those values are dropped instead.
 */
export const reconcileMemberListFilters = (
  filters: Record<string, string[]>,
  fields: { name: string; options: string[] }[],
): Record<string, string[]> => {
  const optionsByField = new Map(
    fields.map((field) => [field.name, new Set(field.options)]),
  );
  const reconciled: Record<string, string[]> = {};
  Object.entries(filters).forEach(([field, values]) => {
    const options = optionsByField.get(field);
    if (!options) return;
    const kept = values.filter((value) => options.has(value));
    if (kept.length) reconciled[field] = kept;
  });
  return reconciled;
};
