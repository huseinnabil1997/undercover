// 200 Word Pairs for Undercover/Mr. White
const WORD_PAIRS = [
    ["Apple", "Pear"], ["Coffee", "Tea"], ["Cat", "Dog"], ["Moon", "Sun"], ["Violin", "Cello"], ["Phone", "Tablet"],
    ["Pizza", "Pasta"], ["Forest", "Jungle"], ["Bicycle", "Motorcycle"], ["Doctor", "Nurse"], ["King", "Queen"], ["Ocean", "Sea"],
    ["Bread", "Toast"], ["Milk", "Cream"], ["Car", "Truck"], ["Shirt", "Jacket"], ["Shoes", "Socks"], ["Hat", "Cap"],
    ["Pencil", "Pen"], ["Notebook", "Paper"], ["Chair", "Stool"], ["Table", "Desk"], ["Lamp", "Light"], ["Window", "Door"],
    ["River", "Lake"], ["Mountain", "Hill"], ["Flower", "Bush"], ["Grass", "Leaf"], ["Rain", "Snow"], ["Wind", "Storm"],
    ["Blue", "Cyan"], ["Red", "Orange"], ["Green", "Lime"], ["Yellow", "Gold"], ["Purple", "Violet"], ["Pink", "Rose"],
    ["Square", "Rectangle"], ["Circle", "Oval"], ["Triangle", "Pyramid"], ["Star", "Diamond"], ["Line", "Curve"], ["Dot", "Point"],
    ["Fast", "Quick"], ["Slow", "Leisurely"], ["Big", "Large"], ["Small", "Tiny"], ["Hot", "Warm"], ["Cold", "Chilly"],
    ["Happy", "Joyful"], ["Sad", "Gloomy"], ["Angry", "Mad"], ["Scared", "Afraid"], ["Brave", "Courageous"], ["Funny", "Silly"],
    ["Sweet", "Sugary"], ["Sour", "Tart"], ["Bitter", "Sharp"], ["Salty", "Briny"], ["Spicy", "Hot"], ["Plain", "Bland"],
    ["Sword", "Knife"], ["Shield", "Armor"], ["Bow", "Arrow"], ["Gun", "Rifle"], ["Bomb", "Grenade"], ["Tank", "Jeep"],
    ["Ship", "Boat"], ["Plane", "Helicopter"], ["Train", "Bus"], ["Subway", "Tram"], ["Rocket", "Shuttle"], ["UFO", "Satellite"],
    ["Earth", "Mars"], ["Venus", "Jupiter"], ["Saturn", "Neptune"], ["Pluto", "Mercury"], ["Galaxy", "Nebula"], ["Comet", "Asteroid"],
    ["Gold", "Silver"], ["Bronze", "Copper"], ["Iron", "Steel"], ["Diamond", "Ruby"], ["Emerald", "Sapphire"], ["Pearl", "Opal"],
    ["Math", "Physics"], ["Science", "History"], ["Art", "Music"], ["English", "Spanish"], ["French", "German"], ["Latin", "Greek"],
    ["Lion", "Tiger"], ["Bear", "Wolf"], ["Elephant", "Rhino"], ["Giraffe", "Zebra"], ["Monkey", "Gorilla"], ["Snake", "Lizard"],
    ["Eagle", "Hawk"], ["Owl", "Falcon"], ["Parrot", "Pigeon"], ["Duck", "Goose"], ["Chicken", "Turkey"], ["Penguin", "Puffin"],
    ["Shark", "Whale"], ["Dolphin", "Porpoise"], ["Octopus", "Squid"], ["Crab", "Lobster"], ["Fish", "Shrimp"], ["Turtle", "Frog"],
    ["Ant", "Bee"], ["Spider", "Scorpion"], ["Butterfly", "Moth"], ["Fly", "Mosquito"], ["Beetle", "Cricket"], ["Worm", "Slug"],
    ["Hammer", "Mallet"], ["Screwdriver", "Wrench"], ["Saw", "Drill"], ["Pliers", "Clamp"], ["Axe", "Hatchet"], ["Shovel", "Spade"],
    ["Bed", "Couch"], ["Pillow", "Cushion"], ["Blanket", "Duvet"], ["Mirror", "Glass"], ["Rug", "Carpet"], ["Curtain", "Blind"],
    ["Plate", "Bowl"], ["Cup", "Mug"], ["Fork", "Spoon"], ["Knife", "Blade"], ["Pot", "Pan"], ["Oven", "Stove"],
    ["Soap", "Shampoo"], ["Towel", "Mat"], ["Brush", "Comb"], ["Razor", "Blade"], ["Cream", "Lotion"], ["Paste", "Gel"],
    ["City", "Town"], ["Village", "Hamlet"], ["Road", "Street"], ["Bridge", "Tunnel"], ["Tower", "Building"], ["Park", "Garden"],
    ["Clock", "Watch"], ["Calendar", "Planner"], ["Map", "Globe"], ["Compass", "Scale"], ["Thermometer", "Gauge"], ["Lens", "Glass"],
    ["Camera", "Lens"], ["Video", "Film"], ["Photo", "Image"], ["Sound", "Noise"], ["Music", "Song"], ["Radio", "Podcast"],
    ["Game", "Toy"], ["Card", "Board"], ["Ball", "Puck"], ["Racket", "Bat"], ["Ski", "Sled"], ["Bike", "Skate"],
    ["School", "College"], ["Office", "Studio"], ["Store", "Shop"], ["Bank", "Vault"], ["Post", "Mail"], ["News", "Paper"],
    ["God", "Angel"], ["Demon", "Ghost"], ["Magic", "Spell"], ["Witch", "Wizard"], ["Hero", "Villain"], ["Legend", "Myth"],
    ["Life", "Death"], ["Health", "Sickness"], ["Love", "Hate"], ["Peace", "War"], ["Truth", "Lie"], ["Fact", "Fiction"],
    ["Space", "Time"], ["Mind", "Soul"], ["Energy", "Power"], ["Heat", "Cold"], ["Dark", "Light"], ["Void", "Space"],
    ["Summer", "Winter"], ["Spring", "Autumn"], ["Day", "Night"], ["Morning", "Evening"], ["Week", "Month"], ["Year", "Century"],
    ["Human", "Person"], ["Male", "Female"], ["Boy", "Girl"], ["Man", "Woman"], ["Child", "Adult"], ["Baby", "Infant"],
    ["Brain", "Heart"], ["Lung", "Liver"], ["Bone", "Muscle"], ["Skin", "Hair"], ["Eye", "Ear"], ["Nose", "Mouth"],
    ["Wine", "Beer"], ["Juice", "Soda"], ["Water", "Ice"], ["Smoke", "Fire"], ["Ash", "Dust"], ["Mud", "Dirt"],
    ["Soft", "Hard"], ["Smooth", "Rough"], ["Clean", "Dirty"], ["Dry", "Wet"], ["Open", "Closed"], ["Full", "Empty"],
    ["Above", "Below"], ["Inside", "Outside"], ["Left", "Right"], ["Front", "Back"], ["Up", "Down"], ["Near", "Far"]
];

