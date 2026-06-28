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

# Global variables for caching shader scan results
SHADER_CACHE = None
IS_SCANNING = False
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
                            zip_file.write(file_path, arcname)
                            
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
                
                shutil.copytree(real_emulator_path, backup_path)
                
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
    print("           DECKBOARD - SERVER STARTED            ")
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
