/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import buffer from "buffer";
if (!buffer.SlowBuffer) {
  (buffer as any).SlowBuffer = class SlowBuffer extends Buffer {};
}

import express, { Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import { join } from "path";
import cors from "cors";
import { md5 } from "js-md5";
import fs from "fs";
import { getServerConfig } from "./config";
import { cacheManager } from "./helpers/cache-manager";
import {
  applyRoundedCornersAndBorder,
  resizeImage,
} from "./helpers/image-processing";
import { imageToConfig, textToCommand } from "./helpers/ai-analysis";
import { generateImageWithGemini } from "./helpers/gemini-generation";
import {
  generateStaticImage,
  generateVideoAndFrames,
} from "./helpers/veo-generation";
import { generateImageWithImagen } from "./helpers/imagen-generation";
import { generateImageWithGemmaCGA, generateImageWithGemmaDiffusion, queryRemoteGemmaModel } from "./helpers/gemma-cga-generation";
import { config } from "./helpers/ai-config-helper";

const { port } = getServerConfig();
const app = express();

// Error handling middleware (must have 4 arguments in Express)
const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({
    error: err.message || "Internal server error",
    timestamp: new Date().toISOString(),
  });
};

// Request validation middleware
const validateImageRequest = (req: Request, res: Response) => {
  if (!req.body.prompt) {
    res.status(400).json({ error: "Image data is required" });
    return false;
  }
  return true;
};

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Resolve paths relative to binary and working directory
const generatedPath = fs.existsSync(join(__dirname, "../generated"))
  ? join(__dirname, "../generated")
  : join(process.cwd(), "generated");

const publicPath = fs.existsSync(join(__dirname, "../public/browser"))
  ? join(__dirname, "../public/browser")
  : fs.existsSync(join(process.cwd(), "server/public/browser"))
  ? join(process.cwd(), "server/public/browser")
  : fs.existsSync(join(process.cwd(), "public/browser"))
  ? join(process.cwd(), "public/browser")
  : join(__dirname, "public/browser");

const resourcesPath = fs.existsSync(join(__dirname, "../resources"))
  ? join(__dirname, "../resources")
  : join(process.cwd(), "resources");

// Create the 'generated' directory if it doesn't exist
try {
  fs.mkdirSync(generatedPath, { recursive: true });
} catch (err) {
  console.error("Error creating 'generated' directory:", err);
}

// Setup static file serving and index route
app.use(express.static(resourcesPath));
app.use("/generated", express.static(generatedPath));

app.get("/test", (_req: Request, res: Response) => {
  res.send(`Hello world from real server this time! On port: ${port}`);
});

app.use(express.static(publicPath));


app.use("/solution", express.static("solution"));
app.use("/external-assets", express.static("solution/external-assets"));
app.use("/src", express.static("solution/src"));
app.use("/shared-assets", express.static("solution/shared-assets"));

app.get("/resources/:file", async (req: Request, res: Response) => {
  try {
    const filePath = join(__dirname, "resources/", req.params.file);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Resource file not found" });
      return;
    }
    res.sendFile(filePath);
  } catch (error) {
    console.log("Error in resources", error);
    throw error;
  }
});