// --- STATE MANAGEMENT ---
let gameState = {
    names: [],
    roles: {}, // name -> { type, word }
    alive: {}, // name -> boolean
    seen: {},  // name -> boolean (tracks who has seen their word)
    config: { undercover: 1, mrwhite: 1 },
    seed: null,
    isHost: true, // For Pass & Play, we are always the host
    currentPlayer: null
};

// --- DOM ELEMENTS ---
const screens = {
    setup: document.getElementById('setup-screen'),
    lobby: document.getElementById('lobby-screen'),
    join: document.getElementById('join-screen'),
    reveal: document.getElementById('reveal-screen'),
    board: document.getElementById('game-board-screen')
};

// --- UTILS ---
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
    window.scrollTo(0, 0);
}

function generateSeed() {
    return Math.random().toString(36).substring(2, 9);
}

function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function shuffle(array, seed) {
    let m = array.length, t, i;
    let s = 0;
    for(let j=0; j<seed.length; j++) s += seed.charCodeAt(j);
    
    while (m) {
        i = Math.floor(seededRandom(s++) * m--);
        t = array[m];
        array[m] = array[i];
        array[i] = t;
    }
    return array;
}

// --- SETUP LOGIC ---
function addPlayerInput(name = "") {
    const container = document.getElementById('player-list');
    const div = document.createElement('div');
    div.className = 'player-input-row';
    div.innerHTML = `
        <input type="text" class="player-name-input" placeholder="Player Name" value="${name}">
        <button class="remove-player-btn danger-btn" style="width: 50px;">×</button>
    `;
    container.appendChild(div);

    div.querySelector('.remove-player-btn').onclick = () => {
        if (document.querySelectorAll('.player-input-row').length > 4) {
            div.remove();
        } else {
            alert("Minimum 4 players required.");
        }
    };
}

// Initialize setup with 4 players
for (let i = 0; i < 4; i++) addPlayerInput();
document.getElementById('add-player-btn').onclick = () => addPlayerInput();

// --- GAME LOGIC ---
function startGame() {
    const nameInputs = document.querySelectorAll('.player-name-input');
    const names = Array.from(nameInputs).map(i => i.value.trim()).filter(n => n !== "");
    
    if (names.length < 4) {
        alert("At least 4 players needed.");
        return;
    }

    const uCount = parseInt(document.getElementById('undercover-count').value);
    const wCount = parseInt(document.getElementById('mrwhite-count').value);
    
    if (uCount + wCount >= names.length - 1) {
        alert("Too many special roles for this number of players.");
        return;
    }

    const customCiv = document.getElementById('word-civilian').value.trim();
    const customUnd = document.getElementById('word-undercover').value.trim();
    
    let words;
    if (customCiv && customUnd) {
        words = [customCiv, customUnd];
    } else {
        words = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
    }

    const seed = generateSeed();
    
    gameState.names = names;
    gameState.config = { undercover: uCount, mrwhite: wCount };
    gameState.seed = seed;
    
    initRoles(words);
    startPassAndPlay();
}

