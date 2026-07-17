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

import express, { Request, Response } from "express";
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
import { config } from "./helpers/ai-config-helper";

const { port } = getServerConfig();
const app = express();

// Error handling middleware
const errorHandler = (err: Error, _req: Request, res: Response) => {
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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create the 'generated' directory if it doesn't exist
fs.mkdir("generated", { recursive: true }, (err) => {
  if (err) {
    console.error("Error creating 'generated' directory:", err);
  }
});

// Setup static file serving and index route
app.use(express.static("resources"));
app.use("/generated", express.static("generated"));

app.get("/test", (_req: Request, res: Response) => {
  res.send(`Hello world from real server this time! On port: ${port}`);
});

app.use(express.static("public/browser"));

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

    const response = await imageToConfig(trimmedData);
    
    console.log("response", response);

    // Check for inappropriate content in the response if safety settings are not triggered
    if (response.type && config.isInappropriateContent(response.type)) {
      return res.json(config.getSafetySettingsResponse());
    }

    res.send(response);
  } catch (error) {
    console.log("Error in analyseImage", error);
    throw new Error("Error in analyseImage");
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
    throw new Error("Error in checkError");
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
    throw new Error("Error in checkFrames");
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
    
    if (backend === "veo" || backend === "omni") {
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
        throw new Error(
          `${backend} image generation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
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
    } else {
      throw new Error(`Unsupported backend: ${backend}`);
    }

    if (!fs.existsSync(filepath)) {
      throw new Error(`Failed to create image file at ${filepath}`);
    }

    await applyRoundedCornersAndBorder(filepath, filepathTemp);

    if (!fs.existsSync(filepathTemp)) {
      throw new Error(`Failed to create temp image file at ${filepathTemp}`);
    }

    await resizeImage(filepathTemp, filepathSmall);

    if (!fs.existsSync(filepathSmall)) {
      throw new Error(`Failed to create small image file at ${filepathSmall}`);
    }

    fs.copyFileSync(filepathSmall, filepath);

    const bitmap = fs.readFileSync(filepathSmall);
    const result = Buffer.from(bitmap).toString("base64");
    res.send(result);
  } catch (error) {
    console.log("Error in generateImage", error);
    throw new Error("Error in generateImage");
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
    throw new Error("Error in textToCommand");
  }
});

// Apply error handling middleware last
app.use(errorHandler);

// Start the server
app.listen(port, () => {
	console.log(
		`Application started and Listening on port ${port}. http://localhost:${port}/`
	);
});
