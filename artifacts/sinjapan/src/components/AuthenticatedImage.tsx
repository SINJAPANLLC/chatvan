import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';

type AuthenticatedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallback?: ReactNode;
};

/**
 * Renders an image returned by an authenticated API endpoint.
 *
 * Browser <img> requests cannot include the Bearer token stored in localStorage.
 * Fetch the file with that token first, then render a short-lived object URL.
 */
export function AuthenticatedImage({ src, fallback = null, ...imageProps }: AuthenticatedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (typeof src !== 'string' || !src) {
      setObjectUrl(null);
      setFailed(true);
      return;
    }

    const controller = new AbortController();
    let nextObjectUrl: string | null = null;

    setObjectUrl(null);
    setFailed(false);

    void fetch(src, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('sinjapan_auth_token') ?? ''}`,
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Image request failed with ${response.status}`);
        }
        nextObjectUrl = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted) {
          setObjectUrl(nextObjectUrl);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('[image] Failed to load protected image', error);
          setFailed(true);
        }
      });

    return () => {
      controller.abort();
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [src]);

  if (failed || !objectUrl) {
    return <>{fallback}</>;
  }

  return <img {...imageProps} src={objectUrl} />;
}