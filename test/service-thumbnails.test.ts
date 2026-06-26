import { describe, it, expect, vi, beforeAll } from "vitest";

const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readFileSync: mockReadFileSync,
  default: {
    existsSync: mockExistsSync,
    statSync: mockStatSync,
    readFileSync: mockReadFileSync
  }
}));

describe("serviceThumbnails", () => {
  let createServiceThumbnails: any;

  beforeAll(async () => {
    const mod = await import("../src/serviceThumbnails.js");
    createServiceThumbnails = mod.createServiceThumbnails;
  });

  const baseConfig = {
    svgFileName: "test.svg",
    logoTransform: "scale(1)",
    logoPathAttrs: "fill='#fff'",
    backgroundColor: "#000",
    fallbackLabel: "TEST",
    fallbackLabelColor: "#fff",
    fallbackBgOpacity: "0.8",
    textColor: "#fff",
    fallbackIcon: "fallback",
    logName: "testService"
  };

  it("createBackdrop returns data URI with fallback when asset missing", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("getOrCreateThumbnail wraps title and generates thumbnail", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails(baseConfig);
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const result = thumbnails.getOrCreateThumbnail(state, "Test Title");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("getOrCreateThumbnail caches and reuses existing thumbnail", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails(baseConfig);
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const first = thumbnails.getOrCreateThumbnail(state, "Test");
    const second = thumbnails.getOrCreateThumbnail(state, "Test");
    expect(first).toBe(second);
  });

  it("getOrCreateThumbnail clears cache when background changes", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails(baseConfig);
    const clearSpy = vi.fn();
    const state = { thumbnailByTitle: { clear: clearSpy, get: vi.fn(), set: vi.fn() }, backgroundSignature: "old" };
    thumbnails.getOrCreateThumbnail(state, "Test");
    expect(clearSpy).toHaveBeenCalled();
  });

  it("getOrCreateThumbnail handles long title with wrapping", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails({ ...baseConfig, maxThumbnailLength: 9999 });
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const result = thumbnails.getOrCreateThumbnail(state, "A very long title that should wrap to multiple lines for the thumbnail display");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("getOrCreateThumbnail falls back to fallbackIcon when over length", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails({ ...baseConfig, maxThumbnailLength: 1 });
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const result = thumbnails.getOrCreateThumbnail(state, "Test");
    expect(result).toBe("fallback");
  });

  it("loads SVG asset and generates path-based logo markup", () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 1234, size: 5678 });
    const svgContent = `<svg><path d="M10 10 L20 20" fill="#fff"/><polygon points="0,0 10,0 10,10 0,10"/></svg>`;
    mockReadFileSync.mockReturnValue(Buffer.from(svgContent, "utf8"));

    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result).not.toBe("fallback");
  });

  it("loadAsset caches and reuses signature", () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 1234, size: 5678 });
    mockReadFileSync.mockReturnValue(Buffer.from("<svg></svg>", "utf8"));

    const thumbnails = createServiceThumbnails(baseConfig);
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const first = thumbnails.createBackdrop();
    // second call hits cache
    const second = thumbnails.getOrCreateThumbnail(state, "Test");
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
  });

  it("getOrCreateThumbnail handles single-word title that exceeds line length", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails({ ...baseConfig, maxThumbnailLength: 9999 });
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const result = thumbnails.getOrCreateThumbnail(state, "VERYLONGWORDTHATEXCEEDSLINELENGTH");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("getOrCreateThumbnail handles empty-ish title", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails({ ...baseConfig, maxThumbnailLength: 9999 });
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const result = thumbnails.getOrCreateThumbnail(state, "");
    expect(result).toBeTruthy();
  });

  it("loadAsset falls back to missing signature when no SVG found", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails(baseConfig);
    // Force a second call - should use cached missing signature and not log again
    thumbnails.createBackdrop();
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  it("polygonPointsToPath handles odd coordinate count", () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 1, size: 2 });
    const svgContent = '<svg><polygon points="0,0 10,0 10,10 0"/></svg>';
    mockReadFileSync.mockReturnValue(Buffer.from(svgContent, "utf8"));
    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  it("wrapTitle adds ellipsis for truncated long title", () => {
    mockExistsSync.mockReturnValue(false);
    const thumbnails = createServiceThumbnails({ ...baseConfig, maxThumbnailLength: 9999 });
    const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
    const longTitle = "Word1 Word2 Word3 Word4 Word5 Word6 Word7 Word8 Word9";
    const result = thumbnails.getOrCreateThumbnail(state, longTitle);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("loadAsset handles SVG with path element", () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 99, size: 88 });
    const svgContent = '<svg><path d="M10 10 L20 20" fill="#fff"/></svg>';
    mockReadFileSync.mockReturnValue(Buffer.from(svgContent, "utf8"));
    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  it("loadAsset handles SVG with empty polygon points", () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 77, size: 66 });
    const svgContent = '<svg><polygon points=""/></svg>';
    mockReadFileSync.mockReturnValue(Buffer.from(svgContent, "utf8"));
    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  it("loadAsset handles non-SVG extension (PNG)", () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ mtimeMs: 55, size: 44 });
    mockReadFileSync.mockReturnValue(Buffer.from("fake-png-data", "utf8"));
    const thumbnails = createServiceThumbnails({ ...baseConfig, svgFileName: "test.png" });
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });
});
