# Plan y Checklist de Lanzamiento: Beta, CI/CD y SEO

Documento maestro con todo lo necesario para desplegar, configurar y optimizar la versión Beta de **Cifra (Analizador de Resultados Financieros)**.

---

## 1. Especificaciones de la Infraestructura Elegida

* **Proveedor:** Contabo (o similar)
* **Plan:** Cloud VPS 4
* **Recursos:** 4 núcleos vCPU, 8 GB de RAM, 100 GB SSD, puerto 200 Mbit/s, tráfico ilimitado.
* **Coste:** ~5.50 €/mes (contrato mensual sin compromiso de permanencia ni costes de alta).
* **Sistema Operativo:** Ubuntu 22.04 LTS o 24.04 LTS.
* **Región elegida:* **UE (Hub Europe)** para proximidad a los usuarios hispanohablantes y RGPD, asumiendo ~100-150 ms extra en las llamadas a SEC/Yahoo (mitigado con caché).

---

## 2. Checklist de Lanzamiento de la Beta

### Fase A: Preparación del Código y Secretos
- [ ] **Auditoría de secretos en Git:** Confirmar que ningún archivo `.env`, token de GitHub o clave privada esté trackeado en el repositorio (`git status`, `.gitignore`).
- [ ] **Configuración `.env` para Producción:**
  - `JWT_SECRET`: generar una cadena criptográfica aleatoria segura (`openssl rand -hex 32`).
  - `AI_PROVIDER=deepseek`: clave `DEEPSEEK_API_KEY` activa y con saldo.
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: credenciales para envío real de correos de verificación y recuperación.
  - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: configurados con la URL de callback final (`https://cifraresearch.com/api/auth/google/callback`).
  - `DATABASE_URL`: apuntando a la base de datos de producción (`cifra_prod`).
- [ ] **Resiliencia ante caídas:** Asegurar que los errores de timeout con DeepSeek o con la SEC muestren alertas comprensibles al usuario y no bloqueen la interfaz.

### Fase B: Configuración y Seguridad del Servidor (VPS)
- [ ] **Actualización del sistema:**
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```
- [ ] **Creación de usuario sin privilegios root:**
  ```bash
  adduser deploy
  usermod -aG sudo deploy
  ```
- [ ] **Seguridad SSH:**
  - Instalar claves SSH públicas en `/home/deploy/.ssh/authorized_keys`.
  - Deshabilitar login por contraseña en `/etc/ssh/sshd_config` (`PasswordAuthentication no`).
- [ ] **Firewall (UFW):**
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow ssh
  sudo ufw allow http
  sudo ufw allow https
  sudo ufw enable
  ```
- [ ] **Instalación de paquetes de entorno:**
  ```bash
  # Node.js 22 LTS
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs git nginx

  # PostgreSQL 16
  sudo apt install -y postgresql postgresql-contrib

  # Certbot para certificados SSL gratis
  sudo apt install -y certbot python3-certbot-nginx
  ```

### Fase C: Base de Datos PostgreSQL
- [ ] **Crear usuario y bases de datos aisladas en PostgreSQL:**
  ```sql
  CREATE USER cifra_user WITH PASSWORD 'tu_password_seguro';
  CREATE DATABASE cifra_prod OWNER cifra_user;
  CREATE DATABASE cifra_dev OWNER cifra_user;
  ```
- [ ] **Ejecutar migraciones iniciales:**
  ```bash
  npm run db:migrate
  ```
- [ ] **Backups automatizados (Cron Job diario):**
  - Crear script `/home/deploy/backup-db.sh`:
    ```bash
    #!/usr/bin/env bash
    BACKUP_DIR="/home/deploy/backups"
    mkdir -p "$BACKUP_DIR"
    FECHA=$(date +%Y-%m-%d_%H%M%S)
    pg_dump -U cifra_user -d cifra_prod | gzip > "$BACKUP_DIR/cifra_prod_$FECHA.sql.gz"
    # Mantener solo los últimos 14 días
    find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -delete
    ```
  - Añadir a `crontab -e`:
    ```cron
    0 3 * * * /home/deploy/backup-db.sh
    ```

---

## 3. Arquitectura CI/CD (Entorno Development vs Producción)

Gracias a los 8 GB de RAM y 4 vCPU del VPS, ambos entornos convivirán en la misma máquina con costo extra cero.

### Distribución de los entornos

| Concepto | Entorno Development | Entorno Producción |
|---|---|---|
| **Dominio / Subdominio** | `dev.cifraresearch.com` | `cifraresearch.com` / `www.cifraresearch.com` |
| **Rama Git** | `development` | `production` |
| **Ruta en VPS** | `/var/www/cifra-dev` | `/var/www/cifra-prod` |
| **Puerto Interno** | `3001` | `3000` |
| **Base de Datos** | `cifra_dev` | `cifra_prod` |
| **Servicio systemd** | `cifra-dev` | `cifra-prod` |

---

### Configuración de Nginx (Proxy Inverso con SSL)

Archivo `/etc/nginx/sites-available/cifra`:

