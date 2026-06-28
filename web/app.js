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

// Expose actions to window context
window.toggleMute = toggleMute;
window.triggerFlatpakUpdate = triggerFlatpakUpdate;
window.powerAction = powerAction;

// Start application
switchTab("stats");
