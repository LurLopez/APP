# Guía y Checklist de Lanzamiento

El documento completo de despliegue, arquitectura CI/CD y estrategia SEO se encuentra en:
👉 [documentacion/lanzamiento.md](file:///home/lur/Lur/APP/documentacion/lanzamiento.md)

### Resumen Rápido:
* **Infraestructura:** Contabo Cloud VPS 4 (4 vCPU, 8 GB RAM, 100 GB SSD) 6,66 €/mes sin permanencia. Región **UE (Hub Europe)**; IP `194.163.166.x` (el último octeto se omite por seguridad).
* **Dominio:** `cifraresearch.com` (Cloudflare Registrar, DNS en Cloudflare, SSL Full strict + Let's Encrypt).
* **Ambientes en el mismo VPS** (servicios systemd `cifra-dev` y `cifra-prod`):
  * `dev.cifraresearch.com` → rama `development`, puerto 3001, BD `cifra_dev`.
  * `cifraresearch.com` / `www` → rama `production`, puerto 3000, BD `cifra_prod`.
* **CI/CD:** GitHub Actions; push a `development` despliega en dev y push a `production` en producción (`.github/workflows/deploy-dev.yml` y `deploy-prod.yml`).
* **Correo:** saliente con Resend (`hola@cifraresearch.com`) y entrante con Cloudflare Email Routing hacia Gmail.
* **SEO/GEO:** meta tags + JSON-LD por página, `hreflang`, `robots.txt`, sitemap dinámico, `llms.txt`/`llms-full.txt` y endpoints Markdown para motores generativos; alta en Google Search Console.
