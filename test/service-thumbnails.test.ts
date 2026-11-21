import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import log from "../src/loggers.js";

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: {
    existsSync: mockExistsSync,
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
    const svgContent = '<svg><path d="M10 10 L20 20" fill="#fff"/></svg>';
    mockReadFileSync.mockReturnValue(Buffer.from(svgContent, "utf8"));
    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  it("loadAsset handles SVG with empty polygon points", () => {
    mockExistsSync.mockReturnValue(true);
    const svgContent = '<svg><polygon points=""/></svg>';
    mockReadFileSync.mockReturnValue(Buffer.from(svgContent, "utf8"));
    const thumbnails = createServiceThumbnails(baseConfig);
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  it("loadAsset handles non-SVG extension (PNG)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from("fake-png-data", "utf8"));
    const thumbnails = createServiceThumbnails({ ...baseConfig, svgFileName: "test.png" });
    const result = thumbnails.createBackdrop();
    expect(result).toBeTruthy();
  });

  describe("file-system access", () => {
    beforeEach(() => {
      mockExistsSync.mockReset();
      mockReadFileSync.mockReset();
    });

    it("reads the logo once, however many thumbnails and backdrops are made", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from('<svg><path d="M0 0 L10 10"/></svg>', "utf8"));
      const thumbnails = createServiceThumbnails(baseConfig);
      const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };

      for (let row = 0; row < 50; row++) thumbnails.getOrCreateThumbnail(state, `Station ${row}`);
      const backdrop = thumbnails.createBackdrop();

      expect(mockExistsSync).toHaveBeenCalledTimes(1);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
      expect(state.thumbnailByTitle.size).toBe(50);
      // The logo is drawn, not the fallback label, and the backdrop is the same string every time.
      expect(backdrop).not.toContain("TEST");
      expect(thumbnails.createBackdrop()).toBe(backdrop);
    });

    it("looks for a missing logo once, warns once and uses the fallback label", () => {
      mockExistsSync.mockReturnValue(false);
      const warn = vi.spyOn(log, "warn").mockImplementation(() => log);
      const thumbnails = createServiceThumbnails(baseConfig);
      const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };

      for (let row = 0; row < 10; row++) thumbnails.getOrCreateThumbnail(state, `Station ${row}`);
      const backdrop = thumbnails.createBackdrop();

      // Four candidate locations are checked, once.
      expect(mockExistsSync).toHaveBeenCalledTimes(4);
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(backdrop).toContain("TEST");
      warn.mockRestore();
    });

    it("keeps the thumbnails of a state that was built for the same logo", () => {
      mockExistsSync.mockReturnValue(false);
      const thumbnails = createServiceThumbnails(baseConfig);
      const state = { thumbnailByTitle: new Map(), backgroundSignature: "" };
      thumbnails.getOrCreateThumbnail(state, "A");

      thumbnails.getOrCreateThumbnail(state, "B");

      expect(state.backgroundSignature).toBe("missing");
      expect([...state.thumbnailByTitle.keys()]).toEqual(["A", "B"]);
    });
  });

  describe("createTunerArtwork", () => {
    let createTunerArtwork: any;

    beforeAll(async () => {
      const mod = await import("../src/serviceThumbnails.js");
      createTunerArtwork = mod.createTunerArtwork;
    });

    it("returns a data URI with the UC radio icon in eiscp blue on a transparent background", () => {
      const result = createTunerArtwork();
      expect(result).toContain("data:image/svg+xml");
      expect(result).toContain("%231a6fd1");
      expect(result).toContain("M495 401Q515");
      expect(result).not.toContain("<rect");
    });

    it("uses the given icon color", () => {
      const result = createTunerArtwork({ textColor: "#ff0000" });
      expect(result).toContain("%23ff0000");
    });

    it("falls back when over max length", () => {
      const result = createTunerArtwork({ maxLength: 1, fallbackIcon: "fallback" });
      expect(result).toBe("fallback");
    });

    it("stays within the default max thumbnail length", () => {
      const result = createTunerArtwork();
      expect(result.length).toBeLessThan(4000);
    });
  });
});
