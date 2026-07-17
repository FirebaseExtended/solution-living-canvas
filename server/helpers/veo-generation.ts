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
import { GoogleGenAI } from "@google/genai";
import { spawn } from "child_process";
import sharp from "sharp";
import fs from "fs";
import path from "path";

import util from "util";
import { applyRoundedCornersAndBorder, resizeImage } from "./image-processing";
import { generateImageBuffer } from "./imagen-generation";
import { generateImageWithGemini } from "./gemini-generation";
import ffmpeg from "ffmpeg-static";
import { config as aiConfig } from "./ai-config-helper";
import { cacheManager } from "./cache-manager";

const { apiKey } = getGoogleCloudConfig();

// Initialize the Google Generative AI client with API key
const ai = new GoogleGenAI({
  apiKey: apiKey,
});

interface GenerateStaticImageResult {
  hash: string;
  processedImage: string;
  filepathOriginal: string;
}

// Generate only the static image (for immediate placeholder)
export async function generateStaticImage(
  objectType: string,
  visualStyle: string,
  filepath: string,
  filepathSmall: string,
  filepathOriginal: string
): Promise<GenerateStaticImageResult> {
  try {
    // For Veo, use the special pool logic
    let base64Image = await getOrCreateImagenPoolImage(objectType, visualStyle);
    const imageBuffer = Buffer.from(base64Image, "base64");
    const writeFile = util.promisify(fs.writeFile);

    // Save the original model output
    if (filepathOriginal) {
      await writeFile(filepathOriginal, imageBuffer);
    }

    // Save the temporary image
    const tempFilePath = filepath + "_temp.png";
    await writeFile(tempFilePath, imageBuffer);

    // Process the image (rounded corners, etc.)
    await applyRoundedCornersAndBorder(tempFilePath, filepath);
    await resizeImage(filepath, filepathSmall);

    fs.readFileSync(filepathSmall);

    // Clean up the temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Extract hash from filepathSmall
    const match = filepathSmall.match(/output_(.+?)_small\.png$/);
    const hash = match ? match[1] : "";

    // Read the resized image and return as base64
    const resizedBuffer = fs.readFileSync(filepathSmall);
    const resizedBase64 = resizedBuffer.toString("base64");

    return { hash, processedImage: resizedBase64, filepathOriginal };
  } catch (error) {
    console.error("Error in generateStaticImage:", error);
    throw error;
  }
}

