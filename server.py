#!/usr/bin/env python3
import os
import sys
import re
import json
import glob
import shutil
import socket
import threading
import mimetypes
import subprocess
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler

# Define base paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
VERSION = "1.1.0"

# Global variables for caching shader scan results
SHADER_CACHE = None
IS_SCANNING = False
FLATPAK_UPDATE_STATUS = "idle"
FLATPAK_UPDATE_LOG = ""
PREV_IDLE = 0
PREV_TOTAL = 0

CONSOLE_NAMES = {
    "3do": "3DO Interactive Multiplayer",
    "amiga": "Commodore Amiga",
    "arcade": "Arcade Games",
    "atari2600": "Atari 2600",
    "atari5200": "Atari 5200",
    "atari7800": "Atari 7800",
    "atari800": "Atari 800",
    "atarijaguar": "Atari Jaguar",
    "colecovision": "ColecoVision",
    "commodore64": "Commodore 64",
    "dreamcast": "Sega Dreamcast",
    "gamegear": "Sega Game Gear",
    "gba": "Game Boy Advance",
    "gbc": "Game Boy Color",
    "gb": "Game Boy",
    "gc": "Nintendo GameCube",
    "gamecube": "Nintendo GameCube",
    "genesis": "Sega Genesis / Mega Drive",
    "megadrive": "Sega Mega Drive",
    "mastersystem": "Sega Master System",
    "n64": "Nintendo 64",
    "nds": "Nintendo DS",
    "nes": "Nintendo Entertainment System",
    "snes": "Super Nintendo (SNES)",
    "pcengine": "PC Engine / TurboGrafx-16",
    "psx": "PlayStation 1",
    "ps1": "PlayStation 1",
    "ps2": "PlayStation 2",
    "ps3": "PlayStation 3",
    "psp": "PlayStation Portable",
    "psvita": "PlayStation Vita",
    "saturn": "Sega Saturn",
    "scummvm": "ScummVM Games",
    "sega32x": "Sega 32X",
    "segacd": "Sega CD / Mega CD",
    "switch": "Nintendo Switch",
    "wii": "Nintendo Wii",
    "wiiu": "Nintendo Wii U",
    "xbox": "Original Xbox",
    "bios": "System BIOS Files"
}

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def get_installed_games():
    """Scan all standard Steam directories (SSD and SD cards) to map AppID to Game Name."""
    games = {}
    paths = [
        os.path.expanduser("~/.steam/steam/steamapps"),
        os.path.expanduser("~/.local/share/Steam/steamapps")
    ]
    sd_mounts = glob.glob("/run/media/deck/*")
    for sd in sd_mounts:
        sd_steamapps = os.path.join(sd, "steamapps")
        if os.path.exists(sd_steamapps):
            paths.append(sd_steamapps)
            
    for base_path in paths:
        if not os.path.exists(base_path):
            continue
        manifests = glob.glob(os.path.join(base_path, "appmanifest_*.acf"))
        for manifest in manifests:
            try:
                with open(manifest, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    appid_match = re.search(r'"appid"\s+"(\d+)"', content)
                    name_match = re.search(r'"name"\s+"([^"]+)"', content)
                    if appid_match and name_match:
                        games[appid_match.group(1)] = name_match.group(1)
            except Exception as e:
                print(f"Error parsing manifest {manifest}: {e}", file=sys.stderr)
    return games

def get_dir_size(path):
    """Recursively calculate the size of a directory in bytes."""
    total = 0
    try:
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_file(follow_symlinks=False):
                    total += entry.stat(follow_symlinks=False).st_size
                elif entry.is_dir(follow_symlinks=False):
                    total += get_dir_size(entry.path)
    except Exception:
        pass
    return total

def scan_shaders_thread():
    """Runs in a background thread to calculate shadercache and compatdata sizes."""
    global SHADER_CACHE, IS_SCANNING
    IS_SCANNING = True
    try:
        installed_games = get_installed_games()
        paths = [
            os.path.expanduser("~/.steam/steam/steamapps"),
            os.path.expanduser("~/.local/share/Steam/steamapps")
        ]
        sd_mounts = glob.glob("/run/media/deck/*")
        for sd in sd_mounts:
            sd_steamapps = os.path.join(sd, "steamapps")
            if os.path.exists(sd_steamapps):
                paths.append(sd_steamapps)
        
        results = []
        seen_dirs = set()
        
        for base_path in paths:
            for folder in ["shadercache", "compatdata"]:
                folder_path = os.path.join(base_path, folder)
                if not os.path.exists(folder_path):
                    continue
                try:
                    with os.scandir(folder_path) as it:
                        for entry in it:
                            if entry.is_dir() and entry.name.isdigit():
                                appid = entry.name
                                key = (folder_path, folder, appid)
                                if key in seen_dirs:
                                    continue
                                seen_dirs.add(key)
                                
                                size = get_dir_size(entry.path)
                                if size < 1024:
                                    continue
                                    
                                is_orphan = appid not in installed_games
                                system_appids = ["0", "228980", "1382070", "1420100", "1826330", "1891320", "2124800", "2821190"]
                                if appid in system_appids:
                                    is_orphan = False
                                    game_name = f"Steam / Proton System Files (AppID: {appid})"
                                else:
                                    game_name = installed_games.get(appid, "Unknown Game / Non-Steam Game")
                                
                                results.append({
                                    "path": entry.path,
                                    "folder": folder,
                                    "appid": appid,
                                    "game_name": game_name,
                                    "size": size,
                                    "is_orphan": is_orphan
                                })
                except Exception as e:
                    print(f"Error scanning {folder_path}: {e}", file=sys.stderr)
        
        results.sort(key=lambda x: (not x["is_orphan"], -x["size"]))
        SHADER_CACHE = results
    except Exception as e:
        print(f"Error in scan thread: {e}", file=sys.stderr)
    finally:
        IS_SCANNING = False

def find_roms_root():
    """Discover where the EmuDeck/ROMs folder is located on the system."""
    sd_mounts = glob.glob("/run/media/deck/*")
    for sd in sd_mounts:
        for folder in ["Emulation/roms", "roms"]:
            path = os.path.join(sd, folder)
            if os.path.exists(path) and os.path.isdir(path):
                return path
                
    for path in ["/home/deck/Emulation/roms", "/home/deck/roms"]:
        if os.path.exists(path) and os.path.isdir(path):
            return path
            
    return None

def find_saves_root():
    """Discover where the EmuDeck/saves folder is located on the system."""
    sd_mounts = glob.glob("/run/media/deck/*")
    for sd in sd_mounts:
        for folder in ["Emulation/saves", "saves"]:
            path = os.path.join(sd, folder)
            if os.path.exists(path) and os.path.isdir(path):
                return path
                
    for path in ["/home/deck/Emulation/saves", "/home/deck/saves"]:
        if os.path.exists(path) and os.path.isdir(path):
            return path
            
    return None

def get_hwmon_paths():
    """Dynamically scan hwmon interfaces to find temperature and fan speed sources."""
    hwmon_paths = {"cpu_temp": None, "fan": None, "gpu_temp": None}
    for path in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            name_path = os.path.join(path, "name")
            if os.path.exists(name_path):
                with open(name_path, "r") as f:
                    name = f.read().strip()
                if name == "steamdeck_hwmon":
                    if os.path.exists(os.path.join(path, "temp1_input")):
                        hwmon_paths["cpu_temp"] = os.path.join(path, "temp1_input")
                    if os.path.exists(os.path.join(path, "fan1_input")):
                        hwmon_paths["fan"] = os.path.join(path, "fan1_input")
                elif name == "amdgpu":
                    if os.path.exists(os.path.join(path, "temp1_input")):
                        hwmon_paths["gpu_temp"] = os.path.join(path, "temp1_input")
        except Exception:
            pass
    return hwmon_paths

def get_cpu_usage():
    global PREV_IDLE, PREV_TOTAL
    try:
        with open('/proc/stat', 'r') as f:
            line = f.readline()
        parts = line.split()
        idle = float(parts[4]) + float(parts[5])
        non_idle = float(parts[1]) + float(parts[2]) + float(parts[3]) + float(parts[6]) + float(parts[7]) + float(parts[8])
        total = idle + non_idle
        
        diff_idle = idle - PREV_IDLE
        diff_total = total - PREV_TOTAL
        
        PREV_IDLE = idle
        PREV_TOTAL = total
        
        if diff_total == 0:
            return 0.0
        return round((1.0 - (diff_idle / diff_total)) * 100, 1)
    except Exception:
        return 0.0

def get_ram_usage():
    try:
        meminfo = {}
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].replace(':', '')] = int(parts[1])
        total = meminfo.get('MemTotal', 0)
        available = meminfo.get('MemAvailable', 0)
        used = total - available
        percent = round((used / total) * 100, 1) if total > 0 else 0
        return {
            "total": total * 1024,
            "used": used * 1024,
            "percent": percent
        }
    except Exception:
        return {"total": 0, "used": 0, "percent": 0}

