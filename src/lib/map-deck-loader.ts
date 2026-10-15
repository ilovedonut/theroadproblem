/** Drain a viewport using keyset pages. The caller owns cancellation and rendering. */
export async function loadMapDeckPages<T extends { id: string }>(options: {
  params: URLSearchParams;
  signal: AbortSignal;
  fetchPage?: typeof fetch;
  onPage: (data: any, roads: T[], complete: boolean) => void;
}) {
  const fetchPage = options.fetchPage || fetch;
  const params = new URLSearchParams(options.params);
  const roads = new Map<string, T>();
  const cursors = new Set<string>();
  while (!options.signal.aborted) {
    const response = await fetchPage(`/api/v1/map/deck?${params}`, {
      cache: 'no-store', signal: options.signal,
    });
    if (!response.ok) throw new Error('Road loading failed. Please retry.');
    const data = await response.json();
    if (options.signal.aborted) return;
    for (const road of data.roads || []) roads.set(road.id, road);
    const pagination = data.pagination;
    const more = pagination?.has_more === true;
    options.onPage(data, [...roads.values()], !more);
    if (!more) return;
    const next = pagination.next_cursor;
    if (typeof next !== 'string' || !next || cursors.has(next)) {
      throw new Error('Road loading stopped before this area was complete. Please retry.');
    }
    cursors.add(next);
    params.set('cursor', next);
  }
}
