import fs from "fs";
import path from "path";
import { config } from "./ai-config-helper";
import { generateImageBuffer } from "./imagen-generation";

export type GenerationType = "imagen" | "gemini" | "veo" | "omni";

interface CacheConfig {
	enabled: boolean;
	poolSize: number;
}

interface CachePaths {
	cacheDir: string;
	framesCacheDir: string;
}

interface CacheResult {
	success: boolean;
	data?: string | string[];
	error?: string;
}

const initializeCache = (paths: CachePaths): void => {
	const { cacheDir, framesCacheDir } = paths;
	const directories = [cacheDir, framesCacheDir];

	for (const dir of directories) {
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}
};

const getCacheKey = (
	objectType: string,
	visualStyle: string,
	variation: number,
	generationType: GenerationType
): string => {
	// Convert objectType and visualStyle to lowercase for consistent naming
	const normalizedObjectType = objectType.toLowerCase();
	const normalizedVisualStyle = visualStyle.toLowerCase();
	return `${generationType}_${normalizedObjectType}_${normalizedVisualStyle}_${variation}`;
};

const getCachePath = (cacheDir: string, cacheKey: string): string => {
	return path.join(cacheDir, `${cacheKey}.png`);
};

const getFramesCachePath = (
	framesCacheDir: string,
	objectType: string,
	visualStyle: string
): string => {
	// Convert to lowercase for consistent naming
	const normalizedObjectType = objectType.toLowerCase();
	const normalizedVisualStyle = visualStyle.toLowerCase();
	return path.join(
		framesCacheDir,
		`${normalizedObjectType}_${normalizedVisualStyle}`
	);
};