// Generate the video and frames in the background
export async function generateVideoAndFrames(
  hash: string,
  filepath: string,
  objectType?: string,
  visualStyle?: string,
  backend: string = "veo"
): Promise<void> {
  try {
    // If objectType and visualStyle are not provided, try to extract from filepath
    if (!objectType || !visualStyle) {
      // First try to get from the original filepath
      const originalMatch = filepath.match(/output_(.+?)_(.+?)_original\.png/);
      if (originalMatch) {
        objectType = originalMatch[1];
        visualStyle = originalMatch[2];
        console.log(
          `Extracted objectType: ${objectType}, visualStyle: ${visualStyle} from original filepath`
        );
      } else {
        // If that fails, try to get from the small filepath
        const smallMatch = filepath.match(/output_(.+?)_(.+?)_small\.png/);
        if (smallMatch) {
          objectType = smallMatch[1];
          visualStyle = smallMatch[2];
          console.log(
            `Extracted objectType: ${objectType}, visualStyle: ${visualStyle} from small filepath`
          );
        }
      }
    }

    if (!objectType || !visualStyle) {
      console.error("Could not determine objectType and visualStyle");
      return;
    }

    console.log(`Checking cache for ${objectType} in ${visualStyle} style`);

    // Check for cached frames
    const cachedFramesResult = await cacheManager.getCachedFrames(
      objectType,
      visualStyle
    );
    if (cachedFramesResult.success && cachedFramesResult.data) {
      console.log(
        `Found cached frames for ${objectType} in ${visualStyle} style`
      );
      // Save the cached frames to the generated directory
      for (let i = 0; i < cachedFramesResult.data.length; i++) {
        const framePath = path.join(
          "generated",
          `output_${hash}_frame${i}.png`
        );
        // Write the cached frame
        fs.writeFileSync(
          framePath,
          Buffer.from(cachedFramesResult.data[i], "base64")
        );

        // Process the frame with rounded corners and border
        const processedFramePath = framePath + "_processed.png";
        await applyRoundedCornersAndBorder(framePath, processedFramePath);
        // Replace the original frame with the processed one
        fs.renameSync(processedFramePath, framePath);
        console.log(`Processed frame ${i} with rounded corners and border`);
      }

      // Create video from processed frames
      console.log(
        `Creating video from processed frames for ${objectType} in ${visualStyle} style`
      );
      const videoPath = path.join("generated", `output_${hash}.mp4`);

      // Create a video from the processed frames using ffmpeg
      await new Promise<void>((resolve, reject) => {
        const framePattern = path.join(
          "generated",
          `output_${hash}_frame%d.png`
        );
        const ffmpegProcess = spawn(ffmpeg as string, [
          "-framerate",
          "1", // 1 frame per second
          "-i",
          framePattern,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-vf",
          "fps=24", // Output at 24fps
          "-y",
          videoPath,
        ]);

        ffmpegProcess.stderr?.on("data", (data) => {
          console.log(`ffmpeg video creation: ${data.toString()}`);
        });

        ffmpegProcess.on("close", (code) => {
          if (code === 0) {
            console.log("Video created successfully from processed frames");
            resolve();
          } else {
            reject(new Error(`FFmpeg video creation exited with code ${code}`));
          }
        });

        ffmpegProcess.on("error", (err) => {
          console.error("Error creating video from frames:", err);
          reject(err);
        });
      });
      return;
    }

    // Only proceed with generation if we have no cached content
    console.log(
      `No cached content found, proceeding with generation for ${objectType} in ${visualStyle} style (backend: ${backend})`
    );

    if (backend === "gemini-anim") {
      await generateGeminiAnimFrames(hash, filepath, objectType, visualStyle);
      return;
    }

    // [START video_generation]
    
    const modelKey = backend === "omni" ? "omni_generation" : "veo_generation";
    const modelId = aiConfig.models[modelKey] || (backend === "omni" ? "omni-2.0-generate-001" : "veo-2.0-generate-001");
    const prompt = aiConfig.prompts[modelKey] || aiConfig.prompts["veo_generation"];
    const imageBuffer = fs.readFileSync(filepath);

    // Pad to 9:16 aspect ratio (e.g., 1080x1920)
    const paddedBuffer = await sharp(imageBuffer)
      .resize({
        width: 1080,
        height: 1920,
        fit: "contain",
      })
      .toBuffer();

    const image = paddedBuffer.toString("base64");

    // Generate the video
    let operation = await ai.models.generateVideos({
      model: modelId,
      image: {
        imageBytes: image,
        mimeType: "image/png",
      },
      config: {
        aspectRatio: "9:16",
        durationSeconds: 4,
        // @ts-ignore
        prompt: prompt,
      },
    });

    // ...
    // [END video_generation]

    // Poll for operation completion
    while (!operation.done) {
      console.log("Polling video generation status...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (!operation.response?.generatedVideos?.length) {
      throw new Error("No videos generated in response");
    }

    const generatedVideo = operation.response.generatedVideos[0];
    if (!generatedVideo.video?.uri) {
      throw new Error("No video URI in response");
    }

    // Download the video
    const generatedDir = "generated";
    if (!fs.existsSync(generatedDir))
      fs.mkdirSync(generatedDir, { recursive: true });
    const videoPath = path.join(generatedDir, `output_${hash}.mp4`);
    const resp = await fetch(`${generatedVideo.video.uri}&key=${apiKey}`);
    if (!resp.ok) {
      throw new Error(`Failed to download video: ${resp.statusText}`);
    }
    const buffer = await resp.arrayBuffer();
    const videoBuffer = Buffer.from(buffer);
    await fs.promises.writeFile(videoPath, videoBuffer);

    // Extract frames from the video
    const frameCount = 4;
    const videoDuration = 4;
    const epsilon = 0.05;
    const timestamps = Array.from({ length: frameCount }, (_, i) =>
      i === frameCount - 1
        ? videoDuration - epsilon
        : parseFloat(((i * videoDuration) / (frameCount - 1)).toFixed(2))
    );

    // Extract and process frames
    const frames: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const framePath = path.join(generatedDir, `output_${hash}_frame${i}.png`);
      await new Promise<void>((resolveFrame, rejectFrame) => {
        console.log(`Extracting frame ${i} at ${timestamps[i]}s`);
        const frameProcess = spawn(ffmpeg as string, [
          "-ss",
          timestamps[i].toString(),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-vf",
          "crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
          "-q:v",
          "2",
          "-y",
          framePath,
        ]);

        frameProcess.stderr?.on("data", (data) => {
          console.log(`ffmpeg frame ${i} extraction: ${data.toString()}`);
        });

        frameProcess.on("close", async (code) => {
          if (code === 0) {
            if (fs.existsSync(framePath)) {
              const frameStats = fs.statSync(framePath);
              if (frameStats.size > 0) {
                console.log(
                  `Frame ${i} extracted successfully (${frameStats.size} bytes)`
                );
                try {
                  const processedFramePath = framePath + "_rounded.png";
                  await applyRoundedCornersAndBorder(
                    framePath,
                    processedFramePath
                  );
                  fs.renameSync(processedFramePath, framePath);
                  console.log(
                    `Frame ${i} processed with rounded corners and border.`
                  );

                  // Read the processed frame and add to frames array
                  const frameBuffer = fs.readFileSync(framePath);
                  frames.push(frameBuffer.toString("base64"));
                  resolveFrame();
                } catch (err) {
                  console.error(`Error processing frame ${i}:`, err);
                  rejectFrame(err);
                }
              } else {
                rejectFrame(new Error(`Extracted frame ${i} is empty`));
              }
            } else {
              rejectFrame(new Error(`Frame ${i} file not created`));
            }
          } else {
            rejectFrame(
              new Error(
                `FFmpeg frame extraction for frame ${i} exited with code ${code}`
              )
            );
          }
        });

        frameProcess.on("error", (err) => {
          console.error(`Error extracting frame ${i}:`, err);
          rejectFrame(err);
        });
      });
    }

    // Cache the frames if we have objectType and visualStyle
    if (objectType && visualStyle) {
      const framesCacheResult = await cacheManager.cacheFrames(
        objectType,
        visualStyle,
        frames
      );
      if (!framesCacheResult.success) {
        console.warn("Failed to cache frames:", framesCacheResult.error);
      }

      console.log(
        `Cached ${frames.length} frames for ${objectType} in ${visualStyle} style`
      );
    }

    console.log("Video and frames generated successfully for hash:", hash);
  } catch (error) {
    console.error("Error in background video/frame generation:", error);
    // Create an error file to signal the frontend
    const errorFile = path.join("generated", `error_${hash}.json`);
    await fs.promises.writeFile(
      errorFile,
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to generate video",
        timestamp: new Date().toISOString(),
      })
    );
    throw error; // Re-throw the error to be handled by the route handler
  }
}

