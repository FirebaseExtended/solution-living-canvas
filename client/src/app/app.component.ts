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

import { Boot } from './../game/scenes/Boot';
import { MainMenu } from './../game/scenes/MainMenu';
import { Preloader } from './../game/scenes/Preloader';
import { StageEarth } from './../game/scenes/StageEarth';
import { StageEarth2 } from './../game/scenes/StageEarth2';
import { StageClean } from './../game/scenes/StageClean';
import { StageSpace } from './../game/scenes/StageSpace';
import { StageMoon } from './../game/scenes/StageMoon';

import {
  StagePuzzle1,
  StagePuzzle2,
  StagePuzzle3,
  StagePuzzle4,
  StagePuzzle5,
  StagePuzzle6,
  StagePuzzle7,
} from './../game/scenes/StagePuzzles';
import {
  IOPuzzle_Fire,
  IOPuzzle_Windy,
  IOPuzzle_Ice,
  IOPuzzle_Metal,
  IOPuzzle_Rain,
  IOPuzzle_Earth,
  IOPuzzle_Lightning,
  IOPuzzle_Balance,
} from './../game/scenes/IOPuzzles';

import { Game, Types } from 'phaser';

import { RouterOutlet } from '@angular/router';

import {
  Component,
  ViewChild,
  ViewContainerRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogComponent } from './dialog/dialog.component';
import { PopupComponent } from './popup/popup.component';
import { FormsModule } from '@angular/forms';
import { LivingCanvasStage } from '../game/LivingCanvas';
import { GemmaModelService, GemmaStatus } from './services/gemma-model.service';

import { environment } from './../environments/environment';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1284,
  height: 750,
  parent: 'game-container',
  backgroundColor: '#181818',
  scale: {
    mode: Phaser.Scale.FIT,
  },
  physics: {
    default: 'matter',
    matter: {
      debug: false,
    },
  },
  scene: [
    Boot,
    Preloader,
    MainMenu,
    StageEarth,
    StageEarth2,
    StageClean,
    StageSpace,
    StageMoon,
    StagePuzzle1,
    StagePuzzle2,
    StagePuzzle3,
    StagePuzzle4,
    StagePuzzle5,
    StagePuzzle6,
    StagePuzzle7,
    IOPuzzle_Fire,
    IOPuzzle_Windy,
    IOPuzzle_Ice,
    IOPuzzle_Metal,
    IOPuzzle_Rain,
    IOPuzzle_Earth,
    IOPuzzle_Lightning,
    IOPuzzle_Balance,
  ],
};

