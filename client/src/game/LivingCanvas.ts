// @ts-nocheck
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

import { Scene, Math } from 'phaser';
import {
  IceCube,
  IceWall,
  RustedKey,
  WorldObject,
} from './objects/WorldObject';
import { WorldObjectFactory } from './objects/WorldObjectFactory';
import { Water } from './objects/Water';
import { HiddenCanvas } from './HiddenCanvas';
import { md5 } from 'js-md5';

import { environment } from '../environments/environment';

import { example_texture } from './example_texture';
import { raw } from 'body-parser';

export class LivingCanvasStage extends Scene {
  MOBILE_BREAKPOINT: number = 600;

  gameSettings: any = {
    imageGenerator: 'imagen',
    visualStyle: 'realistic',
  };

  particleConfigs = {
    loading: {
      angle: { min: 270, max: 270 },
      speed: { min: 50, max: 100 },
      scale: { start: 0.5, end: 0 },
      frequency: 200,
      lifespan: 1500,
      alpha: { start: 0.5, end: 0 },
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-50, -50, 100, 100),
      },
      depth: 995,
    },
    veo: {
      angle: { min: 270, max: 270 },
      speed: { min: 50, max: 100 },
      scale: { start: 0.5, end: 0 },
      frequency: 200,
      lifespan: 1500,
      alpha: { start: 0.5, end: 0 },
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-50, -50, 100, 100),
      },
      depth: 995,
    },
  };

  camera: Phaser.Cameras.Scene2D.Camera;
  background: Phaser.GameObjects.Image;
  msg_text: Phaser.GameObjects.Text;
  keyA: Phaser.Input.Keyboard.Key;
  keyB: Phaser.Input.Keyboard.Key;
  keyC: Phaser.Input.Keyboard.Key;
  keyD: Phaser.Input.Keyboard.Key;
  keyF: Phaser.Input.Keyboard.Key;
  keyG: Phaser.Input.Keyboard.Key;
  keyL: Phaser.Input.Keyboard.Key;
  keyM: Phaser.Input.Keyboard.Key;
  keyQ: Phaser.Input.Keyboard.Key;
  keyR: Phaser.Input.Keyboard.Key;
  keyW: Phaser.Input.Keyboard.Key;
  keySpace: Phaser.Input.Keyboard.Key;
  keyBacktick: Phaser.Input.Keyboard.Key;
  mouseDown: boolean = false;
  lastX: number = -1;
  lastY: number = -1;
  hiddenCanvas: HiddenCanvas;
  sendDelay: number;
  canvasObjects: any[] = [];
  rect: Phaser.GameObjects.Rectangle;
  rectBackground: Phaser.GameObjects.Rectangle;
  drawingInProgress: boolean = false;
  cameraStartX: number;
  cameraStartY: number;
  mouseStartX: number;
  mouseStartY: number;
  shadowbox: HTMLDivElement;
  debugEnabled: boolean = false;

  fireConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

  worldConfig = {
    name: 'Unknown',
    gameMode: 'demo',
    size: { width: 0, height: 0 },
    gravity: { x: 0, y: 0 },
    frictionAir: 0.0,
    frictionWater: 0.9,
    bgcolor: 0x000000,
    bgImage: '',
    fgImage: '',
    isVoidSpace: true,
    next: 'GameOver',
  };

  defaultFont = {
    fontFamily: 'Arial Black',
    fontSize: 32,
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 2,
    fixedWidth: 1240,
    fixedHeight: 64,
  };
  clearFont = {
    fontFamily: 'Arial Black',
    fontSize: 32,
    color: '#ff0000',
    stroke: '#000000',
    strokeThickness: 2,
    fixedWidth: 320,
    fixedHeight: 64,
  };

  worldTexture = [
    { id: 'water', asset: 'assets/water.png' },
    { id: 'droplet', asset: 'assets/droplet.png' },
    { id: 'droplet_circle', asset: 'assets/droplet_circle.png' },
    { id: 'waterbody', asset: 'assets/waterbody.jpg' },
    { id: 'gemini_sparkle', asset: 'assets/gemini_sparkle.png' },
    { id: 'imagen_sparkle', asset: 'assets/imagen_sparkle.png' },
    { id: 'veo_sparkle', asset: 'assets/veo_sparkle.png' },
  ];
  tempCanvasVisible: boolean = false;

  constructor(config: string | Phaser.Types.Scenes.SettingsConfig) {
    super(config);
    this.fireConfig = {
      angle: { min: -100, max: -80 },
      speed: { min: 200, max: 300 },
      scale: { start: 0.15, end: 0 },
      blendMode: 'MULTIPLY',
      frequency: 100,
      lifespan: 800,
      alpha: { start: 0.8, end: 0 },
      tint: 0xff6600,
      emitZone: {
        type: 'edge',
        source: new Phaser.Geom.Rectangle(-10, -20, 20, 1),
      },
      x: 0,
      y: -10,
    };
  }

  init(data: any) {
    if (data && data.gameSettings) {
      this.gameSettings = { ...this.gameSettings, ...data.gameSettings };
    }
  }

  constructServerUrl(path) {
    if (window.location.hostname === 'localhost') {
      return `http://localhost:3000/${path}`;
    } else if (window.location.hostname.startsWith('192.168.') == true) {
      // private network
      return `http://${window.location.hostname}:3000/${path}`;
    } else {
      // Get the URL from the environment configuration.
      return `${environment.backendUrl}/${path}`;
    }
  }

  updateConfigState(config: any) {
    this.gameSettings = { ...this.gameSettings, ...config };
  }

  updateAssets() {
    if (this.worldConfig.bgImage) {
      const visualStyle = this.gameSettings?.visualStyle || 'realistic';

      if (visualStyle === 'mask') {
        this.updateBackground();
        this.updateAllObjectsVisualStyle();
        return;
      }

      const currentPath = this.worldConfig.bgImage;
      const filename = currentPath.split('/').pop();

      const sceneToFilename = {
        IOPuzzle_Fire: 'io_puzzle_fire.png',
        IOPuzzle_Windy: 'io_puzzle_windy.png',
        IOPuzzle_Ice: 'io_puzzle_ice.png',
        IOPuzzle_Metal: 'io_puzzle_metal.png',
        IOPuzzle_Rain: 'io_puzzle_rain.png',
        IOPuzzle_Earth: 'io_puzzle_earth.png',
        IOPuzzle_Lightning: 'io_puzzle_lightning.png',
        IOPuzzle_Balance: 'io_puzzle_balance.png',
        StageClean: 'io_sandbox.png',
      };

      const correctFilename = sceneToFilename[this.scene.key] || filename;

      const newBgPath = `assets/generated/${visualStyle}/${correctFilename}`;

      if (newBgPath !== this.worldConfig.bgImage) {
        this.worldConfig.bgImage = newBgPath;

        const bgKey = `bgImage_${this.scene.key}_${visualStyle}`;
        this.load.image(bgKey, this.worldConfig.bgImage);

        this.load.once('complete', () => {
          this.updateBackground();
          this.updateAllObjectsVisualStyle();
        });
        this.load.start();
      } else {
        this.updateBackground();
        this.updateAllObjectsVisualStyle();
      }
    }
  }

  updateBackground() {
    if (!this.background) return;

    const visualStyle = this.gameSettings?.visualStyle || 'realistic';
    const bgKey = `bgImage_${this.scene.key}_${visualStyle}`;

    if (visualStyle === 'mask') {
      const maskMappings = {
        StageClean: 'sandbox',
        IOPuzzle_Fire: 'puzzle1',
        IOPuzzle_Windy: 'puzzle2',
        IOPuzzle_Ice: 'puzzle3',
        IOPuzzle_Metal: 'puzzle4',
        IOPuzzle_Rain: 'puzzle5',
        IOPuzzle_Earth: 'puzzle6',
        IOPuzzle_Lightning: 'puzzle7',
        IOPuzzle_Balance: 'puzzle8',
      };

      const maskKey = maskMappings[this.scene.key];
      if (!maskKey) {
        console.error(`No mask mapping found for scene ${this.scene.key}`);
        this.background.setFillStyle(0x000000);
        return;
      }

      if (this.textures.exists(maskKey)) {
        this.background.setTexture(maskKey);
        this.background.setOrigin(0, 0);
        this.background.setDisplaySize(
          this.worldConfig.size.width,
          this.worldConfig.size.height
        );
      } else {
        console.warn(`Mask texture not found for scene ${this.scene.key}`);
        this.background.setFillStyle(0x000000);
      }
      return;
    }

    if (this.textures.exists(bgKey)) {
      this.background.setTexture(bgKey);
      this.background.setOrigin(0, 0);
      this.background.setDisplaySize(
        this.worldConfig.size.width,
        this.worldConfig.size.height
      );
    } else {
      const fallbackKey = `fallback_bg_${this.scene.key}`;
      if (this.textures.exists(fallbackKey)) {
        this.background.setTexture(fallbackKey);
        this.background.setOrigin(0, 0);
        this.background.setDisplaySize(
          this.worldConfig.size.width,
          this.worldConfig.size.height
        );
      } else {
        console.warn(
          `Neither main background nor fallback found for scene ${this.scene.key}`
        );
        this.background.setFillStyle(0x000000);
      }
    }
  }

  processCommand(rawCommand: string, commandJson: any) {
    this.logConfigCommandResponse(rawCommand, commandJson);

    console.log('sendCommand response', commandJson);

    commandJson.verb = commandJson.verb.toLowerCase();
    commandJson.target = commandJson.target.toLowerCase();

    // alert("verb: " + commandJson.verb + " target: " + commandJson.target);

    var targets = [];

    switch (commandJson.target) {
      case '':
        return;
        break;
      case 'all':
        targets = this.getWorldObjectList();
        break;
      case 'last_created':
      case 'last_object':
        var last = this.getLastCreatedObject();
        if (last) {
          targets.push(this.getLastCreatedObject());
        }
        break;
      default:
        // find target by name
        targets = this.getWorldObjectList().filter(
          (obj) =>
            commandJson.target &&
            obj.name.toLowerCase() === commandJson.target.toLowerCase()
        );

        // additional target with the property
        var filter = new Object();
        filter[commandJson.target] = true;
        this.getWorldObjectList(filter).forEach((target) => {
          targets.push(target);
        });
        break;
    }

    console.log('targets: ' + targets);

    switch (commandJson.verb) {
      // case 'CREATE':
      case 'destroy':
        targets.forEach((target) => {
          target.clearEffects();
          target.addFire(true);
          target.prop.explodes = true;
          target.life = 0;
          // target.destroy();
        });
        break;
      case 'setfire':
        targets.forEach((target) => {
          target.clearEffects();
          target.addFire(true);
          target.prop.explodes = true;
          // set random life
          target.life = Phaser.Math.Between(100, 300);
        });
        break;
      case 'douse':
        targets.forEach((target) => {
          target.addWet();
        });
        break;
      case 'magnetize':
        targets.forEach((target) => {
          target.prop.metal = true;
          target.prop.magnetic = true;
          target.createMagneticForce();
          target.updateMagneticField();
        });
        break;
      case 'electrify':
        targets.forEach((target) => {
          if (target.prop?.rusted) {
            target.prop.rusted = false;
            if (target instanceof RustedKey) {
              target.setTexture('key');
            }
          }
        });
        break;
    }
  }

  addTargetKeys(targets: string[], key: string) {
    const ignoreKey = ['', 'generating', 'user_generated_obj'];
    if (ignoreKey.includes(key) || targets.includes(key)) return;
    targets.push(key);
  }

  getCurrentTargets() {
    const worldObjects = this.getWorldObjectList();
    const ignoreKey = ['', 'generating', 'user_generated_obj'];
    var targets = [];

    console.log('getCurrentTargets', JSON.stringify(worldObjects, null, 2));

    for (let i = 0; i < worldObjects.length; i++) {
      const obj = worldObjects[i];
      this.addTargetKeys(targets, obj.name);
      for (const key in obj.prop) {
        if (obj.prop[key] == true) {
          this.addTargetKeys(targets, key);
        }
      }
    }

    console.log('getCurrentTargets', targets);
    return targets;
  }

  preload() {
    this.worldConfig.size.width = this.game.config.width;
    this.worldConfig.size.height = this.game.config.height;

    if (!this.textures.exists('droplet_circle')) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(16, 16, 16);
      graphics.generateTexture('droplet_circle', 32, 32);
      graphics.destroy();
    }

    // Load mask images
    for (let i = 1; i <= 8; i++) {
      this.load.image(`puzzle${i}`, `assets/puzzle_masks/puzzle${i}.png`);
    }
    this.load.image('sandbox', 'assets/puzzle_masks/sandbox.png');

    if (this.worldConfig.bgImage) {
      const visualStyle = this.gameSettings?.visualStyle || 'realistic';
      const bgKey = `bgImage_${this.scene.key}_${visualStyle}`;
      this.load.image(bgKey, this.worldConfig.bgImage);
    }

    WorldObjectFactory.preload(this);

    for (let i = 0; i < this.worldTexture.length; i++) {
      this.load.image(this.worldTexture[i].id, this.worldTexture[i].asset);
    }

    this.hiddenCanvas = new HiddenCanvas();
  }

  getRandomWorldPosition() {
    return new Phaser.Math.Vector2(
      Phaser.Math.Between(0, this.worldConfig.size.width),
      Phaser.Math.Between(0, this.worldConfig.size.height)
    );
  }

  getWorldObjectList(filter = null): WorldObject[] {
    var list: WorldObject[] = new Array();
    this.children.list.forEach((object) => {
      if (object instanceof WorldObject) {
        if (filter == null) {
          list.push(object);
        } else {
          const matches = (obj, source) =>
            Object.keys(source).every(
              (key) => obj.hasOwnProperty(key) && obj[key] === source[key]
            );

          if (matches(object.prop, filter)) {
            list.push(object);
          }
        }
      }
    });
    return list;
  }

  getLastCreatedObject(): WorldObject {
    var last = null;
    this.children.list.forEach((object) => {
      if (object instanceof WorldObject && object.prop.user_generated_obj) {
        last = object;
      }
    });
    return last;
  }

  setFireToEverything() {
    this.getWorldObjectList().forEach((object) => {
      if (!object.prop.burns) {
        object.addFire(true);
        object.prop.explodes = true;
        // set random life
        object.life = Phaser.Math.Between(100, 300);
      }
    });
  }

  destroyAllBurnable() {
    var filter = new Object();
    filter.wooden = true;
    this.getWorldObjectList(filter).forEach((object) => {
      object.addFire(true);
      object.prop.explodes = true;
      object.life = 0;
    });
  }

  destroyAllIceBlocks() {
    this.getWorldObjectList().forEach((object) => {
      if (object instanceof IceCube || object instanceof IceWall) {
        object.addFire(true);
        object.prop.explodes = true;
        object.life = 0;
      }
    });
  }

  create() {
    var div = document.getElementById('app');
    div.style.backgroundColor = '#181818';

    this.matter.world.setBounds(
      0,
      0,
      this.worldConfig.size.width,
      this.worldConfig.size.height
    );
    this.matter.world.setGravity(
      this.worldConfig.gravity.x,
      this.worldConfig.gravity.y
    );

    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(this.worldConfig.bgcolor);

    // Escape key handler
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.tempCanvasVisible) {
        this.destroyTempCanvas();
      }
    });

    if (this.worldConfig.bgImage) {
      try {
        const visualStyle = this.gameSettings?.visualStyle || 'realistic';
        const bgKey = `bgImage_${this.scene.key}_${visualStyle}`;

        if (visualStyle === 'mask') {
          const maskMappings = {
            IOPuzzle_Fire: 'puzzle1',
            IOPuzzle_Windy: 'puzzle2',
            IOPuzzle_Ice: 'puzzle3',
            IOPuzzle_Metal: 'puzzle4',
            IOPuzzle_Rain: 'puzzle5',
            IOPuzzle_Earth: 'puzzle6',
            IOPuzzle_Lightning: 'puzzle7',
            IOPuzzle_Balance: 'puzzle8',
            StageClean: 'sandbox',
          };

          const maskKey = maskMappings[this.scene.key];
          if (maskKey && this.textures.exists(maskKey)) {
            this.background = this.add.image(0, 0, maskKey);
          } else {
            console.warn(`Mask image not found for scene ${this.scene.key}`);
            this.background = this.add.rectangle(
              0,
              0,
              this.worldConfig.size.width,
              this.worldConfig.size.height,
              0x000000
            );
          }
        } else if (this.textures.exists(bgKey)) {
          this.background = this.add.image(0, 0, bgKey);
        } else {
          // Only use fallback if the generated image doesn't exist
          const fallbackKey = `fallback_bg_${this.scene.key}`;
          if (this.textures.exists(fallbackKey)) {
            this.background = this.add.image(0, 0, fallbackKey);
          } else {
            console.warn(
              `Neither main background nor fallback found for scene ${this.scene.key}`
            );
            this.background = this.add.rectangle(
              0,
              0,
              this.worldConfig.size.width,
              this.worldConfig.size.height,
              0x000000
            );
          }
        }
        this.background.setOrigin(0, 0);
        this.background.setDisplaySize(
          this.worldConfig.size.width,
          this.worldConfig.size.height
        );
      } catch (error) {
        console.error('Error creating background:', error);
        this.background = this.add.rectangle(
          0,
          0,
          this.worldConfig.size.width,
          this.worldConfig.size.height,
          0x000000
        );
        loadingParticles.stop();
        loadingParticles.destroy();
        if (phaserObj) {
          phaserObj.destroy();
        }
        this.drawingInProgress = false;
        this.mouseDown = false;
      }
    } else {
      this.background = this.add.rectangle(
        0,
        0,
        this.worldConfig.size.width,
        this.worldConfig.size.height,
        0x000000
      );
    }

    if (this.worldConfig.gameMode == 'demo') {
      this.stageSetupDefaultObjects();
    }

    // this.rect = this.add.rectangle(-200, -200, 20, 20, 0xffffff, 1);
    this.rect = this.add.rectangle(-200, -200, 0, 0, 0xffffff, 1);
    this.rect.depth = 1000;

    this.rectBackground = this.add.rectangle(-200, -200, 0, 0, 0x000000, 1);
    this.rectBackground.depth = 900;

    this.shadowbox = document.createElement('div');
    this.shadowbox.style.position = 'absolute';
    this.shadowbox.style.display = 'none';
    this.shadowbox.style.width = '200px';
    this.shadowbox.style.height = '200px';
    this.shadowbox.style.boxShadow = '0px 0px 20px 20px rgba(0,0,0,0.5)';
    this.shadowbox.style.pointerEvents = 'none';

    window.document.body.append(this.shadowbox);

    if (this.worldConfig.gameMode != 'puzzle') {
      this.matter.add.mouseSpring();
    }

    const keyboard = this.input.keyboard;
    if (keyboard != null) {
      this.keyBacktick = keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.BACKTICK
      );
    }

    this.registerCollisionActive();

    setTimeout(() => {
      this.attachDrawingListeners();
    }, 100);
  }

  stageSetupDefaultObjects() {
    for (let i = 0; i < WorldObjectFactory.worldObjectList.length * 2; i++) {
      const pos = this.getRandomWorldPosition();
      const idx = i % WorldObjectFactory.worldObjectList.length;
      this.add.worldobject(
        WorldObjectFactory.worldObjectList[idx].id,
        pos.x,
        pos.y
      );
    }

    for (let i = 0; i < 2; i++) {
      console.log('loop');
      const pos = this.getRandomWorldPosition();
      var userProp = WorldObject.getDefaultWorldObjProp();
      userProp.explodes = true;
      this.add.userobject(pos.x, pos.y, example_texture, userProp);
    }
  }

  update() {
    if (this.debugEnabled) {
      if (Phaser.Input.Keyboard.JustDown(this.keyA)) {
        const x = this.input.x;
        const y = this.input.y;
        const idx = Phaser.Math.Between(
          0,
          WorldObjectFactory.worldObjectList.length - 1
        );
        const item = this.add.worldobject(
          WorldObjectFactory.worldObjectList[idx].id,
          x,
          y
        );
        if (item && item.prop.solid) {
          item.setFrictionAir(this.worldConfig.frictionAir);
        }
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('tree', x, y);
        item.setFrictionAir(this.worldConfig.frictionAir);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('fan', x, y);
        item.setFrictionAir(this.worldConfig.frictionAir);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyD)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('magnet', x, y);
        item.setFrictionAir(this.worldConfig.frictionAir);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyF)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('fire', x, y);
        item.setFrictionAir(this.worldConfig.frictionAir);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyG)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('bricks', x, y);
        item.setFrictionAir(this.worldConfig.frictionAir);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyL)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('lightning', x, y);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
        const x = this.input.x;
        const y = this.input.y;
        const item = this.add.worldobject('cloud', x, y);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
        const x = this.input.x;
        const y = this.input.y;
        this.add.worldobject('cloud_rainy', x, y);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyW)) {
        var filter = new Object();
        filter.metal = true;
        console.log(this.getWorldObjectList(filter));

        this.setFireToEverything();
      }

      if (this.keyQ.isDown) {
        this.safeSceneTransition('GameOver', { currentScene: this.scene.key });
      }

      if (this.keySpace.isDown && this.keySpace.shiftKey) {
        this.safeSceneTransition(this.worldConfig.next);
      }

      if (this.keySpace.isDown) {
        this.safeSceneTransition(this.name);
      }
    }

    if (this.keyBacktick.isDown) {
      this.debugEnabled = true;
      const keyboard = this.input.keyboard;

      if (keyboard != null) {
        this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyB = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
        this.keyC = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyF = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
        this.keyG = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
        this.keyL = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
        this.keyM = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
        this.keyQ = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.keyR = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.keyW = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.keySpace = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      }
    }
  }

  registerCollision(water: Water) {
    const frictionAir = this.worldConfig.frictionAir;
    const frictionWater = this.worldConfig.frictionWater;
    this.matter.world.on('collisionstart', function (event) {
      for (let i = 0; i < event.pairs.length; i++) {
        const bodyA = event.pairs[i].bodyA;
        const bodyB = event.pairs[i].bodyB;
        if (bodyA === water.sensor) {
          water.createSplash(bodyB, frictionWater);
          water.addFloating(bodyB);
          bodyB.gameObject?.addWet();
        }
        if (bodyB === water.sensor) {
          water.createSplash(bodyA, frictionWater);
          water.addFloating(bodyA);
          bodyA.gameObject?.addWet();
        }

        const gameObjectA = bodyA.gameObject;
        const gameObjectB = bodyB.gameObject;
        if (gameObjectA && gameObjectB) {
          if (gameObjectA.prop?.heavy) {
            water.removeFloating(bodyB);
            gameObjectB.prop.floats = false;
          }
          if (gameObjectB.prop?.heavy) {
            water.removeFloating(bodyA);
            gameObjectA.prop.floats = false;
          }
        }
      }
    });
    this.matter.world.on('collisionend', function (event) {
      for (let i = 0; i < event.pairs.length; i++) {
        const bodyA = event.pairs[i].bodyA;
        const bodyB = event.pairs[i].bodyB;
        if (bodyA === water.sensor) {
          water.createSplash(bodyB, frictionAir);
          water.removeFloating(bodyB);
        }
        if (bodyB === water.sensor) {
          water.createSplash(bodyA, frictionAir);
          water.removeFloating(bodyA);
        }
      }
    });
  }

  registerCollisionActive() {
    this.matter.world.on('collisionactive', function (event) {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const gameObjectA = bodyA.gameObject;
        const gameObjectB = bodyB.gameObject;
        if (gameObjectA && gameObjectB) {
          if (WorldObject.canSetFire(gameObjectA)) {
            if (gameObjectB.prop?.wooden || gameObjectB.prop?.ice) {
              gameObjectB.addFire();
            }
          }
          if (gameObjectA.prop?.lightning) {
            if (gameObjectB.prop?.rusted) {
              gameObjectB.prop.rusted = false;
              gameObjectB.setTexture('key');
            }
          }
          if (WorldObject.canSetFire(gameObjectB)) {
            if (gameObjectA.prop?.wooden || gameObjectA.prop?.ice) {
              gameObjectA.addFire();
            }
          }
          if (gameObjectB.prop?.lightning) {
            if (gameObjectA.prop?.rusted) {
              gameObjectA.prop.rusted = false;
              gameObjectA.setTexture('key');
            }
          }
        }
      }
    });
  }

  extractPropertiesFromGeminiData(rawData: JSON): Object<WorldObjProp> {
    console.log('Extracting properties from Gemini data:', rawData);

    var config = WorldObject.getZeroWorldObjProp();

    if (rawData == undefined) {
      return WorldObject.getDefaultWorldObjProp();
    }

    for (const key in config) {
      //console.log('Considering key', key);

      if (rawData.attributes.indexOf(key) != -1) {
        console.log('Setting ' + key + ' to true');
        config[key] = true;
      }
    }

    return config;
  }

  // [START send_image_data]
  async sendImageDataToServerForAnalysis(b64: string) {
    const url = this.constructServerUrl('analyseImage');

    const response = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        prompt: b64,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    });

    if (!response.ok) {
      console.log('Error in sendImageDataToServerForAnalysis', response);
      return null;
    }

    console.log(response.body);

    if (response.body !== null) {
      console.log(response.body);

      const res = await response.json();
      console.log(res);
      return res;
    }
  }
  // [END send_image_data]

  async sendToImageGenerationBackend(
    prompt: string,
    imageData: string,
    generatorType: string
  ) {
    const url = this.constructServerUrl('generateImage');

    console.log('Sending to backend:', generatorType);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          imageData: imageData,
          backend: generatorType,
          style: this.gameSettings.visualStyle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate image');
      }

      // Handle different response types based on backend
      if (generatorType === 'veo' || generatorType === 'omni') {
        // For Veo and Omni, we expect a JSON response with a hash
        const result = await response.json();
        if (result.error) {
          throw new Error(result.error);
        }
        return result.hash;
      } else {
        // For Imagen and Gemini, we expect base64 text
        const b64 = await response.text();
        if (b64.startsWith('Error:')) {
          console.log('Error in sendToImageGenerationBackend', b64);
          throw new Error(b64.substring(6));
        }
        return b64;
      }
    } catch (error) {
      console.error('Error in image generation:', error);
      throw error;
    }
  }

  cleanUpCanvasStrokes() {
    for (let i = 0; i < this.canvasObjects.length; i++) {
      this.canvasObjects[i].destroy();
    }
  }

  logImageGenerationEvent(imageData: string) {
    switch (this.gameSettings.imageGenerator) {
      case 'gemini':
        this.logGeminiGenerationResponse('data:image/png;base64,' + imageData);
        break;
      case 'imagen':
        this.logImagenGenerationResponse('data:image/png;base64,' + imageData);
        break;
      case 'veo':
      case 'omni':
        this.logVeoGenerationResponse('data:image/png;base64,' + imageData);
        break;
    }
  }

  // [START process_canvas]
  async processCanvas() {
    const generatorType = this.gameSettings.imageGenerator;
    let coords = {
      x: this.lastPointerX,
      y: this.lastPointerY,
    };

    let base64ImageData = this.hiddenCanvas.extractCanvas();
    this.logBrowserToAppHosting(base64ImageData);
    this.cleanUpCanvasStrokes();

    var initialProperties = WorldObject.getDefaultWorldObjProp();
    initialProperties.solid = false;
    initialProperties.generating = true;

    let phaserObj = await this.add.userobject(
      coords.x,
      coords.y,
      base64ImageData,
      initialProperties
    );

    const loadingParticles = this.createLoadingParticles(coords.x, coords.y);
    loadingParticles.startFollow(phaserObj);

    try {
      console.log('Sending canvas to server');
      const geminiResponse = await this.sendImageDataToServerForAnalysis(
        base64ImageData
      );
      console.log('Gemini analysis response:', geminiResponse);
      let finalProperties = WorldObject.getDefaultWorldObjProp();

      if (!geminiResponse) {
        throw new Error('No response from server');
      }

      // Check for inappropriate content response
      if (geminiResponse.shouldRemove) {
        // Clean up and remove the drawing
        loadingParticles.stop();
        loadingParticles.destroy();
        if (phaserObj) {
          phaserObj.destroy();
        }
        this.drawingInProgress = false;
        this.mouseDown = false;
        return;
      }

      console.log(
        "Gemini core 'type' guess:",
        geminiResponse.type.toLowerCase()
      );
      phaserObj.setName(geminiResponse.type.toLowerCase().toLowerCase());

      let additionalProperties =
        this.extractPropertiesFromGeminiData(geminiResponse);

      console.log('Additional Properties', additionalProperties);

      // Merge properties
      finalProperties = { ...finalProperties, ...additionalProperties };
      finalProperties.user_generated_obj = true;

      this.logGeminiAnalysisResponse(
        geminiResponse.type,
        JSON.stringify(finalProperties, null, 2)
      );

      // Start generating higher fidelity image
      const generatedImageData = await this.sendToImageGenerationBackend(
        geminiResponse.type,
        base64ImageData,
        generatorType
      );

      if (generatedImageData !== null && generatedImageData.shouldRemove) {
        loadingParticles.stop();
        loadingParticles.destroy();
        if (phaserObj) phaserObj.destroy();
        this.drawingInProgress = false;
        this.mouseDown = false;
        return;
      }

      // Stop and destroy loading particles before proceeding
      loadingParticles.stop();
      loadingParticles.destroy();

      // ...
      // [END process_canvas]

      if (generatorType === 'veo' || generatorType === 'omni') {
        // Handle Veo/Omni animation
        const hash = generatedImageData;
        const staticImageUrl = this.constructServerUrl(
          `generated/output_${hash}.png`
        );

        // Load the static image first
        this.load.image(hash, staticImageUrl);
        this.load.once('complete', () => {
          phaserObj.updateObject(hash, additionalProperties);
        });
        this.load.start();

        // Start blinking effect
        phaserObj.blinkTween = this.tweens.add({
          targets: phaserObj,
          alpha: { from: 1, to: 0.3 },
          duration: 400,
          yoyo: true,
          repeat: -1,
        });

        const veoParticles = this.add.particles(0, 0, 'veo_sparkle', {
          ...this.particleConfigs.veo,
          x: coords.x,
          y: coords.y,
        });
        veoParticles.startFollow(phaserObj);

        // Start polling for frames
        await this.pollForFramesAndShowAnimation(hash, phaserObj);

        veoParticles.stop();
        veoParticles.destroy();

        if (phaserObj && phaserObj.blinkTween) {
          phaserObj.blinkTween.stop();
          phaserObj.setAlpha(1);
        }
      } else {
        // Handle Imagen/Gemini static image
        this.logImageGenerationEvent(generatedImageData);

        const imageKey = md5(generatedImageData);

        if (this.textures.exists(imageKey)) {
          phaserObj.updateObject(imageKey, finalProperties);
        } else {
          phaserObj.updateObject(undefined, finalProperties);

          this.textures.on('onload', (textureId: string, texture) => {
            if (textureId == imageKey) {
              console.log('imagen texture id == imagekey');
              phaserObj.updateObject(textureId, finalProperties);
            }
          });

          this.textures.addBase64(
            imageKey,
            'data:image/png;base64,' + generatedImageData
          );
          console.log('added imagen texture to list');
        }
      }
    } catch (error) {
      console.error('Error in processCanvas:', error);
      // Ensure loading particles are cleaned up on error
      loadingParticles.stop();
      loadingParticles.destroy();
      // Clean up any created objects
      if (phaserObj) {
        try {
          if (phaserObj.blinkTween) {
            phaserObj.blinkTween.stop();
            phaserObj.setAlpha(1);
          }
          if (phaserObj.fire && !phaserObj.fire.destroyed) {
            phaserObj.fire.stop();
          }
          if (phaserObj.flare && !phaserObj.flare.destroyed) {
            phaserObj.flare.stop();
          }
          if (phaserObj.explosion && !phaserObj.explosion.destroyed) {
            phaserObj.explosion.stop();
          }
          if (phaserObj.drips && !phaserObj.drips.destroyed) {
            phaserObj.drips.stop();
          }
          if (phaserObj.steam && !phaserObj.steam.destroyed) {
            phaserObj.steam.stop();
          }
          if (phaserObj.tween) {
            phaserObj.tween.stop();
          }
          // Destroy the object in all error cases
          phaserObj.destroy();
        } catch (cleanupError) {
          console.error('Error during object cleanup:', cleanupError);
        }
      }
      // Reset drawing state
      this.drawingInProgress = false;
      this.mouseDown = false;
    }
  }

  checkGoalCondition(event, goal, target) {
    for (let i = 0; i < event.pairs.length; i++) {
      const bodyA = event.pairs[i].bodyA;
      const bodyB = event.pairs[i].bodyB;
      if (bodyA == goal && bodyB.gameObject == target) {
        // @ts-ignore
        if (this.worldConfig.next) {
          window.phaserGame.app.showLevelCompleteMessage();
          this.time.delayedCall(2000, () => {
            // @ts-ignore
            if (window.phaserGame && window.phaserGame.app) {
              // @ts-ignore
              window.phaserGame.app.loadScene(this.worldConfig.next, true);
            }
          });
        } else {
          // @ts-ignore
          window.phaserGame.app.showGameWonMessage();
        }
      }
      if (bodyB == goal && bodyA.gameObject == target) {
        // @ts-ignore
        if (this.worldConfig.next) {
          window.phaserGame.app.showLevelCompleteMessage();
          this.time.delayedCall(2000, () => {
            // @ts-ignore
            if (window.phaserGame && window.phaserGame.app) {
              // @ts-ignore
              window.phaserGame.app.loadScene(this.worldConfig.next, true);
            }
          });
        } else {
          // @ts-ignore
          window.phaserGame.app.showGameWonMessage();
        }
      }
    }
  }

  updateIceMelting(icewall, pos, size) {
    pos.y = pos.y + 0.5;
    icewall.setPosition(pos.x, pos.y);
    icewall.setDisplaySize(size.x, --size.y);
  }

  checkIceMelting(event, icewall, pos, size) {
    for (let i = 0; i < event.pairs.length; i++) {
      var bodyA = event.pairs[i].bodyA;
      var bodyB = event.pairs[i].bodyB;
      if (
        bodyA.gameObject == icewall &&
        WorldObject.canSetFire(bodyB.gameObject)
      ) {
        this.updateIceMelting(bodyA.gameObject, pos, size);
      }
      if (
        bodyB.gameObject == icewall &&
        WorldObject.canSetFire(bodyA.gameObject)
      ) {
        this.updateIceMelting(bodyB.gameObject, pos, size);
      }
    }
  }

  explodeTogether(target, explosive) {
    if (explosive.prop.explodes && explosive.life <= 0) {
      target.life = 1;
      target.prop.explodes = true;
    }
  }

  attachDrawingListeners() {
    var quickClickTimer: integer;
    var quickClick = false;
    var startX;
    var startY;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (
        this.tempCanvasVisible &&
        this.isWithinTempCanvas(pointer.worldX, pointer.worldY)
      ) {
        this.canvasDownEvent(pointer);
        return;
      }

      this.mouseDown = true;
      startX = pointer.x;
      startY = pointer.y;

      quickClick = true;

      const timerDuration =
        window.innerWidth < this.MOBILE_BREAKPOINT ? 200 : 300;
      quickClickTimer = setTimeout(() => {
        quickClick = false;
      }, timerDuration);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.mouseDown = false;

      if (this.tempCanvasVisible) {
        if (this.isWithinTempCanvas(pointer.worldX, pointer.worldY)) {
          this.canvasUpEvent(pointer);
          return;
        }

        this.destroyTempCanvas();
        quickClick = false;
      } else {
        if (quickClick) {
          quickClick = false;
          clearTimeout(quickClickTimer);
          this.createTempCanvas(pointer);
        }
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.tempCanvasVisible) {
        if (this.isWithinTempCanvas(pointer.worldX, pointer.worldY)) {
          this.canvasMoveEvent(pointer);
          return;
        }
      }
    });

    if (window.innerWidth < this.MOBILE_BREAKPOINT) {
      document.addEventListener(
        'touchstart',
        (e) => {
          console.log('Touch start:', e);
        },
        { passive: false }
      );

      document.addEventListener(
        'touchend',
        (e) => {
          console.log('Touch end:', e);
        },
        { passive: false }
      );
    }
  }

  isWithinTempCanvas(x: number, y: number): boolean {
    if (!this.rect) return false;

    const bounds = this.rect.getBounds();
    const result =
      x >= bounds.left &&
      x <= bounds.right &&
      y >= bounds.top &&
      y <= bounds.bottom;

    // console.log('Checking canvas bounds:', {
    // 	x,
    // 	y,
    // 	bounds,
    // 	result,
    // 	rectX: this.rect.x,
    // 	rectY: this.rect.y,
    // 	rectWidth: this.rect.width,
    // 	rectHeight: this.rect.height
    // });

    return result;
  }

  createTempCanvas(pointer: Phaser.Input.Pointer) {
    this.wipeTempCanvas();
    this.tempCanvasVisible = true;

    const isSmallScreen = window.innerWidth < this.MOBILE_BREAKPOINT;
    const canvasSize = isSmallScreen
      ? window.innerWidth - 40 < 300
        ? window.innerWidth - 40
        : 300
      : 200;
    const offset = canvasSize / 2;

    let x, y;
    if (isSmallScreen) {
      x = this.game.scale.width / 2;
      y = this.game.scale.height / 2;
    } else {
      x = pointer.x;
      y = pointer.y;
    }

    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;

    this.rect.x = x;
    this.rect.y = y;
    this.rect.width = canvasSize;
    this.rect.height = canvasSize;
    this.rect.setFillStyle(0xf8f8f8);
    this.rect.setStrokeStyle(2, 0xcccccc);
    this.rect.setOrigin(0.5, 0.5);
    this.rect.alpha = 1;
    this.rect.depth = 1000;

    this.rectBackground.x = x;
    this.rectBackground.y = y;
    this.rectBackground.width = canvasSize + 10;
    this.rectBackground.height = canvasSize + 10;
    this.rectBackground.setFillStyle(0x000000, 0.1);
    this.rectBackground.setOrigin(0.5, 0.5);
    this.rectBackground.alpha = 1;
    this.rectBackground.depth = 900;

    document.body.style.cursor =
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z'/></svg>\") 0 24, auto";

    this.rect.tween = this.rect.scene.tweens.add({
      targets: this.rect,
      props: {
        x: { from: x, to: x },
        y: { from: y, to: y },
        scale: { from: 0, to: isSmallScreen ? 2 : 1 },
      },
      duration: 150,
      ease: 'Sine.easeInOut',
      yoyo: false,
      repeat: 0,
      loopDelay: 0,
      onComplete: () => {},
      onRepeat: () => {},
    });

    this.rect.tween = this.rect.scene.tweens.add({
      targets: this.rectBackground,
      props: {
        x: { from: x, to: x },
        y: { from: y, to: y },
        scale: { from: 0, to: isSmallScreen ? 2 : 1 },
      },
      duration: 150,
      ease: 'Sine.easeInOut',
      yoyo: false,
      repeat: 0,
      loopDelay: 0,
      onComplete: () => {},
      onRepeat: () => {},
    });

    this.hiddenCanvas.canvas.width = canvasSize;
    this.hiddenCanvas.canvas.height = canvasSize;
  }

  wipeTempCanvas() {
    this.hiddenCanvas.clearCanvas();

    for (let i = 0; i < this.canvasObjects.length; i++) {
      this.canvasObjects[i].destroy();
    }
  }

  destroyTempCanvas() {
    this.tempCanvasVisible = false;

    document.body.style.cursor = 'default';

    const isSmallScreen = window.innerWidth < this.MOBILE_BREAKPOINT;

    this.rect.tween = this.rect.scene.tweens.add({
      targets: this.rect,
      props: {
        alpha: { from: 1, to: 0 },
        x: { from: this.rect.x, to: this.rect.x + this.rect.width / 4 },
        y: {
          from: this.rect.y,
          to: this.rect.y + this.rect.height / 4,
        },
        scale: { from: isSmallScreen ? 2 : 1, to: 0.5 },
      },
      duration: 150,
      ease: 'Sine.easeInOut',
      yoyo: false,
      repeat: 0,
      loopDelay: 0,
      onComplete: () => {},
      onRepeat: () => {},
    });

    this.rect.tween = this.rect.scene.tweens.add({
      targets: this.rectBackground,
      props: {
        alpha: { from: 1, to: 0 },
        x: {
          from: this.rectBackground.x,
          to: this.rectBackground.x + this.rectBackground.width / 4,
        },
        y: {
          from: this.rectBackground.y,
          to: this.rectBackground.y + this.rectBackground.height / 4,
        },
        scale: { from: isSmallScreen ? 2 : 1, to: 0.5 },
      },
      duration: 50,
      ease: 'Sine.easeInOut',
      yoyo: false,
      repeat: 0,
      loopDelay: 0,
      onComplete: () => {},
      onRepeat: () => {},
    });

    clearTimeout(this.sendDelay);
    this.wipeTempCanvas();
  }

  toCanvasCoords(x: integer, y: integer) {
    const isSmallScreen = window.innerWidth < this.MOBILE_BREAKPOINT;
    const canvasSize = isSmallScreen
      ? window.innerWidth - 40 < 300
        ? window.innerWidth - 40
        : 300
      : 200;
    const scale = isSmallScreen ? 2 : 1;

    const canvasX = (x - this.rect.x) / scale;
    const canvasY = (y - this.rect.y) / scale;

    return {
      x: (canvasX + canvasSize / 2) * (canvasSize / (canvasSize * scale)),
      y: (canvasY + canvasSize / 2) * (canvasSize / (canvasSize * scale)),
    };
  }

  pointerToCanvasCoords(pointer: Phaser.Input.Pointer) {
    const isSmallScreen = window.innerWidth < this.MOBILE_BREAKPOINT;
    const canvasSize = isSmallScreen
      ? window.innerWidth - 40 < 300
        ? window.innerWidth - 40
        : 300
      : 200;
    const scale = isSmallScreen ? 2 : 1;

    const canvasX = (pointer.worldX - this.rect.x) / scale;
    const canvasY = (pointer.worldY - this.rect.y) / scale;

    return {
      x: (canvasX + canvasSize / 2) * (canvasSize / (canvasSize * scale)),
      y: (canvasY + canvasSize / 2) * (canvasSize / (canvasSize * scale)),
    };
  }

  canvasDownEvent(pointer: Phaser.Input.Pointer) {
    const coords = this.pointerToCanvasCoords(pointer);

    this.hiddenCanvas.pointerDown(coords.x, coords.y);

    this.mouseDown = true;
    this.drawingInProgress = true;

    // Pencil cursor
    document.body.style.cursor =
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z'/></svg>\") 0 24, auto";

    let circle = this.add.circle(pointer.worldX, pointer.worldY, 3, 0x000000);
    this.canvasObjects.push(circle);
    circle.depth = 1005;

    if (this.sendDelay) {
      clearTimeout(this.sendDelay);
    }
  }

  canvasUpEvent(pointer: Phaser.Input.Pointer) {
    this.mouseDown = false;

    document.body.style.cursor = 'default';

    let circle = this.add.circle(pointer.worldX, pointer.worldY, 3, 0x000000);
    this.lastX = -1;
    this.lastY = -1;
    circle.depth = 1005;
    this.canvasObjects.push(circle);

    this.sendDelay = setTimeout(() => {
      this.processCanvas();
      this.drawingInProgress = false;
      this.destroyTempCanvas();
    }, 1500);
  }

  canvasMoveEvent(pointer: Phaser.Input.Pointer) {
    const coords = this.pointerToCanvasCoords(pointer);
    const lastCoords = this.toCanvasCoords(this.lastX, this.lastY);

    if (this.mouseDown && this.lastX >= 0 && this.lastY >= 0) {
      this.hiddenCanvas.pointerMove(coords.x, coords.y);
      this.hiddenCanvas.drawLine(
        coords.x,
        coords.y,
        lastCoords.x,
        lastCoords.y
      );

      let circle = this.add.circle(pointer.worldX, pointer.worldY, 2, 0x000000);
      circle.depth = 1005;
      let line = this.add
        .line(
          0,
          0,
          pointer.worldX,
          pointer.worldY,
          this.lastX,
          this.lastY,
          0x000000
        )
        .setOrigin(0);
      line.depth = 1005;
      line.setLineWidth(5);

      this.canvasObjects.push(circle);
      this.canvasObjects.push(line);
    }

    this.lastX = pointer.worldX;
    this.lastY = pointer.worldY;
  }

  logBrowserToAppHosting(imageData: string) {
    this.logToSolution(
      'Uploading user drawing from browser to Firebase App Hosting backend.',
      ['angular', 'apphosting'],
      'angular-apphosting',
      undefined,
      imageData
    );
  }

  logGeminiAnalysisResponse(objectType: string, propData: string) {
    this.logToSolution(
      `Gemini response to Vertex AI and Firebase App Hosting. Interpreted as "${objectType}".`,
      ['gemini', 'vertexai', 'apphosting'],
      'cloudrun-gemini',
      propData
    );
  }

  logGeminiGenerationResponse(imageData: string) {
    this.logToSolution(
      'Gemini 2.0 image generation response to Vertex AI and Firebase App Hosting.',
      ['gemini', 'vertexai', 'apphosting'],
      'vertexai-gemini',
      undefined,
      imageData
    );
  }

  logImagenGenerationResponse(imageData: string) {
    this.logToSolution(
      'Imagen image generation response to Vertex AI and Firebase App Hosting.',
      ['imagen', 'vertexai', 'apphosting'],
      'vertexai-imagen',
      undefined,
      imageData
    );
  }

  logVeoGenerationResponse(imageData: string) {
    this.logToSolution(
      'Veo video generation response to Firebase App Hosting.',
      ['veo', 'apphosting'],
      'apphosting-veo',
      undefined,
      imageData
    );
  }

  logCommandToServer(rawCommand: string) {
    this.logToSolution(
      `Uploading user command to Firebase App Hosting backend with text: ${rawCommand}`,
      ['angular', 'apphosting'],
      'angular-apphosting',
      undefined,
      undefined
    );
  }

  logConfigCommandResponse(rawCommand: string, commandData: string) {
    this.logToSolution(
      `Analysis from Gemini 2.5 Flash on: ${rawCommand}`,
      ['gemini', 'vertexai', 'apphosting'],
      'vertexai-gemini',
      JSON.stringify(commandData, null, 2),
      undefined
    );
  }

  logToSolution(
    summary: string,
    sequence: string[],
    inspect: string,
    detail?: string,
    imageData?: string
  ) {
    let message = {
      summary: summary,
      detail,
      imageData,
      type: 'log',
      sequence: sequence,
      inspect: inspect,
    };

    if (detail) message.detail = detail;
    if (detail) message.imageData = imageData;

    window.parent.postMessage(message, '*');
  }

  async pollForFramesAndShowAnimation(hash: string, phaserObj?: any) {
    console.log('Starting animation process for hash:', hash);

    const maxRetries = 30;
    const retryDelay = 2000;
    let retryCount = 0;

    const checkFrameStatus = async () => {
      try {
        // First check for error file
        const errorResponse = await fetch(
          this.constructServerUrl(`checkError/${hash}`)
        );
        if (errorResponse.ok) {
          const errorData = await errorResponse.json();
          throw new Error(errorData.error || 'Failed to generate video');
        }
        // If we get a 404, that means no error file exists, which is good
        if (errorResponse.status !== 404) {
          throw new Error(
            `Unexpected error checking status: ${errorResponse.status}`
          );
        }

        const response = await fetch(
          this.constructServerUrl(`checkFrames/${hash}`)
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Frame status:', data);
        return data;
      } catch (error) {
        console.error('Error checking frame status:', error);
        // If it's a connection error, throw it to be handled by the main loop
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          throw error;
        }
        throw error; // Re-throw other errors to be handled by the main loop
      }
    };

    const tryLoadFrames = async () => {
      return new Promise((resolve) => {
        const frameKeys = Array.from(
          { length: 4 },
          (_, i) => `genframe_${hash}_${i}`
        );

        frameKeys.forEach((key, index) => {
          const framePath = this.constructServerUrl(
            `generated/output_${hash}_frame${index}.png`
          );
          this.load.image(key, framePath);
          this.logVeoGenerationResponse(framePath);
        });

        this.load.once('complete', () => {
          resolve(true);
        });

        this.load.once('loaderror', (file) => {
          resolve(false);
        });

        this.load.start();
      });
    };

    const handleVeoFailure = () => {
      // Clean up any loaded frame textures
      for (let i = 0; i < 4; i++) {
        const frameKey = `genframe_${hash}_${i}`;
        if (this.textures.exists(frameKey)) {
          this.textures.remove(frameKey);
        }
      }

      // Stop blinking but keep the placeholder image
      if (phaserObj) {
        if (phaserObj.blinkTween) {
          phaserObj.blinkTween.stop();
          phaserObj.setAlpha(1);
        }
        // Update the object to use the static placeholder image
        const staticImageUrl = this.constructServerUrl(
          `generated/output_${hash}.png`
        );
        if (this.textures.exists(hash)) {
          phaserObj.updateObject(hash, phaserObj.prop);
        } else {
          this.load.image(hash, staticImageUrl);
          this.load.once('complete', () => {
            if (phaserObj && !phaserObj.destroyed) {
              phaserObj.updateObject(hash, phaserObj.prop);
            }
          });
          this.load.start();
        }
      }
    };

    try {
      while (retryCount < maxRetries) {
        console.log(
          `Checking frame status (attempt ${retryCount + 1} of ${maxRetries})`
        );
        try {
          const status = await checkFrameStatus();

          if (status.ready) {
            console.log('All frames are ready, attempting to load them');
            const success = await tryLoadFrames();
            if (success) {
              console.log('Frames loaded successfully');
              const frameKeys = Array.from(
                { length: 4 },
                (_, i) => `genframe_${hash}_${i}`
              );
              this.createAndPlayAnimation(hash, frameKeys, phaserObj);
              return;
            }
          } else {
            console.log(
              `Frames not ready yet (${status.progress}/${status.total} ready)`
            );
          }
        } catch (error) {
          console.error('Error during frame check:', error);
          handleVeoFailure();
          return;
        }

        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`Waiting ${retryDelay}ms before next check...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }

      console.error(
        'Failed to load animation frames after',
        maxRetries,
        'attempts'
      );
      handleVeoFailure();
    } catch (error) {
      console.error('Unexpected error during animation loading:', error);
      handleVeoFailure();
    }
  }

  createAndPlayAnimation(hash: string, frameKeys: string[], phaserObj?: any) {
    const animationKey = `bounceLoop_${hash}`;
    console.log('Starting createAndPlayAnimation for hash:', hash);

    // First ensure all textures are loaded
    const loadTextures = async () => {
      return new Promise((resolve) => {
        const unloadedFrames = frameKeys.filter(
          (frame) => !this.textures.exists(frame)
        );
        if (unloadedFrames.length === 0) {
          resolve(true);
          return;
        }

        unloadedFrames.forEach((frame) => {
          const framePath = this.constructServerUrl(
            `generated/output_${hash}_frame${frame}.png`
          );
          this.load.image(frame, framePath);
        });

        this.load.once('complete', () => {
          resolve(true);
        });

        this.load.once('loaderror', () => {
          resolve(false);
        });

        this.load.start();
      });
    };

    // Store all properties from the original object
    const originalProps = {
      x: phaserObj?.x || 0,
      y: phaserObj?.y || 0,
      prop: { ...(phaserObj?.prop || {}) },
      displayWidth: phaserObj?.displayWidth || 200,
      displayHeight: phaserObj?.displayHeight || 200,
      depth: phaserObj?.depth || 1000,
      name: phaserObj?.name || `veoAnim_${hash}`,
      physics: {
        frictionAir: phaserObj?.body?.frictionAir,
        friction: phaserObj?.body?.friction,
        restitution: phaserObj?.body?.restitution,
        density: phaserObj?.body?.density,
        mass: phaserObj?.body?.mass,
        velocity: phaserObj?.body?.velocity
          ? { ...phaserObj.body.velocity }
          : undefined,
        angularVelocity: phaserObj?.body?.angularVelocity,
        angle: phaserObj?.body?.angle,
      },
      effects: {
        hasFire: phaserObj?.fire && !phaserObj.fire.destroyed,
        hasFlare: phaserObj?.flare && !phaserObj.flare.destroyed,
        hasExplosion: phaserObj?.explosion && !phaserObj.explosion.destroyed,
        hasDrips: phaserObj?.drips && !phaserObj.drips.destroyed,
        hasSteam: phaserObj?.steam && !phaserObj.steam.destroyed,
        hasTween: phaserObj?.tween ? true : false,
        configs: {
          fire: phaserObj?.fire?.config
            ? { ...phaserObj.fire.config }
            : undefined,
          flare: phaserObj?.flare?.config
            ? { ...phaserObj.flare.config }
            : undefined,
          explosion: phaserObj?.explosion?.config
            ? { ...phaserObj.explosion.config }
            : undefined,
          drips: phaserObj?.drips?.config
            ? { ...phaserObj.drips.config }
            : undefined,
          steam: phaserObj?.steam?.config
            ? { ...phaserObj.steam.config }
            : undefined,
        },
      },
    };

    // Create a temporary placeholder while loading
    const placeholder = new WorldObject(
      this,
      originalProps.x,
      originalProps.y,
      frameKeys[0],
      originalProps.prop
    );

    // Ensure the placeholder is properly initialized
    placeholder.setActive(true);
    placeholder.setVisible(true);
    placeholder.setName(originalProps.name);
    placeholder.setDepth(originalProps.depth);
    placeholder.setOrigin(0.5, 0.5);
    placeholder.setAlpha(1);

    if (originalProps.displayWidth && originalProps.displayHeight) {
      placeholder.setDisplaySize(
        originalProps.displayWidth,
        originalProps.displayHeight
      );
    }

    // Add placeholder to the last created list
    if (!this.lastCreatedList) {
      this.lastCreatedList = [];
    }
    this.lastCreatedList.push(placeholder);

    // Load textures and create animation
    loadTextures().then((success) => {
      if (!success) {
        console.error('Failed to load animation textures');
        return;
      }

      // Create animation
      if (!this.anims.exists(animationKey)) {
        this.anims.create({
          key: animationKey,
          frames: frameKeys.map((frame) => ({ key: frame })),
          frameRate: 10,
          repeat: -1,
        });
      }

      // Start the animation on the placeholder
      placeholder.play(animationKey);
      console.log(
        'Animation started on placeholder:',
        animationKey,
        placeholder
      );

      // Wait for next frame to ensure body is initialized
      this.time.delayedCall(0, () => {
        if (placeholder && placeholder.body) {
          // Copy physics properties
          if (originalProps.physics) {
            try {
              if (originalProps.physics.frictionAir !== undefined) {
                placeholder.body.frictionAir =
                  originalProps.physics.frictionAir;
              }
              if (originalProps.physics.friction !== undefined) {
                placeholder.body.friction = originalProps.physics.friction;
              }
              if (originalProps.physics.restitution !== undefined) {
                placeholder.body.restitution =
                  originalProps.physics.restitution;
              }
              if (originalProps.physics.density !== undefined) {
                placeholder.body.density = originalProps.physics.density;
              }
              if (originalProps.physics.mass !== undefined) {
                placeholder.body.mass = originalProps.physics.mass;
              }
              if (originalProps.physics.velocity) {
                placeholder.body.velocity.x = originalProps.physics.velocity.x;
                placeholder.body.velocity.y = originalProps.physics.velocity.y;
              }
              if (originalProps.physics.angularVelocity !== undefined) {
                placeholder.body.angularVelocity =
                  originalProps.physics.angularVelocity;
              }
              if (originalProps.physics.angle !== undefined) {
                placeholder.setAngle(originalProps.physics.angle);
              }
            } catch (e) {
              console.warn('Error copying physics properties:', e);
            }
          }

          // Transfer effects
          const effectNames = [
            'fire',
            'flare',
            'explosion',
            'drips',
            'steam',
            'wind',
            'magnet',
            'tween',
            'blinkTween',
          ];
          effectNames.forEach((effect) => {
            try {
              if (
                originalProps.effects[
                  `has${effect.charAt(0).toUpperCase() + effect.slice(1)}`
                ]
              ) {
                const config = originalProps.effects.configs[effect];
                const methodName = `add${
                  effect.charAt(0).toUpperCase() + effect.slice(1)
                }`;
                if (typeof placeholder[methodName] === 'function') {
                  if (config) {
                    const newConfig = { ...config };
                    if (newConfig.followTarget) {
                      newConfig.followTarget = placeholder;
                    }
                    placeholder[methodName](newConfig);
                  } else {
                    placeholder[methodName]();
                  }
                } else {
                  // Optionally log or ignore missing method
                  // console.warn(`No method ${methodName} on placeholder`);
                }
              }
            } catch (e) {
              console.warn(`Error transferring ${effect} effect:`, e);
            }
          });

          // Transfer particle emitters from original to placeholder
          const emitterProps = [
            'windEffectLeft',
            'windEffectRight',
            'fireEmitter',
            'drips',
            'steam',
            'flare',
            'explosion',
          ];
          emitterProps.forEach((prop) => {
            if (phaserObj[prop]) {
              // Re-assign follow target if possible
              if (typeof phaserObj[prop].startFollow === 'function') {
                phaserObj[prop].startFollow(placeholder);
              }
              // Move emitter reference to placeholder
              placeholder[prop] = phaserObj[prop];
              phaserObj[prop] = null;
            }
          });
        }

        // Add a small delay before destroying the original object
        this.time.delayedCall(50, () => {
          if (phaserObj && !phaserObj.destroyed) {
            try {
              // Stop all effects before destroying
              const effectNames = [
                'fire',
                'flare',
                'explosion',
                'drips',
                'steam',
                'wind',
                'magnet',
                'tween',
                'blinkTween',
              ];
              effectNames.forEach((effect) => {
                if (phaserObj[effect] && !phaserObj[effect].destroyed) {
                  try {
                    // Stop emitting particles
                    if (phaserObj[effect].stop) {
                      phaserObj[effect].stop();
                    }
                    // Remove from update list
                    if (
                      phaserObj[effect].scene &&
                      phaserObj[effect].scene.sys &&
                      phaserObj[effect].scene.sys.updateList
                    ) {
                      phaserObj[effect].scene.sys.updateList.remove(
                        phaserObj[effect]
                      );
                    }
                    // Destroy the emitter
                    if (phaserObj[effect].destroy) {
                      phaserObj[effect].destroy();
                    }
                  } catch (e) {
                    console.warn(`Error stopping ${effect} effect:`, e);
                  }
                }
              });

              // Clear any remaining effects
              if (phaserObj.clearEffects) {
                try {
                  phaserObj.clearEffects();
                } catch (e) {
                  console.warn('Error clearing effects:', e);
                }
              }

              // Remove from update list before destroying
              if (
                phaserObj.scene &&
                phaserObj.scene.sys &&
                phaserObj.scene.sys.updateList
              ) {
                phaserObj.scene.sys.updateList.remove(phaserObj);
              }

              // Finally destroy the object
              phaserObj.destroy(true);
              console.log('Original object destroyed after delay');
            } catch (e) {
              console.warn('Error destroying original object:', e);
            }
          }
        });
      });
    });

    return placeholder;
  }

  safeSceneTransition(sceneKey: string, data?: any) {
    this.sys.events.off('update');
    this.sys.events.off('shutdown');

    const worldObjects = this.getWorldObjectList();

    const allObjects = [...worldObjects];
    if (this.canvasObjects) {
      allObjects.push(...this.canvasObjects);
    }

    allObjects.forEach((obj) => {
      if (obj && !obj.destroyed) {
        try {
          if (obj.fire && !obj.fire.destroyed) obj.fire.stop();
          if (obj.flare && !obj.flare.destroyed) obj.flare.stop();
          if (obj.explosion && !obj.explosion.destroyed) obj.explosion.stop();
          if (obj.drips && !obj.drips.destroyed) obj.drips.stop();
          if (obj.steam && !obj.steam.destroyed) obj.steam.stop();

          if (obj.tween) obj.tween.stop();

          if (obj.clearEffects) obj.clearEffects();
        } catch (e) {
          console.warn('Error stopping effects:', e);
        }
      }
    });

    if (this.sys && this.sys.displayList) {
      allObjects.forEach((obj) => {
        if (obj && !obj.destroyed) {
          try {
            this.sys.displayList.remove(obj);
          } catch (e) {
            console.warn('Error removing from display list:', e);
          }
        }
      });
    }

    if (this.sys && this.sys.updateList) {
      allObjects.forEach((obj) => {
        if (obj && !obj.destroyed) {
          try {
            this.sys.updateList.remove(obj);
          } catch (e) {
            console.warn('Error removing from update list:', e);
          }
        }
      });
    }

    allObjects.forEach((obj) => {
      if (obj && !obj.destroyed) {
        try {
          this.children.remove(obj);
        } catch (e) {
          console.warn('Error removing from children:', e);
        }
      }
    });

    allObjects.forEach((obj) => {
      if (obj && !obj.destroyed) {
        try {
          obj.destroy(true);
        } catch (e) {
          console.warn('Error destroying object:', e);
        }
      }
    });

    this.canvasObjects = [];

    this.time.delayedCall(0, () => {
      this.scene.start(sceneKey, data);
    });
  }

  shutdown() {
    this.safeSceneTransition(this.scene.key);

    super.shutdown();
  }

  updateAllObjectsVisualStyle() {
    if (this.canvasObjects) {
      this.canvasObjects.forEach((obj) => {
        if (obj instanceof WorldObject) {
          obj.clearEffects();
          obj.updateVisualStyle();
        }
      });
    }

    const worldObjects = this.getWorldObjectList();
    worldObjects.forEach((obj) => {
      if (obj instanceof WorldObject) {
        obj.clearEffects();
        obj.updateVisualStyle();
      }
    });
  }

  createLoadingParticles(x: number, y: number) {
    let sparkleTexture = '';
    switch (this.gameSettings.imageGenerator) {
      case 'gemini':
        sparkleTexture = 'gemini_sparkle';
        break;
      case 'imagen':
        sparkleTexture = 'imagen_sparkle';
        break;
      case 'veo':
      case 'omni':
        // Imagen particles for image generation step
        sparkleTexture = 'imagen_sparkle';
        break;
      default:
        sparkleTexture = 'gemini_sparkle';
    }

    const particles = this.add.particles(0, 0, sparkleTexture, {
      ...this.particleConfigs.loading,
      x: x,
      y: y,
    });

    return particles;
  }
}
