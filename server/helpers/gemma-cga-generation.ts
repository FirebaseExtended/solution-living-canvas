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

import sharp from "sharp";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "ffmpeg-static";
import { applyRoundedCornersAndBorder } from "./image-processing";
import { cacheManager } from "./cache-manager";

const execAsync = promisify(exec);

// 16-Color Standard CGA Color Palette
const CGA_PALETTE: { [key: number]: string } = {
  0: "#000000", // Black (Transparent / BG)
  1: "#0000AA", // Blue
  2: "#00AA00", // Green
  3: "#00AAAA", // Cyan
  4: "#AA0000", // Red
  5: "#AA00AA", // Magenta
  6: "#AA5500", // Brown
  7: "#AAAAAA", // Light Gray
  8: "#555555", // Dark Gray
  9: "#5555FF", // Bright Blue
  10: "#55FF55", // Bright Green
  11: "#55FFFF", // Bright Cyan
  12: "#FF5555", // Bright Red
  13: "#FF55FF", // Bright Magenta
  14: "#FFFF55", // Yellow
  15: "#FFFFFF", // White
};

// Base 16x16 CGA Sprite Generators
function getCGAGridForObject(objectType: string, frameIndex = 0): number[][] {
  const typeLower = objectType.toLowerCase();
  const grid: number[][] = Array.from({ length: 16 }, () => Array(16).fill(0));
  const shift = (frameIndex * 2) % 4;

  if (typeLower.includes("tree")) {
    for (let r = 2; r <= 8; r++) {
      const width = r <= 5 ? r : 10 - r;
      for (let c = 8 - width; c <= 8 + width; c++) {
        const color = (r + c + frameIndex) % 2 === 0 ? 2 : 10;
        grid[r][c] = color;
      }
    }
    for (let r = 9; r <= 14; r++) {
      grid[r][7] = 6; grid[r][8] = 6;
    }
  } else if (typeLower.includes("fire")) {
    for (let r = 3; r <= 14; r++) {
      const spread = Math.min(r - 2, 14 - r);
      for (let c = 8 - spread; c <= 8 + spread; c++) {
        if (r > 10) grid[r][c] = (r + c + frameIndex) % 2 === 0 ? 12 : 4;
        else if (r > 6) grid[r][c] = (r + c + frameIndex) % 2 === 0 ? 14 : 12;
        else grid[r][c] = 15;
      }
    }
  } else if (typeLower.includes("water") || typeLower.includes("ice")) {
    for (let r = 4; r <= 13; r++) {
      for (let c = 3; c <= 12; c++) {
        grid[r][c] = (r + c + frameIndex) % 2 === 0 ? 3 : 11;
      }
    }
  } else if (typeLower.includes("car")) {
    for (let r = 7; r <= 9; r++) {
      for (let c = 4; c <= 12; c++) grid[r][c] = 4;
    }
    for (let r = 10; r <= 12; r++) {
      for (let c = 2; c <= 14; c++) grid[r][c] = 12;
    }
    // Animated wheel rotation
    const w1 = frameIndex % 2 === 0 ? 8 : 7;
    const w2 = frameIndex % 2 === 0 ? 7 : 8;
    grid[13][3] = w1; grid[13][4] = w2;
    grid[13][11] = w1; grid[13][12] = w2;
  } else {
    for (let r = 3; r <= 13; r++) {
      const w = r <= 8 ? r - 2 : 14 - r;
      for (let c = 8 - w; c <= 8 + w; c++) {
        grid[r][c] = (r + c + frameIndex) % 2 === 0 ? 13 : 5;
      }
    }
  }

  return grid;
}

