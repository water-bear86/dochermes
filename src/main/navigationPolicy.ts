export function createAllowedNavigationChecker(
  rendererUrl?: string,
  packagedRendererFile?: string
): (navigationUrl: string) => boolean {
  if (rendererUrl) {
    const rendererOrigin = toOrigin(rendererUrl);
    return (navigationUrl) => Boolean(rendererOrigin) && toOrigin(navigationUrl) === rendererOrigin;
  }

  if (packagedRendererFile) {
    const allowedUrl = toFileUrl(packagedRendererFile);
    return (navigationUrl) => Boolean(allowedUrl) && normalizeUrl(navigationUrl) === allowedUrl;
  }

  return () => false;
}

function toFileUrl(path: string): string | undefined {
  try {
    return new URL(`file://${path.startsWith('/') ? '' : '/'}${path}`).toString();
  } catch {
    return undefined;
  }
}

function normalizeUrl(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).toString();
  } catch {
    return undefined;
  }
}

function toOrigin(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
}
