/** Catch-all ingest route. See route.js for why this exists alongside the middleware. */
export const prerender: false;
export function ALL(context: {
  request: Request;
  clientAddress?: string;
}): Promise<Response>;
