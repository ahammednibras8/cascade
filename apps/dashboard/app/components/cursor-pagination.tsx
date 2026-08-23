import { Link } from "react-router";
import { createCursorPagePath } from "~/lib/pagination/cursor-pagination";

type CursorPaginationProps = {
  ariaLabel: string;
  pathname: string;
  search: string;
  itemCount: number;
  itemLabel: string;
  pagination: {
    nextCursor: string | null;
    totalCount: number;
  };
};

export function CursorPagination({
  ariaLabel,
  pathname,
  search,
  itemCount,
  itemLabel,
  pagination,
}: CursorPaginationProps) {
  const hasCursor = new URLSearchParams(search).has("cursor");
  const nextPagePath = pagination.nextCursor
    ? createCursorPagePath({
        pathname,
        search,
        cursor: pagination.nextCursor,
      })
    : null;

  if (pagination.totalCount === 0) {
    return null;
  }

  return (
    <nav aria-label={ariaLabel} className="mt-4 flex items-center justify-between gap-4 text-sm">
      <p className="text-gray-600">
        Showing {itemCount} {itemLabel}
        {itemCount === 1 ? "" : "s"} on this page · {pagination.totalCount} total
      </p>

      <div className="flex items-center gap-2">
        {hasCursor ? (
          <Link
            to={createCursorPagePath({
              pathname,
              search,
              cursor: null,
            })}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-900"
          >
            First page
          </Link>
        ) : null}

        {nextPagePath ? (
          <Link to={nextPagePath} className="rounded-md bg-black px-3 py-2 font-medium text-white">
            Next page
          </Link>
        ) : (
          <span className="px-3 py-2 text-gray-500">End of list</span>
        )}
      </div>
    </nav>
  );
}
