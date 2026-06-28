// State variables
let activeTab = "stats";
let activeConsole = null;
let activeRestoreEmulator = null;
let consolesData = [];
let romsData = [];
let shadersData = [];
let savesData = [];
let statsInterval = null;

// DOM Elements
const navItems = document.querySelectorAll(".nav-item");
const tabPanels = document.querySelectorAll(".tab-panel");
const tabTitle = document.getElementById("tab-title");
const btnRefreshStats = document.getElementById("btn-refresh-stats");
const deckIpDisplay = document.getElementById("deck-ip-display");
const sshIpInfo = document.getElementById("ssh-ip-info");

// Format helpers
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Navigation Tabs
navItems.forEach(item => {
    item.addEventListener("click", () => {
        const tab = item.getAttribute("data-tab");
        switchTab(tab);
    });
});

function switchTab(tab) {
    activeTab = tab;
    
    // Update menu state
    navItems.forEach(item => {
        if (item.getAttribute("data-tab") === tab) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
    
    // Update panels visibility
    tabPanels.forEach(panel => {
        if (panel.id === `tab-${tab}`) {
            panel.classList.add("active");
        } else {
            panel.classList.remove("active");
        }
    });
    
    // Update title and start/stop tasks
    clearInterval(statsInterval);
    statsInterval = null;
    
    if (tab === "stats") {
        tabTitle.innerText = "Dashboard del Sistema";
        btnRefreshStats.style.display = "inline-flex";
        loadStats();
        statsInterval = setInterval(loadStats, 3000); // refresh every 3s
    } else if (tab === "roms") {
        tabTitle.innerText = "Gestor de ROMs y BIOS";
        btnRefreshStats.style.display = "none";
        loadConsoles();
    } else if (tab === "saves") {
        tabTitle.innerText = "Gestor de Partidas Guardadas";
        btnRefreshStats.style.display = "none";
        loadSaves();
    } else if (tab === "shaders") {
        tabTitle.innerText = "Limpiador de Shaders";
        btnRefreshStats.style.display = "none";
        loadShaders(false);
    } else if (tab === "bios") {
        tabTitle.innerText = "Gestor y Validador de BIOS";
        btnRefreshStats.style.display = "none";
        loadBiosStatus();
    } else if (tab === "games") {
        tabTitle.innerText = "Analizador de Espacio de Juegos";
        btnRefreshStats.style.display = "none";
        loadGamesSpace();
    } else if (tab === "control") {
        tabTitle.innerText = "Control Remoto de la Deck";
        btnRefreshStats.style.display = "none";
        loadControlStatus();
        statsInterval = setInterval(loadControlStatus, 5000);
    } else if (tab === "about") {
        tabTitle.innerText = "Guía e Información";
        btnRefreshStats.style.display = "none";
        loadStats(); // To get current IP for SSH details
    }
}

// --- STATS TAB LOGIC ---
async function loadStats() {
    try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        console.log(`DeckBoard Client: v1.1.0 | Server: v${data.version}`);
        
        // Update IP address displays
        const ip = data.ssh.ip || "127.0.0.1";
        deckIpDisplay.innerText = `IP: ${ip}`;
        sshIpInfo.innerText = ip;
        
        // Connection status card dot pulse
        const indicator = document.querySelector(".status-indicator");
        const pulseDot = indicator.querySelector(".pulse-dot");
        const statusText = indicator.querySelector(".status-text");
        pulseDot.style.backgroundColor = "var(--success)";
        statusText.innerText = "Conectado";
        
        // CPU
        document.getElementById("val-cpu-usage").innerText = `${data.cpu_usage}%`;
        document.getElementById("bar-cpu").style.width = `${data.cpu_usage}%`;
        document.getElementById("val-cpu-temp").innerText = data.cpu_temp;
        
        // GPU / Fan
        document.getElementById("val-gpu-temp").innerText = `${data.gpu_temp}°C`;
        document.getElementById("val-fan").innerText = data.fan_speed > 0 ? data.fan_speed : "0";
        
        // RAM
        document.getElementById("val-ram-usage").innerText = `${data.ram.percent}%`;
        document.getElementById("bar-ram").style.width = `${data.ram.percent}%`;
        document.getElementById("val-ram-used").innerText = (data.ram.used / (1024**3)).toFixed(1);
        document.getElementById("val-ram-total").innerText = (data.ram.total / (1024**3)).toFixed(0);
        
        // Battery
        document.getElementById("val-bat-percent").innerText = `${data.battery.percent}%`;
        document.getElementById("bar-bat").style.width = `${data.battery.percent}%`;
        document.getElementById("val-bat-status").innerText = data.battery.status;
        document.getElementById("val-bat-health").innerText = `${data.battery.health}%`;
        
        // Battery bar color tweak based on charge percentage
        const batBar = document.getElementById("bar-bat");
        if (data.battery.percent <= 15) {
            batBar.style.background = "var(--danger)";
        } else if (data.battery.percent <= 30) {
            batBar.style.background = "var(--warning)";
        } else {
            batBar.style.background = "var(--success)";
        }
        
        // Internal Storage
        document.getElementById("val-internal-percent").innerText = `${data.storage.internal.percent}%`;
        document.getElementById("bar-internal").style.width = `${data.storage.internal.percent}%`;
        document.getElementById("val-internal-used").innerText = (data.storage.internal.used / (1024**3)).toFixed(1);
        document.getElementById("val-internal-free").innerText = (data.storage.internal.free / (1024**3)).toFixed(1);
        document.getElementById("val-internal-total").innerText = (data.storage.internal.total / (1024**3)).toFixed(0);
        
        // SD Storage
        const sdPanel = document.getElementById("sd-card-panel");
        if (data.storage.sd) {
            sdPanel.style.display = "block";
            document.getElementById("val-sd-percent").innerText = `${data.storage.sd.percent}%`;
            document.getElementById("bar-sd").style.width = `${data.storage.sd.percent}%`;
            document.getElementById("val-sd-used").innerText = (data.storage.sd.used / (1024**3)).toFixed(1);
            document.getElementById("val-sd-free").innerText = (data.storage.sd.free / (1024**3)).toFixed(1);
            document.getElementById("val-sd-total").innerText = (data.storage.sd.total / (1024**3)).toFixed(0);
        } else {
            sdPanel.style.display = "none";
        }
        
    } catch (err) {
        console.error(err);
        const indicator = document.querySelector(".status-indicator");
        const pulseDot = indicator.querySelector(".pulse-dot");
        const statusText = indicator.querySelector(".status-text");
        pulseDot.style.backgroundColor = "var(--danger)";
        statusText.innerText = "Desconectado";
    }
}

btnRefreshStats.addEventListener("click", () => {
    loadStats();
});

// --- ROMS TAB LOGIC ---
async function loadConsoles() {
    const listElement = document.getElementById("console-list");
    
    try {
        const res = await fetch("/api/roms/systems");
        if (!res.ok) throw new Error("Failed to load systems");
        const data = await res.json();
        
        consolesData = data.systems || [];
        renderConsoles();
    } catch (err) {
        listElement.innerHTML = `<li class="loading">Error al cargar sistemas: ${err.message}</li>`;
    }
}

function renderConsoles() {
    const listElement = document.getElementById("console-list");
    const searchQuery = document.getElementById("console-search").value.toLowerCase();
    
    listElement.innerHTML = "";
    
    const filtered = consolesData.filter(sys => 
        sys.name.toLowerCase().includes(searchQuery) || 
        sys.id.toLowerCase().includes(searchQuery)
    );
    
    if (filtered.length === 0) {
        listElement.innerHTML = `<li class="loading">No se encontraron consolas</li>`;
        return;
    }
    
    filtered.forEach(sys => {
        const li = document.createElement("li");
        if (activeConsole === sys.id) {
            li.className = "active";
        }
        
        li.innerHTML = `
            <span>${sys.name}</span>
            <span class="count-badge">${sys.count}</span>
        `;
        
        li.addEventListener("click", () => {
            activeConsole = sys.id;
            document.querySelectorAll("#console-list li").forEach(el => el.classList.remove("active"));
            li.classList.add("active");
            
            document.getElementById("roms-empty-state").style.display = "none";
            document.getElementById("roms-list-view").style.display = "flex";
            document.getElementById("active-console-title").innerText = sys.name;
            
            loadROMs(sys.id);
        });
        
        listElement.appendChild(li);
    });
}

document.getElementById("console-search").addEventListener("input", renderConsoles);

async function loadROMs(systemId) {
    const tableBody = document.getElementById("rom-table-body");
    tableBody.innerHTML = `<tr><td colspan="3" class="text-center" style="padding: 2rem; font-style: italic; color: var(--text-muted);">Cargando juegos...</td></tr>`;
    
    try {
        const res = await fetch(`/api/roms/files?system=${encodeURIComponent(systemId)}`);
        if (!res.ok) throw new Error("Failed to load ROM files");
        const data = await res.json();
        
        romsData = data.files || [];
        document.getElementById("active-console-badge").innerText = `${romsData.length} juego${romsData.length !== 1 ? 's' : ''}`;
        renderROMs();
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--danger); padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function renderROMs() {
    const tableBody = document.getElementById("rom-table-body");
    const searchFilter = document.getElementById("rom-search").value.toLowerCase();
    
    tableBody.innerHTML = "";
    
    const filtered = romsData.filter(rom => rom.name.toLowerCase().includes(searchFilter));
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center" style="padding: 2rem; color: var(--text-muted); font-style: italic;">No se encontraron juegos</td></tr>`;
        return;
    }
    
    filtered.forEach(rom => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight: 500; word-break: break-all;">${rom.name}</td>
            <td class="col-size">${formatBytes(rom.size)}</td>
            <td class="col-actions">
                <button class="btn-icon" title="Eliminar juego">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </td>
        `;
        
        tr.querySelector(".btn-icon").addEventListener("click", () => {
            if (confirm(`¿Estás seguro de que deseas eliminar permanentemente el juego "${rom.name}"?`)) {
                deleteROM(activeConsole, rom.name);
            }
        });
        
        tableBody.appendChild(tr);
    });
}

document.getElementById("rom-search").addEventListener("input", renderROMs);

async function deleteROM(system, filename) {
    try {
        const res = await fetch("/api/roms/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ system, filename })
        });
        if (!res.ok) throw new Error("Failed to delete file");
        
        loadROMs(system);
        loadConsoles();
    } catch (err) {
        alert("Error al eliminar el archivo: " + err.message);
    }
}

const uploadZone = document.getElementById("upload-zone");
const fileInput = document.getElementById("file-input");

uploadZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    if (files.length > 0 && activeConsole) {
        Array.from(files).forEach(file => uploadFile(file, activeConsole));
    }
});

uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    const files = e.dataTransfer.files;
    if (files.length > 0 && activeConsole) {
        Array.from(files).forEach(file => uploadFile(file, activeConsole));
    }
});

function uploadFile(file, system) {
    const progressContainer = document.getElementById("upload-progress-container");
    progressContainer.style.display = "block";
    
    const uploadList = document.getElementById("upload-list");
    const itemId = "upload-" + Math.random().toString(36).substr(2, 9);
    
    const div = document.createElement("div");
    div.className = "upload-item";
    div.id = itemId;
    div.innerHTML = `
        <div class="upload-item-header">
            <span class="upload-item-name" title="${file.name}">${file.name}</span>
            <span class="upload-item-pct" id="${itemId}-pct">0%</span>
        </div>
        <div class="upload-progress-bar">
            <div class="upload-progress-fill" id="${itemId}-fill" style="width: 0%"></div>
        </div>
    `;
    
    uploadList.appendChild(div);
    
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/roms/upload?system=${encodeURIComponent(system)}&filename=${encodeURIComponent(file.name)}`, true);
    
    xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            document.getElementById(`${itemId}-pct`).innerText = `${percent}%`;
            document.getElementById(`${itemId}-fill`).style.width = `${percent}%`;
        }
    });
    
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                document.getElementById(`${itemId}-pct`).innerText = "Listo";
                document.getElementById(`${itemId}-pct`).style.color = "var(--success)";
                document.getElementById(`${itemId}-fill`).style.background = "var(--success)";
                
                setTimeout(() => {
                    div.remove();
                    if (uploadList.children.length === 0) {
                        progressContainer.style.display = "none";
                    }
                    loadROMs(system);
                    loadConsoles();
                }, 2000);
            } else {
                document.getElementById(`${itemId}-pct`).innerText = "Error";
                document.getElementById(`${itemId}-pct`).style.color = "var(--danger)";
                document.getElementById(`${itemId}-fill`).style.background = "var(--danger)";
            }
        }
    };
    
    xhr.send(file);
}

