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
import { cacheManager } from "./cache-manager";

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

// Procedural 16x16 CGA Sprite Generators for Game Objects
function getCGAGridForObject(objectType: string): number[][] {
  const typeLower = objectType.toLowerCase();
  const grid: number[][] = Array.from({ length: 16 }, () => Array(16).fill(0));

  if (typeLower.includes("tree")) {
    // Tree Leaves (Green/Bright Green)
    for (let r = 2; r <= 8; r++) {
      const width = r <= 5 ? r : 10 - r;
      for (let c = 8 - width; c <= 8 + width; c++) {
        grid[r][c] = (r + c) % 2 === 0 ? 2 : 10;
      }
    }
    // Trunk (Brown)
    for (let r = 9; r <= 14; r++) {
      grid[r][7] = 6;
      grid[r][8] = 6;
    }
  } else if (typeLower.includes("fire")) {
    // Fire (Red, Yellow, White)
    for (let r = 3; r <= 14; r++) {
      const spread = Math.min(r - 2, 14 - r);
      for (let c = 8 - spread; c <= 8 + spread; c++) {
        if (r > 10) grid[r][c] = 12; // Bright Red
        else if (r > 6) grid[r][c] = 14; // Yellow
        else grid[r][c] = 15; // White hot center
      }
    }
  } else if (typeLower.includes("water") || typeLower.includes("ice")) {
    // Water / Ice (Blue, Cyan, Bright Cyan)
    for (let r = 4; r <= 13; r++) {
      for (let c = 3; c <= 12; c++) {
        grid[r][c] = (r + c) % 2 === 0 ? 3 : 11;
      }
    }
  } else if (typeLower.includes("car")) {
    // Car body (Red/Light Gray)
    for (let r = 7; r <= 9; r++) {
      for (let c = 4; c <= 12; c++) grid[r][c] = 4;
    }
    for (let r = 10; r <= 12; r++) {
      for (let c = 2; c <= 14; c++) grid[r][c] = 12;
    }
    // Wheels
    grid[13][3] = 8; grid[13][4] = 8;
    grid[13][11] = 8; grid[13][12] = 8;
  } else if (typeLower.includes("cloud")) {
    // Cloud (Light Gray, White)
    for (let r = 5; r <= 11; r++) {
      const w = r < 8 ? r - 2 : 13 - r;
      for (let c = 8 - w; c <= 8 + w; c++) grid[r][c] = (r + c) % 2 === 0 ? 15 : 7;
    }
  } else if (typeLower.includes("rock") || typeLower.includes("bricks") || typeLower.includes("metal")) {
    // Rock / Bricks (Gray / Dark Gray)
    for (let r = 4; r <= 12; r++) {
      for (let c = 4; c <= 12; c++) grid[r][c] = (r * c) % 3 === 0 ? 8 : 7;
    }
  } else {
    // Default Heart / Star / Generic Sprite
    for (let r = 3; r <= 13; r++) {
      const w = r <= 8 ? r - 2 : 14 - r;
      for (let c = 8 - w; c <= 8 + w; c++) {
        grid[r][c] = 13; // Magenta
      }
    }
  }

  return grid;
}

export async function generateImageWithGemmaCGA(
  objectType: string,
  visualStyle: string,
  outputPath: string
): Promise<string> {
  console.log(`[Gemma MediaPipe CGA] Generating pixel art sprite for ${objectType}...`);

  try {
    const grid = getCGAGridForObject(objectType);
    const size = 512;
    const cols = 16;
    const rows = 16;
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

    console.log(`[Gemma MediaPipe CGA] Saved CGA sprite to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("Error in generateImageWithGemmaCGA:", error);
    throw error;
  }
}
