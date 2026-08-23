export function createListPath(pathname: string, parameters: URLSearchParams) {
  const query = parameters.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function createCursorPagePath(input: {
  pathname: string;
  search: string;
  cursor: string | null;
}) {
  const parameters = new URLSearchParams(input.search);

  if (input.cursor) {
    parameters.set("cursor", input.cursor);
  } else {
    parameters.delete("cursor");
  }

  return createListPath(input.pathname, parameters);
}