// --- SAVES TAB LOGIC ---
const savesLoading = document.getElementById("saves-loading");
const savesEmpty = document.getElementById("saves-empty");
const savesListView = document.getElementById("saves-list-view");
const savesTableBody = document.getElementById("saves-table-body");
const savesUploadInput = document.getElementById("saves-upload-input");

async function loadSaves() {
    savesLoading.style.display = "flex";
    savesEmpty.style.display = "none";
    savesListView.style.display = "none";
    
    try {
        const res = await fetch("/api/saves/systems");
        if (!res.ok) throw new Error("Failed to load save systems");
        const data = await res.json();
        
        savesData = data.systems || [];
        savesLoading.style.display = "none";
        
        if (savesData.length === 0) {
            savesEmpty.style.display = "flex";
        } else {
            savesListView.style.display = "flex";
            renderSaves();
        }
    } catch (err) {
        savesLoading.innerHTML = `<div style="color: var(--danger); font-weight: bold; padding: 2rem; text-align: center;">Error al cargar partidas guardadas: ${err.message}</div>`;
    }
}

function renderSaves() {
    savesTableBody.innerHTML = "";
    
    savesData.forEach(sys => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight: 600; padding: 1rem;">${sys.name}</td>
            <td class="col-size" style="padding: 1rem;">${formatBytes(sys.size)}</td>
            <td style="width: 280px; text-align: center; padding: 1rem;">
                <button class="btn btn-secondary btn-sm" onclick="downloadSaves('${sys.id}')" style="margin-right: 0.5rem;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
                    </svg>
                    <span>Backup</span>
                </button>
                <button class="btn btn-primary btn-sm" onclick="triggerRestoreSaves('${sys.id}')">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.25rem;">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"></path>
                    </svg>
                    <span>Restaurar</span>
                </button>
            </td>
        `;
        savesTableBody.appendChild(tr);
    });
}

function downloadSaves(emulatorId) {
    window.location.href = `/api/saves/download?emulator=${encodeURIComponent(emulatorId)}`;
}

function triggerRestoreSaves(emulatorId) {
    activeRestoreEmulator = emulatorId;
    savesUploadInput.value = "";
    savesUploadInput.click();
}

savesUploadInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file && activeRestoreEmulator) {
        if (!file.name.endsWith(".zip")) {
            alert("Por favor selecciona un archivo comprimido .zip válido de partida guardada.");
            return;
        }
        
        if (!confirm(`¿Estás seguro de que deseas restaurar las partidas de ${activeRestoreEmulator}? Se sobreescribirán los archivos locales actuales. (Se creará una copia de seguridad local en la Steam Deck por seguridad).`)) {
            return;
        }
        
        savesLoading.style.display = "flex";
        savesListView.style.display = "none";
        savesLoading.querySelector("p").innerText = "Restaurando partida guardada y creando backup local...";
        
        try {
            const res = await fetch(`/api/saves/restore?emulator=${encodeURIComponent(activeRestoreEmulator)}`, {
                method: "POST",
                body: file
            });
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to restore saves");
            }
            
            const data = await res.json();
            alert(`¡Partida restaurada con éxito!\nSe ha guardado un respaldo de tu guardado anterior en la carpeta local:\n${data.backup_created}`);
            loadSaves();
        } catch (err) {
            alert("Error al restaurar partida: " + err.message);
            loadSaves();
        }
    }
});

function downloadGlobalBackup() {
    window.location.href = "/api/saves/download_global";
}

function triggerGlobalRestore() {
    const input = document.getElementById("saves-global-upload-input");
    input.value = "";
    input.click();
}

document.getElementById("saves-global-upload-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.name.endsWith(".zip")) {
            alert("Por favor selecciona un archivo comprimido .zip válido para la restauración global.");
            return;
        }
        
        if (!confirm("¿Estás seguro de que deseas restaurar TODOS los guardados de emuladores? Se sobreescribirán los guardados locales actuales. (Se creará una copia de seguridad global en la Steam Deck por seguridad).")) {
            return;
        }
        
        savesLoading.style.display = "flex";
        savesListView.style.display = "none";
        savesLoading.querySelector("p").innerText = "Restaurando todas las partidas y creando backup global local...";
        
        try {
            const res = await fetch("/api/saves/restore_global", {
                method: "POST",
                body: file
            });
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to restore global saves");
            }
            
            const data = await res.json();
            alert(`¡Todos los guardados restaurados con éxito!\nSe ha guardado un respaldo global de tus guardados anteriores en:\n${data.backup_created}`);
            loadSaves();
        } catch (err) {
            alert("Error al restaurar respaldo global: " + err.message);
            loadSaves();
        }
    }
});

// Expose functions globally for inline HTML click attributes
window.downloadSaves = downloadSaves;
window.triggerRestoreSaves = triggerRestoreSaves;
window.downloadGlobalBackup = downloadGlobalBackup;
window.triggerGlobalRestore = triggerGlobalRestore;

// --- SHADERS TAB LOGIC ---
const btnRescanShaders = document.getElementById("btn-rescan-shaders");
const shaderLoading = document.getElementById("shader-loading");
const shaderEmpty = document.getElementById("shader-empty");
const shaderListView = document.getElementById("shader-list-view");
const shaderTableBody = document.getElementById("shader-table-body");
const shaderSummary = document.getElementById("shader-summary");
const btnCleanSelected = document.getElementById("btn-clean-selected");
const headerSelectAll = document.getElementById("header-select-all");

async function loadShaders(forceScan = false) {
    shaderLoading.style.display = "flex";
    shaderEmpty.style.display = "none";
    shaderListView.style.display = "none";
    shaderSummary.style.display = "none";
    btnCleanSelected.disabled = true;
    headerSelectAll.checked = false;
    
    let url = "/api/shaders";
    if (forceScan) {
        url = "/api/shaders/scan";
    }
    
    try {
        let res = await fetch(url, forceScan ? { method: "POST" } : {});
        if (!res.ok) throw new Error("Failed to load shaders data");
        let data = await res.json();
        
        if (data.status === "scanning") {
            setTimeout(() => loadShaders(false), 2000);
            return;
        }
        
        shadersData = data.shaders || [];
        shaderLoading.style.display = "none";
        
        if (shadersData.length === 0) {
            shaderEmpty.style.display = "flex";
        } else {
            shaderSummary.style.display = "grid";
            shaderListView.style.display = "flex";
            calculateShaderSummary();
            renderShaders();
        }
    } catch (err) {
        shaderLoading.innerHTML = `<div style="color: var(--danger); font-weight: bold;">Error al cargar datos: ${err.message}</div>`;
    }
}

function calculateShaderSummary() {
    let totalSize = 0;
    let orphanSize = 0;
    
    shadersData.forEach(item => {
        totalSize += item.size;
        if (item.is_orphan) {
            orphanSize += item.size;
        }
    });
    
    document.getElementById("val-shader-total-size").innerText = formatBytes(totalSize);
    document.getElementById("val-shader-orphan-size").innerText = formatBytes(orphanSize);
    document.getElementById("val-shader-folder-count").innerText = shadersData.length;
}

function renderShaders() {
    shaderTableBody.innerHTML = "";
    
    shadersData.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="col-check">
                <input type="checkbox" class="shader-checkbox" data-index="${index}">
            </td>
            <td>
                <div style="font-weight: 600;">${item.game_name}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">ID: ${item.appid}</div>
            </td>
            <td>
                <span class="folder-tag">${item.folder}</span>
            </td>
            <td class="col-status">
                <span class="status-tag ${item.is_orphan ? 'orphan' : 'installed'}">
                    ${item.is_orphan ? 'Huérfano' : 'Instalado'}
                </span>
            </td>
            <td class="col-size">${formatBytes(item.size)}</td>
        `;
        
        shaderTableBody.appendChild(tr);
    });
    
    document.querySelectorAll(".shader-checkbox").forEach(cb => {
        cb.addEventListener("change", updateCleanButtonState);
    });
}