def get_system_stats():
    internal = shutil.disk_usage("/home")
    sd_usage = None
    
    sd_mounts = glob.glob("/run/media/deck/*")
    if sd_mounts:
        sd_root = sd_mounts[0]
        try:
            sd_data = shutil.disk_usage(sd_root)
            sd_usage = {
                "total": sd_data.total,
                "used": sd_data.used,
                "free": sd_data.free,
                "percent": round((sd_data.used / sd_data.total) * 100, 1)
            }
        except Exception:
            pass
            
    hw_paths = get_hwmon_paths()
    cpu_temp = 0.0
    gpu_temp = 0.0
    fan_speed = 0
    
    try:
        if hw_paths["cpu_temp"]:
            with open(hw_paths["cpu_temp"], "r") as f:
                cpu_temp = round(float(f.read().strip()) / 1000.0, 1)
        if hw_paths["gpu_temp"]:
            with open(hw_paths["gpu_temp"], "r") as f:
                gpu_temp = round(float(f.read().strip()) / 1000.0, 1)
        if hw_paths["fan"]:
            with open(hw_paths["fan"], "r") as f:
                fan_speed = int(f.read().strip())
    except Exception:
        pass
        
    bat_percent = 0
    bat_status = "Unknown"
    bat_health = 100.0
    try:
        if os.path.exists("/sys/class/power_supply/BAT1"):
            with open("/sys/class/power_supply/BAT1/capacity", "r") as f:
                bat_percent = int(f.read().strip())
            with open("/sys/class/power_supply/BAT1/status", "r") as f:
                bat_status = f.read().strip()
            with open("/sys/class/power_supply/BAT1/charge_full", "r") as f:
                full = int(f.read().strip())
            with open("/sys/class/power_supply/BAT1/charge_full_design", "r") as f:
                design = int(f.read().strip())
            bat_health = round((full / design) * 100.0, 1)
    except Exception:
        pass
        
    ssh_active = False
    try:
        res = subprocess.run(["systemctl", "is-active", "sshd"], capture_output=True, text=True)
        ssh_active = res.stdout.strip() == "active"
    except Exception:
        pass
        
    return {
        "cpu_usage": get_cpu_usage(),
        "cpu_temp": cpu_temp,
        "gpu_temp": gpu_temp,
        "fan_speed": fan_speed,
        "ram": get_ram_usage(),
        "battery": {
            "percent": bat_percent,
            "status": bat_status,
            "health": bat_health
        },
        "storage": {
            "internal": {
                "total": internal.total,
                "used": internal.used,
                "free": internal.free,
                "percent": round((internal.used / internal.total) * 100, 1)
            },
            "sd": sd_usage
        },
        "ssh": {
            "active": ssh_active,
            "ip": get_local_ip()
        }
    }

