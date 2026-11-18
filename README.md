# Control de Asistencia (PWA offline)

App personal para controlar la asistencia de trabajadores. Funciona sin internet y guarda los datos en el propio teléfono.

## 1. Probarla en la PC

En esta carpeta ejecuta:

```
python -m http.server 8000
```

Abre `http://localhost:8000` en Chrome o Edge. (No funciona abriendo `index.html` con doble clic: el service worker necesita un servidor.)

## 2. Subirla gratis a GitHub Pages

1. Crea una cuenta en https://github.com y pulsa **New repository** (por ejemplo `asistencia`, público).
2. En el repositorio nuevo pulsa **uploading an existing file** y arrastra **todos los archivos de esta carpeta** (`index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `xlsx.full.min.js`, `icon-192.png`, `icon-512.png`). Pulsa **Commit changes**.
3. Ve a **Settings → Pages**. En *Branch* elige `main` y carpeta `/ (root)`, y pulsa **Save**.
4. Espera 1–2 minutos. Tu app quedará en `https://TU-USUARIO.github.io/asistencia/`.

## 3. Instalarla en Android

1. Abre la dirección de GitHub Pages en **Chrome** (con internet, solo esta primera vez).
2. Menú ⋮ → **Instalar app** (o **Agregar a pantalla de inicio**).
3. Abre la app desde el icono. Desde ahora funciona sin conexión.

## 4. Respaldo

- **Hacer respaldo:** pestaña **Respaldo → Exportar respaldo**. Se descarga un archivo `respaldo_asistencia_AAAA-MM-DD.json`. Guárdalo o envíatelo (WhatsApp, correo, Drive).
- **Restaurar:** en el teléfono nuevo (o tras reinstalar) abre la app → **Respaldo → Importar respaldo** y elige el archivo. Reemplaza todos los datos actuales, por eso pide confirmación.

Haz respaldos con regularidad: si borras los datos del navegador o desinstalas la app, los datos se pierden.

## Notas de uso

- El **descanso** del día fijo se sugiere solo (borde punteado) y cuenta como descanso en el reporte; puedes cambiarlo ese día. Tocar de nuevo el estado marcado lo quita.
- **Marcar a todos como asistió** solo marca a quienes están sin marcar y sin descanso sugerido.
- **Días sin marcar** cuenta solo trabajadores activos, desde su fecha de alta hasta hoy.
- Para que el Excel tenga encabezados en negrita, `xlsx.full.min.js` es SheetJS en su variante `xlsx-js-style` (misma API, con soporte de estilos).