// Route for analysing images
app.post("/analyseImage", async (req: Request, res: Response) => {
  try {
    if (!validateImageRequest(req, res)) return;

    console.log("req body", req.body);

    const imageData = req.body.prompt || null;
    if (!imageData) {
      res.status(400).json({ error: "No image data provided" });
      return;
    }

    const trimmedData = imageData.slice(22);
    if (!trimmedData) {
      res.status(400).json({ error: "Invalid image data format" });
      return;
    }

    const requestedModel = req.body.model || (req.query.model as string) || undefined;
    const response = await imageToConfig(trimmedData, requestedModel);

    
    console.log("response", response);

    // Check for inappropriate content in the response if safety settings are not triggered
    if (response.type && config.isInappropriateContent(response.type)) {
      return res.json(config.getSafetySettingsResponse());
    }

    res.send(response);
  } catch (error) {
    console.log("Error in analyseImage", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Error in analyseImage" });
  }
});

// Route for Gemma 4 via MediaPipe image analysis
app.post("/analyseImageGemma", async (req: Request, res: Response) => {
  try {
    const imageData = req.body.prompt || null;
    if (!imageData) {
      res.status(400).json({ error: "No image data provided" });
      return;
    }

    const trimmedData = imageData.startsWith("data:image/") ? imageData.slice(22) : imageData;
    console.log("[Gemma 4 MediaPipe] Performing remote Gemma analysis on drawing...");

    const prompt = `Analyze this drawing image and identify what object it represents from this list: Tree, Heart, Spaceship, Bird, Human, Turret, Rock, Water, Fire, Arrow, Animal, Lightning, Cloud, Boat, Car, Dynamite, Bomb, Ball, Bricks, Fan, Ice, Magnet, Metal. Return ONLY a valid JSON object like {"type": "Fire", "attributes": ["burns", "solid", "falls"]}.`;

    try {
      const rawText = await queryRemoteGemmaModel(prompt, trimmedData);
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.type && config.isInappropriateContent(parsed.type)) {
          return res.json(config.getSafetySettingsResponse());
        }
        return res.json(parsed);
      }
    } catch (gemmaErr) {
      console.warn("[Gemma 4 MediaPipe] Remote Gemma call failed, using fallback:", gemmaErr);
    }

    const response = await imageToConfig(trimmedData);

    if (response.type && config.isInappropriateContent(response.type)) {
      return res.json(config.getSafetySettingsResponse());
    }

    res.json(response);
  } catch (error) {
    console.log("Error in analyseImageGemma", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Error in analyseImageGemma" });
  }
});

