# Plan y Checklist de Lanzamiento: Beta, CI/CD y SEO

Documento maestro con todo lo necesario para desplegar, configurar y optimizar la versión Beta de **Cifra (Analizador de Resultados Financieros)**.

---

## 1. Especificaciones de la Infraestructura Elegida

* **Proveedor:** Contabo (o similar)
* **Plan:** Cloud VPS 4
* **Recursos:** 4 núcleos vCPU, 8 GB de RAM, 100 GB SSD, puerto 200 Mbit/s, tráfico ilimitado.
* **Coste:** ~5.50 €/mes (contrato mensual sin compromiso de permanencia ni costes de alta).
* **Sistema Operativo:** Ubuntu 22.04 LTS o 24.04 LTS.
* **Región recomendada:** EE. UU. (Este o Central) para minimizar latencia tanto con la SEC (EDGAR) como con usuarios en América.

---

## 2. Checklist de Lanzamiento de la Beta

### Fase A: Preparación del Código y Secretos
- [ ] **Auditoría de secretos en Git:** Confirmar que ningún archivo `.env`, token de GitHub o clave privada esté trackeado en el repositorio (`git status`, `.gitignore`).
- [ ] **Configuración `.env` para Producción:**
  - `JWT_SECRET`: generar una cadena criptográfica aleatoria segura (`openssl rand -hex 32`).
  - `AI_PROVIDER=deepseek`: clave `DEEPSEEK_API_KEY` activa y con saldo.
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: credenciales para envío real de correos de verificación y recuperación.
  - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: configurados con la URL de callback final (`https://tudominio.com/api/auth/google/callback`).
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

  # PM2 para gestión de procesos Node
  sudo npm install -g pm2
  pm2 startup systemd

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
| **Dominio / Subdominio** | `dev.tudominio.com` | `tudominio.com` / `www.tudominio.com` |
| **Rama Git** | `development` | `main` |
| **Ruta en VPS** | `/var/www/cifra-dev` | `/var/www/cifra-prod` |
| **Puerto Interno** | `3001` | `3000` |
| **Base de Datos** | `cifra_dev` | `cifra_prod` |
| **Proceso PM2** | `cifra-dev` | `cifra-prod` |

---

### Configuración de Nginx (Proxy Inverso con SSL)

Archivo `/etc/nginx/sites-available/cifra`:

```nginx
# Producción
server {
    server_name tudominio.com www.tudominio.com;

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
    server_name dev.tudominio.com;

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
sudo certbot --nginx -d tudominio.com -d www.tudominio.com -d dev.tudominio.com
```

---

### Pipeline de Despliegue Automático con GitHub Actions

Archivo `.github/workflows/deploy.yml`:

```yaml
name: Deploy Web

on:
  push:
    branches:
      - development
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Conectar por SSH y Desplegar
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            if [ "${{ github.ref }}" = "refs/heads/main" ]; then
              echo ">>> Desplegando en PRODUCCIÓN..."
              cd /var/www/cifra-prod
              git pull origin main
              npm install --omit=dev
              npm run db:migrate
              pm2 reload cifra-prod || pm2 start server.js --name "cifra-prod" --env .env
            else
              echo ">>> Desplegando en DEVELOPMENT..."
              cd /var/www/cifra-dev
              git pull origin development
              npm install
              npm run db:migrate
              pm2 reload cifra-dev || pm2 start server.js --name "cifra-dev" --env .env
            fi
            pm2 save
```

**Secretos a guardar en GitHub Settings $\rightarrow$ Secrets and Variables $\rightarrow$ Actions:**
* `VPS_HOST`: IP de tu VPS.
* `VPS_USER`: `deploy`
* `VPS_SSH_KEY`: Clave SSH privada generada para GitHub Actions.

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
<link rel="canonical" href="https://tudominio.com/" />

<!-- Open Graph para redes sociales (X, LinkedIn, WhatsApp) -->
<meta property="og:type" content="website" />
<meta property="og:title" content="Cifra - Análisis de Resultados Financieros con IA" />
<meta property="og:description" content="Convierte informes de más de 80 páginas en un análisis estructurado en segundos." />
<meta property="og:url" content="https://tudominio.com/" />
<meta property="og:image" content="https://tudominio.com/imagenes/og-cifra.png" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Cifra - Análisis Financiero Inteligente" />
<meta name="twitter:description" content="Análisis instantáneo de 10-Q y 10-K de empresas estadounidenses." />
<meta name="twitter:image" content="https://tudominio.com/imagenes/og-cifra.png" />
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

Sitemap: https://tudominio.com/sitemap.xml
```

### D. Endpoint `sitemap.xml` Dinámico
Crear una ruta en Express `GET /sitemap.xml` que liste dinámicamente todos los tickers soportados en la base de datos:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://tudominio.com/</loc>
    <priority>1.0</priority>
    <changefreq>daily</changefreq>
  </url>
  <!-- Generado dinámicamente por cada ticker existente -->
  <url>
    <loc>https://tudominio.com/empresa.html?ticker=KO</loc>
    <priority>0.8</priority>
    <changefreq>weekly</changefreq>
  </url>
  <url>
    <loc>https://tudominio.com/empresa.html?ticker=PEP</loc>
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

1. **Adquirir VPS:** Contratar Cloud VPS 4 en Contabo con Ubuntu (región EE. UU., facturación mensual).
2. **Setup Base:** Ejecutar pasos de la Fase B (usuario deploy, UFW, Node, Postgres, Nginx, PM2).
3. **Despliegue inicial de Development:**
   - Clonar repositorio en `/var/www/cifra-dev`.
   - Probar arranque manual con PM2 en puerto 3001.
4. **Dominio y SSL:** Apuntar DNS del dominio y subdominio `dev.` y generar certificados con Certbot.
5. **Configurar CI/CD:** Añadir `.github/workflows/deploy.yml` y los secrets en GitHub.
6. **Despliegue de Producción:** Crear `/var/www/cifra-prod` en rama `main` en puerto 3000.
7. **SEO y Monitoreo:** Subir `robots.txt`, crear `sitemap.xml` y dar de alta en Google Search Console.