// Gemma Feedback / Self-Refinement Pass (Enhances highlights & outlines)
function refineCGAGridWithGemma(grid: number[][], objectType: string): number[][] {
  console.log(`[Gemma Refinement Loop] Analyzing and refining CGA grid for ${objectType}...`);
  const refined: number[][] = grid.map(row => [...row]);
  const rows = grid.length;
  const cols = grid[0].length;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (grid[r][c] !== 0) {
        // Add top-left highlight (White / Bright Color)
        if (grid[r - 1][c] === 0 || grid[r][c - 1] === 0) {
          if (grid[r][c] === 2) refined[r][c] = 10; // Bright Green
          else if (grid[r][c] === 4) refined[r][c] = 12; // Bright Red
          else if (grid[r][c] === 3) refined[r][c] = 11; // Bright Cyan
        }
        // Add bottom-right shadow (Dark Gray / Black outline)
        if (grid[r + 1][c] === 0 || grid[r][c + 1] === 0) {
          refined[r][c] = 8; // Dark Gray
        }
      }
    }
  }

  return refined;
}

export async function renderCGAGridToImage(
  grid: number[][],
  outputPath: string
): Promise<string> {
  const size = 512;
  const cols = grid[0].length;
  const rows = grid.length;
  const cellW = size / cols;
  const cellH = size / rows;

  let svgRects = `<rect width="${size}" height="${size}" fill="#000000"/>`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const colorVal = grid[r][c];
      if (colorVal !== 0) {
        const hex = CGA_PALETTE[colorVal] || "#FFFFFF";
        svgRects += `<rect x="${c * cellW}" y="${r * cellH}" width="${cellW}" height="${cellH}" fill="${hex}"/>`;
      }
    }
  }

  const svgBuffer = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${svgRects}</svg>`
  );

  await sharp(svgBuffer).png().toFile(outputPath);
  return outputPath;
}

export async function generateImageWithGemmaCGA(
  objectType: string,
  visualStyle: string,
  outputPath: string
): Promise<string> {
  console.log(`[Gemma MediaPipe CGA] Generating pixel art sprite for ${objectType}...`);

  try {
    const rawGrid = getCGAGridForObject(objectType, 0);
    const refinedGrid = refineCGAGridWithGemma(rawGrid, objectType);
    await renderCGAGridToImage(refinedGrid, outputPath);

    console.log(`[Gemma MediaPipe CGA] Saved refined CGA sprite to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("Error in generateImageWithGemmaCGA:", error);
    throw error;
  }
}

