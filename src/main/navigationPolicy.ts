export function createAllowedNavigationChecker(rendererUrl?: string): (navigationUrl: string) => boolean {
  if (rendererUrl) {
    const rendererOrigin = toOrigin(rendererUrl);
    return (navigationUrl) => Boolean(rendererOrigin) && toOrigin(navigationUrl) === rendererOrigin;
  }

  return (navigationUrl) => toProtocol(navigationUrl) === 'file:';
}

function toOrigin(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
}

function toProtocol(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).protocol;
  } catch {
    return undefined;
  }
}