```nginx
# Producción
server {
    server_name cifraresearch.com www.cifraresearch.com;

    # Compresión gzip para alta velocidad
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Development / Staging
server {
    server_name dev.cifraresearch.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Habilitar sitio y generar certificados:
```bash
sudo ln -s /etc/nginx/sites-available/cifra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d cifraresearch.com -d www.cifraresearch.com -d dev.cifraresearch.com
```

---

### Pipeline de Despliegue Automático con GitHub Actions

Implementado con **dos workflows independientes** (`.github/workflows/deploy-dev.yml` y `deploy-prod.yml`): push a `development` despliega en dev y push a `production` en producción. Cada uno ejecuta un job de CI (`npm ci` + `node --check`) y, si pasa, un job de despliegue por SSH que actualiza la rama, instala dependencias, aplica migraciones, **reinicia el servicio systemd** (`cifra-dev` o `cifra-prod`, ya no se usa PM2) y valida con un health check.

**Secretos en GitHub Settings $\rightarrow$ Secrets and Variables $\rightarrow$ Actions:**
* `VPS_HOST`: IP del VPS (configurada como secreto de GitHub; no se documenta en el repositorio).
* `VPS_USER`: `deploy`
* `VPS_SSH_KEY`: clave privada dedicada (`~/.ssh/cifra_actions`), autorizada en el VPS.

---

## 4. Estrategia de SEO para Cifra

Una plataforma de análisis de resultados financieros se nutre del tráfico de inversores que buscan nombres de acciones y tipos de informes.

### A. Páginas Públicas Indexables vs Páginas Privadas
* **Páginas privadas (`noindex`):**
  * `/portfolio` (carteras personales).
  * `/watchlists` (listas privadas).
  * `/settings` (configuraciones).
  * `/api/*` (bloqueadas para rastreadores).
* **Páginas públicas (máximo valor SEO):**
  * `index.html` (Landing principal orientada a la propuesta de valor).
  * `empresa.html?ticker=XYZ` (Páginas de empresas). Deben permitir visualizar información básica del perfil y últimos filings sin forzar registro inmediato para que los bots de Google puedan indexarlas.

### B. Meta Etiquetas Esenciales (Head de HTML)

```html
<!-- Título descriptivo con keywords clave -->
<title>Cifra | Análisis de Informes Financieros 10-K y 10-Q con IA</title>
<meta name="description" content="Analiza informes 10-Q y 10-K de la SEC en segundos. Desglose con IA de ingresos, flujo de caja libre y asignación de capital para inversores." />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="https://cifraresearch.com/" />

<!-- Open Graph para redes sociales (X, LinkedIn, WhatsApp) -->
<meta property="og:type" content="website" />
<meta property="og:title" content="Cifra - Análisis de Resultados Financieros con IA" />
<meta property="og:description" content="Convierte informes de más de 80 páginas en un análisis estructurado en segundos." />
<meta property="og:url" content="https://cifraresearch.com/" />
<meta property="og:image" content="https://cifraresearch.com/imagenes/og-cifra.png" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Cifra - Análisis Financiero Inteligente" />
<meta name="twitter:description" content="Análisis instantáneo de 10-Q y 10-K de empresas estadounidenses." />
<meta name="twitter:image" content="https://cifraresearch.com/imagenes/og-cifra.png" />
```

### C. Archivo `robots.txt` (`public/robots.txt`)

```txt
User-agent: *
Allow: /
Allow: /empresa.html
Disallow: /api/
Disallow: /settings
Disallow: /portfolio
Disallow: /analisis/privado

Sitemap: https://cifraresearch.com/sitemap.xml
```

### D. Endpoint `sitemap.xml` Dinámico
Crear una ruta en Express `GET /sitemap.xml` que liste dinámicamente todos los tickers soportados en la base de datos:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://cifraresearch.com/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>
  <!-- Generado dinámicamente por cada ticker existente -->
  <url>
    <loc>https://cifraresearch.com/empresa.html?ticker=KO</loc>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>https://cifraresearch.com/empresa.html?ticker=PEP</loc>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
</urlset>
```

### E. Alta en Buscadores
* Registrar la propiedad en **Google Search Console** desde el primer día de publicación.
* Enviar la URL del `sitemap.xml` para acelerar el rastreo e indexación.
* Activar **Google Analytics 4** o una alternativa ligera sin cookies (como Plausible o Umami) para medir el tráfico respetando la privacidad.

---

## 5. Orden de Ejecución Recomendado

1. **Adquirir VPS:** Contratar Cloud VPS 4 en Contabo con Ubuntu (región UE, facturación mensual).
2. **Setup Base:** Ejecutar pasos de la Fase B (usuario deploy, UFW, Node, Postgres, Nginx, servicios systemd).
3. **Despliegue inicial de Development:**
   - Clonar repositorio en `/var/www/cifra-dev`.
   - Arrancar el servicio `cifra-dev` en el puerto 3001.
4. **Dominio y SSL:** Apuntar DNS del dominio y subdominio `dev.` y generar certificados con Certbot.
5. **Configurar CI/CD:** Añadir los workflows `deploy-dev.yml`/`deploy-prod.yml` y los secrets en GitHub.
6. **Despliegue de Producción:** Crear `/var/www/cifra-prod` en rama `production` en puerto 3000.
7. **SEO y Monitoreo:** Subir `robots.txt`, crear `sitemap.xml` y dar de alta en Google Search Console.