def get_volume():
    try:
        res = subprocess.run(["amixer", "sget", "Master"], capture_output=True, text=True)
        out = res.stdout
        vol_match = re.search(r"\[(\d+)%\]", out)
        vol = int(vol_match.group(1)) if vol_match else 50
        muted = "[off]" in out or "[on]" not in out
        return vol, muted
    except Exception:
        return 50, False

def get_brightness():
    try:
        if not os.path.exists("/sys/class/backlight/amdgpu_bl0/brightness"):
            return 100
        with open("/sys/class/backlight/amdgpu_bl0/brightness", "r") as f:
            curr = int(f.read().strip())
        with open("/sys/class/backlight/amdgpu_bl0/max_brightness", "r") as f:
            max_val = int(f.read().strip())
        return int((curr / max_val) * 100)
    except Exception:
        return 100

def set_brightness(pct):
    try:
        if not os.path.exists("/sys/class/backlight/amdgpu_bl0/brightness"):
            return False
        pct = max(1, min(100, pct))
        with open("/sys/class/backlight/amdgpu_bl0/max_brightness", "r") as f:
            max_val = int(f.read().strip())
        val = int((pct / 100) * max_val)
        with open("/sys/class/backlight/amdgpu_bl0/brightness", "w") as f:
            f.write(str(val))
        return True
    except Exception as e:
        print(f"Error setting brightness: {e}", file=sys.stderr)
        return False

def get_ssh_active():
    try:
        res = subprocess.run(["systemctl", "is-active", "sshd"], capture_output=True, text=True)
        return res.stdout.strip() == "active"
    except Exception:
        return False

def flatpak_update_thread():
    global FLATPAK_UPDATE_STATUS, FLATPAK_UPDATE_LOG
    FLATPAK_UPDATE_STATUS = "updating"
    try:
        res = subprocess.run(["flatpak", "update", "-y"], capture_output=True, text=True)
        if res.returncode == 0:
            FLATPAK_UPDATE_STATUS = "success"
            FLATPAK_UPDATE_LOG = res.stdout
        else:
            FLATPAK_UPDATE_STATUS = "error"
            FLATPAK_UPDATE_LOG = res.stderr
    except Exception as e:
        FLATPAK_UPDATE_STATUS = "error"
        FLATPAK_UPDATE_LOG = str(e)

BIOS_REQUIREMENTS = {
    "playstation": {
        "name": "Sony PlayStation (PS1)",
        "folder": "psx",
        "files": [
            {"filename": "scph5501.bin", "desc": "BIOS recomendada (USA)"},
            {"filename": "scph5502.bin", "desc": "BIOS recomendada (Europa)"},
            {"filename": "scph5500.bin", "desc": "BIOS recomendada (Japón)"},
            {"filename": "scph1001.bin", "desc": "BIOS alternativa (USA)"}
        ]
    },
    "playstation2": {
        "name": "Sony PlayStation 2 (PS2)",
        "folder": "ps2",
        "files": [
            {"filename": "scph39001.bin", "desc": "BIOS recomendada (USA)"},
            {"filename": "scph70012.bin", "desc": "BIOS recomendada (Europa)"},
            {"filename": "scph50009.bin", "desc": "BIOS recomendada (Asia)"}
        ]
    },
    "dreamcast": {
        "name": "Sega Dreamcast",
        "folder": "dc",
        "files": [
            {"filename": "dc_boot.bin", "desc": "BIOS de arranque (Obligatorio)"},
            {"filename": "dc_flash.bin", "desc": "Archivo flash de configuración"}
        ]
    },
    "segacd": {
        "name": "Sega CD / Mega CD",
        "folder": "",
        "files": [
            {"filename": "bios_CD_U.bin", "desc": "BIOS Sega CD (USA)"},
            {"filename": "bios_CD_E.bin", "desc": "BIOS Mega CD (Europa)"},
            {"filename": "bios_CD_J.bin", "desc": "BIOS Mega CD (Japón)"}
        ]
    },
    "saturn": {
        "name": "Sega Saturn",
        "folder": "",
        "files": [
            {"filename": "saturn_bios.bin", "desc": "BIOS Sega Saturn (Obligatorio)"}
        ]
    },
    "switch": {
        "name": "Nintendo Switch (Yuzu/Ryujinx)",
        "folder": "yuzu/keys",
        "files": [
            {"filename": "prod.keys", "desc": "Claves de encriptación de juegos (Obligatorio)"},
            {"filename": "title.keys", "desc": "Claves de títulos (Opcional)"}
        ]
    }
}

