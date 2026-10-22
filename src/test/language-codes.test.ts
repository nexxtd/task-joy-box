import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveLanguageCode,
  canonicalLanguageCode,
  canonicalLanguageName,
  languageDisplayName,
  migrateStoredLanguage,
} from "@/i18n/translations";
import { isHeaderValueSafe } from "@/context/LanguageContext";
import { normalizeLanguageCode } from "../../server/lib/language";

// Regression tests for the blank-page bug: localStorage used to store the
// DISPLAY NAME ("中文") instead of the language code ("zh"), and the fetch
// wrapper put it into the X-UI-Language header. Browsers only allow
// ISO-8859-1 in header values, so Headers.set() threw on every request and
// the whole app went blank (including the login page).

describe("resolveLanguageCode", () => {
  it("accepts language codes", () => {
    expect(resolveLanguageCode("en")).toBe("en");
    expect(resolveLanguageCode("zh")).toBe("zh");
    expect(resolveLanguageCode("AR")).toBe("ar");
  });

  it("resolves native display names (the legacy stored values)", () => {
    expect(resolveLanguageCode("中文")).toBe("zh");
    expect(resolveLanguageCode("日本語")).toBe("ja");
    expect(resolveLanguageCode("한국어")).toBe("ko");
    expect(resolveLanguageCode("العربية")).toBe("ar");
    expect(resolveLanguageCode("Русский")).toBe("ru");
    expect(resolveLanguageCode("हिन्दी")).toBe("hi");
    expect(resolveLanguageCode("English")).toBe("en");
    expect(resolveLanguageCode("Español")).toBe("es");
  });

  it("resolves legacy English names", () => {
    expect(resolveLanguageCode("Chinese")).toBe("zh");
    expect(resolveLanguageCode("Spanish")).toBe("es");
  });

  it("returns null for missing or garbage values", () => {
    expect(resolveLanguageCode(null)).toBeNull();
    expect(resolveLanguageCode(undefined)).toBeNull();
    expect(resolveLanguageCode("")).toBeNull();
    expect(resolveLanguageCode("   ")).toBeNull();
    expect(resolveLanguageCode("not-a-language")).toBeNull();
  });
});

describe("canonicalLanguageCode", () => {
  it("falls back to English for anything unknown", () => {
    expect(canonicalLanguageCode(null)).toBe("en");
    expect(canonicalLanguageCode("garbage")).toBe("en");
    expect(canonicalLanguageCode("中文")).toBe("zh");
  });
});

describe("languageDisplayName / canonicalLanguageName", () => {
  it("maps codes to display names", () => {
    expect(languageDisplayName("zh")).toBe("中文");
    expect(languageDisplayName("xx" as never)).toBe("English");
  });

  it("canonicalLanguageName normalizes legacy values to display names", () => {
    expect(canonicalLanguageName("zh")).toBe("中文");
    expect(canonicalLanguageName("中文")).toBe("中文");
  });
});

describe("migrateStoredLanguage (startup migration)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("converts legacy display-name values to codes", () => {
    localStorage.setItem("language", "中文");
    migrateStoredLanguage();
    expect(localStorage.getItem("language")).toBe("zh");

    localStorage.setItem("language", "Русский");
    migrateStoredLanguage();
    expect(localStorage.getItem("language")).toBe("ru");
  });

  it("clears unrecognized values so the app falls back to English", () => {
    localStorage.setItem("language", "💥💥💥");
    migrateStoredLanguage();
    expect(localStorage.getItem("language")).toBeNull();
  });

  it("leaves already-migrated codes untouched", () => {
    localStorage.setItem("language", "ja");
    migrateStoredLanguage();
    expect(localStorage.getItem("language")).toBe("ja");
  });
});

describe("isHeaderValueSafe (fetch wrapper header guard)", () => {
  it("rejects non ISO-8859-1 values that would make Headers.set throw", () => {
    expect(isHeaderValueSafe("中文")).toBe(false);
    expect(isHeaderValueSafe("日本語")).toBe(false);
    expect(isHeaderValueSafe("العربية")).toBe(false);
    expect(isHeaderValueSafe("Русский")).toBe(false);
    expect(isHeaderValueSafe("हिन्दी")).toBe(false);
  });

  it("accepts language codes and Latin-1 text", () => {
    expect(isHeaderValueSafe("zh")).toBe(true);
    expect(isHeaderValueSafe("en")).toBe(true);
    expect(isHeaderValueSafe("es")).toBe(true);
    expect(isHeaderValueSafe("Español")).toBe(true); // ñ is U+00F1
  });

  it("a guarded Headers.set never throws for a bad value", () => {
    const h = new Headers();
    const value = "中文";
    if (isHeaderValueSafe(value)) h.set("X-UI-Language", value); // dropped, no throw
    expect(h.has("X-UI-Language")).toBe(false);
  });
});

describe("normalizeLanguageCode (server-side account storage)", () => {
  it("stores codes as-is", () => {
    expect(normalizeLanguageCode("zh")).toBe("zh");
    expect(normalizeLanguageCode(" en ")).toBe("en");
  });

  it("normalizes legacy display names so old accounts self-heal", () => {
    expect(normalizeLanguageCode("中文")).toBe("zh");
    expect(normalizeLanguageCode("English")).toBe("en");
    expect(normalizeLanguageCode("Español")).toBe("es");
  });

  it("falls back to English for anything invalid", () => {
    expect(normalizeLanguageCode(undefined)).toBe("en");
    expect(normalizeLanguageCode("")).toBe("en");
    expect(normalizeLanguageCode("nope")).toBe("en");
  });
});