// Function to extract frames from video using ffmpeg-static
async function extractFrames(
  videoPath: string,
  objectType: string,
  visualStyle: string,
  hash: string
): Promise<string> {
  const generatedDir = "generated";
  if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
  }

  // Check cache first for all frames
  const cachedFramesResult = await cacheManager.getCachedFrames(
    objectType,
    visualStyle
  );
  if (cachedFramesResult.success && cachedFramesResult.data) {
    console.log(
      `Retrieved cached frames for ${objectType} in ${visualStyle} style`
    );
    // Save the cached frames to the generated directory
    for (let i = 0; i < cachedFramesResult.data.length; i++) {
      const framePath = path.join(generatedDir, `output_${hash}_frame${i}.png`);
      fs.writeFileSync(
        framePath,
        Buffer.from(cachedFramesResult.data[i], "base64")
      );
    }
    return hash;
  }

  return new Promise((resolve, reject) => {
    const frameCount = 4;
    const videoDuration = 5; // 5 seconds minimum duration
    // Distribute frames evenly: 0s, 1.66s, 3.33s, 5s
    const epsilon = 0.05; // 50ms before the end
    const timestamps = Array.from({ length: frameCount }, (_, i) =>
      i === frameCount - 1
        ? videoDuration - epsilon
        : parseFloat(((i * videoDuration) / (frameCount - 1)).toFixed(2))
    );
    const framePromises = timestamps.map((timestamp, i) => {
      // [START frame_extraction]
      const framePath = path.join(generatedDir, `output_${hash}_frame${i}.png`);

      return new Promise((resolveFrame, rejectFrame) => {
        console.log(`Extracting frame ${i} at ${timestamp}s`);
        const frameProcess = spawn(ffmpeg as string, [
          "-ss",
          timestamp.toString(),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-vf",
          "crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
          "-q:v",
          "2",
          "-y",
          framePath,
        ]);

        frameProcess.stderr?.on("data", (data) => {
          console.log(`ffmpeg frame ${i} extraction: ${data.toString()}`);
        });

        frameProcess.on("close", async (code) => {
          if (code === 0) {
            if (fs.existsSync(framePath)) {
              const frameStats = fs.statSync(framePath);
              if (frameStats.size > 0) {
                console.log(
                  `Frame ${i} extracted successfully (${frameStats.size} bytes)`
                );
                // Process the frame to add rounded corners and border
                try {
                  const processedFramePath = framePath + "_rounded.png";
                  await applyRoundedCornersAndBorder(
                    framePath,
                    processedFramePath
                  );
                  fs.renameSync(processedFramePath, framePath);
                  console.log(
                    `Frame ${i} processed with rounded corners and border.`
                  );
                  resolveFrame(framePath);
                } catch (err) {
                  console.error(`Error processing frame ${i}:`, err);
                  rejectFrame(err);
                }
              } else {
                rejectFrame(new Error(`Extracted frame ${i} is empty`));
              }
            } else {
              rejectFrame(new Error(`Frame ${i} file not created`));
            }
          } else {
            rejectFrame(
              new Error(
                `FFmpeg frame extraction for frame ${i} exited with code ${code}`
              )
            );
          }
        });

        // ...
        // [END frame_extraction]

        frameProcess.on("error", (err) => {
          console.error(`Error extracting frame ${i}:`, err);
          rejectFrame(err);
        });
      });
    });

    Promise.all(framePromises)
      .then(() => {
        console.log("All frames extracted and processed successfully");
        resolve(hash);
      })
      .catch((err) => {
        console.error("Error extracting or processing frames:", err);
        reject(err);
      });
  });
}

