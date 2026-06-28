# 📋 DeckBoard - Tareas Pendientes (TODO)

Este documento detalla las funciones planificadas para las próximas versiones de **DeckBoard**.

---

## 🚀 Próximas Características (Roadmap)

### 1. 🎛️ Control Remoto de la Deck (Quick Actions) - [COMPLETADO ✅]
*   **Descripción:** Permitir al usuario realizar acciones rápidas de control de hardware de la Steam Deck de forma remota a través de la web (ideal desde el móvil).
*   **Funciones planificadas:**
    *   Botones de energía: Apagar, reiniciar, suspender consola.
    *   Toggles del sistema: Cambiar entre Modo Escritorio y Modo Juego (Game Mode).
    *   Ajustes de pantalla y audio: Control deslizante de volumen y brillo de la pantalla.
    *   Acciones de sistema rápido: Toggles para activar/desactivar SSH (mostrando comandos si se requiere contraseña) y botón para actualizar aplicaciones Flatpak (`flatpak update -y`).
*   **UI sugerida:** Grid de tarjetas minimalistas con iconos de control en la parte superior del Dashboard.

### 2. 💻 Terminal Web Integrada (Web Terminal) - [Prioridad: Media]
*   **Descripción:** Añadir una consola interactiva en la interfaz web de DeckBoard que ejecute comandos bash en segundo plano en la Steam Deck y devuelva la salida en tiempo real.
*   **Funciones planificadas:**
    *   Consola interactiva que simula una terminal real (con tema oscuro de consola).
    *   Botonera con comandos predefinidos útiles (ej. `passwd`, `systemctl status sshd`, `df -h`, etc.).
    *   Ejecución segura de procesos asíncronos para evitar bloquear el servidor principal.
    *   Bloqueo o aviso al intentar ejecutar comandos destructivos.
*   **UI sugerida:** Pestaña independiente llamada "Terminal" con estilo retro hacker y fuente monoespacio.

### 3. 📁 Gestor y Validador de BIOS - [COMPLETADO ✅]
*   **Descripción:** Inspeccionar los archivos BIOS requeridos por cada consola en EmuDeck, subirlos por Wi-Fi de forma automática y resolver conflictos de nombres.
*   **Funciones implementadas:**
    *   Escanear el directorio de BIOS de EmuDeck en busca de archivos esenciales (PS1, PS2, Sega CD, Sega Saturn, Dreamcast, Switch keys).
    *   Detectar discrepancias de mayúsculas/minúsculas (case mismatches) para evitar incompatibilidades en Linux.
    *   Zonas drag-and-drop independientes para subir e instalar archivos BIOS directamente en las carpetas correctas por Wi-Fi.
    *   Acción rápida para corregir nombres de archivos incorrectos directamente desde la interfaz web.

### 📊 4. Analizador de Espacio de Juegos (Steam Game Space Analyzer) - [COMPLETADO ✅]
*   **Descripción:** Analizador visual e interactivo de almacenamiento de los juegos de Steam (SSD y MicroSD).
*   **Funciones implementadas:**
    *   Escanear la biblioteca de Steam y desglosar el espacio ocupado por cada juego en 3 componentes principales: Archivos del juego (`common`), Archivos de caché de Shaders (`shadercache`) y Prefijos de Proton (`compatdata`).
    *   Visualización moderna usando barras de progreso apiladas con colores diferenciados (Azul para el juego, Púrpura para los shaders, Rosa para el prefijo).
    *   Mapear y agrupar la información por disco (SSD Interno o tarjeta MicroSD).
    *   Herramientas de limpieza quirúrgicas para eliminar de forma individual el caché de shaders o el prefijo de compatdata de un juego específico.
