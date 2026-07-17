import fs from "fs";
import path from "path";
import { config } from "./ai-config-helper";
import { generateImageBuffer } from "./imagen-generation";

export type GenerationType =
  | "imagen"
  | "gemini"
  | "veo"
  | "omni"
  | "gemini-anim"
  | "gemma-cga"
  | "gemma-anim"
  | "gemma-diffusion"
  | "gemma-diff-anim"
  | string;

interface CacheConfig {
  enabled: boolean;
  poolSize: number;
}

interface CachePaths {
  cacheDir: string;
}

interface CacheResult {
  success: boolean;
  data?: string | string[];
  error?: string;
}

const initializeCache = (paths: CachePaths): void => {
  if (!fs.existsSync(paths.cacheDir)) {
    fs.mkdirSync(paths.cacheDir, { recursive: true });
  }
};

const getModelDir = (cacheDir: string, backend: string): string => {
  const normalizedBackend = (backend || "imagen").toLowerCase();
  const dir = path.join(cacheDir, normalizedBackend);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getImageCachePath = (
  cacheDir: string,
  backend: string,
  objectType: string,
  visualStyle: string,
  variation: number
): string => {
  const modelDir = getModelDir(cacheDir, backend);
  const normalizedObject = objectType.toLowerCase();
  const normalizedStyle = visualStyle.toLowerCase();
  const filename = normalizedStyle
    ? `${normalizedObject}_${normalizedStyle}-${variation}.png`
    : `${normalizedObject}-${variation}.png`;
  return path.join(modelDir, filename);
};

const getFrameCachePath = (
  cacheDir: string,
  backend: string,
  objectType: string,
  visualStyle: string,
  frameIndex: number
): string => {
  const modelDir = getModelDir(cacheDir, backend);
  const normalizedObject = objectType.toLowerCase();
  const normalizedStyle = visualStyle.toLowerCase();
  const filename = normalizedStyle
    ? `${normalizedObject}_${normalizedStyle}-frame${frameIndex}.png`
    : `${normalizedObject}-frame${frameIndex}.png`;
  return path.join(modelDir, filename);
};

export const cacheManager = {
  config: config.getCacheConfig() as CacheConfig,
  paths: {
    cacheDir: path.join(process.cwd(), "generated", "cache"),
  },

  initialize(): void {
    if (!this.config.enabled) return;
    initializeCache(this.paths);
  },

  async preloadCache(objectType: string, visualStyle: string): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const availableVariations: number[] = [];
      for (let i = 0; i < this.config.poolSize; i++) {
        const cachePath = getImageCachePath(
          this.paths.cacheDir,
          "imagen",
          objectType,
          visualStyle,
          i
        );
        if (fs.existsSync(cachePath)) {
          availableVariations.push(i);
        }
      }

      if (availableVariations.length === this.config.poolSize) {
        return;
      }

      for (let i = availableVariations.length; i < this.config.poolSize; i++) {
        try {
          const base64Image = await generateImageBuffer(objectType, visualStyle);
          await this.cacheImage(objectType, visualStyle, base64Image, "imagen");
        } catch (error) {
          console.error(
            `Failed to preload variation ${i} for ${objectType} in ${visualStyle} style:`,
            error
          );
        }
      }
    } catch (error) {
      console.error(
        `Error in preloadCache for ${objectType} in ${visualStyle} style:`,
        error
      );
    }
  },

  async getCachedImage(
    objectType: string,
    visualStyle: string,
    generationType: GenerationType = "imagen"
  ): Promise<CacheResult> {
    if (!this.config.enabled) {
      return { success: false, error: "Cache is disabled" };
    }

    try {
      const availableVariations: number[] = [];
      for (let i = 0; i < this.config.poolSize; i++) {
        const cachePath = getImageCachePath(
          this.paths.cacheDir,
          generationType,
          objectType,
          visualStyle,
          i
        );
        if (fs.existsSync(cachePath)) {
          availableVariations.push(i);
        }
      }

      console.log(
        `Found ${availableVariations.length} variations for ${objectType} in ${visualStyle} style (model: ${generationType})`
      );

      if (availableVariations.length === this.config.poolSize) {
        let selectedVariation: number;
        if (generationType === "veo" || generationType === "omni") {
          selectedVariation = 0;
        } else {
          const randomIndex = Math.floor(
            Math.random() * availableVariations.length
          );
          selectedVariation = availableVariations[randomIndex];
        }

        console.log(
          `Selected variation ${selectedVariation} from full pool of ${availableVariations.length} variations for ${generationType}`
        );

        const cachePath = getImageCachePath(
          this.paths.cacheDir,
          generationType,
          objectType,
          visualStyle,
          selectedVariation
        );

        const imageBuffer = fs.readFileSync(cachePath);
        return { success: true, data: imageBuffer.toString("base64") };
      }

      if (availableVariations.length > 0) {
        console.log(
          `Incomplete pool (${availableVariations.length}/${this.config.poolSize}) for ${generationType}, triggering new generation`
        );
      }

      return { success: false, error: "No cached images found" };
    } catch (error) {
      return { success: false, error: `Error getting cached image: ${error}` };
    }
  },

  async cacheImage(
    objectType: string,
    visualStyle: string,
    base64Image: string,
    generationType: GenerationType = "imagen"
  ): Promise<CacheResult> {
    if (!this.config.enabled) {
      return { success: false, error: "Cache is disabled" };
    }

    try {
      const existingVariations: number[] = [];
      for (let i = 0; i < this.config.poolSize; i++) {
        const cachePath = getImageCachePath(
          this.paths.cacheDir,
          generationType,
          objectType,
          visualStyle,
          i
        );
        if (fs.existsSync(cachePath)) {
          existingVariations.push(i);
        }
      }

      let variation = 0;
      while (variation < this.config.poolSize) {
        if (!existingVariations.includes(variation)) {
          break;
        }
        variation++;
      }

      if (variation >= this.config.poolSize) {
        variation = Math.floor(Math.random() * this.config.poolSize);
        console.log(
          `Pool is full for ${generationType}, randomly replacing variation ${variation}`
        );
      } else {
        console.log(
          `Adding new variation ${variation} for ${generationType} to the pool`
        );
      }

      const cachePath = getImageCachePath(
        this.paths.cacheDir,
        generationType,
        objectType,
        visualStyle,
        variation
      );

      fs.writeFileSync(cachePath, Buffer.from(base64Image, "base64"));
      console.log(
        `Cached image variation ${variation} for ${objectType} in ${visualStyle} style (model: ${generationType})`
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: `Error caching image: ${error}` };
    }
  },

  async getCachedFrames(
    objectType: string,
    visualStyle: string,
    backend: string = "veo"
  ): Promise<CacheResult> {
    if (!this.config.enabled) {
      return { success: false, error: "Cache is disabled" };
    }

    try {
      const frames: string[] = [];
      for (let i = 0; i < 4; i++) {
        const framePath = getFrameCachePath(
          this.paths.cacheDir,
          backend,
          objectType,
          visualStyle,
          i
        );
        if (!fs.existsSync(framePath)) {
          return { success: false, error: `Missing frame ${i} for ${backend}` };
        }
        const frameBuffer = fs.readFileSync(framePath);
        frames.push(frameBuffer.toString("base64"));
      }

      return { success: true, data: frames };
    } catch (error) {
      return { success: false, error: `Error reading cached frames: ${error}` };
    }
  },

  async cacheFrames(
    objectType: string,
    visualStyle: string,
    frames: string[],
    backend: string = "veo"
  ): Promise<CacheResult> {
    if (!this.config.enabled) {
      return { success: false, error: "Cache is disabled" };
    }

    try {
      for (let i = 0; i < frames.length; i++) {
        const framePath = getFrameCachePath(
          this.paths.cacheDir,
          backend,
          objectType,
          visualStyle,
          i
        );
        fs.writeFileSync(framePath, Buffer.from(frames[i], "base64"));
      }

      console.log(
        `Cached ${frames.length} frames for ${objectType} in ${visualStyle} style (model: ${backend})`
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: `Error caching frames: ${error}` };
    }
  },
};

// Initialize cache on import
cacheManager.initialize();