// Helper for Veo: get any image from Imagen pool, or create one if pool is empty
async function getOrCreateImagenPoolImage(
  objectType: string,
  visualStyle: string
): Promise<string> {
  // Try to find any image in the Imagen pool
  for (let i = 0; i < cacheManager.config.poolSize; i++) {
    const cacheKey = `imagen_${objectType.toLowerCase()}_${visualStyle.toLowerCase()}_${i}`;
    const cachePath = path.join(cacheManager.paths.cacheDir, `${cacheKey}.png`);
    if (fs.existsSync(cachePath)) {
      const imageBuffer = fs.readFileSync(cachePath);
      return imageBuffer.toString("base64");
    }
  }
  // If none found, generate and cache the first one using the normal Imagen logic
  await generateImageBuffer(objectType, visualStyle, "imagen_generation");
  // Now, find the file that was just created (should be _0.png)
  const cacheKey = `imagen_${objectType.toLowerCase()}_${visualStyle.toLowerCase()}_0`;
  const cachePath = path.join(cacheManager.paths.cacheDir, `${cacheKey}.png`);
  if (!fs.existsSync(cachePath)) {
    throw new Error(`Failed to create image file at ${cachePath}`);
  }
  const imageBuffer = fs.readFileSync(cachePath);
  return imageBuffer.toString("base64");
}

