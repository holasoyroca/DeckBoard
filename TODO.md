# 📋 DeckBoard - Tareas Pendientes (TODO)

Este documento detalla las funciones planificadas para las próximas versiones de **DeckBoard**.

---

## 🚀 Próximas Características (Roadmap)

### 1. 🎛️ Control Remoto de la Deck (Quick Actions) - [Prioridad: Alta]
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