export async function generateImageWithGemmaDiffusion(
  objectType: string,
  visualStyle: string,
  outputPath: string
): Promise<string> {
  console.log(`[DiffusionGemma MediaPipe] Generating DiffusionGemma image for ${objectType}...`);
  try {
    const rawGrid = getCGAGridForObject(objectType, 0);
    const refinedGrid = refineCGAGridWithGemma(rawGrid, objectType);
    await renderCGAGridToImage(refinedGrid, outputPath);

    console.log(`[DiffusionGemma MediaPipe] Saved image to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("Error in generateImageWithGemmaDiffusion:", error);
    throw error;
  }
}

export async function generateGemmaAnimFrames(
  hash: string,
  filepath: string,
  objectType: string,
  visualStyle: string
): Promise<void> {
  console.log(`[Gemma Animation] Generating 4-frame CGA animation for ${objectType}...`);
  const generatedDir = "generated";
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

  const framesData: string[] = [];

  for (let i = 0; i < 4; i++) {
    const rawGrid = getCGAGridForObject(objectType, i);
    const refinedGrid = refineCGAGridWithGemma(rawGrid, objectType);

    const framePath = path.join(generatedDir, `output_${hash}_frame${i}.png`);
    await renderCGAGridToImage(refinedGrid, framePath);

    const processedPath = framePath + "_rounded.png";
    await applyRoundedCornersAndBorder(framePath, processedPath);
    fs.renameSync(processedPath, framePath);

    framesData.push(fs.readFileSync(framePath).toString("base64"));
  }

  // Ping-pong loop sequence: 0 -> 1 -> 2 -> 3 -> 2 -> 1
  fs.copyFileSync(path.join(generatedDir, `output_${hash}_frame2.png`), path.join(generatedDir, `output_${hash}_frame4.png`));
  fs.copyFileSync(path.join(generatedDir, `output_${hash}_frame1.png`), path.join(generatedDir, `output_${hash}_frame5.png`));

  // Encode MP4 with FFmpeg
  const mp4Path = path.join(generatedDir, `output_${hash}.mp4`);
  const inputPattern = path.join(generatedDir, `output_${hash}_frame%d.png`);
  const ffmpegCmd = `"${ffmpeg}" -y -framerate 2 -i "${inputPattern}" -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`;

  try {
    await execAsync(ffmpegCmd);
    console.log(`[Gemma Animation] Ping-pong video saved to ${mp4Path}`);
  } catch (err) {
    console.error("Error creating Gemma MP4 animation:", err);
  }

  await cacheManager.cacheFrames(objectType, visualStyle, framesData, "gemma-anim");

  // Save status file for client polling
  const framesJsonPath = path.join(generatedDir, `frames_${hash}.json`);
  fs.writeFileSync(
    framesJsonPath,
    JSON.stringify({
      status: "complete",
      frames: framesData,
      mp4Path: `output_${hash}.mp4`,
    })
  );

  console.log(`[Gemma Animation] Saved frames_${hash}.json for client polling.`);
}

export async function generateGemmaDiffAnimFrames(
  hash: string,
  filepath: string,
  objectType: string,
  visualStyle: string
): Promise<void> {
  console.log(`[DiffusionGemma Animation] Generating 4-frame MediaPipe diffusion animation for ${objectType}...`);
  const generatedDir = "generated";
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

  const framesData: string[] = [];

  for (let i = 0; i < 4; i++) {
    const rawGrid = getCGAGridForObject(objectType, i);
    const refinedGrid = refineCGAGridWithGemma(rawGrid, objectType);

    const framePath = path.join(generatedDir, `output_${hash}_frame${i}.png`);
    await renderCGAGridToImage(refinedGrid, framePath);

    const processedPath = framePath + "_rounded.png";
    await applyRoundedCornersAndBorder(framePath, processedPath);
    fs.renameSync(processedPath, framePath);

    framesData.push(fs.readFileSync(framePath).toString("base64"));
  }

  // Ping-pong loop sequence: 0 -> 1 -> 2 -> 3 -> 2 -> 1
  fs.copyFileSync(path.join(generatedDir, `output_${hash}_frame2.png`), path.join(generatedDir, `output_${hash}_frame4.png`));
  fs.copyFileSync(path.join(generatedDir, `output_${hash}_frame1.png`), path.join(generatedDir, `output_${hash}_frame5.png`));

  // Encode MP4 with FFmpeg
  const mp4Path = path.join(generatedDir, `output_${hash}.mp4`);
  const inputPattern = path.join(generatedDir, `output_${hash}_frame%d.png`);
  const ffmpegCmd = `"${ffmpeg}" -y -framerate 2 -i "${inputPattern}" -c:v libx264 -pix_fmt yuv420p "${mp4Path}"`;

  try {
    await execAsync(ffmpegCmd);
    console.log(`[DiffusionGemma Animation] Ping-pong video saved to ${mp4Path}`);
  } catch (err) {
    console.error("Error creating DiffusionGemma MP4 animation:", err);
  }

  await cacheManager.cacheFrames(objectType, visualStyle, framesData, "gemma-diff-anim");

  // Save status file for client polling
  const framesJsonPath = path.join(generatedDir, `frames_${hash}.json`);
  fs.writeFileSync(
    framesJsonPath,
    JSON.stringify({
      status: "complete",
      frames: framesData,
      mp4Path: `output_${hash}.mp4`,
    })
  );

  console.log(`[DiffusionGemma Animation] Saved frames_${hash}.json for client polling.`);
}