export const cacheManager = {
	config: config.getCacheConfig() as CacheConfig,
	paths: {
		cacheDir: path.join(process.cwd(), "generated", "cache"),
		framesCacheDir: path.join(process.cwd(), "generated", "cache", "frames"),
	},

	initialize(): void {
		if (!this.config.enabled) return;
		initializeCache(this.paths);
	},

	async preloadCache(objectType: string, visualStyle: string): Promise<void> {
		// Silently return if cache is disabled
		if (!this.config.enabled) return;

		try {
			// Check if we already have a full pool
			const availableVariations: number[] = [];
			for (let i = 0; i < this.config.poolSize; i++) {
				const cacheKey = getCacheKey(objectType, visualStyle, i, "imagen");
				const cachePath = getCachePath(this.paths.cacheDir, cacheKey);
				if (fs.existsSync(cachePath)) {
					availableVariations.push(i);
				}
			}

			// If we already have a full pool, no need to preload
			if (availableVariations.length === this.config.poolSize) {
				return;
			}

			// Generate images until we have a full pool
			for (let i = availableVariations.length; i < this.config.poolSize; i++) {
				try {
					const base64Image = await generateImageBuffer(objectType, visualStyle);
					await this.cacheImage(objectType, visualStyle, base64Image);
				} catch (error) {
					// Log error but continue trying to preload
					console.error(`Failed to preload variation ${i} for ${objectType} in ${visualStyle} style:`, error);
				}
			}
		} catch (error) {
			// Log error but don't throw
			console.error(`Error in preloadCache for ${objectType} in ${visualStyle} style:`, error);
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
			// Get all available variations for this object and style
			const availableVariations: number[] = [];
			for (let i = 0; i < this.config.poolSize; i++) {
				const cacheKey = getCacheKey(objectType, visualStyle, i, generationType);
				const cachePath = getCachePath(this.paths.cacheDir, cacheKey);
				if (fs.existsSync(cachePath)) {
					availableVariations.push(i);
				}
			}

			console.log(`Found ${availableVariations.length} variations for ${objectType} in ${visualStyle} style`);

			// If we have a full pool, randomly select one
			if (availableVariations.length === this.config.poolSize) {
				// For VEO generation, always use the first variation (variation 0)
				let selectedVariation: number;
				if (generationType === "veo" || generationType === "omni") {
					selectedVariation = 0;
				} else {
					// Randomly select from available variations
					const randomIndex = Math.floor(Math.random() * availableVariations.length);
					selectedVariation = availableVariations[randomIndex];
				}

				console.log(`Selected variation ${selectedVariation} from full pool of ${availableVariations.length} variations`);

				const cacheKey = getCacheKey(
					objectType,
					visualStyle,
					selectedVariation,
					generationType
				);
				const cachePath = getCachePath(this.paths.cacheDir, cacheKey);

				const imageBuffer = fs.readFileSync(cachePath);
				return { success: true, data: imageBuffer.toString("base64") };
			}

			// If we have some variations but not a full pool, return error to trigger generation
			if (availableVariations.length > 0) {
				console.log(`Incomplete pool (${availableVariations.length}/${this.config.poolSize}), triggering new generation`);
			}

			// If no variations found, return error to trigger generation
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
			// Get all existing variations
			const existingVariations: number[] = [];
			for (let i = 0; i < this.config.poolSize; i++) {
				const cacheKey = getCacheKey(objectType, visualStyle, i, generationType);
				const cachePath = getCachePath(this.paths.cacheDir, cacheKey);
				if (fs.existsSync(cachePath)) {
					existingVariations.push(i);
				}
			}

			console.log(`Found ${existingVariations.length} existing variations for ${objectType} in ${visualStyle} style`);

			// Find the next available variation number
			let variation = 0;
			while (variation < this.config.poolSize) {
				if (!existingVariations.includes(variation)) {
					break;
				}
				variation++;
			}

			// If we've reached the pool size, randomly replace an existing image
			if (variation >= this.config.poolSize) {
				variation = Math.floor(Math.random() * this.config.poolSize);
				console.log(`Pool is full, randomly replacing variation ${variation}`);
			} else {
				console.log(`Adding new variation ${variation} to the pool`);
			}

			const cacheKey = getCacheKey(
				objectType,
				visualStyle,
				variation,
				generationType
			);
			const cachePath = getCachePath(this.paths.cacheDir, cacheKey);

			fs.writeFileSync(cachePath, Buffer.from(base64Image, "base64"));
			console.log(`Cached image ${variation} for ${objectType} in ${visualStyle} style`);
			return { success: true };
		} catch (error) {
			return { success: false, error: `Error caching image: ${error}` };
		}
	},

	async getCachedFrames(
		objectType: string,
		visualStyle: string
	): Promise<CacheResult> {
		if (!this.config.enabled) {
			return { success: false, error: "Cache is disabled" };
		}

		try {
			const framesDir = getFramesCachePath(
				this.paths.framesCacheDir,
				objectType,
				visualStyle
			);
			if (!fs.existsSync(framesDir)) {
				return { success: false, error: "No cached frames found" };
			}

			const frames: string[] = [];
			for (let i = 0; i < 4; i++) {
				const framePath = path.join(framesDir, `frame${i}.png`);
				if (!fs.existsSync(framePath)) {
					return { success: false, error: `Missing frame ${i}` };
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
		frames: string[]
	): Promise<CacheResult> {
		if (!this.config.enabled) {
			return { success: false, error: "Cache is disabled" };
		}

		try {
			const framesDir = getFramesCachePath(
				this.paths.framesCacheDir,
				objectType,
				visualStyle
			);
			if (!fs.existsSync(framesDir)) {
				fs.mkdirSync(framesDir, { recursive: true });
			}

			for (let i = 0; i < frames.length; i++) {
				const framePath = path.join(framesDir, `frame${i}.png`);
				fs.writeFileSync(framePath, Buffer.from(frames[i], "base64"));
			}

			return { success: true };
		} catch (error) {
			return { success: false, error: `Error caching frames: ${error}` };
		}
	}
};

// Initialize cache on import
cacheManager.initialize();