// Route for checking error status
app.get("/checkError/:hash", (req: Request, res: Response) => {
  try {
    const hash = req.params.hash;
    if (!hash) {
      res.status(400).json({ error: "Hash parameter is required" });
      return;
    }

    const errorFile = join("generated", `error_${hash}.json`);

    if (fs.existsSync(errorFile)) {
      const errorData = JSON.parse(fs.readFileSync(errorFile, "utf8"));
      res.json(errorData);
    } else {
      res.status(404).send();
    }
  } catch (error) {
    console.log("Error in checkError", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Error in checkError" });
  }
});

// Route for checking frame status
app.get("/checkFrames/:hash", (req: Request, res: Response) => {
  try {
    const hash = req.params.hash;
    if (!hash) {
      res.status(400).json({ error: "Hash parameter is required" });
      return;
    }

    const framesDir = join("generated");
    const totalFrames = 4;
    let readyFrames = 0;

    for (let i = 0; i < totalFrames; i++) {
      const framePath = join(framesDir, `output_${hash}_frame${i}.png`);
      if (fs.existsSync(framePath)) {
        readyFrames++;
      }
    }

    res.json({
      ready: readyFrames === totalFrames,
      progress: readyFrames,
      total: totalFrames,
    });
  } catch (error) {
    console.log("Error in checkFrames", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Error in checkFrames" });
  }
});

app.post("/generateImage", async (req: Request, res: Response) => {
  try {
    console.log("genimage reached ******");

    const { prompt, imageData: inputImageData, backend, style } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

		// Check for inappropriate content in the prompt
    if (config.isInappropriateContent(prompt)) {
      return res.json(config.getSafetySettingsResponse());
    }

    const objectType = prompt;
    const visualStylePrompt = style || "realistic";
    const hash = md5(objectType + visualStylePrompt + Date.now());

    const filename = `output_${hash}.png`;
    const filenameTemp = `output_${hash}_temp.png`;
    const filenameSmall = `output_${hash}_small.png`;

    const filepath = join("generated", filename);
    const filepathTemp = join("generated", filenameTemp);
    const filepathSmall = join("generated", filenameSmall);

    // Clean up any existing files
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      if (fs.existsSync(filepathTemp)) {
        fs.unlinkSync(filepathTemp);
      }
      if (fs.existsSync(filepathSmall)) {
        fs.unlinkSync(filepathSmall);
      }
    } catch (cleanupError) {
      console.error("Error cleaning up existing files:", cleanupError);
    }
    
    if (backend === "veo" || backend === "omni" || backend === "gemini-anim" || backend === "gemma-anim" || backend === "gemma-diff-anim") {
      try {
        const filenameOriginal = `output_${hash}_original.png`;
        const filepathOriginal = join("generated", filenameOriginal);

        const { processedImage } = await generateStaticImage(
          objectType,
          visualStylePrompt,
          filepath,
          filepathSmall,
          filepathOriginal
        );

        res.json({ hash, processedImage });

        // Start video generation in background
        generateVideoAndFrames(
          hash,
          filepathOriginal,
          objectType,
          visualStylePrompt,
          backend
        ).catch((err) => {
          console.error("Error with video/frames generation:", err);
          // Create error file for frontend
          const errorFile = join("generated", `error_${hash}.json`);
          fs.writeFileSync(
            errorFile,
            JSON.stringify({
              error:
                err instanceof Error ? err.message : "Failed to generate video",
              timestamp: new Date().toISOString(),
            })
          );
        });

        fs.copyFileSync(filepathSmall, filepath);
        return;
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : `${backend} image generation failed` });
        return;
      }
    } else if (backend === "gemini") {
      await generateImageWithGemini(
        "gemini_generation",
        objectType,
        inputImageData || "",
        visualStylePrompt,
        filepath
      );
    } else if (backend === "imagen") {
      await generateImageWithImagen(
        "imagen_generation",
        objectType,
        visualStylePrompt,
        filepath
      );
    } else if (backend === "gemma-cga") {
      await generateImageWithGemmaCGA(
        objectType,
        visualStylePrompt,
        filepath
      );
    } else if (backend === "gemma-diffusion") {
      await generateImageWithGemmaDiffusion(
        objectType,
        visualStylePrompt,
        filepath
      );
    } else {
      res.status(400).json({ error: `Unsupported backend: ${backend}` });
      return;
    }

    if (!fs.existsSync(filepath)) {
      res.status(500).json({ error: `Failed to create image file at ${filepath}` });
      return;
    }

    await applyRoundedCornersAndBorder(filepath, filepathTemp);

    if (!fs.existsSync(filepathTemp)) {
      res.status(500).json({ error: `Failed to create temp image file at ${filepathTemp}` });
      return;
    }

    await resizeImage(filepathTemp, filepathSmall);

    if (!fs.existsSync(filepathSmall)) {
      res.status(500).json({ error: `Failed to create small image file at ${filepathSmall}` });
      return;
    }

    fs.copyFileSync(filepathSmall, filepath);

    const bitmap = fs.readFileSync(filepathSmall);
    const result = Buffer.from(bitmap).toString("base64");
    res.send(result);
  } catch (error) {
    console.log("Error in generateImage", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Error in generateImage" });
  }
});

app.post("/textToCommand", async (req: Request, res: Response) => {
  try {
    const textCommand = req.body.command || null;
    const currentTargets = req.body.currentTargets || null;

    if (!textCommand) {
      res.status(400).json({ error: "Command text is required" });
      return;
    }

    console.log(
      "textToCommand: ",
      textCommand,
      " possible targets: ",
      currentTargets
    );

    const result = await textToCommand(textCommand, currentTargets);
    console.log(result);

    res.send(result);
  } catch (error) {
    console.log("Error in textToCommand", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Error in textToCommand" });
  }
});

// Serve index.html for root and SPA routes
app.get("*", (req: Request, res: Response, next: NextFunction) => {
  // If it is an API route or file with extension that was not handled, let it pass to 404/errorHandler
  if (req.path.startsWith("/api") || req.path.includes(".")) {
    return next();
  }
  const indexPath = join(publicPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Apply error handling middleware last
app.use(errorHandler);

// Start the server
app.listen(port, () => {
	console.log(
		`Application started and Listening on port ${port}. http://localhost:${port}/`
	);
});