def find_bios_root():
    sd_mounts = glob.glob("/run/media/deck/*")
    for mount in sd_mounts:
        path = os.path.join(mount, "Emulation/bios")
        if os.path.exists(path) and os.path.isdir(path):
            return path
            
    internal_path = "/home/deck/Emulation/bios"
    if os.path.exists(internal_path) and os.path.isdir(internal_path):
        return internal_path
        
    return None

class CompanionRequestHandler(BaseHTTPRequestHandler):
    
    def log_message(self, format, *args):
        try:
            if len(args) > 0:
                msg = str(args[0])
                if "GET /api/" in msg or "POST /api/" in msg:
                    print(f"[API] {msg} - {args[1] if len(args) > 1 else ''}", file=sys.stderr)
        except Exception:
            pass

    def handle_api_get(self, path, query_str):
        query = parse_qs(query_str)
        
        if path == "/api/stats":
            stats = get_system_stats()
            stats["version"] = VERSION
            self.send_json(stats)
            
        elif path == "/api/shaders":
            global SHADER_CACHE, IS_SCANNING
            if IS_SCANNING:
                self.send_json({"status": "scanning", "shaders": []})
            elif SHADER_CACHE is None:
                threading.Thread(target=scan_shaders_thread).start()
                self.send_json({"status": "scanning", "shaders": []})
            else:
                self.send_json({"status": "ready", "shaders": SHADER_CACHE})
                
        elif path == "/api/roms/systems":
            roms_root = find_roms_root()
            if not roms_root:
                self.send_json({"error": "No ROM directory found", "systems": []}, status=404)
                return
                
            systems = []
            try:
                with os.scandir(roms_root) as it:
                    for entry in it:
                        if entry.is_dir() and not entry.name.startswith("."):
                            try:
                                count = len([f for f in os.listdir(entry.path) if os.path.isfile(os.path.join(entry.path, f))])
                            except Exception:
                                count = 0
                            
                            systems.append({
                                "id": entry.name,
                                "name": CONSOLE_NAMES.get(entry.name.lower(), entry.name.capitalize()),
                                "count": count
                            })
                systems.sort(key=lambda x: x["name"])
                self.send_json({"roms_root": roms_root, "systems": systems})
            except Exception as e:
                self.send_json({"error": str(e), "systems": []}, status=500)
                
        elif path == "/api/roms/files":
            system = query.get("system", [None])[0]
            if not system:
                self.send_json({"error": "Missing system parameter"}, status=400)
                return
                
            roms_root = find_roms_root()
            system_dir = os.path.join(roms_root, system)
            
            real_system_dir = os.path.realpath(system_dir)
            real_roms_root = os.path.realpath(roms_root)
            if not real_system_dir.startswith(real_roms_root) or not os.path.exists(real_system_dir):
                self.send_json({"error": "Access Denied / Invalid System"}, status=403)
                return
                
            files = []
            try:
                with os.scandir(real_system_dir) as it:
                    for entry in it:
                        if entry.is_file() and not entry.name.startswith("."):
                            stat = entry.stat()
                            files.append({
                                "name": entry.name,
                                "size": stat.st_size,
                                "mtime": int(stat.st_mtime)
                            })
                files.sort(key=lambda x: x["name"].lower())
                self.send_json({"files": files})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/saves/systems":
            saves_root = find_saves_root()
            if not saves_root:
                self.send_json({"error": "No saves directory found", "systems": []}, status=404)
                return
                
            systems = []
            try:
                with os.scandir(saves_root) as it:
                    for entry in it:
                        if entry.is_dir() and not entry.name.startswith(".") and not "_backup_" in entry.name:
                            size = get_dir_size(entry.path)
                            systems.append({
                                "id": entry.name,
                                "name": CONSOLE_NAMES.get(entry.name.lower(), entry.name.capitalize()),
                                "size": size
                            })
                systems.sort(key=lambda x: x["name"])
                self.send_json({"saves_root": saves_root, "systems": systems})
            except Exception as e:
                self.send_json({"error": str(e), "systems": []}, status=500)
                
        elif path == "/api/saves/download":
            emulator = query.get("emulator", [None])[0]
            if not emulator:
                self.send_json({"error": "Missing emulator parameter"}, status=400)
                return
                
            saves_root = find_saves_root()
            if not saves_root:
                self.send_json({"error": "No saves directory found"}, status=404)
                return
                
            emulator_path = os.path.join(saves_root, emulator)
            real_emulator_path = os.path.realpath(emulator_path)
            real_saves_root = os.path.realpath(saves_root)
            
            if not real_emulator_path.startswith(real_saves_root) or not os.path.exists(real_emulator_path):
                self.send_json({"error": "Access Denied / Invalid Emulator Folder"}, status=403)
                return
                
            try:
                import io
                import zipfile
                
                memory_file = io.BytesIO()
                with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                    for root, dirs, files in os.walk(real_emulator_path):
                        if "_backup_" in root:
                            continue
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, real_emulator_path)
                            try:
                                if os.path.islink(file_path) and not os.path.exists(file_path):
                                    continue
                                zip_file.write(file_path, arcname)
                            except Exception as e:
                                print(f"Error zipping {file_path}: {e}", file=sys.stderr)
                                continue
                            
                memory_file.seek(0)
                zip_data = memory_file.getvalue()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f"attachment; filename=saves_{emulator}.zip")
                self.send_header("Content-Length", str(len(zip_data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(zip_data)
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        elif path == "/api/saves/download_global":
            saves_root = find_saves_root()
            if not saves_root:
                self.send_json({"error": "No saves directory found"}, status=404)
                return
                
            try:
                import io
                import zipfile
                
                memory_file = io.BytesIO()
                with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as global_zip:
                    with os.scandir(saves_root) as it:
                        for entry in it:
                            if entry.is_dir() and not entry.name.startswith(".") and not "_backup_" in entry.name:
                                emulator = entry.name
                                # Create in-memory zip for this emulator
                                emu_buffer = io.BytesIO()
                                with zipfile.ZipFile(emu_buffer, 'w', zipfile.ZIP_DEFLATED) as emu_zip:
                                    for root, dirs, files in os.walk(entry.path):
                                        if "_backup_" in root:
                                            continue
                                        for file in files:
                                            file_path = os.path.join(root, file)
                                            arcname = os.path.relpath(file_path, entry.path)
                                            try:
                                                if os.path.islink(file_path) and not os.path.exists(file_path):
                                                    continue
                                                emu_zip.write(file_path, arcname)
                                            except Exception as e:
                                                print(f"Error zipping {file_path}: {e}", file=sys.stderr)
                                                continue
                                                
                                # Add inner zip to global zip
                                emu_buffer.seek(0)
                                global_zip.writestr(f"{emulator}.zip", emu_buffer.getvalue())
                                
                memory_file.seek(0)
                zip_data = memory_file.getvalue()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", "attachment; filename=saves_global_backup.zip")
                self.send_header("Content-Length", str(len(zip_data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(zip_data)
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        elif path == "/api/control/status":
            vol, muted = get_volume()
            self.send_json({
                "volume": vol,
                "muted": muted,
                "brightness": get_brightness(),
                "ssh_active": get_ssh_active(),
                "flatpak_status": FLATPAK_UPDATE_STATUS,
                "flatpak_log": FLATPAK_UPDATE_LOG
            })
        elif path == "/api/bios/status":
            bios_root = find_bios_root()
            if not bios_root:
                self.send_json({"error": "No BIOS directory found", "systems": {}}, status=404)
                return
                
            all_files = {}
            try:
                for root, dirs, files in os.walk(bios_root, followlinks=True):
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, bios_root)
                        all_files[rel_path.lower()] = rel_path
            except Exception as e:
                self.send_json({"error": str(e), "systems": {}}, status=500)
                return
                
            status_data = {}
            for sys_key, sys_info in BIOS_REQUIREMENTS.items():
                sys_files = []
                for req_file in sys_info["files"]:
                    filename = req_file["filename"]
                    subfolder = sys_info["folder"]
                    
                    expected_rel = os.path.join(subfolder, filename) if subfolder else filename
                    expected_rel_lower = expected_rel.lower()
                    
                    status = "missing"
                    actual_filename = ""
                    
                    if expected_rel_lower in all_files:
                        actual_rel = all_files[expected_rel_lower]
                        actual_filename = os.path.basename(actual_rel)
                        if actual_filename == filename:
                            status = "present"
                        else:
                            status = "case_mismatch"
                            
                    sys_files.append({
                        "filename": filename,
                        "desc": req_file["desc"],
                        "status": status,
                        "actual_filename": actual_filename,
                        "target_rel_path": expected_rel
                    })
                
                status_data[sys_key] = {
                    "name": sys_info["name"],
                    "folder": sys_info["folder"],
                    "files": sys_files
                }
                
            self.send_json({
                "bios_root": bios_root,
                "systems": status_data
            })
        elif path == "/api/bios/download_global":
            bios_root = find_bios_root()
            if not bios_root:
                self.send_json({"error": "No BIOS directory found"}, status=404)
                return
                
            try:
                import io
                import zipfile
                
                memory_file = io.BytesIO()
                with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as bios_zip:
                    for root, dirs, files in os.walk(bios_root, followlinks=True):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, bios_root)
                            try:
                                bios_zip.write(file_path, arcname)
                            except Exception as e:
                                print(f"Error zipping BIOS file {file_path}: {e}", file=sys.stderr)
                                continue
                                
                memory_file.seek(0)
                zip_data = memory_file.getvalue()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", "attachment; filename=bios_global_backup.zip")
                self.send_header("Content-Length", str(len(zip_data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(zip_data)
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        else:
            self.send_error(404, "API Endpoint Not Found")

    def handle_api_post(self, path, query_str):
        query = parse_qs(query_str)
        content_length = int(self.headers.get('Content-Length', 0))
        
        if path == "/api/shaders/scan":
            global IS_SCANNING
            if not IS_SCANNING:
                threading.Thread(target=scan_shaders_thread).start()
            self.send_json({"status": "scanning"})
            
        elif path == "/api/shaders/clean":
            if content_length == 0:
                self.send_json({"error": "Missing post data"}, status=400)
                return
                
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                paths_to_clean = data.get("paths", [])
                
                cleaned_count = 0
                errors = []
                
                for p in paths_to_clean:
                    p = os.path.normpath(p)
                    is_valid = False
                    valid_patterns = [
                        r"^/home/deck/\.steam/steam/steamapps/(shadercache|compatdata)/\d+$",
                        r"^/home/deck/\.local/share/Steam/steamapps/(shadercache|compatdata)/\d+$",
                        r"^/run/media/deck/[^/]+/steamapps/(shadercache|compatdata)/\d+$"
                    ]
                    for pattern in valid_patterns:
                        if re.match(pattern, p):
                            is_valid = True
                            break
                            
                    if is_valid and os.path.exists(p) and os.path.isdir(p):
                        try:
                            shutil.rmtree(p)
                            cleaned_count += 1
                        except Exception as e:
                            errors.append(f"Failed to delete {p}: {str(e)}")
                    else:
                        errors.append(f"Skipped invalid path: {p}")
                
                global SHADER_CACHE
                SHADER_CACHE = None
                
                self.send_json({
                    "status": "success" if not errors else "partial_success",
                    "cleaned": cleaned_count,
                    "errors": errors
                })
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/roms/upload":
            system = query.get("system", [None])[0]
            filename = query.get("filename", [None])[0]
            
            if not system or not filename:
                self.send_json({"error": "Missing system or filename"}, status=400)
                return
                
            roms_root = find_roms_root()
            if not roms_root:
                self.send_json({"error": "ROM root not found"}, status=404)
                return
                
            dest_dir = os.path.join(roms_root, system)
            real_dest_dir = os.path.realpath(dest_dir)
            real_roms_root = os.path.realpath(roms_root)
            
            if not real_dest_dir.startswith(real_roms_root):
                self.send_json({"error": "Access Denied / Invalid System Directory"}, status=403)
                return
                
            os.makedirs(real_dest_dir, exist_ok=True)
            
            filename = os.path.basename(filename)
            dest_file = os.path.join(real_dest_dir, filename)
            
            try:
                remaining = content_length
                with open(dest_file, "wb") as f:
                    while remaining > 0:
                        chunk_size = min(remaining, 65536)
                        chunk = self.rfile.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)
                
                self.send_json({"status": "success", "file": filename})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/roms/delete":
            if content_length == 0:
                self.send_json({"error": "Missing post data"}, status=400)
                return
                
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                system = data.get("system")
                filename = data.get("filename")
                
                if not system or not filename:
                    self.send_json({"error": "Missing parameters"}, status=400)
                    return
                    
                roms_root = find_roms_root()
                target_file = os.path.join(roms_root, system, os.path.basename(filename))
                real_file = os.path.realpath(target_file)
                real_roms_root = os.path.realpath(roms_root)
                
                if not real_file.startswith(real_roms_root) or not os.path.exists(real_file):
                    self.send_json({"error": "File access denied or not found"}, status=403)
                    return
                    
                os.remove(real_file)
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/saves/restore":
            emulator = query.get("emulator", [None])[0]
            if not emulator:
                self.send_json({"error": "Missing emulator parameter"}, status=400)
                return
                
            saves_root = find_saves_root()
            if not saves_root:
                self.send_json({"error": "Saves root not found"}, status=404)
                return
                
            emulator_path = os.path.join(saves_root, emulator)
            real_emulator_path = os.path.realpath(emulator_path)
            real_saves_root = os.path.realpath(saves_root)
            
            if not real_emulator_path.startswith(real_saves_root) or not os.path.exists(real_emulator_path):
                self.send_json({"error": "Access Denied / Invalid Emulator Folder"}, status=403)
                return
                
            try:
                import io
                import zipfile
                import time
                
                if content_length > 200 * 1024 * 1024:
                    self.send_json({"error": "File size exceeds 200MB limit"}, status=400)
                    return
                    
                zip_data = self.rfile.read(content_length)
                zip_buffer = io.BytesIO(zip_data)
                
                if not zipfile.is_zipfile(zip_buffer):
                    self.send_json({"error": "Uploaded file is not a valid ZIP file"}, status=400)
                    return
                
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                backup_path = f"{real_emulator_path}_backup_{timestamp}"
                
                shutil.copytree(real_emulator_path, backup_path, symlinks=True)
                
                with os.scandir(real_emulator_path) as it:
                    for entry in it:
                        if "_backup_" in entry.name:
                            continue
                        if entry.is_file() or entry.is_symlink():
                            os.remove(entry.path)
                        elif entry.is_dir():
                            shutil.rmtree(entry.path)
                            
                with zipfile.ZipFile(zip_buffer) as zf:
                    zf.extractall(real_emulator_path)
                    
                self.send_json({
                    "status": "success",
                    "backup_created": os.path.basename(backup_path)
                })
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        elif path == "/api/saves/restore_global":
            saves_root = find_saves_root()
            if not saves_root:
                self.send_json({"error": "Saves root not found"}, status=404)
                return
                
            try:
                import io
                import zipfile
                import time
                
                if content_length > 500 * 1024 * 1024:
                    self.send_json({"error": "File size exceeds 500MB limit"}, status=400)
                    return
                    
                zip_data = self.rfile.read(content_length)
                zip_buffer = io.BytesIO(zip_data)
                
                if not zipfile.is_zipfile(zip_buffer):
                    self.send_json({"error": "Uploaded file is not a valid ZIP file"}, status=400)
                    return
                
                # Create a global backup
                timestamp = time.strftime("%Y%m%d_%H%M%S")
                parent_dir = os.path.dirname(saves_root)
                global_backup_path = os.path.join(parent_dir, f"saves_global_backup_{timestamp}")
                
                def ignore_backups(directory, contents):
                    ignored = []
                    for name in contents:
                        if "_backup_" in name:
                            ignored.append(name)
                    return ignored
                    
                # Enable symlinks=True to copy broken symlinks as links without error
                shutil.copytree(saves_root, global_backup_path, ignore=ignore_backups, symlinks=True)
                
                # Extract global zip which contains inner <emulator>.zip files
                with zipfile.ZipFile(zip_buffer) as gz:
                    for file_info in gz.infolist():
                        if file_info.filename.endswith(".zip"):
                            emulator = file_info.filename[:-4]
                            if not re.match(r"^[a-zA-Z0-9_\-]+$", emulator):
                                continue
                                
                            emulator_path = os.path.join(saves_root, emulator)
                            os.makedirs(emulator_path, exist_ok=True)
                            
                            # Delete active files/directories (ignore backups)
                            try:
                                with os.scandir(emulator_path) as it:
                                    for entry in it:
                                        if "_backup_" in entry.name:
                                            continue
                                        if entry.is_file() or entry.is_symlink():
                                            os.remove(entry.path)
                                        elif entry.is_dir():
                                            shutil.rmtree(entry.path)
                            except Exception:
                                pass
                                
                            # Extract inner zip
                            inner_zip_data = gz.read(file_info.filename)
                            inner_zip_buffer = io.BytesIO(inner_zip_data)
                            if zipfile.is_zipfile(inner_zip_buffer):
                                with zipfile.ZipFile(inner_zip_buffer) as iz:
                                    iz.extractall(emulator_path)
                                    
                self.send_json({
                    "status": "success",
                    "backup_created": os.path.basename(global_backup_path)
                })
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        elif path == "/api/control/power":
            action = query.get("action", [None])[0]
            if not action:
                self.send_json({"error": "Missing action parameter"}, status=400)
                return
                
            try:
                if action == "shutdown":
                    subprocess.Popen(["systemctl", "poweroff"])
                elif action == "reboot":
                    subprocess.Popen(["systemctl", "reboot"])
                elif action == "suspend":
                    subprocess.Popen(["systemctl", "suspend"])
                elif action == "gamemode":
                    subprocess.Popen(["/usr/bin/steamos-session-select", "gaming"])
                else:
                    self.send_json({"error": "Invalid action"}, status=400)
                    return
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/control/volume":
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                
                if "volume" in data:
                    vol = int(data["volume"])
                    subprocess.run(["amixer", "sset", "Master", f"{vol}%"], capture_output=True)
                if "muted" in data:
                    muted = bool(data["muted"])
                    cmd = "mute" if muted else "unmute"
                    subprocess.run(["amixer", "sset", "Master", cmd], capture_output=True)
                    
                vol, muted = get_volume()
                self.send_json({"status": "success", "volume": vol, "muted": muted})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/control/brightness":
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                pct = int(data.get("brightness", 100))
                set_brightness(pct)
                self.send_json({"status": "success", "brightness": get_brightness()})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/control/ssh":
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                active = bool(data.get("active", False))
                cmd = "start" if active else "stop"
                subprocess.run(["systemctl", cmd, "sshd"], capture_output=True)
                self.send_json({"status": "success", "ssh_active": get_ssh_active()})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/control/flatpak_update":
            global FLATPAK_UPDATE_STATUS
            if FLATPAK_UPDATE_STATUS != "updating":
                threading.Thread(target=flatpak_update_thread).start()
            self.send_json({"status": "success", "flatpak_status": FLATPAK_UPDATE_STATUS})
        elif path == "/api/bios/upload":
            target_rel_path = query.get("target_rel_path", [None])[0]
            if not target_rel_path:
                self.send_json({"error": "Missing target_rel_path parameter"}, status=400)
                return
                
            bios_root = find_bios_root()
            if not bios_root:
                self.send_json({"error": "BIOS root not found"}, status=404)
                return
                
            dest_file = os.path.join(bios_root, target_rel_path)
            # Use os.path.normpath to validate path containment without resolving symlinks.
            # This is critical because EmuDeck uses symlinks to target flatpak storage (e.g. yuzu/keys -> /home/deck/.local/share/yuzu/keys).
            norm_dest = os.path.normpath(dest_file)
            norm_bios_root = os.path.normpath(bios_root)
            
            # Prevent path traversal
            if not norm_dest.startswith(norm_bios_root):
                self.send_json({"error": "Access Denied / Invalid BIOS Path"}, status=403)
                return
                
            try:
                # Ensure the parent directory exists, handling symlinks robustly (even broken ones)
                parent_dir = os.path.dirname(norm_dest)
                if os.path.islink(parent_dir):
                    real_target_dir = os.path.realpath(parent_dir)
                    os.makedirs(real_target_dir, exist_ok=True)
                else:
                    os.makedirs(parent_dir, exist_ok=True)
                
                remaining = content_length
                with open(norm_dest, "wb") as f:
                    while remaining > 0:
                        chunk_size = min(remaining, 65536)
                        chunk = self.rfile.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        remaining -= len(chunk)
                        
                self.send_json({"status": "success", "file": target_rel_path})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
                
        elif path == "/api/bios/fix_case":
            if content_length == 0:
                self.send_json({"error": "Missing post data"}, status=400)
                return
                
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                target_rel_path = data.get("target_rel_path")
                actual_filename = data.get("actual_filename")
                
                if not target_rel_path or not actual_filename:
                    self.send_json({"error": "Missing parameters"}, status=400)
                    return
                    
                bios_root = find_bios_root()
                if not bios_root:
                    self.send_json({"error": "BIOS root not found"}, status=404)
                    return
                    
                subfolder = os.path.dirname(target_rel_path)
                actual_file_path = os.path.join(bios_root, subfolder, actual_filename)
                target_file_path = os.path.join(bios_root, target_rel_path)
                
                # Validate using normpath to support symlinks
                norm_actual = os.path.normpath(actual_file_path)
                norm_target = os.path.normpath(target_file_path)
                norm_bios_root = os.path.normpath(bios_root)
                
                if not norm_actual.startswith(norm_bios_root) or not norm_target.startswith(norm_bios_root):
                    self.send_json({"error": "Access Denied"}, status=403)
                    return
                    
                if not os.path.exists(norm_actual):
                    self.send_json({"error": "Source file not found"}, status=404)
                    return
                    
                os.rename(norm_actual, norm_target)
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        elif path == "/api/bios/restore_global":
            bios_root = find_bios_root()
            if not bios_root:
                self.send_json({"error": "No BIOS directory found"}, status=404)
                return
                
            try:
                import io
                import zipfile
                import shutil
                from datetime import datetime
                
                zip_buffer = io.BytesIO()
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(remaining, 65536)
                    chunk = self.rfile.read(chunk_size)
                    if not chunk:
                        break
                    zip_buffer.write(chunk)
                    remaining -= len(chunk)
                zip_buffer.seek(0)
                
                if not zipfile.is_zipfile(zip_buffer):
                    self.send_json({"error": "Invalid zip file format"}, status=400)
                    return
                    
                # Create backup of current bios folder first
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                parent_dir = os.path.dirname(bios_root)
                global_backup_path = os.path.join(parent_dir, f"bios_global_backup_{timestamp}")
                
                try:
                    shutil.copytree(bios_root, global_backup_path, symlinks=True)
                except Exception as e:
                    print(f"Warning: BIOS backup failed: {e}", file=sys.stderr)
                    
                with zipfile.ZipFile(zip_buffer) as bz:
                    for member in bz.infolist():
                        target_path = os.path.join(bios_root, member.filename)
                        norm_target = os.path.normpath(target_path)
                        norm_bios_root = os.path.normpath(bios_root)
                        
                        if not norm_target.startswith(norm_bios_root):
                            continue
                            
                        parent_dir = os.path.dirname(norm_target)
                        if os.path.islink(parent_dir):
                            real_target_dir = os.path.realpath(parent_dir)
                            os.makedirs(real_target_dir, exist_ok=True)
                        else:
                            os.makedirs(parent_dir, exist_ok=True)
                            
                        if not member.filename.endswith('/'):
                            with bz.open(member) as source, open(norm_target, "wb") as target:
                                shutil.copyfileobj(source, target)
                                
                self.send_json({"status": "success"})
            except Exception as e:
                self.send_json({"error": str(e)}, status=500)
        else:
            self.send_error(404, "API Endpoint Not Found")

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        response_bytes = json.dumps(data).encode('utf-8')
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path.startswith("/api/"):
            self.handle_api_get(path, parsed.query)
        else:
            if path == "/":
                path = "/index.html"
                
            clean_path = os.path.normpath(path).lstrip("/")
            file_path = os.path.join(WEB_DIR, clean_path)
            
            real_file_path = os.path.realpath(file_path)
            real_web_dir = os.path.realpath(WEB_DIR)
            
            if not real_file_path.startswith(real_web_dir) or not os.path.exists(real_file_path) or os.path.isdir(real_file_path):
                self.send_error(404, "File Not Found")
                return
                
            self.send_response(200)
            mime_type, _ = mimetypes.guess_type(real_file_path)
            self.send_header("Content-Type", mime_type or "application/octet-stream")
            self.send_header("Content-Length", str(os.path.getsize(real_file_path)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            
            with open(real_file_path, "rb") as f:
                self.wfile.write(f.read())
                
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path.startswith("/api/"):
            self.handle_api_post(path, parsed.query)
        else:
            self.send_error(404, "File Not Found")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With")
        self.end_headers()

def main():
    os.makedirs(WEB_DIR, exist_ok=True)
    port = 8000
    server_address = ('', port)
    
    get_cpu_usage()
    
    httpd = HTTPServer(server_address, CompanionRequestHandler)
    
    local_ip = get_local_ip()
    print("=" * 60)
    print("           DECKBOARD v1.1.0 - SERVER STARTED     ")
    print("=" * 60)
    print(f"  Local Access:   http://localhost:{port}")
    print(f"  Network Access: http://{local_ip}:{port}")
    print("-" * 60)
    print("  Use this interface to:")
    print("  1. Transfer ROMs to your Steam Deck via Wi-Fi.")
    print("  2. Monitor temperatures, RAM, and Battery Health.")
    print("  3. Clean up orphaned shader caches / compatdata.")
    print("  4. Backup and restore emulator save games.")
    print("=" * 60)
    print("Press Ctrl+C to stop the server.")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
        print("Server stopped.")

if __name__ == "__main__":
    main()
