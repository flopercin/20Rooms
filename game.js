import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer;
let audioListener, sound;

// Controls
let controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false; // Note: not jumping, but keeping var for standard implementation

// Velocity and Direction
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

// Mobile controls
let isMobile = false;
let joystickActive = false;
let joystickVector = new THREE.Vector2();
let lookActive = false;
let previousTouch = null;
let yawObject = new THREE.Object3D();
let pitchObject = new THREE.Object3D();

// Game objects and logic
let roomGroup = new THREE.Group();
let furnitureBoxes = []; // Array of Box3
let doorBox = new THREE.Box3();
let keyMesh = null;
let keyBox = new THREE.Box3();
let currentRoom = 1;
let totalRooms = 20;
let hasKey = false;
let playerBox = new THREE.Box3();
const roomSize = 20; // globalizing room size for bounds checking

init();
animate();

function init() {
    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0); // slightly grayish white
    scene.fog = new THREE.Fog(0xf0f0f0, 0, 50); // Optional fog for liminal feel

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.y = 1.6; // average eye height

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 4. Lighting setup
    // Ambient light - soft and white
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light - soft shadowless
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // 5. Audio setup
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    sound = new THREE.Audio(audioListener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('music/sunday_afternoon_light.mp3', function(buffer) {
        sound.setBuffer(buffer);
        sound.setLoop(true);
        sound.setVolume(0.5);
    });

    // 6. Controls setup
    setupControls();

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Detect mobile
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Start button logic
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
        document.getElementById('start-menu').style.display = 'none';

        if (isMobile) {
            startMobile();
        } else {
            controls.lock();
        }

        // Play sound if loaded
        if (!sound.isPlaying && sound.buffer) {
            sound.play();
        }

        // Generate the first room
        scene.add(roomGroup);
        generateRoom();
    });
}

function setupControls() {
    controls = new PointerLockControls(camera, document.body);

    controls.addEventListener('lock', function () {
        document.body.classList.add('locked');
    });

    controls.addEventListener('unlock', function () {
        document.body.classList.remove('locked');
        if (!isMobile) {
            document.getElementById('start-menu').style.display = 'flex';
        }
    });

    scene.add(controls.getObject());

    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Mobile yaw/pitch setup
    yawObject.add(pitchObject);
    pitchObject.add(camera);
}

function startMobile() {
    document.getElementById('mobile-controls').style.display = 'block';
    scene.add(yawObject);
    yawObject.position.copy(camera.position);
    camera.position.set(0,0,0);

    // Request fullscreen and orientation
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    }

    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(err => {
            console.log(`Error attempting to lock orientation: ${err.message}`);
        });
    }

    setupMobileTouch();
}

function setupMobileTouch() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickKnob = document.getElementById('joystick-knob');
    if (!joystickKnob) {
        const knob = document.createElement('div');
        knob.id = 'joystick-knob';
        joystickZone.appendChild(knob);
    }
    const knob = document.getElementById('joystick-knob');

    let joystickCenter = { x: 0, y: 0 };
    let joystickRadius = 75;

    joystickZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect = joystickZone.getBoundingClientRect();
        joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        joystickActive = true;
        updateJoystick(touch);
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (joystickActive) {
            updateJoystick(e.changedTouches[0]);
        }
    }, { passive: false });

    joystickZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        joystickActive = false;
        joystickVector.set(0, 0);
        knob.style.transform = `translate(0px, 0px)`;
    }, { passive: false });

    function updateJoystick(touch) {
        let dx = touch.clientX - joystickCenter.x;
        let dy = touch.clientY - joystickCenter.y;

        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > joystickRadius) {
            dx = (dx / distance) * joystickRadius;
            dy = (dy / distance) * joystickRadius;
        }

        knob.style.transform = `translate(${dx}px, ${dy}px)`;

        joystickVector.set(dx / joystickRadius, dy / joystickRadius);
    }

    const lookZone = document.getElementById('look-zone');
    lookZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        lookActive = true;
        previousTouch = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (lookActive && previousTouch) {
            const touch = e.changedTouches[0];
            const movementX = touch.clientX - previousTouch.x;
            const movementY = touch.clientY - previousTouch.y;

            const sensitivity = 0.005;
            yawObject.rotation.y -= movementX * sensitivity;
            pitchObject.rotation.x -= movementY * sensitivity;

            // Constrain pitch
            pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));

            previousTouch = { x: touch.clientX, y: touch.clientY };
        }
    }, { passive: false });

    lookZone.addEventListener('touchend', (e) => {
        e.preventDefault();
        lookActive = false;
        previousTouch = null;
    }, { passive: false });
}

