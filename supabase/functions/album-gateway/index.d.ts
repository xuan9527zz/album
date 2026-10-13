export function handleAlbumGateway(
  request: Request,
  upstreamFetch?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response>;
