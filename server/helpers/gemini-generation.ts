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

import { GenerateContentConfig, GoogleGenAI } from "@google/genai";
import fs from "fs";
import sharp from "sharp";
import { getGoogleCloudConfig } from "../config";
import { config as aiConfig } from "./ai-config-helper";
import { cacheManager } from "./cache-manager";
import { generateImageWithGemmaCGA } from "./gemma-cga-generation";
import path from "path";


const { projectId, location, apiKey } = getGoogleCloudConfig();

interface GenerationConfig {
  maxOutputTokens: number;
  temperature: number;
  topP: number;
  seed: number;
  responseModalities: string[];
  safetySettings: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        inlineData: {
          data: string;
        };
      }>;
    };
    finishReason: string;
  }>;
}

// Initialize GoogleGenAI client with API key or Vertex AI fallback
const ai = apiKey
  ? new GoogleGenAI({ apiKey })
  : new GoogleGenAI({
      vertexai: true,
      project: projectId || "living-canvas-prod-3",
      location: location || "us-central1",
    });



// Set up generation config
const generationConfig: GenerationConfig = {
  maxOutputTokens: 8192,
  temperature: 1,
  topP: 0.95,
  seed: 0,
  responseModalities: ["TEXT", "IMAGE"],
  safetySettings: aiConfig.getSafetySettings(),
};

async function generateImageBuffer(
  objectType: string,
  visualStyle: string,
  promptId: string = "gemini_generation"
): Promise<string> {
  try {
    // Try to get from cache first
    const cachedResult = await cacheManager.getCachedImage(
      objectType,
      visualStyle,
      "gemini"
    );
    if (cachedResult.success && cachedResult.data) {
      console.log(
        `Retrieved cached image for ${objectType} in ${visualStyle} style`
      );
      return cachedResult.data as string;
    }

    // If not in cache, proceed with normal image generation
    const model = aiConfig.models["generation_gemini"];
    if (!model) {
      throw new Error("Gemini model configuration not found");
    }

    const textPrompt = aiConfig.buildPrompt(promptId, {
      type: objectType,
      visualStyle: visualStyle,
    });

    const vertexChat = ai.chats.create({
      model: model,
      config: generationConfig as GenerateContentConfig,
    });

    const response = await sendGeminiMessage(
      vertexChat,
      textPrompt,
      "" // Empty input image for generation
    );

    if (!response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      throw new Error("Invalid response format from Gemini API");
    }

    const base64Image = response.candidates[0].content.parts[0].inlineData.data;

    // Cache the generated image
    const cacheResult = await cacheManager.cacheImage(
      objectType,
      visualStyle,
      base64Image,
      "gemini"
    );
    if (!cacheResult.success) {
      console.warn("Failed to cache image:", cacheResult.error);
    }

    return base64Image;
  } catch (error) {
    console.warn("Error in generateImageBuffer (gemini), falling back to Gemma CGA sprite generator:", error);
    try {
      const tempPath = path.join("generated", `fallback_${Date.now()}.png`);
      await generateImageWithGemmaCGA(objectType, visualStyle, tempPath);
      if (fs.existsSync(tempPath)) {
        const b64 = fs.readFileSync(tempPath, { encoding: "base64" });
        try { fs.unlinkSync(tempPath); } catch (_) {}
        return b64;
      }
    } catch (fallbackError) {
      console.error("Gemma CGA fallback in generateImageBuffer also failed:", fallbackError);
    }
    throw error;
  }
}


// [START image_generation]
export async function generateImageWithGemini(
  promptId: string,
  objectType: string,
  inputImageData: string,
  visualStyle: string,
  filepath: string
): Promise<string> {
  try {
    if (inputImageData && inputImageData.startsWith("data:image/png;base64,")) {
      inputImageData = inputImageData.slice(22);
    }
    const hasInputImage = Boolean(inputImageData && inputImageData.trim().length > 0);

    // Check cache first only if no user input image was provided
    if (!hasInputImage) {
      const cachedResult = await cacheManager.getCachedImage(
        objectType,
        visualStyle,
        "gemini"
      );
      if (
        cachedResult.success &&
        cachedResult.data &&
        typeof cachedResult.data === "string"
      ) {
        console.log(
          `Using cached image for ${objectType} in ${visualStyle} style`
        );
        fs.writeFileSync(filepath, Buffer.from(cachedResult.data, "base64"));
        return filepath;
      }
    }

    // If no cache hit or input image provided, proceed with generation
    const model = aiConfig.models["generation_gemini"];
    if (!model) {
      throw new Error("Gemini model configuration not found");
    }

    const textPrompt = aiConfig.buildPrompt(promptId, {
      type: objectType,
      visualStyle: visualStyle,
    });

    const vertexChat = ai.chats.create({
      model: model,
      config: generationConfig as GenerateContentConfig,
    });

    const response = await sendGeminiMessage(
      vertexChat,
      textPrompt,
      inputImageData
    );

    // // Check for inappropriate content in the response
    console.log("response from gemini", response);
    console.log("response safety", response.candidates?.[0]);

    if (response?.candidates?.[0]?.finishReason === "SAFETY") {
      return "__BLOCKED__";
    }

    if (!response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      throw new Error("Invalid response format from Gemini API");
    }

    const rawImageData =
      response.candidates[0].content.parts[0].inlineData.data;

    // Force 1:1 square aspect ratio (512x512)
    const rawBuffer = Buffer.from(rawImageData, "base64");
    const squareBuffer = await sharp(rawBuffer)
      .resize(512, 512, { fit: "cover" })
      .toBuffer();
    const generatedImageData = squareBuffer.toString("base64");

    // Save to file
    fs.writeFileSync(filepath, squareBuffer);

    if (!fs.existsSync(filepath)) {
      throw new Error("Failed to save generated image");
    }

    // Cache the generated image
    await cacheManager.cacheImage(
      objectType,
      visualStyle,
      generatedImageData,
      "gemini"
    );

    console.log(`Saved image ${filepath}`);
    return filepath;
  } catch (error) {
    console.warn("Error in generateImageWithGemini, using Gemma CGA sprite generator fallback:", error);
    try {
      await generateImageWithGemmaCGA(objectType, visualStyle, filepath);
      return filepath;
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      throw error;
    }
  }
}


async function sendGeminiMessage(
  vertexChat: any,
  textData: string,
  inputImageData: string
): Promise<GeminiResponse> {
  try {
    const messageParts: any[] = [{ text: textData }];
    if (inputImageData && inputImageData.trim().length > 0) {
      messageParts.push({
        inlineData: {
          mimeType: "image/png",
          data: inputImageData,
        },
      });
    }

    const response = await vertexChat.sendMessage({
      message: messageParts,
    });

    if (!response) {
      throw new Error("No response received from Gemini API");
    }

    return response;
  } catch (error) {
    console.error("Error in sendGeminiMessage:", error);
    throw error;
  }
}

// Export the base64 generation function for direct access
export { generateImageBuffer };
