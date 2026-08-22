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

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface GemmaStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class GemmaModelService {
  private llmInference: any = null;
  private initializationPromise: Promise<void> | null = null;

  public status$ = new BehaviorSubject<GemmaStatus>({
    state: 'idle',
    progress: 0,
    message: 'Gemma Browser Model Idle',
  });

  private remoteModelUrl =
    'https://huggingface.co/google/gemma-2b-it-gpu-int4/resolve/main/gemma-2b-it-gpu-int4.bin';

  private isGenerating = false;

  constructor() {}

  public async initModel(): Promise<void> {
    if (this.llmInference) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      try {
        console.log('%c[Gemma Model Service] Initiating browser-side Gemma model loading from Hugging Face...', 'color: #8ea8f9; font-weight: bold;');
        this.status$.next({
          state: 'loading',
          progress: 10,
          message: 'Initializing WebGPU & MediaPipe Tasks GenAI engine...',
        });

        // Dynamically import @mediapipe/tasks-genai from CDN
        // @ts-ignore
        const tasksGenAi = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.20/+esm');
        const { FilesetResolver, LlmInference } = tasksGenAi;

        this.status$.next({
          state: 'loading',
          progress: 30,
          message: 'Loading WebGPU WASM binaries...',
        });

        const genAiFileset = await FilesetResolver.forGenAiTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.20/wasm'
        );

        this.status$.next({
          state: 'loading',
          progress: 55,
          message: 'Downloading Gemma 2B model weights from Hugging Face...',
        });

        this.llmInference = await LlmInference.createFromOptions(genAiFileset, {
          baseOptions: {
            modelAssetPath: this.remoteModelUrl,
          },
          maxTokens: 512,
          topK: 40,
          temperature: 0.7,
        });

        this.status$.next({
          state: 'ready',
          progress: 100,
          message: 'Gemma Browser Model loaded successfully from Hugging Face!',
        });
        console.log('%c[Gemma Model Service] Browser Gemma model is READY in WebGPU!', 'color: #55ff55; font-weight: bold;');
      } catch (error: any) {
        console.error('[Gemma Model Service] Failed to load Gemma model in browser:', error);
        this.status$.next({
          state: 'error',
          progress: 0,
          message: `Gemma load error: ${error?.message || error}`,
        });
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  public async generateText(prompt: string): Promise<string> {
    await this.initModel();
    if (!this.llmInference) throw new Error('Gemma browser model is not ready');

    while (this.isGenerating) {
      await new Promise<void>((r) => setTimeout(r, 100));
    }

    this.isGenerating = true;
    try {
      console.log('%c[Gemma Model Service] Running prompt in browser WebGPU:', 'color: #8ea8f9;', prompt);
      const result = await this.llmInference.generateResponse(prompt);
      console.log('%c[Gemma Model Service] Browser WebGPU response:', 'color: #7b95e6;', result);
      return result;
    } finally {
      this.isGenerating = false;
    }
  }

  public async analyzeImage(base64Image: string): Promise<{ type: string; attributes: string[] }> {
    console.log('%c[Gemma Model Service] Analyzing image drawing in browser...', 'color: #8ea8f9;');
    const prompt = `Analyze this drawing. Select type from: Tree, Heart, Spaceship, Bird, Human, Turret, Rock, Water, Fire, Arrow, Animal, Lightning, Cloud, Boat, Car, Dynamite, Bomb, Ball, Bricks, Fan, Ice, Magnet, Metal. Return JSON format: {"type": "Fire", "attributes": ["burns", "solid"]}`;
    try {
      const text = await this.generateText(prompt);
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (err) {
      console.warn('[Gemma Model Service] Image analysis parse fallback:', err);
    }
    return { type: 'Tree', attributes: ['solid', 'heavy'] };
  }

  public async generateCGAGrid(objectType: string, frameIndex = 0): Promise<number[][]> {
    console.log(`%c[Gemma Model Service] Generating 16x16 CGA sprite grid for ${objectType} (frame ${frameIndex}) in browser...`, 'color: #8ea8f9;');
    const prompt = `Generate a 16x16 CGA grid array (0-15) for ${objectType} frame ${frameIndex}. Output ONLY JSON 16x16 2D array.`;
    try {
      const text = await this.generateText(prompt);
      const match = text.match(/\[\s*\[[\s\S]*\]\s*\]/);
      if (match) {
        const grid = JSON.parse(match[0]);
        if (Array.isArray(grid) && grid.length === 16) {
          return grid;
        }
      }
    } catch (err) {
      console.warn('[Gemma Model Service] CGA grid parse fallback:', err);
    }
    return Array.from({ length: 16 }, () => Array(16).fill(2));
  }
}
