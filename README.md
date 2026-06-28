# DeckBoard 🎮✨
### El panel de control y gestor web definitivo para tu Steam Deck

**DeckBoard** es un panel de control y gestor web ultraligero diseñado específicamente para la **Steam Deck**. Está programado en **Python 3 puro** (usando solo librerías estándar), lo que significa que **no requiere desactivar el modo de solo lectura de SteamOS**, no necesita privilegios de administrador (`sudo`) y no requiere instalar Node.js ni paquetes externos (`pip`). 

Permite monitorizar estadísticas del sistema, transferir juegos (ROMs) mediante Wi-Fi usando arrastrar y soltar (Drag & Drop) y eliminar archivos temporales obsoletos (Shader Cache / Compatdata) de juegos desinstalados para recuperar gigabytes de espacio.

---

## ✨ Características Principales

1.  **📊 Panel de Estadísticas (Dashboard):**
    *   Uso de CPU e historial de temperaturas.
    *   Temperatura de la GPU y velocidad del ventilador (RPM) leídos de los sensores oficiales de la consola (`steamdeck_hwmon`).
    *   Uso de RAM y almacenamiento detallado (SSD interno y tarjeta MicroSD).
    *   **Salud de la Batería:** Calculada dinámicamente comparando la capacidad actual con la capacidad original de fábrica.
2.  **🎮 Gestor de ROMs e BIOS por Wi-Fi:**
    *   **Auto-descubrimiento:** Localiza automáticamente tus rutas de EmuDeck (tanto en la tarjeta MicroSD como en el almacenamiento interno).
    *   **Subida optimizada (Drag & Drop):** Sube archivos pesados (juegos en `.iso`, `.zip`, `.rom`) directamente desde el navegador de tu móvil o PC secundario. Los archivos se transmiten por streaming directo al disco, previniendo cuelgues o falta de memoria RAM.
    *   **Explorador integrado:** Lista tus ROMs y borra juegos obsoletos cómodamente de forma inalámbrica.
3.  **🧹 Limpiador Inteligente de Shaders y Compatdata:**
    *   **Asociación de AppID:** Lee los archivos ACF de Steam para emparejar carpetas numéricas con nombres de juegos reales.
    *   **Identificación de Huérfanos:** Encuentra de forma automática cachés de sombreadores (`shadercache`) y prefijos de Wine (`compatdata`) pertenecientes a juegos que ya eliminaste de Steam y los borra de forma segura.

---

## 🚀 Inicio Rápido (Manual)

1.  Abre la terminal de tu Steam Deck (Konsole).
2.  Ve al directorio del proyecto e inicia el servidor ejecutando:
    ```bash
    /home/deck/git_proyects/DeckBoard/start.sh
    ```
3.  La terminal mostrará la dirección IP del servidor. Abre tu navegador en tu móvil o PC principal y accede a:
    ```
    http://<IP-DE-TU-STEAMDECK>:8000
    ```
    *(Si accedes desde la propia Steam Deck, entra a `http://localhost:8000`)*.
4.  Presiona `Ctrl+C` en la terminal para apagar el servidor.

---

## 🤖 Inicio Automático con SteamOS (Servicio Systemd)

Para que DeckBoard funcione en segundo plano **siempre que inicies la Steam Deck en Modo Escritorio** (sin necesidad de abrir la terminal):

1.  Crea la carpeta de servicios de usuario:
    ```bash
    mkdir -p ~/.config/systemd/user/
    ```
2.  Crea el archivo de configuración del servicio ejecutando lo siguiente:
    ```bash
    cat << 'EOF' > ~/.config/systemd/user/deckboard.service
    [Unit]
    Description=DeckBoard Web Dashboard
    After=network.target

    [Service]
    Type=simple
    ExecStart=/usr/bin/python3 /home/deck/git_proyects/DeckBoard/server.py
    Restart=on-failure
    RestartSec=5

    [Install]
    WantedBy=default.target
    EOF
    ```
3.  Recarga systemd para que detecte el nuevo servicio:
    ```bash
    systemctl --user daemon-reload
    ```
4.  Habilita e inicia el servicio:
    ```bash
    systemctl --user enable --now deckboard.service
    ```

*   **Verificar estado:** `systemctl --user status deckboard.service`
*   **Detener temporalmente:** `systemctl --user stop deckboard.service`

---

## ❌ Desinstalación Completa

Si deseas desinstalar DeckBoard y limpiar cualquier rastro del sistema:

1.  **Detén y deshabilita el servicio automático** (si lo configuraste):
    ```bash
    systemctl --user disable --now deckboard.service
    ```
2.  **Elimina el archivo del servicio de Systemd:**
    ```bash
    rm -f ~/.config/systemd/user/deckboard.service
    systemctl --user daemon-reload
    ```
3.  **Elimina la carpeta del proyecto:**
    ```bash
    rm -rf /home/deck/git_proyects/DeckBoard
    ```

---

## 👤 Creador
Desarrollado con ❤️ por **holasoyroca**. Puedes descargar y colaborar con el proyecto desde el repositorio oficial en [GitHub](https://github.com/holasoyroca/deckboard).