function generateRoom() {
    // Clear previous room
    while (roomGroup.children.length > 0) {
        roomGroup.remove(roomGroup.children[0]);
    }
    furnitureBoxes = [];
    keyMesh = null;

    const roomSize = 20;
    const wallHeight = 5;
    const roomMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.9, side: THREE.BackSide });

    // Room Box (Floor, Ceiling, Walls)
    const roomGeometry = new THREE.BoxGeometry(roomSize, wallHeight, roomSize);
    const room = new THREE.Mesh(roomGeometry, roomMaterial);
    room.position.y = wallHeight / 2;
    roomGroup.add(room);

    // Door
    const doorWidth = 2;
    const doorHeight = 4;
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 0.2);
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xd0d0d0 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);

    // Random door placement (N, E, S, W)
    const wallIndex = Math.floor(Math.random() * 4);
    if (wallIndex === 0) { // North
        door.position.set(0, doorHeight/2, -roomSize/2);
    } else if (wallIndex === 1) { // East
        door.position.set(roomSize/2, doorHeight/2, 0);
        door.rotation.y = Math.PI / 2;
    } else if (wallIndex === 2) { // South
        door.position.set(0, doorHeight/2, roomSize/2);
    } else { // West
        door.position.set(-roomSize/2, doorHeight/2, 0);
        door.rotation.y = Math.PI / 2;
    }
    roomGroup.add(door);

    door.updateMatrixWorld();
    doorBox.setFromObject(door);

    // Generate Furniture
    const numFurniture = Math.floor(Math.random() * 5) + 3; // 3 to 7 pieces

    for (let i = 0; i < numFurniture; i++) {
        createFurniture(roomSize);
    }

    // Generate Key
    spawnKey(roomSize);

    // Reset state
    hasKey = false;
    document.getElementById('key-status').textContent = 'Key: Not Found';
    document.getElementById('key-status').style.color = '#666';
    document.getElementById('room-counter').textContent = `Room: ${currentRoom}/${totalRooms}`;
    showMessage("Find the key to open the door");

    // Reset player position
    if (isMobile) {
        yawObject.position.set(0, 1.6, 0);
    } else {
        controls.getObject().position.set(0, 1.6, 0);
    }
}

function showMessage(text) {
    const msgEl = document.getElementById('message');
    msgEl.textContent = text;
    msgEl.style.opacity = 1;
    setTimeout(() => { msgEl.style.opacity = 0; }, 3000);
}

function createFurniture(roomSize) {
    const furnitureTypes = [
        { w: 2, h: 1, d: 2, y: 0.5 }, // Table
        { w: 1, h: 3, d: 1, y: 1.5 }, // Tall cabinet
        { w: 3, h: 0.5, d: 1, y: 0.25 }, // Low shelf
        { w: 1, h: 1, d: 1, y: 0.5 } // Cube stand
    ];

    const type = furnitureTypes[Math.floor(Math.random() * furnitureTypes.length)];
    const geometry = new THREE.BoxGeometry(type.w, type.h, type.d);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const mesh = new THREE.Mesh(geometry, material);

    // Try to find a valid position
    let validPos = false;
    let attempts = 0;

    while (!validPos && attempts < 50) {
        mesh.position.x = (Math.random() - 0.5) * (roomSize - 4);
        mesh.position.z = (Math.random() - 0.5) * (roomSize - 4);
        mesh.position.y = type.y;

        // Prevent spawning in center (player spawn area)
        if (Math.abs(mesh.position.x) < 2 && Math.abs(mesh.position.z) < 2) {
            attempts++;
            continue;
        }

        mesh.updateMatrixWorld();
        const box = new THREE.Box3().setFromObject(mesh);

        let overlap = false;
        for (let b of furnitureBoxes) {
            if (box.intersectsBox(b)) {
                overlap = true;
                break;
            }
        }

        // Don't block door
        if (box.intersectsBox(doorBox)) {
            overlap = true;
        }

        if (!overlap) {
            validPos = true;
            furnitureBoxes.push(box);
            roomGroup.add(mesh);
        }
        attempts++;
    }
}