async function generateGeminiAnimFrames(
  hash: string,
  filepath: string,
  objectType: string,
  visualStyle: string
): Promise<void> {
  console.log(
    `Generating 4-frame Gemini animation for ${objectType} in ${visualStyle} style...`
  );
  const generatedDir = "generated";
  if (!fs.existsSync(generatedDir))
    fs.mkdirSync(generatedDir, { recursive: true });

  const framesData: string[] = [];

  // Frame 0: original static image
  const frame0Path = path.join(generatedDir, `output_${hash}_frame0.png`);
  fs.copyFileSync(filepath, frame0Path);
  const processedFrame0Path = frame0Path + "_rounded.png";
  await applyRoundedCornersAndBorder(frame0Path, processedFrame0Path);
  fs.renameSync(processedFrame0Path, frame0Path);
  framesData.push(fs.readFileSync(frame0Path).toString("base64"));

  let lastFrameImageData = fs.readFileSync(filepath).toString("base64");

  // Generate frames 1, 2, 3 sequentially using Gemini
  for (let i = 1; i < 4; i++) {
    console.log(`Generating Gemini animation frame ${i} for ${objectType}...`);
    const currentFramePath = path.join(
      generatedDir,
      `output_${hash}_frame${i}.png`
    );
    await generateImageWithGemini(
      "gemini_anim_frame",
      objectType,
      lastFrameImageData,
      visualStyle,
      currentFramePath
    );

    const rawFrameBuffer = fs.readFileSync(currentFramePath);
    lastFrameImageData = rawFrameBuffer.toString("base64");

    const processedFramePath = currentFramePath + "_rounded.png";
    await applyRoundedCornersAndBorder(currentFramePath, processedFramePath);
    fs.renameSync(processedFramePath, currentFramePath);

    framesData.push(fs.readFileSync(currentFramePath).toString("base64"));
  }

  // Ping-pong loop sequence: 0 -> 1 -> 2 -> 3 -> 2 -> 1
  const frame4Path = path.join(generatedDir, `output_${hash}_frame4.png`);
  const frame5Path = path.join(generatedDir, `output_${hash}_frame5.png`);
  fs.copyFileSync(
    path.join(generatedDir, `output_${hash}_frame2.png`),
    frame4Path
  );
  fs.copyFileSync(
    path.join(generatedDir, `output_${hash}_frame1.png`),
    frame5Path
  );

  const pingPongFramesData = [
    framesData[0],
    framesData[1],
    framesData[2],
    framesData[3],
    framesData[2],
    framesData[1],
  ];

  // Cache ping-pong frames
  await cacheManager.cacheFrames(objectType, visualStyle, pingPongFramesData);

  // Create MP4 video from processed frames using ffmpeg (frames 0..5)
  console.log(`Creating MP4 ping-pong video for Gemini animation...`);
  const videoPath = path.join(generatedDir, `output_${hash}.mp4`);
  const framePattern = path.join(generatedDir, `output_${hash}_frame%d.png`);
  await new Promise<void>((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpeg as string, [
      "-framerate",
      "2",
      "-i",
      framePattern,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "fps=24",
      "-y",
      videoPath,
    ]);

    ffmpegProcess.stderr?.on("data", (data) => {
      console.log(`ffmpeg video creation: ${data.toString()}`);
    });

    ffmpegProcess.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg video creation exited with code ${code}`));
    });

    ffmpegProcess.on("error", (err) => reject(err));
  });
}