headerSelectAll.addEventListener("change", (e) => {
    const checked = e.target.checked;
    document.querySelectorAll(".shader-checkbox").forEach(cb => {
        cb.checked = checked;
    });
    updateCleanButtonState();
});

document.getElementById("btn-select-orphans").addEventListener("click", () => {
    document.querySelectorAll(".shader-checkbox").forEach(cb => {
        const idx = cb.getAttribute("data-index");
        cb.checked = shadersData[idx].is_orphan;
    });
    headerSelectAll.checked = false;
    updateCleanButtonState();
});

document.getElementById("btn-deselect-all").addEventListener("click", () => {
    document.querySelectorAll(".shader-checkbox").forEach(cb => {
        cb.checked = false;
    });
    headerSelectAll.checked = false;
    updateCleanButtonState();
});

function updateCleanButtonState() {
    const selected = document.querySelectorAll(".shader-checkbox:checked");
    const count = selected.length;
    
    btnCleanSelected.disabled = count === 0;
    document.getElementById("selected-clean-count").innerText = count;
}

btnRescanShaders.addEventListener("click", () => {
    loadShaders(true);
});

btnCleanSelected.addEventListener("click", async () => {
    const selected = document.querySelectorAll(".shader-checkbox:checked");
    const pathsToClean = Array.from(selected).map(cb => {
        const idx = cb.getAttribute("data-index");
        return shadersData[idx].path;
    });
    
    const count = pathsToClean.length;
    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente estas ${count} carpetas seleccionadas? Esta acción no se puede deshacer.`)) {
        btnCleanSelected.disabled = true;
        btnCleanSelected.innerText = "Limpiando...";
        
        try {
            const res = await fetch("/api/shaders/clean", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paths: pathsToClean })
            });
            if (!res.ok) throw new Error("Deletion request failed");
            const data = await res.json();
            
            alert(`Limpieza completada. Se eliminaron con éxito ${data.cleaned} de ${count} carpetas.`);
            loadShaders(false);
        } catch (err) {
            alert("Error al limpiar carpetas: " + err.message);
            updateCleanButtonState();
        }
    }
});

// --- CONTROL REMOTO TAB LOGIC ---
let flatpakPollInterval = null;

async function loadControlStatus() {
    try {
        const res = await fetch("/api/control/status");
        if (!res.ok) throw new Error("Failed to fetch control status");
        const data = await res.json();
        
        // Volume
        document.getElementById("lbl-volume").innerText = `${data.volume}%`;
        document.getElementById("slider-volume").value = data.volume;
        const btnMute = document.getElementById("btn-mute");
        if (data.muted) {
            btnMute.innerText = "Desactivar Silencio";
            btnMute.classList.remove("btn-secondary");
            btnMute.classList.add("btn-primary");
        } else {
            btnMute.innerText = "Silenciar";
            btnMute.classList.remove("btn-primary");
            btnMute.classList.add("btn-secondary");
        }
        
        // Brightness
        document.getElementById("lbl-brightness").innerText = `${data.brightness}%`;
        document.getElementById("slider-brightness").value = data.brightness;
        
        // SSH
        const toggleSsh = document.getElementById("toggle-ssh");
        const lblSshStatus = document.getElementById("lbl-ssh-status");
        toggleSsh.checked = data.ssh_active;
        if (data.ssh_active) {
            lblSshStatus.innerText = "Activo";
            lblSshStatus.style.color = "var(--success)";
        } else {
            lblSshStatus.innerText = "Inactivo";
            lblSshStatus.style.color = "var(--danger)";
        }
        
        // Flatpak
        const lblFlatpakStatus = document.getElementById("lbl-flatpak-status");
        const flatpakProgressContainer = document.getElementById("flatpak-progress-container");
        const lblFlatpakProgress = document.getElementById("lbl-flatpak-progress");
        const btnUpdateFlatpak = document.getElementById("btn-update-flatpak");
        
        if (data.flatpak_status === "idle") {
            lblFlatpakStatus.innerText = "Al día / Sin comprobar";
            flatpakProgressContainer.style.display = "none";
            btnUpdateFlatpak.disabled = false;
            if (flatpakPollInterval) {
                clearInterval(flatpakPollInterval);
                flatpakPollInterval = null;
            }
        } else if (data.flatpak_status === "updating") {
            lblFlatpakStatus.innerText = "Actualizando...";
            flatpakProgressContainer.style.display = "flex";
            lblFlatpakProgress.innerText = "Ejecutando flatpak update -y...";
            btnUpdateFlatpak.disabled = true;
            if (!flatpakPollInterval) {
                flatpakPollInterval = setInterval(loadControlStatus, 2000);
            }
        } else if (data.flatpak_status === "success") {
            lblFlatpakStatus.innerText = "Actualizado con éxito";
            flatpakProgressContainer.style.display = "none";
            btnUpdateFlatpak.disabled = false;
            if (flatpakPollInterval) {
                clearInterval(flatpakPollInterval);
                flatpakPollInterval = null;
            }
        } else if (data.flatpak_status === "error") {
            lblFlatpakStatus.innerText = "Error en actualización";
            flatpakProgressContainer.style.display = "none";
            btnUpdateFlatpak.disabled = false;
            if (flatpakPollInterval) {
                clearInterval(flatpakPollInterval);
                flatpakPollInterval = null;
            }
        }
    } catch (err) {
        console.error("Error loading control status:", err);
    }
}

// Volume Listeners
document.getElementById("slider-volume").addEventListener("change", async (e) => {
    const val = e.target.value;
    try {
        await fetch("/api/control/volume", {
            method: "POST",
            body: JSON.stringify({ volume: parseInt(val) })
        });
        loadControlStatus();
    } catch (err) {
        console.error("Error setting volume:", err);
    }
});
document.getElementById("slider-volume").addEventListener("input", (e) => {
    document.getElementById("lbl-volume").innerText = `${e.target.value}%`;
});

// Brightness Listeners
document.getElementById("slider-brightness").addEventListener("change", async (e) => {
    const val = e.target.value;
    try {
        await fetch("/api/control/brightness", {
            method: "POST",
            body: JSON.stringify({ brightness: parseInt(val) })
        });
        loadControlStatus();
    } catch (err) {
        console.error("Error setting brightness:", err);
    }
});
document.getElementById("slider-brightness").addEventListener("input", (e) => {
    document.getElementById("lbl-brightness").innerText = `${e.target.value}%`;
});

// Toggle Mute
async function toggleMute() {
    const btnMute = document.getElementById("btn-mute");
    const isMuted = btnMute.innerText === "Silenciar";
    try {
        await fetch("/api/control/volume", {
            method: "POST",
            body: JSON.stringify({ muted: isMuted })
        });
        loadControlStatus();
    } catch (err) {
        console.error("Error toggling mute:", err);
    }
}

// SSH switch
document.getElementById("toggle-ssh").addEventListener("change", async (e) => {
    const active = e.target.checked;
    try {
        const res = await fetch("/api/control/ssh", {
            method: "POST",
            body: JSON.stringify({ active: active })
        });
        if (!res.ok) throw new Error("Failed to toggle SSH");
        loadControlStatus();
    } catch (err) {
        alert("Error al cambiar SSH: " + err.message);
        loadControlStatus();
    }
});

// Flatpak updater
async function triggerFlatpakUpdate() {
    try {
        const btn = document.getElementById("btn-update-flatpak");
        btn.disabled = true;
        document.getElementById("flatpak-progress-container").style.display = "flex";
        document.getElementById("lbl-flatpak-progress").innerText = "Iniciando actualización...";
        
        const res = await fetch("/api/control/flatpak_update", { method: "POST" });
        if (!res.ok) throw new Error("Failed to start Flatpak update");
        
        loadControlStatus();
    } catch (err) {
        alert("Error al actualizar Flatpaks: " + err.message);
        loadControlStatus();
    }
}

// Power actions
async function powerAction(action) {
    let msg = "";
    if (action === "shutdown") msg = "¿Estás seguro de que deseas APAGAR la Steam Deck?";
    else if (action === "reboot") msg = "¿Estás seguro de que deseas REINICIAR la Steam Deck?";
    else if (action === "suspend") msg = "¿Estás seguro de que deseas SUSPENDER la Steam Deck?";
    else if (action === "gamemode") msg = "¿Estás seguro de que deseas volver al Modo Juego?";
    
    if (confirm(msg)) {
        try {
            await fetch(`/api/control/power?action=${action}`, { method: "POST" });
            if (action === "shutdown" || action === "reboot") {
                alert("Comando de apagado/reinicio enviado. La conexión se cerrará.");
            } else {
                setTimeout(loadControlStatus, 2000);
            }
        } catch (err) {
            alert("Error al ejecutar acción: " + err.message);
        }
    }
}

// --- BIOS TAB LOGIC ---
let biosData = {};

async function loadBiosStatus() {
    const grid = document.getElementById("bios-systems-grid");
    grid.innerHTML = '<div class="shader-loading" style="grid-column: 1/-1;"><div class="spinner"></div><p>Analizando archivos BIOS de tus emuladores...</p></div>';
    
    try {
        const res = await fetch("/api/bios/status");
        if (!res.ok) throw new Error("Failed to load BIOS status");
        const data = await res.json();
        
        document.getElementById("lbl-bios-path").innerText = data.bios_root || "No detectado";
        grid.innerHTML = "";
        biosData = data.systems || {};
        
        Object.keys(biosData).forEach(sysKey => {
            const sys = biosData[sysKey];
            const card = document.createElement("div");
            card.className = "glass-card";
            card.style.padding = "1.5rem";
            card.style.display = "flex";
            card.style.flexDirection = "column";
            card.style.gap = "1.25rem";
            
            let filesHtml = "";
            sys.files.forEach(file => {
                let badgeClass = "missing";
                let badgeText = "Faltante";
                let fixButton = "";
                
                if (file.status === "present") {
                    badgeClass = "present";
                    badgeText = "Encontrado";
                } else if (file.status === "case_mismatch") {
                    badgeClass = "mismatch";
                    badgeText = "Mayúsculas";
                    fixButton = `<button class="btn btn-primary btn-sm" onclick="fixBiosCase('${sysKey}', '${file.target_rel_path}', '${file.actual_filename}')" style="padding: 0.15rem 0.4rem; font-size: 0.7rem; margin-left: 0.5rem; background: var(--secondary-grad);">Corregir</button>`;
                }
                
                filesHtml += `
                    <li class="bios-file-item" style="list-style: none;">
                        <div class="bios-file-info">
                            <span class="bios-file-name" style="font-family: monospace; font-size: 0.85rem; font-weight: 600;">${file.filename}</span>
                            <span class="bios-file-desc" style="font-size: 0.75rem; opacity: 0.6;">${file.desc}</span>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <span class="badge-status ${badgeClass}">${badgeText}</span>
                            ${fixButton}
                        </div>
                    </li>
                `;
            });
            
            card.innerHTML = `
                <div>
                    <h3 style="font-family: var(--font-header); font-size: 1.15rem; font-weight: 700; margin-bottom: 0.25rem;">${sys.name}</h3>
                    <p class="subtitle" style="font-size: 0.8rem;">Carpeta: <code class="code" style="font-family: monospace; font-size: 0.75rem;">bios/${sys.folder || ""}</code></p>
                </div>
                <ul class="bios-list" style="padding: 0; margin: 0 0 1rem 0; display: flex; flex-direction: column; gap: 0.75rem;">
                    ${filesHtml}
                </ul>
                <div class="bios-dropzone" 
                     id="dropzone-${sysKey}"
                     ondragover="event.preventDefault(); highlightDropzone('${sysKey}', true)"
                     ondragleave="highlightDropzone('${sysKey}', false)"
                     ondrop="handleBiosDrop(event, '${sysKey}')">
                    Arrastra la BIOS aquí para subirla
                </div>
            `;
            
            grid.appendChild(card);
        });
    } catch (err) {
        grid.innerHTML = `<div style="color: var(--danger); font-weight: bold; padding: 2rem; text-align: center; grid-column: 1/-1;">Error al escanear BIOS: ${err.message}</div>`;
    }
}

function highlightDropzone(sysKey, highlight) {
    const dz = document.getElementById(`dropzone-${sysKey}`);
    if (dz) {
        if (highlight) dz.classList.add("hover");
        else dz.classList.remove("hover");
    }
}

async function handleBiosDrop(e, sysKey) {
    e.preventDefault();
    highlightDropzone(sysKey, false);
    
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    const system = biosData[sysKey];
    if (!system) return;
    
    const uploadList = [];
    for (let i = 0; i < files.length; i++) {
        const droppedFile = files[i];
        const droppedNameLower = droppedFile.name.toLowerCase();
        
        const match = system.files.find(f => f.filename.toLowerCase() === droppedNameLower);
        if (match) {
            uploadList.push({
                file: droppedFile,
                target_rel_path: match.target_rel_path
            });
        } else {
            alert(`El archivo '${droppedFile.name}' no corresponde a ninguna BIOS conocida de ${system.name}.`);
        }
    }
    
    if (uploadList.length === 0) return;
    
    const dz = document.getElementById(`dropzone-${sysKey}`);
    dz.innerText = `Subiendo ${uploadList.length} BIOS...`;
    dz.style.color = "var(--primary)";
    
    try {
        for (const item of uploadList) {
            const url = `/api/bios/upload?target_rel_path=${encodeURIComponent(item.target_rel_path)}`;
            const res = await fetch(url, {
                method: "POST",
                body: item.file
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to upload file");
            }
        }
        alert(`¡Completado! BIOS subida con éxito para ${system.name}.`);
    } catch (err) {
        alert("Error al subir BIOS: " + err.message);
    } finally {
        loadBiosStatus();
    }
}

async function fixBiosCase(sysKey, targetRelPath, actualFilename) {
    try {
        const res = await fetch("/api/bios/fix_case", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                target_rel_path: targetRelPath,
                actual_filename: actualFilename
            })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to fix file case");
        }
        alert("¡Nombre corregido a minúsculas con éxito!");
        loadBiosStatus();
    } catch (err) {
        alert("Error al corregir nombre: " + err.message);
    }
}

function downloadBiosGlobalBackup() {
    window.location.href = "/api/bios/download_global";
}

function triggerBiosGlobalRestore() {
    document.getElementById("bios-restore-input").click();
}

async function handleBiosGlobalRestore(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm(`¿Estás seguro de que deseas restaurar este respaldo global de BIOS?\nEsto reemplazará los archivos BIOS correspondientes (se creará una copia de seguridad en tu Steam Deck antes de continuar).`)) {
        event.target.value = "";
        return;
    }
    
    const grid = document.getElementById("bios-systems-grid");
    grid.innerHTML = '<div class="shader-loading" style="grid-column: 1/-1;"><div class="spinner"></div><p>Restaurando respaldo global de BIOS, no cierres esta pestaña...</p></div>';
    
    try {
        const res = await fetch("/api/bios/restore_global", {
            method: "POST",
            body: file
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to restore backup");
        }
        alert("¡Respaldo global de BIOS restaurado con éxito!");
    } catch (err) {
        alert("Error al restaurar respaldo global: " + err.message);
    } finally {
        event.target.value = "";
        loadBiosStatus();
    }
}

// --- GAMES SPACE ANALYZER TAB LOGIC ---
async function loadGamesSpace() {
    const tbody = document.getElementById("games-table-body");
    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: center; padding: 3rem;">
                <div class="spinner" style="margin: 0 auto 1rem auto;"></div>
                <p>Analizando juegos de Steam y calculando espacios en disco...</p>
            </td>
        </tr>
    `;
    
    try {
        const res = await fetch("/api/games/space_analyzer");
        if (!res.ok) throw new Error("Failed to load games space analyzer data");
        const data = await res.json();
        
        tbody.innerHTML = "";
        const games = data.games || [];
        
        if (games.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        No se detectaron juegos de Steam instalados en este sistema.
                    </td>
                </tr>
            `;
            return;
        }
        
        games.forEach(game => {
            const tr = document.createElement("tr");
            
            const sizeGame = formatBytes(game.game_size);
            const sizeShader = formatBytes(game.shader_size);
            const sizeCompat = formatBytes(game.compat_size);
            const sizeTotal = formatBytes(game.total_size);
            
            const total = game.total_size || 1;
            const pctGame = ((game.game_size / total) * 100).toFixed(1);
            const pctShader = ((game.shader_size / total) * 100).toFixed(1);
            const pctCompat = ((game.compat_size / total) * 100).toFixed(1);
            
            const storageBadge = game.storage === "MicroSD" 
                ? `<span class="badge" style="background: rgba(167, 139, 250, 0.15); color: #c084fc; font-size: 0.7rem; margin-left: 0.5rem;">MicroSD</span>`
                : `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 0.7rem; margin-left: 0.5rem;">SSD</span>`;
                
            const disableShader = game.shader_size === 0 ? "disabled" : "";
            const disableCompat = game.compat_size === 0 ? "disabled" : "";
            
            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600; font-size: 0.95rem; color: white;">${game.name}</div>
                    <div style="font-size: 0.75rem; opacity: 0.5; display: flex; align-items: center; margin-top: 0.15rem;">
                        AppID: ${game.appid} ${storageBadge}
                    </div>
                </td>
                <td style="text-align: right; font-weight: 700; color: var(--primary); font-size: 0.95rem;">
                    ${sizeTotal}
                </td>
                <td>
                    <div class="space-bar-stacked">
                        <div class="space-fill game-fill" style="width: ${pctGame}%" title="Archivos del Juego: ${pctGame}%"></div>
                        <div class="space-fill shader-fill" style="width: ${pctShader}%" title="Shaders: ${pctShader}%"></div>
                        <div class="space-fill compat-fill" style="width: ${pctCompat}%" title="Compatdata: ${pctCompat}%"></div>
                    </div>
                    <div class="space-legend">
                        <span class="space-legend-game">Juego: ${sizeGame} (${pctGame}%)</span>
                        <span class="space-legend-shader">Shaders: ${sizeShader} (${pctShader}%)</span>
                        <span class="space-legend-compat">Compat: ${sizeCompat} (${pctCompat}%)</span>
                    </div>
                </td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 0.4rem; justify-content: center; align-items: center; flex-wrap: wrap;">
                        <button class="btn btn-secondary btn-sm" onclick="cleanGameCache('${game.appid}', true, false, '${game.name.replace(/'/g, "\\'")}')" ${disableShader} style="padding: 0.3rem 0.5rem; font-size: 0.72rem;">
                            Borrar Shaders
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="cleanGameCache('${game.appid}', false, true, '${game.name.replace(/'/g, "\\'")}')" ${disableCompat} style="padding: 0.3rem 0.5rem; font-size: 0.72rem; border-color: rgba(239, 68, 68, 0.2); color: #f87171;">
                            Borrar Prefijo
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="uninstallGame('${game.appid}', '${game.name.replace(/'/g, "\\'")}')" style="padding: 0.3rem 0.5rem; font-size: 0.72rem; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #fecaca;">
                            Eliminar Juego
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--danger); font-weight: bold; padding: 3rem;">
                    Error al cargar datos: ${err.message}
                </td>
            </tr>
        `;
    }
}

async function cleanGameCache(appid, cleanShaders, cleanCompat, gameName) {
    let actionText = cleanShaders ? "los Shaders" : "el prefijo Proton (compatdata)";
    let warning = cleanCompat ? "\n¡ADVERTENCIA! Al borrar el prefijo se borrarán tus partidas guardadas locales del juego si no usa Steam Cloud. ¿Deseas continuar?" : "";
    
    if (!confirm(`¿Estás seguro de que deseas limpiar ${actionText} para "${gameName}"?${warning}`)) {
        return;
    }
    
    try {
        const res = await fetch("/api/games/clean_cache", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                appid: appid,
                clean_shaders: cleanShaders,
                clean_compatdata: cleanCompat
            })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to clean cache");
        }
        
        alert(`Limpieza completada para "${gameName}" con éxito.`);
        loadGamesSpace();
    } catch (err) {
        alert("Error al limpiar cachés: " + err.message);
    }
}

async function uninstallGame(appid, gameName) {
    if (!confirm(`⚠️ ¡ATENCIÓN CRÍTICA! ⚠️\n\n¿Estás seguro de que deseas eliminar COMPLETAMENTE "${gameName}" de tu Steam Deck?\n\nEsta acción borrará:\n1. Todos los archivos de instalación del juego.\n2. Todos los archivos de Shaders compilados.\n3. Su prefijo Proton/Compatdata (incluyendo sus partidas guardadas locales si no usa Steam Cloud).\n\nEl juego se eliminará por completo y tendrás que descargarlo de nuevo desde Steam para volver a jugarlo.`)) {
        return;
    }
    
    if (!confirm(`Confirmación final: ¿Realmente deseas desinstalar y borrar todo el contenido de "${gameName}"?`)) {
        return;
    }
    
    const tbody = document.getElementById("games-table-body");
    tbody.innerHTML = `
        <tr>
            <td colspan="4" style="text-align: center; padding: 3rem;">
                <div class="spinner" style="margin: 0 auto 1rem auto;"></div>
                <p>Eliminando archivos del juego, shaders y prefijo de compatibilidad...</p>
            </td>
        </tr>
    `;
    
    try {
        const res = await fetch("/api/games/uninstall", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appid: appid })
        });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Failed to uninstall game");
        }
        
        alert(`"${gameName}" ha sido desinstalado y eliminado por completo de tu Steam Deck.`);
    } catch (err) {
        alert("Error al desinstalar el juego: " + err.message);
    } finally {
        loadGamesSpace();
    }
}

// Expose actions to window context
window.toggleMute = toggleMute;
window.triggerFlatpakUpdate = triggerFlatpakUpdate;
window.powerAction = powerAction;
window.handleBiosDrop = handleBiosDrop;
window.highlightDropzone = highlightDropzone;
window.fixBiosCase = fixBiosCase;
window.loadBiosStatus = loadBiosStatus;
window.downloadBiosGlobalBackup = downloadBiosGlobalBackup;
window.triggerBiosGlobalRestore = triggerBiosGlobalRestore;
window.handleBiosGlobalRestore = handleBiosGlobalRestore;
window.loadGamesSpace = loadGamesSpace;
window.cleanGameCache = cleanGameCache;
window.uninstallGame = uninstallGame;

// Start application
switchTab("stats");
