import { useEffect, useState } from "react";
import { useLocation } from "wouter";

type PublicSeoSettings = {
  title: string;
  description: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  gaTag: string;
  gscCode: string;
  siteUrl: string;
};

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function absoluteUrl(value: string, baseUrl: string): string {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

/**
 * 公開設定をブラウザのheadに同期する。
 * 静的HTMLには安全な既定値を残し、管理者の保存後は次のページ表示から反映する。
 */
export function PublicSeo() {
  const [location] = useLocation();
  const [settings, setSettings] = useState<PublicSeoSettings | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}api/public/seo`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("SEO settings unavailable")))
      .then((value: PublicSeoSettings) => setSettings(value))
      .catch(error => {
        if (error.name !== "AbortError") console.warn("[seo] public settings could not be loaded");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!settings) return;
    const baseUrl = settings.siteUrl || window.location.origin;
    const canonical = absoluteUrl(location || "/", baseUrl);
    const image = absoluteUrl(settings.ogImage || "/og-image.jpg", baseUrl);
    const title = settings.title;
    const description = settings.description;

    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "keywords", settings.keywords);
    setMeta("property", "og:title", settings.ogTitle || title);
    setMeta("property", "og:description", settings.ogDescription || description);
    setMeta("property", "og:site_name", "Chat VAN");
    setMeta("property", "og:locale", "ja_JP");
    setMeta("property", "og:image", image);
    setMeta("property", "og:image:alt", "Chat VANのロゴ");
    setMeta("property", "og:url", canonical);
    setMeta("name", "twitter:title", settings.ogTitle || title);
    setMeta("name", "twitter:description", settings.ogDescription || description);
    setMeta("name", "twitter:image", image);
    setMeta("name", "twitter:image:alt", "Chat VANのロゴ");

    let canonicalLink = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;

    const verificationCode = settings.gscCode.replace(/^google-site-verification=/i, "").trim();
    if (verificationCode) setMeta("name", "google-site-verification", verificationCode);

    const analyticsScriptId = "chat-van-google-analytics";
    const prior = document.getElementById(analyticsScriptId);
    if (settings.gaTag && !prior) {
      const script = document.createElement("script");
      script.id = analyticsScriptId;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(settings.gaTag)}`;
      document.head.appendChild(script);
      window.dataLayer = window.dataLayer || [];
      const dataLayer = window.dataLayer;
      window.gtag = window.gtag || function gtag(...args: unknown[]) { dataLayer.push(args); };
      window.gtag("js", new Date());
      window.gtag("config", settings.gaTag);
    }
  }, [location, settings]);

  return null;
}

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}