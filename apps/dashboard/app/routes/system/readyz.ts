export function loader() {
  return Response.json(
    {
      ok: true,
      service: "@cascade/dashboard",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