function spawnKey(roomSize) {
    const keyGeo = new THREE.OctahedronGeometry(0.2);
    const keyMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xaa8800,
        roughness: 0.2,
        metalness: 1.0
    });
    keyMesh = new THREE.Mesh(keyGeo, keyMat);

    let validPos = false;

    while (!validPos) {
        keyMesh.position.x = (Math.random() - 0.5) * (roomSize - 2);
        keyMesh.position.z = (Math.random() - 0.5) * (roomSize - 2);
        keyMesh.position.y = 0.2; // On floor by default

        // 50% chance to place on furniture
        if (Math.random() > 0.5 && furnitureBoxes.length > 0) {
            const fBox = furnitureBoxes[Math.floor(Math.random() * furnitureBoxes.length)];
            keyMesh.position.x = (fBox.min.x + fBox.max.x) / 2;
            keyMesh.position.z = (fBox.min.z + fBox.max.z) / 2;
            keyMesh.position.y = fBox.max.y + 0.2; // Placed exactly on top
            validPos = true;
        } else {
            // Place on floor, ensure it's not inside furniture
            keyMesh.updateMatrixWorld();
            keyBox.setFromObject(keyMesh);

            let overlap = false;
            for (let b of furnitureBoxes) {
                // Ignore y for overlap check to prevent spawning *under* furniture
                const bXZ = new THREE.Box3(
                    new THREE.Vector3(b.min.x, -1, b.min.z),
                    new THREE.Vector3(b.max.x, 10, b.max.z)
                );
                if (keyBox.intersectsBox(bXZ)) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) validPos = true;
        }
    }

    roomGroup.add(keyMesh);
    keyMesh.updateMatrixWorld();
    keyBox.setFromObject(keyMesh);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();

    if (controls.isLocked || isMobile) {
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        const moveSpeed = 40.0;

        if (isMobile) {
            // Mobile movement using joystickVector
            direction.z = joystickVector.y;
            direction.x = joystickVector.x;
            direction.normalize(); // this ensures consistent movements in all directions

            // Calculate movement relative to camera rotation
            const euler = new THREE.Euler(0, yawObject.rotation.y, 0, 'YXZ');
            const vec = new THREE.Vector3(direction.x, 0, direction.z).applyEuler(euler);

            if (joystickActive) {
                velocity.x -= vec.x * moveSpeed * delta;
                velocity.z -= vec.z * moveSpeed * delta;
            }

            yawObject.position.x -= velocity.x * delta;
            yawObject.position.z -= velocity.z * delta;

        } else {
            // PC movement using WASD
            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();

            if (moveForward || moveBackward) velocity.z -= direction.z * moveSpeed * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta;

            // Apply movement to temp variables first to check collision
            const dx = -velocity.x * delta;
            const dz = -velocity.z * delta;

            controls.moveRight(dx);
            controls.moveForward(dz);
        }

        // --- Collision and Game Logic ---

        // Get player position
        const playerPos = isMobile ? yawObject.position : controls.getObject().position;

        // Wall bounds
        const bound = (roomSize / 2) - 0.5;
        if (playerPos.x < -bound) playerPos.x = -bound;
        if (playerPos.x > bound) playerPos.x = bound;
        if (playerPos.z < -bound) playerPos.z = -bound;
        if (playerPos.z > bound) playerPos.z = bound;

        // Furniture collision
        playerBox.setFromCenterAndSize(
            new THREE.Vector3(playerPos.x, playerPos.y - 0.6, playerPos.z), // Shift down so it hits low shelves
            new THREE.Vector3(1, 2, 1) // rough player size
        );

        for (let box of furnitureBoxes) {
            if (playerBox.intersectsBox(box)) {
                // Simple resolution: undo movement by pushing away
                // Determine smallest intersection depth
                const pMin = playerBox.min;
                const pMax = playerBox.max;
                const bMin = box.min;
                const bMax = box.max;

                const dX1 = pMax.x - bMin.x;
                const dX2 = bMax.x - pMin.x;
                const dZ1 = pMax.z - bMin.z;
                const dZ2 = bMax.z - pMin.z;

                const minOverlap = Math.min(dX1, dX2, dZ1, dZ2);

                if (minOverlap === dX1) playerPos.x -= dX1;
                else if (minOverlap === dX2) playerPos.x += dX2;
                else if (minOverlap === dZ1) playerPos.z -= dZ1;
                else if (minOverlap === dZ2) playerPos.z += dZ2;

                // Re-update box after resolution
                playerBox.setFromCenterAndSize(
                    new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z),
                    new THREE.Vector3(1, 2, 1)
                );
            }
        }

        // Key pickup logic
        if (!hasKey && keyMesh && playerBox.intersectsBox(keyBox)) {
            hasKey = true;
            roomGroup.remove(keyMesh);
            keyMesh = null;
            document.getElementById('key-status').textContent = 'Key: Found';
            document.getElementById('key-status').style.color = '#daa520';
            showMessage("Key found! Head to the door.");
        }

        // Door logic
        if (playerBox.intersectsBox(doorBox)) {
            if (hasKey) {
                currentRoom++;
                if (currentRoom > totalRooms) {
                    // Win state
                    if (!isMobile) controls.unlock();
                    document.getElementById('mobile-controls').style.display = 'none';
                    document.getElementById('end-menu').style.display = 'flex';
                } else {
                    showMessage("Room Complete");
                    generateRoom();
                }
            } else {
                // Optional: bounce off door or show message once
                // showMessage("The door is locked. Find the key.");
            }
        }
    }

    // Key rotation animation
    if (keyMesh) {
        keyMesh.rotation.y += 0.05;
        keyMesh.rotation.x += 0.02;
    }

    prevTime = time;

    renderer.render(scene, camera);
}