type LevelState = {
  type: 'level' | 'sandbox' | 'complete' | 'gameOver' | 'stageSpace';
  number?: string;
  name: string;
  hint: string;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    DialogComponent,
    PopupComponent,
    RouterOutlet,
    FormsModule,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit {
  title = 'lc-client';
  phaserGame: Game;
  @ViewChild('gameContainer', { read: ViewContainerRef })
  gameContainer: ViewContainerRef;
  currentScene: string = 'IOPuzzle_Fire';
  isLocalOnlyMode: boolean = environment.localOnly || false;
  gameSettings: any = {
    imageGenerator: (environment.localOnly || false) ? 'gemma-cga' : 'imagen',
    imageAnalysis: (environment.localOnly || false) ? 'gemma-mediapipe' : 'gemini-3.7-flash',
    visualStyle: 'realistic',
  };

  gemmaStatus: GemmaStatus = { state: 'idle', progress: 0, message: '' };

  constructor(public gemmaModelService: GemmaModelService) {
    this.gemmaModelService.status$.subscribe((status) => {
      this.gemmaStatus = status;
    });
  }

  isServerModel(modelKey: string): boolean {
    return ['imagen', 'gemini', 'gemini-anim', 'veo', 'omni', 'gemini-3.7-flash', 'gemini-2.5-flash'].includes(modelKey);
  }


  showGameHelp = false;
  showAboutDemo = false;
  showLevelIntro = false;
  showLevelComplete = false;
  showGameOver = false;
  showGameWon = false;
  levelState: LevelState = {
    type: 'level',
    number: '',
    name: '',
    hint: '',
  };

  showCommandDialog: boolean = false;
  commandText: string = '';

  getLevelNumber(sceneKey: string): string {
    if (sceneKey === 'StageClean') return 'Sandbox';
    const levelMap: { [key: string]: string } = {
      IOPuzzle_Fire: '1',
      IOPuzzle_Windy: '2',
      IOPuzzle_Ice: '3',
      IOPuzzle_Metal: '4',
      IOPuzzle_Rain: '5',
      IOPuzzle_Earth: '6',
      IOPuzzle_Lightning: '7',
      IOPuzzle_Balance: '8',
    };
    return levelMap[sceneKey] || sceneKey;
  }

  getLevelName(sceneKey: string): string {
    const levelNames: { [key: string]: string } = {
      StageClean: 'Sandbox',
      IOPuzzle_Fire: 'Fire',
      IOPuzzle_Windy: 'Wind',
      IOPuzzle_Ice: 'Ice',
      IOPuzzle_Metal: 'Metal',
      IOPuzzle_Rain: 'Rain',
      IOPuzzle_Earth: 'Earth',
      IOPuzzle_Lightning: 'Lightning',
      IOPuzzle_Balance: 'Balance',
      StageSpace: 'Congratulations!',
    };
    return levelNames[sceneKey] || sceneKey;
  }

  getLevelHint(sceneKey: string): string {
    const levelHints: { [key: string]: string } = {
      StageClean: 'Experiment with different elements.',
      IOPuzzle_Fire: 'Let ice meet fire.',
      IOPuzzle_Windy: 'Follow the way of the wind.',
      IOPuzzle_Ice: 'Build a path.',
      IOPuzzle_Metal: 'Think magenetically.',
      IOPuzzle_Rain: 'Let fire meet water.',
      IOPuzzle_Earth: 'Weigh down the opportunity.',
      IOPuzzle_Lightning: 'Rust hates electricity.',
      IOPuzzle_Balance: 'Combine all your lessons.',
      StageSpace: 'You have completed all puzzles!',
      StageEarth2: 'Navigate through the water to reach your goal.',
      StageMoon: "Use the moon's low gravity to your advantage.",
    };
    return levelHints[sceneKey] || 'No hint available';
  }

  ngAfterViewInit() {
    this.phaserGame = new Game(config);
    // @ts-ignore
    window.phaserGame = this.phaserGame;
    // @ts-ignore
    this.phaserGame.app = this;

    this.phaserGame.events.on('transitionstart', (fromScene, toScene) => {
      console.log('Transitioning from', fromScene, 'to', toScene);
    });

    this.phaserGame.events.on('transitioncomplete', (fromScene, toScene) => {
      console.log('Transition complete to', toScene);
    });

    (
      document.querySelector('#game-container > canvas') as HTMLElement
    ).style.borderRadius = '25px';
    (
      document.querySelector('#game-container > canvas') as HTMLElement
    ).style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';

    setTimeout(() => {
      this.updatePhaser();
    }, 1000);
  }

  loadScene(sceneKey: string, skipIntro = false) {
    this.clearAllPopups();

    const levelNumber = this.getLevelNumber(sceneKey);
    const levelName = this.getLevelName(sceneKey);
    const levelHint = this.getLevelHint(sceneKey);

    this.levelState = {
      type:
        sceneKey === 'StageClean'
          ? 'sandbox'
          : sceneKey === 'StageSpace'
          ? 'stageSpace'
          : 'level',
      number: sceneKey === 'StageSpace' ? undefined : levelNumber,
      name: levelName,
      hint: levelHint,
    };

    if (sceneKey === this.currentScene) {
      if (this.phaserGame) {
        // Stop current scene first
        const currentScenes = this.phaserGame.scene.getScenes(true);
        currentScenes.forEach((scene) => {
          if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') {
            scene.scene.stop();
          }
        });

        setTimeout(() => {
          const currentScene = this.phaserGame.scene.getScene(sceneKey);
          if (currentScene && currentScene instanceof LivingCanvasStage) {
            currentScene.updateConfigState(this.gameSettings);
          }
          this.phaserGame.scene.start(sceneKey);
          if (!skipIntro) {
            this.showLevelIntro = true;
          }
        }, 0);
      }
      return;
    }

    this.currentScene = sceneKey;

    if (this.phaserGame) {
      const currentScenes = this.phaserGame.scene.getScenes(true);

      currentScenes.forEach((scene) => {
        if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') {
          scene.scene.stop();
        }
      });

      const currentScene = this.phaserGame.scene.getScene(sceneKey);
      if (currentScene && currentScene instanceof LivingCanvasStage) {
        currentScene.updateConfigState(this.gameSettings);
      }
      this.phaserGame.scene.start(sceneKey);
      if (!skipIntro) {
        this.showLevelIntro = true;
      }
    }
  }

  loadPuzzle() {}

  getSelectedLabel(category: string): string {
    const val = this.gameSettings[category];
    if (category === 'imageGenerator') {
      const labels: Record<string, string> = {
        'gemini': 'Gemini 3.1 Flash-Lite',
        'imagen': 'Imagen 4 Fast',
        'veo': 'Veo 3.1 Fast',
        'omni': 'Omni (Veo 3.1)',
        'gemini-anim': 'Gemini 3.1 Animation (4-Frame)',
        'gemma-cga': 'Gemma CGA Pixel Art (MediaPipe)',
        'gemma-anim': 'Gemma Animation (4-Frame)',
        'gemma-diffusion': 'DiffusionGemma (MediaPipe)',
        'gemma-diff-anim': 'DiffusionGemma Animation (4-Frame)',
      };
      return labels[val] || 'Select Model';
    } else if (category === 'imageAnalysis') {
      const labels: Record<string, string> = {
        'gemini-3.7-flash': 'Gemini 3.7 Flash',
        'gemini-2.5-flash': 'Gemini 2.5 Flash',
        'gemini': 'Gemini 3.7 Flash',
        'gemma-mediapipe': 'Gemma 4 (MediaPipe)',
        'chrome-llm': 'Chrome Built-in Model',
      };
      return labels[val] || 'Gemini 3.7 Flash';
    } else if (category === 'visualStyle') {

      const labels: Record<string, string> = {
        'realistic': 'Realistic',
        'cartoon': 'Cartoon',
        'pixellated': 'Pixel Art',
        'outline': 'Mask',
      };
      return labels[val] || 'Realistic';
    }
    return '';
  }

  setConfig(key: string, value: any) {
    if (this.isLocalOnlyMode && this.isServerModel(value)) {
      console.warn(`[Local-Only Build] Model '${value}' is disabled in local-only mode.`);
      return;
    }
    this.gameSettings[key] = value;
    if (key === 'imageGenerator' || key === 'imageAnalysis') {
      const label = this.getSelectedLabel(key);
      console.log(`%c[Gemma / Model Selected] Configured ${key} -> ${label} (${value})`, 'color: #8ea8f9; font-weight: bold;');
    }
    this.updatePhaser();

    // Update assets in the current scene without reloading
    if (key === 'visualStyle' && this.phaserGame) {
      const currentScene = this.phaserGame.scene.getScene(this.currentScene);
      if (currentScene && currentScene instanceof LivingCanvasStage) {
        currentScene.updateConfigState(this.gameSettings);
        currentScene.updateAssets();
      }
    }
  }

  updatePhaser() {
    if (this.phaserGame) {
      for (const scene of this.phaserGame.scene.getScenes(true)) {
        if (
          typeof (scene as any).updateConfigState === 'function' &&
          (scene as any).updateConfigState
        ) {
          (scene as any).updateConfigState(this.gameSettings);
        }
      }
    }
  }

  getPhaserSceneForFunction(functionName: string) {
    if (this.phaserGame) {
      for (const scene of this.phaserGame.scene.getScenes(true)) {
        if (
          typeof (scene as any)[functionName] === 'function' &&
          (scene as any)[functionName]
        ) {
          return scene;
        }
      }
    }
  }

  openGameHelp() {
    this.showGameHelp = true;
  }

  openAboutDemo() {
    this.showAboutDemo = true;
  }

  closeGameHelp() {
    this.showGameHelp = false;
  }

  closeAboutDemo() {
    this.showAboutDemo = false;
  }

  showLevelCompleteMessage() {
    this.clearAllPopups();
    this.levelState = {
      type: 'complete',
      name: 'Level Complete',
      hint: 'Moving to next level...',
    };
    this.showLevelComplete = true;
    if (this.phaserGame) {
      const currentScenes = this.phaserGame.scene.getScenes(true);
      currentScenes.forEach((scene) => {
        if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') {
          scene.scene.stop();
        }
      });
    }

    if (this.phaserGame) {
      const currentScene = this.phaserGame.scene.getScene(
        this.currentScene
      ) as any;
      if (
        currentScene &&
        currentScene.worldConfig &&
        currentScene.worldConfig.next
      ) {
        this.loadScene(currentScene.worldConfig.next, false);
      }
    }
  }

  showGameOverMessage(reason: string) {
    if (this.showGameWon || this.currentScene === 'StageSpace') {
      return;
    }

    this.clearAllPopups();

    let hint = 'Restarting level...';
    if (reason === 'key_destroyed') {
      hint = 'You destroyed the key! Restarting level...';
    }

    this.levelState = {
      type: 'gameOver',
      name: 'Game Over',
      hint: hint,
    };
    this.showGameOver = true;

    if (this.phaserGame) {
      const currentScenes = this.phaserGame.scene.getScenes(true);
      currentScenes.forEach((scene) => {
        if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') {
          scene.scene.stop();
        }
      });

      setTimeout(() => {
        const currentScene = this.phaserGame.scene.getScene(this.currentScene);
        if (currentScene && currentScene instanceof LivingCanvasStage) {
          currentScene.updateConfigState(this.gameSettings);
        }
        this.phaserGame.scene.start(this.currentScene);
      }, 500);
    }
  }

  showGameWonMessage() {
    this.clearAllPopups();
    this.levelState = {
      type: 'stageSpace',
      name: 'Congratulations!',
      hint: 'You have completed all levels!',
    };
    this.showGameWon = true;
    if (this.phaserGame) {
      const currentScenes = this.phaserGame.scene.getScenes(true);
      currentScenes.forEach((scene) => {
        if (scene.scene.key !== 'Boot' && scene.scene.key !== 'Preloader') {
          scene.scene.stop();
        }
      });
    }
  }

  private clearAllPopups() {
    this.showLevelIntro = false;
    this.showLevelComplete = false;
    this.showGameOver = false;
    this.showGameWon = false;
  }

  openCommandDialog() {
    this.showCommandDialog = true;
  }

  closeCommandDialog() {
    this.showCommandDialog = false;
  }

  handleCommandSubmitted(command: string) {
    setTimeout(() => {
      this.commandText = '';
    }, 0);

    const sceneForTargets: any =
      this.getPhaserSceneForFunction('getCurrentTargets');
    const currentTargets = sceneForTargets.getCurrentTargets();

    const scene: any = this.getPhaserSceneForFunction('logCommandToServer');
    scene.logCommandToServer(command);

    fetch(constructServerUrl('textToCommand'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command, currentTargets }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then((data) => {
        console.log('Success:', data);
        const scene: any = this.getPhaserSceneForFunction('processCommand');
        scene.processCommand(command, data);
      })
      .catch((error) => {
        console.error('Error:', error);
      });

    this.closeCommandDialog();
  }
}

function constructServerUrl(path) {
  if (window.location.hostname === 'localhost') {
    return `http://localhost:3000/${path}`;
  } else {
    // Get the URL from the environment configuration.
    return `${environment.backendUrl}/${path}`;
  }
}
