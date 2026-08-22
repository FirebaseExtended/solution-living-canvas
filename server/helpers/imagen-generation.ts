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

import { getGoogleCloudConfig } from "../config";
import { config as aiConfig } from "./ai-config-helper";
import { GoogleGenAI } from "@google/genai";
import * as aiplatform from "@google-cloud/aiplatform";
import util from "util";
import fs from "fs";
import { cacheManager } from "./cache-manager";

const { projectId, location, apiKey } = getGoogleCloudConfig();
const { helpers } = aiplatform;
const { PredictionServiceClient } = aiplatform.v1;

const ai = new GoogleGenAI({
  vertexai: true,
  project: projectId || "living-canvas-prod-3",
  location: location || "us-central1",
});


// Instantiates a client
const predictionServiceClient = new PredictionServiceClient({
  apiEndpoint: `${location}-aiplatform.googleapis.com`,
});

// Reusable function that returns the image buffer
async function generateImageBuffer(
  objectType: string,
  visualStyle: string,
  promptId: string = "imagen_generation"
): Promise<string> {
  try {
    // Try to get from cache first
    const cachedResult = await cacheManager.getCachedImage(
      objectType,
      visualStyle,
      "imagen"
    );
    if (cachedResult.success && cachedResult.data) {
      console.log(
        `Retrieved cached image for ${objectType} in ${visualStyle} style`
      );
      return cachedResult.data as string;
    }

    console.log(
      `No cached image found, generating new image for ${objectType} in ${visualStyle} style`
    );

    // If not in cache, proceed with normal image generation
    const imagenModel = aiConfig.models["generation_imagen"];
    if (!imagenModel) {
      throw new Error("Imagen model configuration not found");
    }

    const textPrompt = aiConfig.buildPrompt(promptId, {
      type: objectType,
      visualStyle: visualStyle,
    });

    let base64Image: string = "";

    try {
      const response = await ai.models.generateImages({
        model: imagenModel,
        prompt: textPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/png",
          aspectRatio: "1:1",
        },
      });

      if (response.generatedImages?.[0]?.image?.imageBytes) {
        base64Image = response.generatedImages[0].image.imageBytes;
      } else {
        throw new Error("Empty image response from GoogleGenAI");
      }
    } catch (genAiError) {
      console.warn(
        "GoogleGenAI generateImages failed, trying REST predict API:",
        genAiError instanceof Error ? genAiError.message : genAiError
      );

      if (apiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${imagenModel}:predict?key=${apiKey}`;
        const restRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: textPrompt }],
            parameters: { sampleCount: 1, aspectRatio: "1:1" },
          }),
        });
        const data: any = await restRes.json();
        if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
          base64Image = data.predictions[0].bytesBase64Encoded;
        } else {
          throw new Error(
            data.error?.message || "REST predict API failed to generate image"
          );
        }
      } else {
        const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/${imagenModel}`;
        const instances = [helpers.toValue({ prompt: textPrompt })];
        const parameter = {
          sampleCount: 1,
          aspectRatio: "1:1",
          safetySetting: aiConfig.getSafetySettings(),
        };
        const parameters = helpers.toValue(parameter);

        const request = {
          endpoint,
          instances,
          parameters,
        };

        // @ts-ignore
        const [response] = await predictionServiceClient.predict(request);
        const predictions = response.predictions;

        if (!predictions || predictions.length === 0) {
          throw new Error(
            "No image was generated. Check the request parameters and prompt."
          );
        }

        const prediction = predictions[0];
        if (!prediction.structValue?.fields?.bytesBase64Encoded?.stringValue) {
          throw new Error("Invalid prediction response format");
        }

        base64Image =
          prediction.structValue.fields.bytesBase64Encoded.stringValue;
      }
    }

    if (!base64Image) {
      throw new Error("Generated image is empty");
    }

    // Cache the generated image for future use
    const cacheResult = await cacheManager.cacheImage(
      objectType,
      visualStyle,
      base64Image,
      "imagen"
    );
    if (!cacheResult.success) {
      console.warn("Failed to cache image:", cacheResult.error);
    }

    return base64Image;

    // ...
    // [END image_generation]
  } catch (error: any) {
    if (error.code === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    } else if (error.code === 400) {
      throw new Error("Invalid request parameters.");
    }
    throw error;
  }
}

import { generateImageWithGemini } from "./gemini-generation";
import { generateImageWithGemmaCGA } from "./gemma-cga-generation";

// Main function with Promise wrapper and file saving
export async function generateImageWithImagen(
  promptId: string,
  objectType: string,
  visualStyle: string,
  filepath: string
): Promise<string> {
  try {
    const base64Image = await generateImageBuffer(
      objectType,
      visualStyle,
      promptId
    );

    const buff = Buffer.from(base64Image, "base64");
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(filepath, buff);

    if (!fs.existsSync(filepath)) {
      throw new Error("Failed to save generated image");
    }

    console.log(`Saved image ${filepath}`);
    return filepath;
  } catch (error) {
    console.warn("Imagen generation failed, falling back to Gemini / Gemma CGA generator:", error);
    try {
      return await generateImageWithGemini(
        "gemini_generation",
        objectType,
        "",
        visualStyle,
        filepath
      );
    } catch (geminiError) {
      console.warn("Gemini fallback failed, using Gemma CGA generator:", geminiError);
      return await generateImageWithGemmaCGA(
        objectType,
        visualStyle,
        filepath
      );
    }
  }
}

// Export the base64 generation function for direct access
export { generateImageBuffer };