function initRoles(words) {
    const rolesPool = [];
    for (let i = 0; i < gameState.config.undercover; i++) rolesPool.push('undercover');
    for (let i = 0; i < gameState.config.mrwhite; i++) rolesPool.push('mrwhite');
    while (rolesPool.length < gameState.names.length) rolesPool.push('civilian');

    const shuffledPool = shuffle([...rolesPool], gameState.seed);
    
    gameState.roles = {};
    gameState.alive = {};
    gameState.seen = {};
    gameState.names.forEach((name, i) => {
        const type = shuffledPool[i];
        let word = "";
        if (type === 'civilian') word = words[0];
        else if (type === 'undercover') word = words[1];
        else word = "???";

        gameState.roles[name] = { type, word };
        gameState.alive[name] = true;
        gameState.seen[name] = false;
    });
}

function startPassAndPlay() {
    showScreen('join');
    updateNameSelectionList();
}

function updateNameSelectionList() {
    const list = document.getElementById('name-selection-list');
    list.innerHTML = "";
    
    gameState.names.forEach(name => {
        const isSeen = gameState.seen[name];
        const btn = document.createElement('button');
        btn.className = `name-btn ${isSeen ? 'seen' : ''}`;
        btn.innerHTML = `${name} ${isSeen ? '✅' : ''}`;
        btn.disabled = isSeen;
        btn.onclick = () => pickName(name);
        list.appendChild(btn);
    });

    // Check if everyone has seen their roles
    const everyoneSeen = gameState.names.every(n => gameState.seen[n]);
    if (everyoneSeen) {
        const startBoardBtn = document.createElement('button');
        startBoardBtn.className = "primary-btn";
        startBoardBtn.style.marginTop = "20px";
        startBoardBtn.innerText = "Start Discussion";
        startBoardBtn.onclick = () => {
            showScreen('board');
            updateBoard();
        };
        list.appendChild(startBoardBtn);
    }
}

function pickName(name) {
    gameState.currentPlayer = name;
    document.getElementById('player-name-display').innerText = `Hello, ${name}`;
    
    const role = gameState.roles[name];
    document.getElementById('role-type').innerText = role.type.replace('mrwhite', 'Mr. White');
    document.getElementById('secret-word').innerText = role.type === 'mrwhite' ? "You have no word!" : role.word;
    
    // Reset card state
    const roleCard = document.getElementById('role-card');
    roleCard.classList.remove('flipped');
    document.getElementById('confirm-reveal-btn').classList.add('hidden');
    
    showScreen('reveal');
}

// --- CARD FLIP ---
const roleCard = document.getElementById('role-card');
roleCard.onclick = () => {
    roleCard.classList.toggle('flipped');
    if (roleCard.classList.contains('flipped')) {
        document.getElementById('confirm-reveal-btn').classList.remove('hidden');
    }
};

document.getElementById('confirm-reveal-btn').onclick = () => {
    gameState.seen[gameState.currentPlayer] = true;
    startPassAndPlay(); // Go back to name selection
};

// --- GAME BOARD ---
function updateBoard() {
    const list = document.getElementById('player-status-list');
    list.innerHTML = "";
    
    let civs = 0, unds = 0, whites = 0;

    gameState.names.forEach(name => {
        const isAlive = gameState.alive[name];
        const role = gameState.roles[name];
        
        if (isAlive) {
            if (role.type === 'civilian') civs++;
            else if (role.type === 'undercover') unds++;
            else whites++;
        }

        const div = document.createElement('div');
        div.className = `status-row ${isAlive ? '' : 'dead'}`;
        div.innerHTML = `
            <span>${name} ${!isAlive ? `(${role.type === 'mrwhite' ? 'Mr. White' : role.type})` : ''}</span>
            ${isAlive ? `<button class="danger-btn eliminate-btn" data-name="${name}">Eliminate</button>` : ''}
        `;
        list.appendChild(div);
    });

    document.getElementById('civ-left').innerText = civs;
    document.getElementById('und-left').innerText = unds;
    document.getElementById('whi-left').innerText = whites;

    // Check Win Conditions
    if (unds === 0 && whites === 0) {
        setTimeout(() => alert("Civilians Win!"), 100);
    } else if (civs <= unds + whites) {
        setTimeout(() => alert("Undercovers / Mr. White Win!"), 100);
    }
}

document.addEventListener('click', e => {
    if (e.target.classList.contains('eliminate-btn')) {
        const name = e.target.getAttribute('data-name');
        if (confirm(`Eliminate ${name}?`)) {
            gameState.alive[name] = false;
            updateBoard();
        }
    }
});

// --- BUTTON BINDS ---
document.getElementById('start-game-btn').onclick = startGame;
document.getElementById('reset-game-btn').onclick = () => {
    if (confirm("End this game and start a new one?")) {
        window.location.href = window.location.pathname;
    }
};
